from django.contrib.auth import authenticate
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import RegisterSerializer


class RegisterAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        return Response({
            'refresh': str(refresh),
            'access': str(refresh.access_token),
        })


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
        return Response({
            'refresh': str(refresh),
            'access': str(refresh.access_token),
        })
