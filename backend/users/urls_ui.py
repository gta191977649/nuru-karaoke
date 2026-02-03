from django.urls import path

from . import views_ui

urlpatterns = [
    path('users/', views_ui.user_list, name='ui_user_list'),
    path('users/<int:pk>/', views_ui.user_detail, name='ui_user_detail'),
    path('users/<int:pk>/songs/<int:song_id>/', views_ui.user_song_detail, name='ui_user_song_detail'),
    path('users/<int:pk>/songs/<int:song_id>/scores/<int:history_id>/', views_ui.user_score_detail, name='ui_user_score_detail'),
]
