import os

from django import forms
from django.core.files.base import ContentFile

from .models import ArtistIndex, Song, Tag


class SongForm(forms.ModelForm):
    tags = forms.ModelMultipleChoiceField(
        queryset=Tag.objects.all(),
        required=False,
        widget=forms.SelectMultiple(attrs={'size': 6}),
    )
    lrc_text = forms.CharField(
        required=False,
        strip=False,
        widget=forms.Textarea(attrs={'rows': 18, 'class': 'form-control d-none'}),
    )

    class Meta:
        model = Song
        fields = (
            'title',
            'artist',
            'language',
            'tags',
            'midi_file',
            'lrc_file',
            'cover_image',
            'lrc_offset',
            'is_published',
        )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        artist_names = (
            Song.objects.exclude(artist='')
            .values_list('artist', flat=True)
            .distinct()
            .order_by('artist')
        )
        self.artist_suggestions = list(artist_names)
        if 'artist' in self.fields:
            self.fields['artist'].widget.attrs['list'] = 'artist-options'
        for name, field in self.fields.items():
            if isinstance(field.widget, forms.CheckboxInput):
                field.widget.attrs.setdefault('class', 'form-check-input')
            elif isinstance(field.widget, forms.SelectMultiple):
                field.widget.attrs.setdefault('class', 'form-select')
            elif isinstance(field.widget, forms.Select):
                field.widget.attrs.setdefault('class', 'form-select')
            else:
                field.widget.attrs.setdefault('class', 'form-control')
        if 'midi_file' in self.fields:
            self.fields['midi_file'].widget.attrs['accept'] = '.mid,.midi'
        if 'lrc_file' in self.fields:
            self.fields['lrc_file'].widget.attrs['accept'] = '.lrc'
        if 'cover_image' in self.fields:
            self.fields['cover_image'].widget.attrs['accept'] = 'image/*'
        if self.instance and self.instance.pk and self.instance.code:
            self.fields['code'] = forms.CharField(
                required=False,
                initial=self.instance.code,
                disabled=True,
                label='Code',
            )
            self.fields['code'].widget.attrs['class'] = 'form-control'
        if not self.is_bound:
            self.initial.setdefault('lrc_text', self._read_existing_lrc_text())

    def clean(self):
        cleaned = super().clean()
        artist = cleaned.get('artist')
        title = cleaned.get('title')
        midi = cleaned.get('midi_file')
        lrc = cleaned.get('lrc_file')
        if (midi or lrc) and (not artist or not title):
            raise forms.ValidationError('Please enter artist and title before uploading MIDI/LRC files.')
        return cleaned

    def save(self, commit=True):
        song = super().save(commit=commit)
        if not commit:
            return song

        lrc_text = self.cleaned_data.get('lrc_text')
        uploaded_lrc = self.cleaned_data.get('lrc_file')
        initial_lrc_text = self.initial.get('lrc_text', '')
        should_persist_text = (
            lrc_text is not None
            and not (uploaded_lrc and not lrc_text and not initial_lrc_text)
            and (bool(song.lrc_file) or bool(lrc_text) or bool(initial_lrc_text))
        )

        if should_persist_text:
            self._write_lrc_text(song, lrc_text)

        return song

    def _read_existing_lrc_text(self):
        lrc_file = getattr(self.instance, 'lrc_file', None)
        if not lrc_file:
            return ''
        try:
            with lrc_file.open('rb') as handle:
                return handle.read().decode('utf-8-sig')
        except Exception:
            return ''

    def _write_lrc_text(self, song, text):
        encoded = (text or '').encode('utf-8')
        current_name = song.lrc_file.name if song.lrc_file else ''
        extension = os.path.splitext(current_name)[1].lower() or '.lrc'
        upload_name = f'lyrics{extension}'

        if current_name and song.lrc_file.storage.exists(current_name):
            song.lrc_file.storage.delete(current_name)

        song.lrc_file.save(upload_name, ContentFile(encoded), save=False)
        song.save()


class TagForm(forms.ModelForm):
    class Meta:
        model = Tag
        fields = ('name',)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field in self.fields.values():
            field.widget.attrs.setdefault('class', 'form-control')


class ArtistForm(forms.ModelForm):
    class Meta:
        model = ArtistIndex
        fields = ('name',)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field in self.fields.values():
            field.widget.attrs.setdefault('class', 'form-control')
