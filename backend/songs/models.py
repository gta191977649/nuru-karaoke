import os
from io import BytesIO

from django.db import models, transaction

try:
    import mido
except ImportError:
    mido = None


class ArtistIndex(models.Model):
    name = models.CharField(max_length=255, unique=True)
    next_song_no = models.PositiveIntegerField(default=1)

    def __str__(self):
        return self.name


def midi_upload_path(instance, filename):
    if not instance.artist_no and instance.artist:
        artist_index, _ = ArtistIndex.objects.get_or_create(name=instance.artist.strip())
        instance.artist_no = artist_index.id
    ext = os.path.splitext(filename)[1].lower() or '.mid'
    artist_no = instance.artist_no or 0
    song_no = instance.song_no or 0
    return f'songs/midi/{artist_no}-{song_no}{ext}'


def lrc_upload_path(instance, filename):
    if not instance.artist_no and instance.artist:
        artist_index, _ = ArtistIndex.objects.get_or_create(name=instance.artist.strip())
        instance.artist_no = artist_index.id
    ext = os.path.splitext(filename)[1].lower() or '.lrc'
    artist_no = instance.artist_no or 0
    song_no = instance.song_no or 0
    return f'songs/lrc/{artist_no}-{song_no}{ext}'


class Tag(models.Model):
    name = models.CharField(max_length=64, unique=True)

    def __str__(self):
        return self.name


class Song(models.Model):
    code = models.CharField(max_length=32, unique=True, blank=True)
    title = models.CharField(max_length=255)
    artist = models.CharField(max_length=255, blank=True)
    artist_no = models.PositiveIntegerField(null=True, blank=True)
    song_no = models.PositiveIntegerField(null=True, blank=True)
    language = models.CharField(max_length=32, blank=True, default='jp')
    duration_seconds = models.PositiveIntegerField(null=True, blank=True)
    bpm = models.PositiveIntegerField(null=True, blank=True)
    key = models.CharField(max_length=16, blank=True)
    tags = models.ManyToManyField(Tag, blank=True, related_name='songs')

    midi_file = models.FileField(upload_to=midi_upload_path, blank=True, null=True)
    lrc_file = models.FileField(upload_to=lrc_upload_path, blank=True, null=True)
    cover_image = models.ImageField(upload_to='songs/cover/', blank=True, null=True)

    lrc_offset = models.IntegerField(default=0)
    is_published = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.title} - {self.artist}'

    def save(self, *args, **kwargs):
        if self.midi_file and mido:
            previous = None
            if self.pk:
                previous = Song.objects.filter(pk=self.pk).values_list('midi_file', flat=True).first()
            midi_changed = previous != self.midi_file.name
            needs_fill = not (self.duration_seconds and self.bpm and self.key)
            if midi_changed or needs_fill:
                try:
                    file_obj = self.midi_file.file
                    file_obj.seek(0)
                    data = file_obj.read()
                    file_obj.seek(0)
                    midi = mido.MidiFile(file=BytesIO(data))
                    self.duration_seconds = int(round(midi.length))
                    tempo = None
                    key_signature = None
                    for track in midi.tracks:
                        for msg in track:
                            if msg.type == 'set_tempo' and tempo is None:
                                tempo = msg.tempo
                            if msg.type == 'key_signature' and key_signature is None:
                                key_signature = msg.key
                        if tempo and key_signature:
                            break
                    if tempo:
                        self.bpm = int(round(mido.tempo2bpm(tempo)))
                    if key_signature:
                        self.key = key_signature
                except Exception:
                    # If parsing fails, keep existing values.
                    pass

        if self.artist and not self.artist_no:
            artist_index, _ = ArtistIndex.objects.get_or_create(name=self.artist.strip())
            self.artist_no = artist_index.id

        if self.artist and (not self.song_no or not self.code):
            with transaction.atomic():
                artist_index = ArtistIndex.objects.select_for_update().get(name=self.artist.strip())
                if not self.artist_no:
                    self.artist_no = artist_index.id
                if not self.song_no:
                    self.song_no = artist_index.next_song_no
                    artist_index.next_song_no += 1
                    artist_index.save(update_fields=['next_song_no'])
                if not self.code:
                    self.code = f'{self.artist_no}-{self.song_no}'
        super().save(*args, **kwargs)
