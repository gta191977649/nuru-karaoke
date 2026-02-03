from datetime import timedelta

from django.contrib.auth import authenticate
from rest_framework import serializers
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from scores.models import Score
from .models import FavoriteSong, PlayHistory
from .serializers import (
    FavoriteCreateSerializer,
    FavoriteSongSerializer,
    PlayHistorySerializer,
    RegisterSerializer,
    ScoreSerializer,
    UserProfileSerializer,
    UserSerializer,
)


class RegisterAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        response = Response({
            'access': str(refresh.access_token),
        })
        response.set_cookie(
            'refresh_token',
            str(refresh),
            httponly=True,
            samesite='Lax',
            secure=False,
            max_age=int(timedelta(days=14).total_seconds()),
        )
        return response


class LoginAPIView(APIView):
    permission_classes = [AllowAny]

    class InputSerializer(serializers.Serializer):
        username_or_email = serializers.CharField()
        password = serializers.CharField()

    def post(self, request):
        serializer = self.InputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        username_or_email = serializer.validated_data['username_or_email']
        password = serializer.validated_data['password']
        user = authenticate(request, username=username_or_email, password=password)
        if not user:
            return Response({'detail': 'Invalid credentials.'}, status=401)
        refresh = RefreshToken.for_user(user)
        response = Response({
            'access': str(refresh.access_token),
        })
        response.set_cookie(
            'refresh_token',
            str(refresh),
            httponly=True,
            samesite='Lax',
            secure=False,
            max_age=int(timedelta(days=14).total_seconds()),
        )
        return response


class RefreshAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        token = request.COOKIES.get('refresh_token')
        if not token:
            return Response({'detail': 'Refresh token missing.'}, status=401)
        try:
            refresh = RefreshToken(token)
        except Exception:
            return Response({'detail': 'Invalid refresh token.'}, status=401)
        access = str(refresh.access_token)
        response = Response({'access': access})
        return response


class LogoutAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        response = Response({'status': 'ok'})
        response.delete_cookie('refresh_token')
        return response


class MeAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        profile = request.user.profile
        serializer = UserProfileSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(request.user).data)


class MyScoresAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        scores = Score.objects.filter(user=request.user).order_by('-updated_at')
        return Response(ScoreSerializer(scores, many=True).data)


class MyFavoritesAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        favorites = FavoriteSong.objects.filter(user=request.user).select_related('song').order_by('-created_at')
        return Response(FavoriteSongSerializer(favorites, many=True).data)

    def post(self, request):
        serializer = FavoriteCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        song = serializer.validated_data['song']
        FavoriteSong.objects.get_or_create(user=request.user, song=song)
        return Response({'status': 'ok'})


class MyFavoriteDeleteAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, code):
        FavoriteSong.objects.filter(user=request.user, song__code=code).delete()
        return Response({'status': 'ok'})


class MyHistoryAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        song_code = request.query_params.get('song')
        qs = PlayHistory.objects.filter(user=request.user).select_related('song')
        if song_code:
            qs = qs.filter(song__code=song_code)
        qs = qs.order_by('-created_at')[:200]
        return Response(PlayHistorySerializer(qs, many=True).data)


class PersonalVsNationalAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        song_code = request.query_params.get('song')
        if not song_code:
            return Response({'detail': 'song is required.'}, status=400)
        personal = Score.objects.filter(user=request.user, song__code=song_code).first()
        national = Score.objects.filter(song__code=song_code).order_by('-score', '-accuracy', '-max_combo')[:10]
        return Response({
            'personal': ScoreSerializer(personal).data if personal else None,
            'national_top': ScoreSerializer(national, many=True).data,
        })
