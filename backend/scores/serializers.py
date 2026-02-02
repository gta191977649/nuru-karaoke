from rest_framework import serializers

from songs.models import Song
from .models import Score


class ScoreSubmitSerializer(serializers.Serializer):
    song = serializers.CharField()
    score = serializers.IntegerField(min_value=0)
    accuracy = serializers.DecimalField(max_digits=5, decimal_places=2, required=False)
    max_combo = serializers.IntegerField(min_value=0, required=False)
    play_mode = serializers.CharField(required=False, allow_blank=True)
    difficulty = serializers.CharField(required=False, allow_blank=True)
    version = serializers.CharField(required=False, allow_blank=True)

    def validate_song(self, value):
        try:
            song = Song.objects.get(code=value)
        except Song.DoesNotExist:
            raise serializers.ValidationError('Song not found.')
        return song


class ScoreSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = Score
        fields = ('username', 'score', 'accuracy', 'max_combo', 'updated_at')
