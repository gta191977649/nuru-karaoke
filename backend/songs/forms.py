from django import forms

from .models import ArtistIndex, Song, Tag


class SongForm(forms.ModelForm):
    tags = forms.ModelMultipleChoiceField(
        queryset=Tag.objects.all(),
        required=False,
        widget=forms.SelectMultiple(attrs={'size': 6}),
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

    def clean(self):
        cleaned = super().clean()
        artist = cleaned.get('artist')
        title = cleaned.get('title')
        midi = cleaned.get('midi_file')
        lrc = cleaned.get('lrc_file')
        if (midi or lrc) and (not artist or not title):
            raise forms.ValidationError('Please enter artist and title before uploading MIDI/LRC files.')
        return cleaned


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
