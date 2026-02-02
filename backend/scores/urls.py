from django.urls import path

from .views import LeaderboardAPIView, ScoreSubmitAPIView

urlpatterns = [
    path('scores', ScoreSubmitAPIView.as_view()),
    path('leaderboard', LeaderboardAPIView.as_view()),
]
