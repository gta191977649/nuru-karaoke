from django.contrib import admin

from .models import Song, Tag


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    search_fields = ('name',)


@admin.register(Song)
class SongAdmin(admin.ModelAdmin):
    list_display = ('code', 'title', 'artist', 'language', 'is_published', 'updated_at')
    list_filter = ('is_published', 'language', 'tags')
    search_fields = ('code', 'title', 'artist')
    filter_horizontal = ('tags',)
