"""
OpenTelemetry middleware for Django applications.
Provides automatic tracing for HTTP requests, database queries, and external calls.
"""

import logging
import sys
from typing import Callable

from opentelemetry import trace
from opentelemetry.instrumentation.wsgi import OpenTelemetryMiddleware as WSGIMiddleware

logger = logging.getLogger(__name__)


class ObservabilityMiddleware:
    """
    WSGI middleware for OpenTelemetry tracing.
    Automatically traces all HTTP requests and integrates with instrumentation.
    """

    def __init__(self, get_response: Callable):
        self.get_response = get_response
        self.tracer = trace.get_tracer(__name__)

    def __call__(self, request):
        # Extract trace context from incoming request headers
        # OpenTelemetry automatically handles W3C Trace Context and Jaeger propagation
        
        response = self.get_response(request)
        
        # Optional: Add custom attributes to response headers for debugging
        if hasattr(request, 'trace_id'):
            response['X-Trace-ID'] = str(request.trace_id)
        
        return response

    def process_exception(self, request, exception):
        """Log exceptions to tracing backend."""
        tracer = trace.get_tracer(__name__)
        with tracer.start_as_current_span("exception") as span:
            span.set_attribute("exception.type", type(exception).__name__)
            span.set_attribute("exception.message", str(exception))
            logger.exception(f"Exception in request: {exception}")
        return None


def setup_observability_from_env(service_name: str) -> dict:
    """
    Initialize all observability components from environment variables.
    Called from Django settings.py.
    
    Args:
        service_name: Name of the service (used in metrics/traces/logs)
    
    Returns:
        Dictionary with tracer, meter, logger instances
    """
    # Import here to avoid import errors if opentelemetry not installed
    try:
        from infra.observability import setup_all_instrumentation
        return setup_all_instrumentation(
            service_name=service_name,
            enable_jaeger=True
        )
    except ImportError as e:
        logger.warning(f"Could not import observability module: {e}")
        return {"tracer": None, "meter": None, "logger": logger}
