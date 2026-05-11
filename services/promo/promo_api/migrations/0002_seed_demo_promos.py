from django.db import migrations


def seed_demo_promos(apps, schema_editor):
    PromoCode = apps.get_model('promo_api', 'PromoCode')

    PromoCode.objects.get_or_create(
        code='WELCOME10',
        defaults={
            'discount_type': 'PERCENT',
            'discount_value': 10,
            'min_order_amount': 0,
            'active': True,
            'usage_limit': 0,
            'used_count': 0,
        },
    )

    PromoCode.objects.get_or_create(
        code='SAVE300',
        defaults={
            'discount_type': 'FIXED',
            'discount_value': 300,
            'min_order_amount': 3000,
            'active': True,
            'usage_limit': 0,
            'used_count': 0,
        },
    )


def unseed_demo_promos(apps, schema_editor):
    PromoCode = apps.get_model('promo_api', 'PromoCode')
    PromoCode.objects.filter(code__in=['WELCOME10', 'SAVE300']).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('promo_api', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_demo_promos, unseed_demo_promos),
    ]
