import hashlib
from pathlib import Path
from tempfile import TemporaryDirectory

from django.test import SimpleTestCase, override_settings

from .synth_resources import ROM_SLOTS


class SynthResourceTests(SimpleTestCase):
    def test_missing_roms_are_reported_without_exposing_paths(self):
        with override_settings(SMU2000_ROM_DIR=''):
            response = self.client.get('/api/synth/smu2000/manifest/')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()['available'])
        self.assertEqual(response.json()['files'], [])

    def test_public_manifest_checks_sizes_and_public_rom_matches_hash(self):
        with TemporaryDirectory() as directory, override_settings(SMU2000_ROM_DIR=directory):
            for kind, name, size, required in ROM_SLOTS:
                if not required:
                    continue
                folder = Path(directory) / ('dump' if 1 <= kind <= 4 else '')
                folder.mkdir(exist_ok=True)
                with (folder / name).open('wb') as stream:
                    stream.truncate(size)
            manifest = self.client.get('/api/synth/smu2000/manifest/').json()
            self.assertTrue(manifest['available'])
            self.assertEqual(len(manifest['files']), 6)
            file = manifest['files'][-1]
            response = self.client.get(file['url'])
            self.assertEqual(response.status_code, 200)
            digest = hashlib.sha256(b''.join(response.streaming_content)).hexdigest()
            self.assertEqual(digest, file['sha256'])
            previous_version = manifest['version']
            (Path(directory) / 'hd44780u_b04.bin').write_bytes(b'x' * 4096)
            updated = self.client.get('/api/synth/smu2000/manifest/').json()
            self.assertNotEqual(previous_version, updated['version'])
            (Path(directory) / 'hd44780u_b04.bin').write_bytes(b'bad')
            self.assertFalse(self.client.get('/api/synth/smu2000/manifest/').json()['available'])
            self.assertEqual(self.client.get(file['url']).status_code, 404)

    def test_fixed_file_allowlist(self):
        with TemporaryDirectory() as directory, override_settings(SMU2000_ROM_DIR=directory):
            (Path(directory) / 'secret.txt').write_text('private')
            self.assertEqual(self.client.get('/api/synth/smu2000/rom/secret.txt/').status_code, 404)
            self.assertEqual(self.client.get('/api/synth/smu2000/rom/../secret.txt/').status_code, 404)
