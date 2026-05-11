import uuid

from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = []

    operations = [
        migrations.CreateModel(
            name='DeliverySlot',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('city', models.CharField(db_index=True, max_length=120)),
                ('date', models.DateField(db_index=True)),
                ('window_from', models.TimeField()),
                ('window_to', models.TimeField()),
                ('capacity', models.IntegerField(default=50)),
                ('booked', models.IntegerField(default=0)),
            ],
        ),
        migrations.CreateModel(
            name='Shipment',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('order_id', models.UUIDField(unique=True)),
                ('user_id', models.UUIDField(db_index=True)),
                ('tracking_number', models.CharField(max_length=64, unique=True)),
                ('status', models.CharField(choices=[('CREATED', 'CREATED'), ('IN_TRANSIT', 'IN_TRANSIT'), ('DELIVERED', 'DELIVERED'), ('RETURNING', 'RETURNING'), ('RETURNED', 'RETURNED')], db_index=True, default='CREATED', max_length=32)),
                ('events', models.JSONField(blank=True, default=list)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('slot', models.ForeignKey(on_delete=models.deletion.PROTECT, related_name='shipments', to='logistics_api.deliveryslot')),
            ],
        ),
        migrations.CreateModel(
            name='ReturnRequest',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('reason', models.CharField(max_length=255)),
                ('status', models.CharField(choices=[('CREATED', 'CREATED'), ('APPROVED', 'APPROVED'), ('PICKED_UP', 'PICKED_UP'), ('COMPLETED', 'COMPLETED')], default='CREATED', max_length=24)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('shipment', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='returns', to='logistics_api.shipment')),
            ],
        ),
    ]
