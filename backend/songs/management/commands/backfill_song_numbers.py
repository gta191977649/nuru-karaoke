import os

from django.core.management.base import BaseCommand
from django.db import transaction

from songs.models import ArtistIndex, Song, lrc_upload_path, midi_upload_path


class Command(BaseCommand):
    help = 'Backfill artist_no/song_no/code and rename MIDI/LRC files to ARTISTNO-SONGNO.'

    def handle(self, *args, **options):
        songs_by_artist = {}
        for song in Song.objects.exclude(artist='').order_by('artist', 'id'):
            songs_by_artist.setdefault(song.artist.strip(), []).append(song)

        updated = 0
        renamed = 0

        for artist_name, songs in songs_by_artist.items():
            with transaction.atomic():
                artist_index, _ = ArtistIndex.objects.get_or_create(name=artist_name)
                next_song_no = 1

                for song in songs:
                    song.artist_no = artist_index.id
                    song.song_no = next_song_no
                    song.code = f'{song.artist_no}-{song.song_no}'

                    # Rename MIDI file if present
                    if song.midi_file:
                        old_name = song.midi_file.name
                        new_name = midi_upload_path(song, old_name)
                        if old_name != new_name and song.midi_file.storage.exists(old_name):
                            old_path = song.midi_file.storage.path(old_name)
                            new_path = song.midi_file.storage.path(new_name)
                            os.makedirs(os.path.dirname(new_path), exist_ok=True)
                            os.rename(old_path, new_path)
                            song.midi_file.name = new_name
                            renamed += 1

                    # Rename LRC file if present
                    if song.lrc_file:
                        old_name = song.lrc_file.name
                        new_name = lrc_upload_path(song, old_name)
                        if old_name != new_name and song.lrc_file.storage.exists(old_name):
                            old_path = song.lrc_file.storage.path(old_name)
                            new_path = song.lrc_file.storage.path(new_name)
                            os.makedirs(os.path.dirname(new_path), exist_ok=True)
                            os.rename(old_path, new_path)
                            song.lrc_file.name = new_name
                            renamed += 1

                    song.save(update_fields=['artist_no', 'song_no', 'code', 'midi_file', 'lrc_file'])
                    updated += 1
                    next_song_no += 1

                artist_index.next_song_no = next_song_no
                artist_index.save(update_fields=['next_song_no'])

        self.stdout.write(self.style.SUCCESS(f'Updated {updated} songs. Renamed {renamed} files.'))
