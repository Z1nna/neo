"""
Shared observability configuration for all microservices.
Provides OpenTelemetry tracing, metrics collection, and logging setup.
"""

import os
import logging
from logging.handlers import RotatingFileHandler
from typing import Optional

from opentelemetry import trace, metrics
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.jaeger.thrift import JaegerExporter
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.exporter.prometheus import PrometheusMetricReader
from opentelemetry.instrumentation.django import DjangoInstrumentation
from opentelemetry.instrumentation.celery import CeleryInstrumentation
from opentelemetry.instrumentation.redis import RedisInstrumentation
from opentelemetry.instrumentation.psycopg2 import Psycopg2Instrumentation
from opentelemetry.instrumentation.requests import RequestsInstrumentation
from opentelemetry.instrumentation.wsgi import OpenTelemetryMiddleware


def setup_tracing(service_name: str, jaeger_host: Optional[str] = None) -> trace.Tracer:
    """
    Setup distributed tracing with Jaeger collector.
    
    Args:
        service_name: Name of the service (used in otel traces)
        jaeger_host: Jaeger collector host (default: localhost:6831)
    
    Returns:
        Configured tracer instance
    """
    if not jaeger_host:
        jaeger_host = os.getenv("JAEGER_HOST", "jaeger:6831")
    
    jaeger_exporter = JaegerExporter(
        agent_host_name=jaeger_host.split(":")[0],
        agent_port=int(jaeger_host.split(":")[1]) if ":" in jaeger_host else 6831,
    )
    
    tracer_provider = TracerProvider()
    tracer_provider.add_span_processor(BatchSpanProcessor(jaeger_exporter))
    trace.set_tracer_provider(tracer_provider)
    
    return trace.get_tracer(__name__)


def setup_metrics(enable_prometheus: bool = True) -> metrics.Meter:
    """
    Setup metrics collection with Prometheus scrape endpoint.
    
    Args:
        enable_prometheus: Whether to enable Prometheus metric reader
    
    Returns:
        Configured meter instance
    """
    if enable_prometheus:
        metric_reader = PrometheusMetricReader()
        meter_provider = MeterProvider(metric_readers=[metric_reader])
    else:
        meter_provider = MeterProvider()
    
    metrics.set_meter_provider(meter_provider)
    return metrics.get_meter(__name__)


def instrument_django_app(app: str) -> None:
    """
    Setup automatic Django instrumentation for tracing.
    
    Args:
        app: Django app name for filtering
    """
    DjangoInstrumentation().instrument(
        skip_paths=["/health", "/metrics", "/schema", "/swagger"],
        excluded_urls=".*health|.*metrics|.*schema|.*swagger.*",
    )


def instrument_redis() -> None:
    """Setup automatic Redis instrumentation for tracing."""
    RedisInstrumentation().instrument()


def instrument_db() -> None:
    """Setup automatic database instrumentation for query tracing."""
    Psycopg2Instrumentation().instrument()


def instrument_requests() -> None:
    """Setup automatic HTTP requests instrumentation for outbound call tracing."""
    RequestsInstrumentation().instrument()


def setup_logging(
    service_name: str,
    log_level: str = "INFO",
    log_file: Optional[str] = None,
    log_dir: str = "/var/log/neomarket"
) -> logging.Logger:
    """
    Setup centralized logging with structured format and log rotation.
    
    Args:
        service_name: Service name for log identification
        log_level: Python logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_file: Optional log file path (if None, logs to stdout only)
        log_dir: Base directory for log files
    
    Returns:
        Configured logger instance
    """
    logger = logging.getLogger(service_name)
    logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))
    
    # Structured log format with service name and request tracking
    formatter = logging.Formatter(
        fmt='%(asctime)s | %(name)s | %(levelname)-8s | [%(filename)s:%(lineno)d] | %(message)s',
        datefmt='%Y-%m-%dT%H:%M:%SZ'
    )
    
    # Console handler (stdout)
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    
    # File handler with rotation (if log_file specified)
    if log_file:
        os.makedirs(log_dir, exist_ok=True)
        file_path = os.path.join(log_dir, log_file)
        file_handler = RotatingFileHandler(
            filename=file_path,
            maxBytes=10 * 1024 * 1024,  # 10MB
            backupCount=10,
            encoding='utf-8'
        )
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    
    return logger


def setup_all_instrumentation(service_name: str, enable_jaeger: bool = True) -> dict:
    """
    Setup all observability components (tracing, metrics, logging, instrumentation).
    
    Args:
        service_name: Name of the service
        enable_jaeger: Whether to setup Jaeger tracing (default True)
    
    Returns:
        Dictionary with tracer, meter, and logger instances
    """
    # Setup logging first (non-blocking)
    logger = setup_logging(
        service_name,
        log_level=os.getenv("LOG_LEVEL", "INFO"),
        log_file=f"{service_name}.log"
    )
    
    # Setup metrics (always enabled)
    meter = setup_metrics(enable_prometheus=True)
    
    # Setup tracing (optional, can be disabled)
    tracer = None
    if enable_jaeger and os.getenv("JAEGER_ENABLED", "true").lower() == "true":
        try:
            tracer = setup_tracing(service_name)
            logger.info(f"Jaeger tracing initialized for {service_name}")
        except Exception as e:
            logger.warning(f"Failed to setup Jaeger: {e}. Continuing with metrics only.")
    
    # Setup automatic instrumentation
    try:
        instrument_django_app(service_name)
        instrument_redis()
        instrument_db()
        instrument_requests()
        logger.info(f"OpenTelemetry instrumentation initialized for {service_name}")
    except Exception as e:
        logger.warning(f"Failed to setup instrumentation: {e}")
    
    return {
        "tracer": tracer,
        "meter": meter,
        "logger": logger,
    }
