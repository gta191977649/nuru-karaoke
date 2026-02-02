from decimal import Decimal

from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Score
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

        obj, created = Score.objects.get_or_create(
            user=request.user, song=song,
            defaults=incoming,
        )

        if created:
            return Response({'status': 'created'})

        def to_decimal(v):
            if v is None:
                return Decimal('0')
            if isinstance(v, Decimal):
                return v
            return Decimal(str(v))

        existing_tuple = (obj.score, to_decimal(obj.accuracy), obj.max_combo or 0)
        incoming_tuple = (incoming['score'], to_decimal(incoming['accuracy']), incoming['max_combo'] or 0)

        if incoming_tuple > existing_tuple:
            for key, value in incoming.items():
                setattr(obj, key, value)
            obj.save(update_fields=['score', 'accuracy', 'max_combo', 'play_mode', 'difficulty', 'version', 'updated_at'])
            return Response({'status': 'updated'})

        return Response({'status': 'ignored'})


class LeaderboardAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        song_code = request.query_params.get('song')
        if not song_code:
            return Response({'detail': 'song is required.'}, status=400)

        qs = Score.objects.filter(song__code=song_code).select_related('user')
        qs = qs.order_by('-score', '-accuracy', '-max_combo', '-updated_at')[:100]

        data = []
        for idx, score in enumerate(qs, start=1):
            item = ScoreSerializer(score).data
            item['rank'] = idx
            data.append(item)

        return Response({
            'song': song_code,
            'limit': 100,
            'results': data,
        })
