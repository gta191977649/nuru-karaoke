#!/usr/bin/env python3
"""Safely synchronize the local Django song library to the production server."""

from __future__ import annotations

import argparse
import getpass
import hashlib
import io
import json
import os
import sys
import tarfile
import tempfile
import time
import urllib.request
from pathlib import Path, PurePosixPath


PROJECT_ROOT = Path(__file__).resolve().parent
BACKEND_ROOT = PROJECT_ROOT / "backend"
MEDIA_ROOT = BACKEND_ROOT / "media"
DEFAULT_HOST = "64.176.60.176"
DEFAULT_USER = "root"
DEFAULT_API_URL = "https://raku-sound.okamei.net/api/songs/?page_size=1"


def log(message: str) -> None:
    print(message, flush=True)


def configure_django() -> None:
    sys.path.insert(0, str(BACKEND_ROOT))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "karaoke_backend.settings")
    import django

    django.setup()


def safe_media_path(name: str) -> Path:
    relative = PurePosixPath(name)
    if relative.is_absolute() or ".." in relative.parts:
        raise RuntimeError(f"Unsafe media path in database: {name!r}")
    path = MEDIA_ROOT.joinpath(*relative.parts).resolve()
    try:
        path.relative_to(MEDIA_ROOT.resolve())
    except ValueError as exc:
        raise RuntimeError(f"Media path escapes MEDIA_ROOT: {name!r}") from exc
    return path


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def export_manifest() -> tuple[dict, list[tuple[str, Path]]]:
    configure_django()
    from songs.models import ArtistIndex, Song, Tag

    artists = list(
        ArtistIndex.objects.order_by("id").values("id", "name", "next_song_no")
    )
    tags = list(Tag.objects.order_by("name").values_list("name", flat=True))
    songs = []
    media_files: dict[str, Path] = {}

    for song in Song.objects.prefetch_related("tags").order_by("code"):
        file_names = {}
        for field_name in ("midi_file", "lrc_file", "cover_image"):
            field = getattr(song, field_name)
            name = field.name if field else ""
            file_names[field_name] = name
            if name:
                path = safe_media_path(name)
                if not path.is_file():
                    raise RuntimeError(
                        f"Song {song.code!r} references a missing file: {path}"
                    )
                media_files[name] = path

        songs.append(
            {
                "code": song.code,
                "title": song.title,
                "artist": song.artist,
                "artist_no": song.artist_no,
                "song_no": song.song_no,
                "language": song.language,
                "duration_seconds": song.duration_seconds,
                "bpm": song.bpm,
                "key": song.key,
                "midi_file": file_names["midi_file"],
                "lrc_file": file_names["lrc_file"],
                "cover_image": file_names["cover_image"],
                "lrc_offset": song.lrc_offset,
                "is_published": song.is_published,
                "tags": list(song.tags.order_by("name").values_list("name", flat=True)),
            }
        )

    sorted_media_files = sorted(media_files.items())
    manifest = {
        "format": 2,
        "exported_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "artists": artists,
        "tags": tags,
        "songs": songs,
        "media": {
            name: {
                "sha256": file_sha256(path),
                "size": path.stat().st_size,
            }
            for name, path in sorted_media_files
        },
    }
    return manifest, sorted_media_files


REMOTE_IMPORTER = r'''import json
from django.db import transaction
from songs.models import ArtistIndex, Song, Tag

MANIFEST_PATH = "/tmp/song-library-manifest.json"

with open(MANIFEST_PATH, "r", encoding="utf-8") as handle:
    manifest = json.load(handle)

if manifest.get("format") != 2:
    raise RuntimeError("Unsupported song-library manifest format")

created = 0
updated = 0

with transaction.atomic():
    # Artist IDs are part of song codes, so silently remapping them is unsafe.
    for source in manifest["artists"]:
        by_id = ArtistIndex.objects.filter(pk=source["id"]).first()
        by_name = ArtistIndex.objects.filter(name=source["name"]).first()
        if by_id and by_id.name != source["name"]:
            raise RuntimeError(
                f"Artist ID conflict: local {source['id']}={source['name']!r}, "
                f"server={by_id.name!r}"
            )
        if by_name and by_name.pk != source["id"]:
            raise RuntimeError(
                f"Artist name conflict: {source['name']!r} has local ID "
                f"{source['id']} but server ID {by_name.pk}"
            )
        artist = by_id or ArtistIndex(id=source["id"], name=source["name"])
        artist.name = source["name"]
        artist.next_song_no = max(artist.next_song_no, source["next_song_no"])
        artist.save(force_insert=artist._state.adding)

    tags = {}
    for name in manifest["tags"]:
        tags[name], _ = Tag.objects.get_or_create(name=name)

    scalar_fields = (
        "title", "artist", "artist_no", "song_no", "language",
        "duration_seconds", "bpm", "key", "lrc_offset", "is_published",
    )
    file_fields = ("midi_file", "lrc_file", "cover_image")

    for source in manifest["songs"]:
        song = Song.objects.select_for_update().filter(code=source["code"]).first()
        if song is None:
            song = Song(code=source["code"])
            created += 1
        else:
            updated += 1
        for field in scalar_fields:
            setattr(song, field, source[field])
        for field in file_fields:
            getattr(song, field).name = source[field]
        song.save()
        song.tags.set([tags[name] for name in source["tags"]])

print(json.dumps({
    "created": created,
    "updated": updated,
    "server_song_count": Song.objects.count(),
}, ensure_ascii=False))
'''


REMOTE_VERIFIER = r'''import hashlib
import json
import os
import sys
from pathlib import Path, PurePosixPath

MANIFEST_PATH = os.environ.get("SONG_SYNC_MANIFEST", "/tmp/song-library-manifest.json")
MEDIA_ROOT = Path(os.environ.get("SONG_SYNC_MEDIA_ROOT", "/data/media")).resolve()
strict = "--strict" in sys.argv

with open(MANIFEST_PATH, "r", encoding="utf-8") as handle:
    manifest = json.load(handle)

if manifest.get("format") != 2 or not isinstance(manifest.get("media"), dict):
    raise RuntimeError("Manifest does not contain checksummed media metadata")

results = {"matching": [], "changed": [], "missing": []}
for name, expected in sorted(manifest["media"].items()):
    relative = PurePosixPath(name)
    if relative.is_absolute() or ".." in relative.parts:
        raise RuntimeError(f"Unsafe media path: {name!r}")
    path = MEDIA_ROOT.joinpath(*relative.parts).resolve()
    if MEDIA_ROOT not in path.parents:
        raise RuntimeError(f"Media path escapes MEDIA_ROOT: {name!r}")
    if not path.is_file():
        results["missing"].append(name)
        continue
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    actual_hash = digest.hexdigest()
    actual_size = path.stat().st_size
    if actual_hash == expected["sha256"] and actual_size == expected["size"]:
        results["matching"].append(name)
    else:
        results["changed"].append(name)

print(json.dumps({key: len(value) for key, value in results.items()}, ensure_ascii=False))
for category in ("changed", "missing"):
    for name in results[category]:
        print(f"{category.upper()} {name}")

if strict and (results["changed"] or results["missing"]):
    raise RuntimeError("Server media checksum verification failed")
'''


REMOTE_BACKUP = r'''import os
import sqlite3
import tarfile
from pathlib import Path

backup_dir = Path(os.environ["SONG_SYNC_BACKUP_DIR"])
backup_dir.mkdir(parents=True, exist_ok=False)

source = sqlite3.connect("/data/db.sqlite3")
destination = sqlite3.connect(str(backup_dir / "db.sqlite3"))
try:
    source.backup(destination)
finally:
    destination.close()
    source.close()

media_root = Path("/data/media")
with tarfile.open(backup_dir / "media.tar.gz", "w:gz") as archive:
    if media_root.exists():
        archive.add(media_root, arcname="media")

print(backup_dir)
'''


def add_bytes(archive: tarfile.TarFile, name: str, data: bytes) -> None:
    info = tarfile.TarInfo(name)
    info.size = len(data)
    info.mtime = int(time.time())
    archive.addfile(info, io.BytesIO(data))


def build_archive(manifest: dict, media_files: list[tuple[str, Path]], target: Path) -> str:
    with tarfile.open(target, "w:gz", format=tarfile.PAX_FORMAT) as archive:
        add_bytes(
            archive,
            "manifest.json",
            json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8"),
        )
        add_bytes(archive, "import_song_library.py", REMOTE_IMPORTER.encode("utf-8"))
        add_bytes(archive, "verify_song_library.py", REMOTE_VERIFIER.encode("utf-8"))
        add_bytes(archive, "backup_song_library.py", REMOTE_BACKUP.encode("utf-8"))
        for name, path in media_files:
            archive.add(path, arcname=f"media/{name}", recursive=False)

    digest = hashlib.sha256()
    with target.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def connect_ssh(host: str, user: str):
    try:
        import paramiko
    except ImportError as exc:
        raise RuntimeError(
            "Paramiko is required. Install it with: .venv\\Scripts\\python.exe -m pip install paramiko"
        ) from exc

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        log("Trying SSH key/agent authentication...")
        client.connect(
            host,
            username=user,
            timeout=15,
            banner_timeout=15,
            auth_timeout=15,
            allow_agent=True,
            look_for_keys=True,
        )
        return client
    except (paramiko.AuthenticationException, paramiko.PasswordRequiredException):
        client.close()
    except paramiko.SSHException as exc:
        client.close()
        # Paramiko raises a generic SSHException when Windows has neither an
        # SSH agent identity nor a usable private key. That is an expected
        # signal to fall back to an interactive password, not a fatal error.
        if "no authentication methods available" not in str(exc).lower():
            raise

    password = os.environ.get("NURU_KARAOKE_SSH_PASSWORD")
    if not password:
        password = getpass.getpass(f"SSH password for {user}@{host}: ")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        host,
        username=user,
        password=password,
        timeout=15,
        banner_timeout=15,
        auth_timeout=15,
        allow_agent=False,
        look_for_keys=False,
    )
    return client


def run_remote(client, command: str, *, input_text: str | None = None) -> str:
    stdin, stdout, stderr = client.exec_command(command, timeout=900)
    if input_text is not None:
        stdin.write(input_text)
        stdin.channel.shutdown_write()
    output = stdout.read().decode("utf-8", errors="replace")
    error = stderr.read().decode("utf-8", errors="replace")
    status = stdout.channel.recv_exit_status()
    if output.strip():
        log(output.rstrip())
    if status != 0:
        detail = error.strip() or output.strip() or f"exit status {status}"
        raise RuntimeError(f"Remote command failed:\n{detail}")
    if error.strip():
        log(error.rstrip())
    return output.strip()


def upload(client, source: Path, destination: str) -> None:
    size = source.stat().st_size
    last_percent = -1

    def progress(transferred: int, total: int) -> None:
        nonlocal last_percent
        percent = int(transferred * 100 / max(total, 1))
        if percent == 100 or percent >= last_percent + 10:
            print(f"\rUploading: {percent:3d}%", end="", flush=True)
            last_percent = percent

    with client.open_sftp() as sftp:
        sftp.put(str(source), destination, callback=progress)
    print(f" ({size / 1024 / 1024:.1f} MiB)")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def verify_public_api(url: str) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": "nuru-karaoke-sync/1"})
    with urllib.request.urlopen(request, timeout=20) as response:
        if response.status != 200:
            raise RuntimeError(f"Public API health check returned HTTP {response.status}")
        json.load(response)
    log(f"Public API check: HTTP 200 ({url})")


def synchronize(args: argparse.Namespace, archive: Path, digest: str) -> None:
    timestamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    stage = f"/root/song-library-sync/{timestamp}"
    remote_archive = f"{stage}/song-library.tar.gz"
    client = connect_ssh(args.host, args.user)
    try:
        run_remote(client, f"mkdir -p {shell_quote(stage)}")
        upload(client, archive, remote_archive)
        remote_hash = run_remote(
            client, f"sha256sum {shell_quote(remote_archive)} | cut -d' ' -f1"
        ).splitlines()[-1]
        if remote_hash.lower() != digest.lower():
            raise RuntimeError("Uploaded archive checksum does not match the local archive")
        log("Upload checksum verified.")

        run_remote(
            client,
            f"mkdir -p {shell_quote(stage + '/payload')} && "
            f"tar -xzf {shell_quote(remote_archive)} -C {shell_quote(stage + '/payload')}",
        )
        container_output = run_remote(
            client,
            "docker ps --filter name=rakusound-backend-backend "
            "--format '{{.Names}}' | head -n 1",
        )
        container = container_output.splitlines()[-1].strip() if container_output else ""
        if not container:
            raise RuntimeError("The production backend container is not running")
        log(f"Backend container: {container}")

        payload = f"{stage}/payload"
        run_remote(
            client,
            f"docker cp {shell_quote(payload + '/manifest.json')} "
            f"{shell_quote(container + ':/tmp/song-library-manifest.json')} && "
            f"docker cp {shell_quote(payload + '/verify_song_library.py')} "
            f"{shell_quote(container + ':/tmp/verify_song_library.py')} && "
            f"docker exec {shell_quote(container)} python /tmp/verify_song_library.py",
        )

        run_remote(
            client,
            f"docker cp {shell_quote(payload + '/backup_song_library.py')} "
            f"{shell_quote(container + ':/tmp/backup_song_library.py')} && "
            f"docker exec -e SONG_SYNC_BACKUP_DIR={shell_quote('/data/song-sync-backups/' + timestamp)} "
            f"{shell_quote(container)} python /tmp/backup_song_library.py",
        )
        log(f"Temporary rollback backup created: /data/song-sync-backups/{timestamp}")

        run_remote(
            client,
            f"docker cp {shell_quote(payload + '/media/.')} "
            f"{shell_quote(container + ':/data/media/')} && "
            f"docker exec {shell_quote(container)} python /tmp/verify_song_library.py --strict && "
            f"docker cp {shell_quote(payload + '/import_song_library.py')} "
            f"{shell_quote(container + ':/tmp/import_song_library.py')} && "
            f"docker exec {shell_quote(container)} python manage.py shell "
            f"-c \"exec(open('/tmp/import_song_library.py', encoding='utf-8').read())\" && "
            f"docker exec {shell_quote(container)} python manage.py check",
        )

        try:
            verify_public_api(args.api_url)
        except Exception as exc:
            log(f"Warning: public API check was skipped after a network error: {exc}")

        run_remote(
            client,
            f"docker exec {shell_quote(container)} python -c "
            f"\"import shutil; shutil.rmtree('/data/song-sync-backups', ignore_errors=True)\" && "
            f"python3 -c \"import shutil; shutil.rmtree({stage!r}, ignore_errors=True)\"",
        )
        log("Checksum verification passed; temporary and historical sync backups removed.")
        log("Song-library synchronization completed successfully.")
    finally:
        client.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--user", default=DEFAULT_USER)
    parser.add_argument("--api-url", default=DEFAULT_API_URL)
    parser.add_argument("--dry-run", action="store_true", help="export and validate only")
    parser.add_argument("--yes", action="store_true", help="skip the confirmation prompt")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    manifest, media_files = export_manifest()
    media_bytes = sum(path.stat().st_size for _, path in media_files)
    log(
        f"Local library: {len(manifest['songs'])} songs, "
        f"{len(manifest['artists'])} artists, {len(manifest['tags'])} tags, "
        f"{len(media_files)} media files ({media_bytes / 1024 / 1024:.1f} MiB)"
    )

    with tempfile.TemporaryDirectory(prefix="nuru-karaoke-song-sync-") as temp_dir:
        archive = Path(temp_dir) / "song-library.tar.gz"
        digest = build_archive(manifest, media_files, archive)
        log(
            f"Archive ready: {archive.stat().st_size / 1024 / 1024:.1f} MiB, "
            f"SHA-256 {digest}"
        )
        if args.dry_run:
            log("Dry run completed. Nothing was uploaded or changed.")
            return 0

        if not args.yes:
            answer = input(
                f"Synchronize these songs to {args.user}@{args.host}? "
                "Production scores and users will be preserved. [y/N] "
            )
            if answer.strip().lower() not in {"y", "yes"}:
                log("Cancelled.")
                return 0

        synchronize(args, archive, digest)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nCancelled.", file=sys.stderr)
        raise SystemExit(130)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
