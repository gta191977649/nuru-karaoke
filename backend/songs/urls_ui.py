from django.contrib.auth import views as auth_views
from django.urls import path

from . import views_ui

urlpatterns = [
    path('', views_ui.login_redirect, name='ui_home'),
    path('login/', auth_views.LoginView.as_view(template_name='auth/login.html'), name='ui_login'),
    path('logout/', views_ui.logout_view, name='ui_logout'),
    path('artists/', views_ui.artist_list, name='ui_artist_list'),
    path('artists/<int:pk>/', views_ui.artist_detail, name='ui_artist_detail'),
    path('artists/<int:pk>/edit/', views_ui.artist_edit, name='ui_artist_edit'),
    path('leaderboard/', views_ui.leaderboard_list, name='ui_leaderboard'),
    path('songs/', views_ui.song_list, name='ui_song_list'),
    path('songs/new/', views_ui.song_create, name='ui_song_create'),
    path('songs/<int:pk>/edit/', views_ui.song_edit, name='ui_song_edit'),
    path('songs/<int:pk>/delete/', views_ui.song_delete, name='ui_song_delete'),
    path('tags/', views_ui.tag_list, name='ui_tag_list'),
    path('tags/new/', views_ui.tag_create, name='ui_tag_create'),
    path('tags/<int:pk>/delete/', views_ui.tag_delete, name='ui_tag_delete'),
]
