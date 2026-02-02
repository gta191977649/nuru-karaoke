from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import SongViewSet, TagViewSet

router = DefaultRouter()
router.register('songs', SongViewSet, basename='songs')
router.register('tags', TagViewSet, basename='tags')

urlpatterns = [
    path('', include(router.urls)),
]
