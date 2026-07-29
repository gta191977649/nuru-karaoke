from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0003_scorehistory_technique_counts'),
    ]

    operations = [
        migrations.AddField(
            model_name='scorehistory',
            name='version',
            field=models.CharField(blank=True, max_length=32),
        ),
    ]
