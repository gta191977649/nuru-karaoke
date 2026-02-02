from django.db.models import Q
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from rest_framework.viewsets import ReadOnlyModelViewSet

from .models import Song, Tag
from .serializers import SongSerializer, TagSerializer


class SongPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 200


class SongViewSet(ReadOnlyModelViewSet):
    serializer_class = SongSerializer
    permission_classes = [AllowAny]
    lookup_field = 'code'
    pagination_class = SongPagination

    def get_queryset(self):
        qs = Song.objects.filter(is_published=True).prefetch_related('tags')
        q = self.request.query_params.get('q')
        tag = self.request.query_params.get('tag')
        language = self.request.query_params.get('language')
        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(artist__icontains=q))
        if tag:
            qs = qs.filter(tags__name__iexact=tag)
        if language:
            qs = qs.filter(language__iexact=language)
        return qs.order_by('title')


class TagViewSet(ReadOnlyModelViewSet):
    queryset = Tag.objects.order_by('name')
    serializer_class = TagSerializer
    permission_classes = [AllowAny]
