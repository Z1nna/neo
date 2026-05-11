from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = []

    operations = [
        migrations.CreateModel(
            name='PromoCode',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(max_length=32, unique=True)),
                ('discount_type', models.CharField(choices=[('PERCENT', 'PERCENT'), ('FIXED', 'FIXED')], max_length=16)),
                ('discount_value', models.IntegerField()),
                ('min_order_amount', models.IntegerField(default=0)),
                ('active', models.BooleanField(default=True)),
                ('usage_limit', models.IntegerField(default=0)),
                ('used_count', models.IntegerField(default=0)),
            ],
        ),
    ]
