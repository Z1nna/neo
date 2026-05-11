from django.urls import path

from .views import PaymentCaptureView, PaymentDetailView, PaymentHoldView, PaymentRefundView, ProviderWebhookView


urlpatterns = [
    path('payments/hold/', PaymentHoldView.as_view(), name='payments-hold'),
    path('payments/<uuid:payment_id>/', PaymentDetailView.as_view(), name='payments-detail'),
    path('payments/<uuid:payment_id>/capture/', PaymentCaptureView.as_view(), name='payments-capture'),
    path('payments/<uuid:payment_id>/refund/', PaymentRefundView.as_view(), name='payments-refund'),
    path('payments/webhooks/provider/', ProviderWebhookView.as_view(), name='payments-provider-webhook'),
]
