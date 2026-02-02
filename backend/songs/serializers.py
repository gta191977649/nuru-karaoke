from rest_framework import serializers

from .models import Song, Tag


class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ('name',)


class SongSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source='code', read_only=True)
    tags = serializers.SlugRelatedField(many=True, slug_field='name', read_only=True)
    url = serializers.SerializerMethodField()
    lrc = serializers.SerializerMethodField()
    cover = serializers.SerializerMethodField()

    class Meta:
        model = Song
        fields = (
            'id', 'title', 'artist', 'language', 'duration_seconds',
            'bpm', 'key', 'tags', 'url', 'lrc', 'cover', 'lrc_offset',
        )

    def _build_url(self, request, file_field):
        if not file_field:
            return None
        if request is None:
            return file_field.url
        return request.build_absolute_uri(file_field.url)

    def get_url(self, obj):
        request = self.context.get('request')
        return self._build_url(request, obj.midi_file)

    def get_lrc(self, obj):
        request = self.context.get('request')
        return self._build_url(request, obj.lrc_file)

    def get_cover(self, obj):
        request = self.context.get('request')
        return self._build_url(request, obj.cover_image)
