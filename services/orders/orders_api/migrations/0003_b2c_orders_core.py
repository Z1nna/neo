from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("orders_api", "0002_event_bus"),
    ]

    operations = [
        migrations.AddField(
            model_name="orderitem",
            name="product_title",
            field=models.CharField(default="", max_length=255),
        ),
        migrations.AddField(
            model_name="orderitem",
            name="sku_name",
            field=models.CharField(default="", max_length=255),
        ),
        migrations.AlterField(
            model_name="order",
            name="status",
            field=models.CharField(
                choices=[
                    ("PENDING", "PENDING"),
                    ("PAID", "PAID"),
                    ("ASSEMBLING", "ASSEMBLING"),
                    ("DELIVERING", "DELIVERING"),
                    ("DELIVERED", "DELIVERED"),
                    ("CANCELED", "CANCELED"),
                    ("CANCEL_PENDING", "CANCEL_PENDING"),
                ],
                default="PENDING",
                max_length=32,
            ),
        ),
    ]
