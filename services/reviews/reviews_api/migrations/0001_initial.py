import uuid

from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = []

    operations = [
        migrations.CreateModel(
            name='ProductReview',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('product_id', models.UUIDField(db_index=True)),
                ('user_id', models.UUIDField(db_index=True)),
                ('rating', models.IntegerField()),
                ('text', models.TextField(blank=True)),
                ('status', models.CharField(choices=[('PUBLISHED', 'PUBLISHED'), ('HIDDEN', 'HIDDEN')], db_index=True, default='PUBLISHED', max_length=16)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
        ),
    ]
