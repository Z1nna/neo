from django.db import migrations


def seed_polina(apps, schema_editor):
    PromoCode = apps.get_model('promo_api', 'PromoCode')
    PromoCode.objects.get_or_create(
        code='POLINA',
        defaults={
            'discount_type': 'PERCENT',
            'discount_value': 30,
            'min_order_amount': 0,
            'active': True,
            'usage_limit': 0,
            'used_count': 0,
        },
    )


def unseed_polina(apps, schema_editor):
    PromoCode = apps.get_model('promo_api', 'PromoCode')
    PromoCode.objects.filter(code='POLINA').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('promo_api', '0002_seed_demo_promos'),
    ]

    operations = [
        migrations.RunPython(seed_polina, unseed_polina),
    ]
