"""
Metrics endpoint for Prometheus scraping.
Exposes OpenTelemetry metrics in Prometheus format.
"""

from django.http import HttpResponse
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST


def metrics_view(request):
    """
    Prometheus metrics endpoint.
    Exposes metrics collected by OpenTelemetry instrumentation.
    
    Returns:
        HttpResponse with Prometheus-format metrics
    """
    try:
        # Generate Prometheus metrics from all registered collectors
        metrics_data = generate_latest()
        return HttpResponse(
            metrics_data,
            content_type=CONTENT_TYPE_LATEST,
            status=200
        )
    except Exception as e:
        return HttpResponse(
            f"Error generating metrics: {str(e)}",
            content_type="text/plain",
            status=500
        )


def health_check(request):
    """Simple health check endpoint for container orchestration."""
    return HttpResponse("OK", content_type="text/plain", status=200)
