from django.contrib import admin

from .models import Category, Invoice, InvoiceItem, Product, Sku

admin.site.register(Category)
admin.site.register(Product)
admin.site.register(Sku)
admin.site.register(Invoice)
admin.site.register(InvoiceItem)
