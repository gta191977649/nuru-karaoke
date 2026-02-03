from django.urls import path

from .views import (
    LoginAPIView,
    LogoutAPIView,
    MeAPIView,
    MyFavoriteDeleteAPIView,
    MyFavoritesAPIView,
    MyHistoryAPIView,
    MyScoresAPIView,
    PersonalVsNationalAPIView,
    RefreshAPIView,
    RegisterAPIView,
)

urlpatterns = [
    path('auth/register', RegisterAPIView.as_view()),
    path('auth/login', LoginAPIView.as_view()),
    path('auth/refresh', RefreshAPIView.as_view()),
    path('auth/logout', LogoutAPIView.as_view()),
    path('user/me', MeAPIView.as_view()),
    path('user/scores', MyScoresAPIView.as_view()),
    path('user/favorites', MyFavoritesAPIView.as_view()),
    path('user/favorites/<str:code>', MyFavoriteDeleteAPIView.as_view()),
    path('user/history', MyHistoryAPIView.as_view()),
    path('user/leaderboard', PersonalVsNationalAPIView.as_view()),
]
