from django.contrib.auth import get_user_model
from rest_framework import serializers

from songs.models import Song
from scores.models import Score
from .models import FavoriteSong, PlayHistory, UserProfile


User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ('username', 'email', 'password')

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('Email already in use.')
        return value

    def create(self, validated_data):
        user = User(username=validated_data['username'], email=validated_data['email'])
        user.set_password(validated_data['password'])
        user.save()
        return user


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = ('display_name', 'region', 'avatar_url')


class UserSerializer(serializers.ModelSerializer):
    profile = UserProfileSerializer()

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'profile')


class FavoriteSongSerializer(serializers.ModelSerializer):
    song_code = serializers.CharField(source='song.code', read_only=True)
    title = serializers.CharField(source='song.title', read_only=True)
    artist = serializers.CharField(source='song.artist', read_only=True)

    class Meta:
        model = FavoriteSong
        fields = ('song_code', 'title', 'artist', 'created_at')


class PlayHistorySerializer(serializers.ModelSerializer):
    song_code = serializers.CharField(source='song.code', read_only=True)
    title = serializers.CharField(source='song.title', read_only=True)
    artist = serializers.CharField(source='song.artist', read_only=True)

    class Meta:
        model = PlayHistory
        fields = ('song_code', 'title', 'artist', 'score', 'accuracy', 'max_combo', 'created_at')


class ScoreSerializer(serializers.ModelSerializer):
    song_code = serializers.CharField(source='song.code', read_only=True)
    title = serializers.CharField(source='song.title', read_only=True)
    artist = serializers.CharField(source='song.artist', read_only=True)

    class Meta:
        model = Score
        fields = ('song_code', 'title', 'artist', 'score', 'accuracy', 'max_combo', 'updated_at')


class FavoriteCreateSerializer(serializers.Serializer):
    song = serializers.CharField()

    def validate_song(self, value):
        try:
            return Song.objects.get(code=value)
        except Song.DoesNotExist:
            raise serializers.ValidationError('Song not found.')
