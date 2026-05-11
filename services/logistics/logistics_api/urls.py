from django.urls import path

from .views import ReturnRequestView, ShipmentTrackingView, ShipmentsView, SlotsView


urlpatterns = [
    path('logistics/slots/', SlotsView.as_view(), name='logistics-slots'),
    path('logistics/shipments/', ShipmentsView.as_view(), name='logistics-shipments'),
    path('logistics/shipments/<uuid:shipment_id>/tracking/', ShipmentTrackingView.as_view(), name='logistics-tracking'),
    path('logistics/shipments/<uuid:shipment_id>/returns/', ReturnRequestView.as_view(), name='logistics-returns'),
]
