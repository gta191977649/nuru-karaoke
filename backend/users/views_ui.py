from django.contrib.auth import get_user_model
from django.contrib.auth.decorators import login_required
from django.db.models import Count, Max, Q
from django.shortcuts import get_object_or_404, render
from mido import MidiFile, merge_tracks, tick2second

from songs.models import Song
from .models import ScoreHistory


def _build_reference_curve(song, times):
    if not song or not song.midi_file:
        return [], {'segments': 0, 'min_t': None, 'max_t': None}
    midi_path = getattr(song.midi_file, 'path', '')
    if not midi_path:
        return [], {'segments': 0, 'min_t': None, 'max_t': None}
    try:
        midi = MidiFile(midi_path)
    except Exception:
        return [], {'segments': 0, 'min_t': None, 'max_t': None}

    tempo = 500000
    time_sec = 0.0
    active = {}
    segments = []

    for msg in merge_tracks(midi.tracks):
        delta_ticks = int(msg.time) if msg.time else 0
        if delta_ticks:
            time_sec += float(tick2second(delta_ticks, midi.ticks_per_beat, tempo))
        if msg.type == 'set_tempo':
            tempo = msg.tempo
            continue
        if not hasattr(msg, 'channel') or msg.channel != 0:
            continue
        if msg.type == 'note_on' and msg.velocity > 0:
            active[msg.note] = time_sec
        elif msg.type == 'note_off' or (msg.type == 'note_on' and msg.velocity == 0):
            start = active.pop(msg.note, None)
            if start is not None and time_sec >= start:
                segments.append((start, time_sec, msg.note))

    if active:
        end_time = time_sec
        for note, start in active.items():
            if end_time >= start:
                segments.append((start, end_time, note))

    segments.sort(key=lambda seg: seg[0])
    if not segments:
        return [], {'segments': 0, 'min_t': None, 'max_t': None}

    times_sorted = sorted(times)
    times_min = times_sorted[0] if times_sorted else None
    offset = segments[0][0] - times_min if times_min is not None else 0.0
    idx = 0
    results = []
    for t in times_sorted:
        t_lookup = t + offset
        while idx < len(segments) and t_lookup >= segments[idx][1]:
            idx += 1
        note = None
        if idx < len(segments) and segments[idx][0] <= t_lookup < segments[idx][1]:
            note = segments[idx][2]

        results.append({
            't': t,
            'midi': note,
        })
    min_t = segments[0][0] if segments else None
    max_t = segments[-1][1] if segments else None

    return results, {'segments': len(segments), 'min_t': min_t, 'max_t': max_t}


@login_required
def user_list(request):
    q = (request.GET.get('q') or '').strip()
    User = get_user_model()
    users = User.objects.all()
    if q:
        users = users.filter(Q(username__icontains=q) | Q(email__icontains=q))
    users = (
        users
        .annotate(play_count=Count('score_history', distinct=True))
        .annotate(last_play=Max('score_history__created_at'))
        .order_by('username')
    )
    return render(
        request,
        'users/user_list.html',
        {
            'users': users,
            'q': q,
        },
    )


@login_required
def user_detail(request, pk):
    User = get_user_model()
    user = get_object_or_404(User, pk=pk)
    songs = (
        ScoreHistory.objects
        .filter(user=user)
        .values('song', 'song__code', 'song__title', 'song__artist')
        .annotate(best_score=Max('score'))
        .annotate(play_count=Count('id'))
        .order_by('song__title')
    )
    return render(
        request,
        'users/user_detail.html',
        {
            'user_obj': user,
            'songs': songs,
        },
    )


@login_required
def user_song_detail(request, pk, song_id):
    User = get_user_model()
    user = get_object_or_404(User, pk=pk)
    song = get_object_or_404(Song, pk=song_id)
    histories = (
        ScoreHistory.objects
        .filter(user=user, song=song)
        .order_by('-created_at')
    )
    return render(
        request,
        'users/user_song_detail.html',
        {
            'user_obj': user,
            'song': song,
            'histories': histories,
        },
    )


@login_required
def user_score_detail(request, pk, song_id, history_id):
    User = get_user_model()
    user = get_object_or_404(User, pk=pk)
    song = get_object_or_404(Song, pk=song_id)
    history = get_object_or_404(ScoreHistory, pk=history_id, user=user, song=song)
    f0_curve = history.f0_curve or []
    times = []
    if isinstance(f0_curve, list):
        for point in f0_curve:
            if isinstance(point, dict) and isinstance(point.get('t'), (int, float)):
                times.append(float(point['t']))
    reference_curve, ref_debug = _build_reference_curve(song, times) if times else ([], {'segments': 0, 'min_t': None, 'max_t': None})
    return render(
        request,
        'users/user_score_detail.html',
        {
            'user_obj': user,
            'song': song,
            'history': history,
            'reference_curve': reference_curve,
            'ref_debug': ref_debug,
            'midi_path': getattr(song.midi_file, 'path', ''),
        },
    )
