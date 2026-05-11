from django.urls import path

from .views import LoginView, MeView, OpenIdConfigurationView, RefreshView, RegisterView, TokenIntrospectView, TokenView


urlpatterns = [
    path('auth/token/', TokenView.as_view(), name='auth-token'),
    path('auth/introspect/', TokenIntrospectView.as_view(), name='auth-introspect'),
    path('auth/register/', RegisterView.as_view(), name='auth-register'),
    path('auth/login/', LoginView.as_view(), name='auth-login'),
    path('auth/refresh/', RefreshView.as_view(), name='auth-refresh'),
    path('auth/me/', MeView.as_view(), name='auth-me'),
    path('.well-known/openid-configuration/', OpenIdConfigurationView.as_view(), name='auth-oidc-config'),
]
