from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Score
from users.models import ScoreHistory
from .serializers import ScoreSerializer, ScoreSubmitSerializer


class ScoreSubmitAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ScoreSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        song = serializer.validated_data['song']
        incoming = {
            'score': serializer.validated_data['score'],
            'accuracy': serializer.validated_data.get('accuracy'),
            'max_combo': serializer.validated_data.get('max_combo'),
            'play_mode': serializer.validated_data.get('play_mode', ''),
            'difficulty': serializer.validated_data.get('difficulty', ''),
            'version': serializer.validated_data.get('version', ''),
        }

        Score.objects.create(user=request.user, song=song, **incoming)
        ScoreHistory.objects.create(
            user=request.user,
            song=song,
            score=incoming['score'],
            accuracy=incoming.get('accuracy'),
            max_combo=incoming.get('max_combo'),
            f0_curve=serializer.validated_data.get('f0_curve'),
            technique_counts=serializer.validated_data.get('technique_counts'),
        )
        return Response({'status': 'created'})


class LeaderboardAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        song_code = request.query_params.get('song')
        if not song_code:
            return Response({'detail': 'song is required.'}, status=400)

        qs = (
            Score.objects.filter(song__code=song_code)
            .select_related('user')
            .order_by('-score', '-accuracy', '-max_combo', '-created_at')
        )
        seen = set()
        data = []
        for score in qs:
            if score.user_id in seen:
                continue
            seen.add(score.user_id)
            item = ScoreSerializer(score).data
            item['rank'] = len(data) + 1
            data.append(item)
            if len(data) >= 100:
                break

        return Response({
            'song': song_code,
            'limit': 100,
            'results': data,
        })
