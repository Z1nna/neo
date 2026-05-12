from django.urls import path

from .views import PromoApplyView, PromoCodesView, PromoPreviewView


urlpatterns = [
    path('promo/codes/', PromoCodesView.as_view(), name='promo-codes'),
    path('promo/preview/', PromoPreviewView.as_view(), name='promo-preview'),
    path('promo/apply/', PromoApplyView.as_view(), name='promo-apply'),
]
