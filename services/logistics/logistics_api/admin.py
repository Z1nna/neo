from django.contrib import admin
from .models import DeliverySlot, Shipment, ReturnRequest

admin.site.register(DeliverySlot)
admin.site.register(Shipment)
admin.site.register(ReturnRequest)
