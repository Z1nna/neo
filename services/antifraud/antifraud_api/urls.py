from django.urls import path

from .views import FraudCheckView, FraudFeedbackView


urlpatterns = [
    path('antifraud/check/', FraudCheckView.as_view(), name='antifraud-check'),
    path('antifraud/feedback/', FraudFeedbackView.as_view(), name='antifraud-feedback'),
]
