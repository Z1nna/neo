from django.contrib import admin

from .models import Payment, PaymentOutbox

admin.site.register(Payment)
admin.site.register(PaymentOutbox)
