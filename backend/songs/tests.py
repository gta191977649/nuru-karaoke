from tempfile import TemporaryDirectory

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse

from .forms import SongForm
from .models import Song


class SongLyricsEditorTests(TestCase):
    def setUp(self):
        super().setUp()
        self.temp_dir = TemporaryDirectory()
        self.override = override_settings(MEDIA_ROOT=self.temp_dir.name)
        self.override.enable()

    def tearDown(self):
        self.override.disable()
        self.temp_dir.cleanup()
        super().tearDown()

    def create_song(self, title='Song Title', artist='Singer Name'):
        return Song.objects.create(
            title=title,
            artist=artist,
            language='jp',
            lrc_offset=0,
            is_published=True,
        )

    def read_lrc_text(self, song):
        with song.lrc_file.open('rb') as handle:
            return handle.read().decode('utf-8')

    def test_form_loads_existing_lrc_text(self):
        song = self.create_song()
        song.lrc_file.save('seed.lrc', ContentFile('[00:01.00]hello'.encode('utf-8')), save=True)

        form = SongForm(instance=song)

        self.assertEqual(form.initial['lrc_text'], '[00:01.00]hello')

    def test_form_save_overwrites_existing_lrc_file_from_lrc_text(self):
        song = self.create_song()
        song.lrc_file.save('seed.lrc', ContentFile('[00:01.00]old'.encode('utf-8')), save=True)

        form = SongForm(
            data={
                'title': song.title,
                'artist': song.artist,
                'language': song.language,
                'lrc_offset': song.lrc_offset,
                'is_published': 'on',
                'lrc_text': '[00:02.00]{f}new{/f}',
            },
            instance=song,
        )

        self.assertTrue(form.is_valid(), form.errors)
        saved_song = form.save()
        saved_song.refresh_from_db()

        self.assertEqual(self.read_lrc_text(saved_song), '[00:02.00]{f}new{/f}')

    def test_form_save_creates_new_lrc_file_from_text(self):
        form = SongForm(
            data={
                'title': 'Brand New Song',
                'artist': 'New Artist',
                'language': 'jp',
                'lrc_offset': 120,
                'is_published': 'on',
                'lrc_text': '[00:03.00]fresh line',
            }
        )

        self.assertTrue(form.is_valid(), form.errors)
        song = form.save()

        self.assertTrue(song.lrc_file.name.endswith('.lrc'))
        self.assertEqual(self.read_lrc_text(song), '[00:03.00]fresh line')

    def test_uploaded_lrc_file_is_kept_when_editor_text_is_blank(self):
        upload = SimpleUploadedFile('upload.lrc', '[00:04.00]from file'.encode('utf-8'), content_type='text/plain')
        form = SongForm(
            data={
                'title': 'Uploaded Song',
                'artist': 'Uploader',
                'language': 'jp',
                'lrc_offset': 0,
                'is_published': 'on',
                'lrc_text': '',
            },
            files={'lrc_file': upload},
        )

        self.assertTrue(form.is_valid(), form.errors)
        song = form.save()

        self.assertEqual(self.read_lrc_text(song), '[00:04.00]from file')

    def test_edit_page_renders_existing_lrc_text_for_editor(self):
        user = get_user_model().objects.create_user(username='tester', password='secret123')
        song = self.create_song()
        song.lrc_file.save('seed.lrc', ContentFile('[00:05.00]preview me'.encode('utf-8')), save=True)
        self.client.force_login(user)

        response = self.client.get(reverse('ui_song_edit', kwargs={'pk': song.pk}))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'preview me')
        self.assertContains(response, '歌词编辑器')
