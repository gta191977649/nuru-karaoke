from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import SongViewSet, TagViewSet
from .synth_resources import smu_manifest, smu_rom

router = DefaultRouter()
router.register('songs', SongViewSet, basename='songs')
router.register('tags', TagViewSet, basename='tags')

urlpatterns = [
    path('synth/smu2000/manifest/', smu_manifest),
    path('synth/smu2000/rom/<str:name>/', smu_rom),
    path('', include(router.urls)),
]
