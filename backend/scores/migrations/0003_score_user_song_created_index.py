from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('scores', '0002_remove_score_unique_user_song'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='score',
            index=models.Index(
                fields=['user', 'song', '-created_at'],
                name='scores_scor_user_id_5e548a_idx',
            ),
        ),
    ]
