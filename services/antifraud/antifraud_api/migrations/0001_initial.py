import uuid

from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = []

    operations = [
        migrations.CreateModel(
            name='FraudCheck',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('order_id', models.UUIDField(db_index=True)),
                ('user_id', models.UUIDField(db_index=True)),
                ('amount', models.BigIntegerField()),
                ('score', models.IntegerField()),
                ('decision', models.CharField(choices=[('ALLOW', 'ALLOW'), ('REVIEW', 'REVIEW'), ('BLOCK', 'BLOCK')], max_length=16)),
                ('reasons', models.JSONField(blank=True, default=list)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
        ),
    ]
