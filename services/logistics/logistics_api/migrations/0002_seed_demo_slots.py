from datetime import date, time, timedelta

from django.db import migrations


def seed_demo_slots(apps, schema_editor):
    DeliverySlot = apps.get_model('logistics_api', 'DeliverySlot')

    cities = ['Moscow', 'Yekaterinburg', 'Saint Petersburg']
    windows = [
        (time(10, 0), time(14, 0)),
        (time(14, 0), time(18, 0)),
    ]

    for city in cities:
        for day_offset in range(1, 4):
            slot_date = date.today() + timedelta(days=day_offset)
            for window_from, window_to in windows:
                DeliverySlot.objects.get_or_create(
                    city=city,
                    date=slot_date,
                    window_from=window_from,
                    window_to=window_to,
                    defaults={'capacity': 30, 'booked': 0},
                )


class Migration(migrations.Migration):

    dependencies = [
        ('logistics_api', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_demo_slots, migrations.RunPython.noop),
    ]
