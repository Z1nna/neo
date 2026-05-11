from django.urls import path

from .views import PromoApplyView, PromoCodesView


urlpatterns = [
    path('promo/codes/', PromoCodesView.as_view(), name='promo-codes'),
    path('promo/apply/', PromoApplyView.as_view(), name='promo-apply'),
]
