from django.contrib.auth import logout
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.db.models import Q, Max

from .forms import ArtistForm, SongForm, TagForm
from .models import ArtistIndex, Song, Tag
from scores.models import Score


@login_required
def login_redirect(_request):
    return redirect('ui_song_list')


@login_required
def song_list(request):
    q = (request.GET.get('q') or '').strip()
    tag = (request.GET.get('tag') or '').strip()
    language = (request.GET.get('language') or '').strip()

    songs = Song.objects.all().prefetch_related('tags')
    if q:
        songs = songs.filter(Q(title__icontains=q) | Q(artist__icontains=q) | Q(code__icontains=q))
    if tag:
        songs = songs.filter(tags__name__iexact=tag)
    if language:
        songs = songs.filter(language__iexact=language)
    songs = songs.order_by('title')

    tag_options = Tag.objects.order_by('name')
    language_options = Song.objects.exclude(language='').values_list('language', flat=True).distinct().order_by('language')

    return render(
        request,
        'songs/song_list.html',
        {
            'songs': songs,
            'q': q,
            'tag': tag,
            'language': language,
            'tag_options': tag_options,
            'language_options': language_options,
        },
    )


@login_required
def song_create(request):
    if request.method == 'POST':
        form = SongForm(request.POST, request.FILES)
        if form.is_valid():
            song = form.save()
            return redirect('ui_song_edit', pk=song.pk)
    else:
        form = SongForm()
    return render(request, 'songs/song_form.html', {'form': form, 'mode': 'create'})


@login_required
def song_edit(request, pk):
    song = get_object_or_404(Song, pk=pk)
    if request.method == 'POST':
        form = SongForm(request.POST, request.FILES, instance=song)
        if form.is_valid():
            form.save()
            return redirect('ui_song_edit', pk=song.pk)
    else:
        form = SongForm(instance=song)
    return render(request, 'songs/song_form.html', {'form': form, 'mode': 'edit', 'song': song})


@login_required
def song_delete(request, pk):
    song = get_object_or_404(Song, pk=pk)
    if request.method == 'POST':
        song.delete()
        return redirect('ui_song_list')
    return render(request, 'songs/song_delete.html', {'song': song})


@login_required
def tag_list(request):
    tags = Tag.objects.order_by('name')
    return render(request, 'songs/tag_list.html', {'tags': tags})


@login_required
def tag_create(request):
    if request.method == 'POST':
        form = TagForm(request.POST)
        if form.is_valid():
            form.save()
            return redirect('ui_tag_list')
    else:
        form = TagForm()
    return render(request, 'songs/tag_form.html', {'form': form, 'mode': 'create'})


@login_required
def tag_delete(request, pk):
    tag = get_object_or_404(Tag, pk=pk)
    if request.method == 'POST':
        tag.delete()
        return redirect('ui_tag_list')
    return render(request, 'songs/tag_delete.html', {'tag': tag})


@login_required
def logout_view(request):
    logout(request)
    return redirect('ui_login')


@login_required
def artist_list(request):
    q = (request.GET.get('q') or '').strip()
    artists_qs = ArtistIndex.objects.all()
    if q:
        artists_qs = artists_qs.filter(name__icontains=q)
    artists_qs = artists_qs.order_by('name')

    return render(
        request,
        'songs/artist_list.html',
        {
            'artists': artists_qs,
            'q': q,
        },
    )


@login_required
def artist_edit(request, pk):
    artist = get_object_or_404(ArtistIndex, pk=pk)
    original_name = artist.name
    if request.method == 'POST':
        form = ArtistForm(request.POST, instance=artist)
        if form.is_valid():
            form.save()
            if artist.name != original_name:
                Song.objects.filter(artist=original_name).update(artist=artist.name)
            return redirect('ui_artist_list')
    else:
        form = ArtistForm(instance=artist)
    return render(
        request,
        'songs/artist_edit.html',
        {
            'form': form,
            'artist': artist,
        },
    )


@login_required
def artist_detail(request, pk):
    artist = get_object_or_404(ArtistIndex, pk=pk)
    songs = Song.objects.filter(artist=artist.name).prefetch_related('tags').order_by('title')
    return render(
        request,
        'songs/artist_detail.html',
        {
            'artist': artist,
            'songs': songs,
        },
    )


@login_required
def leaderboard_list(request):
    song_code = (request.GET.get('song') or '').strip()
    songs = (
        Song.objects
        .order_by('title')
        .annotate(top_score=Max('scores__score'))
    )

    selected_song = None
    scores = []
    if song_code:
        selected_song = Song.objects.filter(code=song_code).first()
        if selected_song:
            scores = (
                Score.objects.filter(song=selected_song)
                .select_related('user')
                .order_by('-score', '-accuracy', '-max_combo', '-updated_at')[:100]
            )

    return render(
        request,
        'scores/leaderboard_list.html',
        {
            'songs': songs,
            'selected_song': selected_song,
            'scores': scores,
            'song_code': song_code,
        },
    )
