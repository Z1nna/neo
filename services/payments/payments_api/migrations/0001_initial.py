import uuid

from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = []

    operations = [
        migrations.CreateModel(
            name='Payment',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('order_id', models.UUIDField(db_index=True)),
                ('user_id', models.UUIDField(db_index=True)),
                ('amount', models.BigIntegerField()),
                ('currency', models.CharField(default='RUB', max_length=8)),
                ('status', models.CharField(choices=[('HOLD', 'HOLD'), ('CAPTURED', 'CAPTURED'), ('REFUNDED', 'REFUNDED'), ('FAILED', 'FAILED')], db_index=True, default='HOLD', max_length=16)),
                ('provider_payment_id', models.CharField(blank=True, max_length=128)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
        ),
        migrations.CreateModel(
            name='PaymentOutbox',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('aggregate_id', models.UUIDField(db_index=True)),
                ('event_type', models.CharField(max_length=64)),
                ('payload', models.JSONField(default=dict)),
                ('published', models.BooleanField(db_index=True, default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
        ),
    ]
