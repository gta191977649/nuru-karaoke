from django.contrib.auth import get_user_model
from django.contrib.auth.decorators import login_required
from django.db.models import Count, Max, Q
from django.shortcuts import get_object_or_404, render
from mido import MidiFile, merge_tracks, tick2second

from songs.models import Song
from .models import ScoreHistory




def _build_reference_curve(song):
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

    results = []
    total_end = max(seg[1] for seg in segments)
    cursor = 0.0
    for start, end, note in segments:
        if start > cursor:
            results.append({'t': cursor, 'midi': None})
            results.append({'t': start, 'midi': None})
        results.append({'t': start, 'midi': note})
        results.append({'t': end, 'midi': note})
        cursor = max(cursor, end)

    if cursor < total_end:
        results.append({'t': cursor, 'midi': None})
        results.append({'t': total_end, 'midi': None})

    return results, {'segments': len(segments), 'min_t': 0.0, 'max_t': total_end}


def _build_user_curve_with_gaps(f0_curve):
    if not isinstance(f0_curve, list):
        return []
    points = []
    for point in f0_curve:
        if isinstance(point, dict) and isinstance(point.get('t'), (int, float)):
            t = float(point['t'])
            midi = point.get('midi')
            midi = float(midi) if isinstance(midi, (int, float)) else None
            points.append({'t': t, 'midi': midi})
    if not points:
        return []
    points.sort(key=lambda item: item['t'])
    # Estimate typical step to detect gaps
    deltas = [points[i + 1]['t'] - points[i]['t'] for i in range(len(points) - 1)]
    deltas = [d for d in deltas if d > 0]
    if deltas:
        deltas.sort()
        mid = len(deltas) // 2
        median = deltas[mid] if len(deltas) % 2 else (deltas[mid - 1] + deltas[mid]) / 2
    else:
        median = 0.0
    gap_threshold = max(0.05, median * 3) if median > 0 else 0.2

    results = [points[0]]
    for prev, curr in zip(points, points[1:]):
        if curr['t'] - prev['t'] > gap_threshold:
            # Insert a null break to avoid connecting across missing time
            results.append({'t': prev['t'], 'midi': None})
            results.append({'t': curr['t'], 'midi': None})
        results.append(curr)
    return results


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
    f0_curve_display = _build_user_curve_with_gaps(f0_curve)
    reference_curve, ref_debug = _build_reference_curve(song)
    return render(
        request,
        'users/user_score_detail.html',
        {
            'user_obj': user,
            'song': song,
            'history': history,
            'reference_curve': reference_curve,
            'f0_curve_display': f0_curve_display,
            'ref_debug': ref_debug,
            'midi_path': getattr(song.midi_file, 'path', ''),
        },
    )
