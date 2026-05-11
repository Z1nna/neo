import uuid
from datetime import datetime, timedelta, timezone

import jwt
from django.conf import settings
from django.test import TestCase
from rest_framework.test import APIClient


def _jwt_for_user(user_id):
    payload = {
        "sub": str(user_id),
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
    }
    if settings.JWT_ISSUER:
        payload["iss"] = settings.JWT_ISSUER
    if settings.JWT_AUDIENCE:
        payload["aud"] = settings.JWT_AUDIENCE
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


class CartApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_id = uuid.uuid4()
        self.auth = f"Bearer {_jwt_for_user(self.user_id)}"

    def test_cart_requires_identity(self):
        response = self.client.get("/api/v1/cart")
        self.assertEqual(response.status_code, 400)

    def test_add_and_get_cart_item_with_jwt(self):
        sku_id = uuid.uuid4()
        add_response = self.client.post(
            "/api/v1/cart/items",
            {"sku_id": str(sku_id), "quantity": 2},
            format="json",
            HTTP_AUTHORIZATION=self.auth,
        )
        self.assertIn(add_response.status_code, [200, 201])

        get_response = self.client.get("/api/v1/cart", HTTP_AUTHORIZATION=self.auth)
        self.assertEqual(get_response.status_code, 200)
        self.assertEqual(len(get_response.data["items"]), 1)
        self.assertEqual(get_response.data["items"][0]["quantity"], 2)

    def test_favorites_requires_user_identity(self):
        response = self.client.get("/api/v1/favorites")
        self.assertEqual(response.status_code, 401)

    def test_banner_events_accept_batch(self):
        response = self.client.post(
            "/api/v1/banner-events",
            {
                "events": [
                    {
                        "banner_id": "550e8400-e29b-41d4-a716-446655440000",
                        "event": "impression",
                        "timestamp": "2026-05-11T19:00:00Z",
                    },
                    {
                        "banner_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
                        "event": "click",
                        "timestamp": "2026-05-11T19:00:05Z",
                    },
                ]
            },
            format="json",
            HTTP_AUTHORIZATION=self.auth,
        )
        self.assertEqual(response.status_code, 204)
