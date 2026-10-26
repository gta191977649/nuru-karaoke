"""Deployment-owned ROMs. Never place these files in STATIC_ROOT or Git."""
import hashlib
import json
from functools import lru_cache
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404, JsonResponse
from django.views.decorators.http import require_GET


ROM_SLOTS = (
    (0, 'mu2000_flash.bin', 4 * 1024 * 1024, True),
    (1, 'xv364a0.ic49', 8 * 1024 * 1024, True),
    (2, 'xv365a0.ic50', 8 * 1024 * 1024, True),
    (3, 'xw848a0.ic53', 8 * 1024 * 1024, True),
    (4, 'xw849a0.ic54', 8 * 1024 * 1024, True),
    (5, 'sin-table.bin', 65536, False),
    (6, 'hd44780u_b04.bin', 4096, True),
)


def rom_path(name):
    root = getattr(settings, 'SMU2000_ROM_DIR', '')
    if not root:
        return None
    root = Path(root).resolve()
    for relative in (name, f'dump/{name}', f'standin/{name}'):
        candidate = (root / relative).resolve()
        if candidate.is_relative_to(root) and candidate.is_file():
            return candidate
    return None


@lru_cache(maxsize=32)
def file_digest(path, size, mtime_ns):
    with open(path, 'rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


@require_GET
def smu_manifest(request):
    files, errors = [], []
    for kind, name, size, required in ROM_SLOTS:
        path = rom_path(name)
        if path is None:
            if required:
                errors.append(f'Missing ROM: {name}')
            continue
        stat = path.stat()
        if stat.st_size != size:
            errors.append(f'Invalid ROM size: {name}')
            continue
        files.append(dict(kind=kind, name=name, size=size,
                          sha256=file_digest(str(path), size, stat.st_mtime_ns),
                          url=f'/api/synth/smu2000/rom/{name}/'))
    version = hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest()
    response = JsonResponse(dict(available=not errors, version=version, files=files, errors=errors))
    response['Cache-Control'] = 'no-cache'
    return response


@require_GET
def smu_rom(request, name):
    slot = next((slot for slot in ROM_SLOTS if slot[1] == name), None)
    path = rom_path(name) if slot else None
    if path is None or path.stat().st_size != slot[2]:
        raise Http404('ROM unavailable')
    response = FileResponse(path.open('rb'), content_type='application/octet-stream')
    response['Cache-Control'] = 'no-cache'
    response['X-Content-Type-Options'] = 'nosniff'
    return response
