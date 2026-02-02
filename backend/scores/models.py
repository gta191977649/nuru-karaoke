from django.conf import settings
from django.db import models

from songs.models import Song


class Score(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='scores')
    song = models.ForeignKey(Song, on_delete=models.CASCADE, related_name='scores')

    score = models.PositiveIntegerField()
    accuracy = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    max_combo = models.PositiveIntegerField(null=True, blank=True)
    play_mode = models.CharField(max_length=32, blank=True)
    difficulty = models.CharField(max_length=32, blank=True)
    version = models.CharField(max_length=32, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['user', 'song'], name='unique_best_score_per_user_song')
        ]
        indexes = [
            models.Index(fields=['song', '-score', '-updated_at']),
        ]

    def __str__(self):
        return f'{self.user} - {self.song} - {self.score}'
