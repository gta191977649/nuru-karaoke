from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from songs.models import Song
from users.models import ScoreHistory
from .models import Score


class VersionedScoreApiTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user_v6 = user_model.objects.create_user(username='v6-singer', password='test')
        self.user_v5 = user_model.objects.create_user(username='v5-singer', password='test')
        self.user_v4 = user_model.objects.create_user(username='v4-singer', password='test')
        self.user_v3 = user_model.objects.create_user(username='v3-singer', password='test')
        self.user_v2 = user_model.objects.create_user(username='v2-singer', password='test')
        self.user_legacy = user_model.objects.create_user(username='legacy-singer', password='test')
        self.song = Song.objects.create(code='test-song', title='Test Song')
        self.client = APIClient()

    def test_score_submission_persists_algorithm_version_in_both_tables(self):
        self.client.force_authenticate(self.user_v6)
        response = self.client.post(
            '/api/scores',
            {
                'song': self.song.code,
                'score': 88,
                'play_mode': 'competitive',
                'version': 'pitch-v6',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(Score.objects.get().version, 'pitch-v6')
        self.assertEqual(ScoreHistory.objects.get().version, 'pitch-v6')

    def test_leaderboard_filters_when_version_is_supplied(self):
        Score.objects.create(user=self.user_v6, song=self.song, score=80, version='pitch-v6')
        Score.objects.create(user=self.user_v5, song=self.song, score=98, version='pitch-v5')
        Score.objects.create(user=self.user_legacy, song=self.song, score=99, version='')

        response = self.client.get('/api/leaderboard', {
            'song': self.song.code,
            'version': 'pitch-v6',
        })

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['version'], 'pitch-v6')
        self.assertEqual([row['username'] for row in response.data['results']], ['v6-singer'])
        self.assertEqual(response.data['results'][0]['version'], 'pitch-v6')

    def test_omitting_version_preserves_legacy_mixed_query(self):
        Score.objects.create(user=self.user_v2, song=self.song, score=80, version='pitch-v2')
        Score.objects.create(user=self.user_legacy, song=self.song, score=99, version='')

        response = self.client.get('/api/leaderboard', {'song': self.song.code})

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data['version'])
        self.assertEqual(len(response.data['results']), 2)
