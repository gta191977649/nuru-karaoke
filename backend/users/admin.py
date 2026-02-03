from django.contrib import admin

from .models import FavoriteSong, PlayHistory, UserProfile


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'display_name', 'region', 'updated_at')
    search_fields = ('user__username', 'display_name', 'region')


@admin.register(FavoriteSong)
class FavoriteSongAdmin(admin.ModelAdmin):
    list_display = ('user', 'song', 'created_at')
    search_fields = ('user__username', 'song__title', 'song__artist')


@admin.register(PlayHistory)
class PlayHistoryAdmin(admin.ModelAdmin):
    list_display = ('user', 'song', 'score', 'created_at')
    search_fields = ('user__username', 'song__title', 'song__artist')
