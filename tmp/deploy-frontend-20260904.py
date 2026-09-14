"""Deploy only the built frontend, using the song-sync SSH connection helper."""
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import tarfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'frontend' / 'dist'
spec = importlib.util.spec_from_file_location('song_sync', ROOT / 'sync-song-library.py')
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)
TARGET = '/root/site/karaoke'
stamp = time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())
STAGE = f'/root/karaoke-frontend-deploy/{stamp}'

def remote_python(client, source, data):
    command = 'python3 -c ' + sync.shell_quote(source)
    return sync.run_remote(client, command, input_text=json.dumps(data))

CHECK = '''
import hashlib, json, pathlib, sys
d = json.load(sys.stdin)
root = pathlib.Path(d['target']).resolve(strict=True)
assert str(root) == '/root/site/karaoke'
result = {}
for name in d['files']:
    p = root / name
    assert root in p.resolve().parents
    result[name] = hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None
print(json.dumps(result))
'''

INSTALL = '''
import hashlib, json, os, pathlib, shutil, sys, tarfile
d = json.load(sys.stdin)
root = pathlib.Path(d['target']).resolve(strict=True)
stage = pathlib.Path(d['stage']).resolve(strict=True)
assert str(root) == '/root/site/karaoke'
assert stage.parent == pathlib.Path('/root/karaoke-frontend-deploy')
payload = stage / 'payload'
backup = stage / 'backup'
payload.mkdir()
backup.mkdir()
with tarfile.open(stage / 'frontend.tar.gz') as archive:
    assert set(archive.getnames()) == set(d['changed'])
    for member in archive.getmembers():
        assert member.isfile() and not member.name.startswith('/') and '..' not in pathlib.PurePosixPath(member.name).parts
        archive.extract(member, payload, filter='data')
for name in d['changed']:
    source = payload / name
    assert hashlib.sha256(source.read_bytes()).hexdigest() == d['files'][name]
    target = root / name
    assert root in target.resolve().parents
    if target.exists():
        saved = backup / name
        saved.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(target, saved)
(stage / 'deployment.json').write_text(json.dumps(d, indent=2))
def replace(source, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(target.name + '.deploy-' + stage.name)
    shutil.copy2(source, temporary)
    temporary.chmod(0o644)
    os.replace(temporary, target)
try:
    # Install dependencies first. Keep the bind-mounted root directory intact.
    for name in sorted(d['changed'], key=lambda name: name == 'index.html'):
        replace(payload / name, root / name)
    for name, digest in d['files'].items():
        assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest, name
except Exception:
    for saved in backup.rglob('*'):
        if saved.is_file():
            replace(saved, root / saved.relative_to(backup))
    raise
print('Installed and checksum-verified all ' + str(len(d['files'])) + ' frontend files; backup: ' + str(backup))
'''

ROLLBACK = '''
import json, os, pathlib, shutil, sys
d = json.load(sys.stdin)
root = pathlib.Path(d['target']).resolve(strict=True)
stage = pathlib.Path(d['stage']).resolve(strict=True)
assert str(root) == '/root/site/karaoke'
assert stage.parent == pathlib.Path('/root/karaoke-frontend-deploy')
for saved in (stage / 'backup').rglob('*'):
    if saved.is_file():
        target = root / saved.relative_to(stage / 'backup')
        assert root in target.resolve().parents
        temp = target.with_name(target.name + '.rollback-' + stage.name)
        shutil.copy2(saved, temp)
        os.replace(temp, target)
print('Restored previous frontend files. New hashed assets retained safely.')
'''

files = {p.relative_to(DIST).as_posix(): sync.file_sha256(p) for p in sorted(DIST.rglob('*')) if p.is_file()}
assert 'index.html' in files
assert not any(name.startswith('qa-') for name in files)
client = sync.connect_ssh(sync.DEFAULT_HOST, sync.DEFAULT_USER)
installed = False
data = {'target': TARGET, 'stage': STAGE, 'files': files,
        'commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()}
try:
    mounts = json.loads(sync.run_remote(client, "docker inspect karaoke-web-1 --format '{{json .Mounts}}'"))
    assert any(m['Source'] == TARGET and m['Destination'] == '/usr/share/nginx/html' for m in mounts)
    current = json.loads(remote_python(client, CHECK, data))
    changed = [name for name in files if current[name] != files[name]]
    data['changed'] = changed
    print('Changed files:', ', '.join(changed), flush=True)
    if not changed:
        print('Already deployed.', flush=True)
        raise SystemExit(0)
    archive = ROOT / 'tmp' / f'karaoke-frontend-deploy-{stamp}.tar.gz'
    with tarfile.open(archive, 'w:gz') as output:
        for name in changed:
            output.add(DIST / name, arcname=name, recursive=False)
    sync.run_remote(client, 'mkdir ' + sync.shell_quote(STAGE))
    sync.upload(client, archive, STAGE + '/frontend.tar.gz')
    uploaded_hash = sync.run_remote(client, 'sha256sum ' + sync.shell_quote(STAGE + '/frontend.tar.gz')).split()[0]
    assert uploaded_hash == sync.file_sha256(archive)
    remote_python(client, INSTALL, data)
    installed = True
    index = (DIST / 'index.html').read_text(encoding='utf-8')
    urls = ['index.html'] + re.findall(r'(?:src|href)="/(assets/[^\"]+)"', index)
    for name in urls:
        url = 'https://karaoke.okamei.net/' + name + '?deploy=' + stamp
        req = urllib.request.Request(url, headers={'Cache-Control': 'no-cache', 'User-Agent': 'nuru-karaoke-deploy/1'})
        with urllib.request.urlopen(req, timeout=30) as response:
            assert response.status == 200
            assert hashlib.sha256(response.read()).hexdigest() == files[name], name
        print('Public HTTP 200 + SHA-256 verified:', name, flush=True)
    sync.verify_public_api(sync.DEFAULT_API_URL)
    sync.run_remote(client, 'docker exec karaoke-web-1 nginx -t')
    print('DEPLOYMENT COMPLETE: ' + data['commit'] + ' BACKUP: ' + STAGE + '/backup', flush=True)
except Exception:
    if installed:
        remote_python(client, ROLLBACK, data)
    raise
finally:
    client.close()
