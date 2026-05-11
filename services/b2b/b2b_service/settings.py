import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.getenv('SECRET_KEY', 'b2b-unsafe-dev-key')
DEBUG = os.getenv('DEBUG', '0') == '1'
ALLOWED_HOSTS = [host.strip() for host in os.getenv('ALLOWED_HOSTS', '*').split(',') if host.strip()]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'drf_spectacular',
    'b2b_api',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'b2b_service.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'b2b_service.wsgi.application'
ASGI_APPLICATION = 'b2b_service.asgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('DB_NAME', 'b2b_db'),
        'USER': os.getenv('DB_USER', 'neomarket'),
        'PASSWORD': os.getenv('DB_PASSWORD', 'neomarket'),
        'HOST': os.getenv('DB_HOST', 'localhost'),
        'PORT': os.getenv('DB_PORT', '5432'),
    }
}

LANGUAGE_CODE = 'ru-ru'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

REST_FRAMEWORK = {
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
}

SPECTACULAR_SETTINGS = {
    'TITLE': 'NeoMarket B2B Seller Cabinet API',
    'DESCRIPTION': 'Seller-facing microservice for product/SKU/invoice management.',
    'VERSION': '0.1.0',
}

# Observability: OpenTelemetry tracing, metrics, and logging
OTEL_ENABLED = os.getenv('OTEL_ENABLED', 'true').lower() == 'true'
OTEL_SERVICE_NAME = 'b2b'
OTEL_TRACES_EXPORTER = os.getenv('OTEL_TRACES_EXPORTER', 'jaeger')
OTEL_METRICS_EXPORTER = os.getenv('OTEL_METRICS_EXPORTER', 'prometheus')
OTEL_EXPORTER_OTLP_ENDPOINT = os.getenv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://jaeger:4317')
JAEGER_HOST = os.getenv('JAEGER_HOST', 'jaeger:6831')
JAEGER_ENABLED = os.getenv('JAEGER_ENABLED', 'true').lower() == 'true'
LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')

if OTEL_ENABLED:
    from infra.middleware import setup_observability_from_env
    OBSERVABILITY = setup_observability_from_env(OTEL_SERVICE_NAME)

JWT_ALGORITHM = os.getenv('JWT_ALGORITHM', 'HS256')
JWT_SECRET = os.getenv('JWT_SECRET', SECRET_KEY)
JWT_PUBLIC_KEY = os.getenv('JWT_PUBLIC_KEY', '')
JWT_AUDIENCE = os.getenv('JWT_AUDIENCE', '')
JWT_ISSUER = os.getenv('JWT_ISSUER', '')

REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
EVENT_STREAM = os.getenv('EVENT_STREAM', 'neomarket.events')
EVENT_SOURCE = 'b2b'
