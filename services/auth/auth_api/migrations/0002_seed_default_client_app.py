from django.db import migrations


def seed_default_client_app(apps, schema_editor):
    ClientApp = apps.get_model('auth_api', 'ClientApp')
    ClientApp.objects.get_or_create(
        client_id='neomarket-web',
        defaults={
            'client_secret': 'dev-secret',
            'name': 'NeoMarket Web Frontend',
            'scopes': ['marketplace:ui'],
            'is_active': True,
        },
    )


def unseed_default_client_app(apps, schema_editor):
    ClientApp = apps.get_model('auth_api', 'ClientApp')
    ClientApp.objects.filter(client_id='neomarket-web').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('auth_api', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_default_client_app, unseed_default_client_app),
    ]
