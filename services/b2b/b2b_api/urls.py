from django.urls import path

from .views import (
    DashboardOverviewView,
    DashboardStatsView,
    InvoiceAcceptView,
    InvoicesView,
    ProductDetailView,
    ProductsView,
    SellerProfileView,
    SkuMutationView,
)


urlpatterns = [
    path('profile', SellerProfileView.as_view(), name='b2b-profile-no-slash'),
    path('profile/', SellerProfileView.as_view(), name='b2b-profile'),
    path('dashboard/overview', DashboardOverviewView.as_view(), name='b2b-dashboard-overview-no-slash'),
    path('dashboard/overview/', DashboardOverviewView.as_view(), name='b2b-dashboard-overview'),
    path('dashboard/stats', DashboardStatsView.as_view(), name='b2b-dashboard-stats-no-slash'),
    path('dashboard/stats/', DashboardStatsView.as_view(), name='b2b-dashboard-stats'),
    path('products', ProductsView.as_view(), name='b2b-products-no-slash'),
    path('products/', ProductsView.as_view(), name='b2b-products'),
    path('products/<uuid:id>', ProductDetailView.as_view(), name='b2b-product-detail-no-slash'),
    path('products/<uuid:id>/', ProductDetailView.as_view(), name='b2b-product-detail'),
    path('skus', SkuMutationView.as_view(), name='b2b-skus-no-slash'),
    path('skus/', SkuMutationView.as_view(), name='b2b-skus'),
    path('invoices', InvoicesView.as_view(), name='b2b-invoices-no-slash'),
    path('invoices/', InvoicesView.as_view(), name='b2b-invoices'),
    path('invoices/accept', InvoiceAcceptView.as_view(), name='b2b-invoices-accept-no-slash'),
    path('invoices/accept/', InvoiceAcceptView.as_view(), name='b2b-invoices-accept'),
]
