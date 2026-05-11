import uuid

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('reviews_api', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='ProductQuestion',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('product_id', models.UUIDField(db_index=True)),
                ('user_id', models.UUIDField(db_index=True)),
                ('question', models.TextField()),
                ('answer', models.TextField(blank=True)),
                ('answered_by', models.UUIDField(blank=True, null=True)),
                ('status', models.CharField(choices=[('OPEN', 'OPEN'), ('ANSWERED', 'ANSWERED')], db_index=True, default='OPEN', max_length=16)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('answered_at', models.DateTimeField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
        ),
    ]
