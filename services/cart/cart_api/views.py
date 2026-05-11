from uuid import UUID

import jwt
import requests
from django.conf import settings
from django.db import transaction
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema, extend_schema_view
from jwt import InvalidTokenError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import BannerEvent, Cart, CartItem, Favorite, Subscription
from .serializers import (
    AddCartItemRequestSerializer,
    BannerEventsRequestSerializer,
    CartItemSerializer,
    FavoriteListItemSerializer,
    FavoriteMutationSerializer,
    SubscribeRequestSerializer,
    UpdateCartItemRequestSerializer,
)


def _parse_uuid(value):
    if not value:
        return None
    try:
        return UUID(str(value))
    except (TypeError, ValueError):
        return None


def _error(message, code, http_status):
    return Response({"code": code, "message": message}, status=http_status)


def _decode_jwt_payload(token):
    algorithm = settings.JWT_ALGORITHM
    key = settings.JWT_SECRET if algorithm.startswith("HS") else settings.JWT_PUBLIC_KEY
    if not key:
        return None

    decode_kwargs = {
        "algorithms": [algorithm],
        "options": {
            "verify_signature": True,
            "verify_exp": True,
            "verify_aud": bool(settings.JWT_AUDIENCE),
            "verify_iss": bool(settings.JWT_ISSUER),
        },
    }
    if settings.JWT_AUDIENCE:
        decode_kwargs["audience"] = settings.JWT_AUDIENCE
    if settings.JWT_ISSUER:
        decode_kwargs["issuer"] = settings.JWT_ISSUER

    try:
        return jwt.decode(token, key=key, **decode_kwargs)
    except InvalidTokenError:
        return None


def _extract_identity(request):
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth.split(" ", 1)[1].strip()
        payload = _decode_jwt_payload(token)
        if payload is None:
            return None, None, True
        user_candidate = payload.get("sub") or payload.get("user_id")
        user_id = _parse_uuid(user_candidate)
        if user_id:
            return user_id, None, False

        return None, None, True

    # Bootstrap compatibility for existing clients.
    user_id = _parse_uuid(request.headers.get("X-User-Id"))
    session_id = _parse_uuid(request.headers.get("X-Session-Id"))
    return user_id, session_id, False


def _get_cart_identity(request):
    user_id, session_id, token_error = _extract_identity(request)
    if token_error:
        return None, None, _error("Невалидный JWT токен", "UNAUTHORIZED", status.HTTP_401_UNAUTHORIZED)
    if not user_id and not session_id:
        return None, None, _error("Передайте X-User-Id или X-Session-Id", "MISSING_CART_IDENTITY", status.HTTP_400_BAD_REQUEST)
    return user_id, session_id, None


def _get_user_id_for_favorites(request):
    user_id, _session_id, token_error = _extract_identity(request)
    if token_error:
        return None, _error("Невалидный JWT токен", "UNAUTHORIZED", status.HTTP_401_UNAUTHORIZED)
    if not user_id:
        return None, _error("Требуется авторизация", "UNAUTHORIZED", status.HTTP_401_UNAUTHORIZED)
    return user_id, None


def _load_catalog_products(limit=60):
    try:
        response = requests.get(
            settings.CATALOG_PRODUCTS_URL,
            params={"limit": limit, "offset": 0, "sort": "date_desc"},
            timeout=settings.CATALOG_TIMEOUT,
        )
    except requests.RequestException:
        return []

    if response.status_code != status.HTTP_200_OK:
        return []

    try:
        payload = response.json()
    except ValueError:
        return []

    return payload.get("items", [])


HOME_BANNERS = [
    {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "collection_id": "new-arrivals",
        "fallback_title": "Новые поступления",
        "fallback_subtitle": "Свежие товары каталога",
        "fallback_image": "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?w=1400&q=80&auto=format&fit=crop",
    },
    {
        "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
        "collection_id": "best-value",
        "fallback_title": "Популярное сейчас",
        "fallback_subtitle": "Подборка актуальных товаров с витрины",
        "fallback_image": "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1400&q=80&auto=format&fit=crop",
    },
]


def _build_collections_from_products(products):
    in_stock_products = [item for item in products if item.get("in_stock")]
    fallback_tail = products[:8]
    return [
        {
            "id": "new-arrivals",
            "title": "Новые поступления",
            "description": "Самые свежие товары, уже доступные на витрине",
            "product_ids": [item["id"] for item in products[:8]],
        },
        {
            "id": "best-value",
            "title": "Популярное сейчас",
            "description": "Товары, которые чаще всего попадают в пользовательские сценарии",
            "product_ids": [item["id"] for item in products[8:16] or fallback_tail],
        },
        {
            "id": "ready-to-buy",
            "title": "Готово к заказу",
            "description": "Позиции, которые уже есть в наличии",
            "product_ids": [item["id"] for item in in_stock_products[:8] or fallback_tail],
        },
    ]


def _build_home_banners(products, collections):
    products_by_id = {item["id"]: item for item in products}
    collections_by_id = {item["id"]: item for item in collections}
    banners = []

    for template in HOME_BANNERS:
        collection = collections_by_id.get(template["collection_id"])
        product_ids = collection["product_ids"] if collection else []
        first_product = next((products_by_id[product_id] for product_id in product_ids if product_id in products_by_id), None)
        image_url = (first_product or {}).get("image") or template["fallback_image"]
        title = collection["title"] if collection else template["fallback_title"]
        subtitle = collection["description"] if collection else template["fallback_subtitle"]
        link = f"/collections/{collection['id']}" if collection else f"/collections/{template['collection_id']}"
        banners.append(
            {
                "id": template["id"],
                "title": title,
                "subtitle": subtitle,
                "image": image_url,
                "image_url": image_url,
                "link": link,
                "target": {"type": "collection", "id": collection["id"] if collection else template["collection_id"]},
            }
        )

    return banners


def _get_or_create_cart(user_id, session_id):
    if user_id:
        return Cart.objects.get_or_create(user_id=user_id, defaults={"session_id": None})
    return Cart.objects.get_or_create(session_id=session_id, defaults={"user_id": None})


@extend_schema_view(
    get=extend_schema(operation_id="cart_get_cart", responses=OpenApiTypes.OBJECT),
    delete=extend_schema(operation_id="cart_clear_cart", responses=None),
)
class CartView(APIView):
    def get(self, request):
        user_id, session_id, error = _get_cart_identity(request)
        if error:
            return error

        cart = Cart.objects.filter(user_id=user_id).first() if user_id else Cart.objects.filter(session_id=session_id).first()
        if not cart:
            return Response(
                {
                    "items": [],
                    "summary": {
                        "total_amount": 0,
                        "total_items": 0,
                        "total_quantity": 0,
                        "available_items": 0,
                        "has_unavailable_items": False,
                        "checkout_ready": False,
                        "currency": "RUB",
                    },
                    "checkout_payload": {"items": [], "total_amount": 0, "currency": "RUB"},
                }
            )

        items = cart.items.all().order_by("created_at")
        serialized = CartItemSerializer(items, many=True).data
        total_quantity = sum(item["quantity"] for item in serialized)

        return Response(
            {
                "items": serialized,
                "summary": {
                    "total_amount": 0,
                    "total_items": len(serialized),
                    "total_quantity": total_quantity,
                    "available_items": len(serialized),
                    "has_unavailable_items": False,
                    "checkout_ready": len(serialized) > 0,
                    "currency": "RUB",
                },
                "checkout_payload": {"items": serialized, "total_amount": 0, "currency": "RUB"},
            }
        )

    def delete(self, request):
        user_id, session_id, error = _get_cart_identity(request)
        if error:
            return error

        cart = Cart.objects.filter(user_id=user_id).first() if user_id else Cart.objects.filter(session_id=session_id).first()
        if cart:
            cart.items.all().delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema_view(
    post=extend_schema(
        operation_id="cart_add_item",
        request=AddCartItemRequestSerializer,
        responses=OpenApiTypes.OBJECT,
    ),
)
class CartItemsView(APIView):
    @transaction.atomic
    def post(self, request):
        user_id, session_id, error = _get_cart_identity(request)
        if error:
            return error

        serializer = AddCartItemRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return _error("Невалидный запрос", "INVALID_REQUEST", status.HTTP_400_BAD_REQUEST)

        cart, _ = _get_or_create_cart(user_id, session_id)
        item, created = CartItem.objects.select_for_update().get_or_create(
            cart=cart,
            sku_id=serializer.validated_data["sku_id"],
            defaults={"quantity": serializer.validated_data["quantity"]},
        )

        if not created:
            item.quantity += serializer.validated_data["quantity"]
            item.save(update_fields=["quantity", "updated_at"])

        payload = {
            "item_id": item.id,
            "sku_id": item.sku_id,
            "quantity": item.quantity,
            "message": "Товар добавлен в корзину" if created else "Количество товара увеличено",
        }
        return Response(payload, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


@extend_schema_view(
    get=extend_schema(operation_id="cart_get_item", responses=CartItemSerializer),
    put=extend_schema(
        operation_id="cart_update_item",
        request=UpdateCartItemRequestSerializer,
        responses=OpenApiTypes.OBJECT,
    ),
    delete=extend_schema(operation_id="cart_delete_item", responses=None),
)
class CartItemDetailView(APIView):
    def _resolve_item(self, request, item_id):
        user_id, session_id, error = _get_cart_identity(request)
        if error:
            return None, None, error

        try:
            item = CartItem.objects.select_related("cart").get(id=item_id)
        except CartItem.DoesNotExist:
            return None, None, _error("Позиция не найдена в корзине", "CART_ITEM_NOT_FOUND", status.HTTP_404_NOT_FOUND)

        if user_id and item.cart.user_id != user_id:
            return None, None, _error("Нет доступа к этой позиции корзины", "ACCESS_DENIED", status.HTTP_403_FORBIDDEN)
        if session_id and item.cart.session_id != session_id:
            return None, None, _error("Нет доступа к этой позиции корзины", "ACCESS_DENIED", status.HTTP_403_FORBIDDEN)

        return item, (user_id, session_id), None

    def get(self, request, item_id):
        item, _identity, error = self._resolve_item(request, item_id)
        if error:
            if error.status_code == status.HTTP_403_FORBIDDEN:
                return _error("Позиция не найдена в корзине", "CART_ITEM_NOT_FOUND", status.HTTP_404_NOT_FOUND)
            return error
        return Response(CartItemSerializer(item).data)

    @transaction.atomic
    def put(self, request, item_id):
        item, _identity, error = self._resolve_item(request, item_id)
        if error:
            return error

        serializer = UpdateCartItemRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return _error("Невалидный запрос", "INVALID_REQUEST", status.HTTP_400_BAD_REQUEST)

        item.quantity = serializer.validated_data["quantity"]
        item.save(update_fields=["quantity", "updated_at"])

        return Response(
            {
                "item_id": item.id,
                "sku_id": item.sku_id,
                "quantity": item.quantity,
                "message": "Количество обновлено",
            }
        )

    def delete(self, request, item_id):
        item, _identity, error = self._resolve_item(request, item_id)
        if error:
            if error.status_code == status.HTTP_403_FORBIDDEN:
                return _error("Позиция не найдена в корзине", "CART_ITEM_NOT_FOUND", status.HTTP_404_NOT_FOUND)
            return error

        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema_view(
    get=extend_schema(operation_id="cart_validate", responses=OpenApiTypes.OBJECT),
)
class CartValidateView(APIView):
    def get(self, request):
        user_id, error = _get_user_id_for_favorites(request)
        if error:
            return error

        cart = Cart.objects.filter(user_id=user_id).first()
        if not cart:
            return Response(
                {
                    "is_valid": True,
                    "can_checkout": False,
                    "total_items": 0,
                    "issues": [],
                }
            )

        items = cart.items.all()
        issues = []
        for item in items:
            if item.quantity < 1:
                issues.append(
                    {
                        "cart_item_id": str(item.id),
                        "issue_type": "INVALID_QUANTITY",
                        "severity": "critical",
                        "message": "Некорректное количество",
                    }
                )

        return Response(
            {
                "is_valid": len(issues) == 0,
                "can_checkout": len(items) > 0 and len(issues) == 0,
                "total_items": len(items),
                "issues": issues,
            }
        )


@extend_schema_view(
    get=extend_schema(operation_id="favorites_list", responses=OpenApiTypes.OBJECT),
)
class FavoritesView(APIView):
    def get(self, request):
        user_id, error = _get_user_id_for_favorites(request)
        if error:
            return error

        try:
            limit = max(1, min(int(request.query_params.get("limit", 20)), 100))
            offset = max(0, int(request.query_params.get("offset", 0)))
        except ValueError:
            return _error("Параметры limit/offset невалидны", "INVALID_PARAMETER", status.HTTP_400_BAD_REQUEST)

        queryset = Favorite.objects.filter(user_id=user_id).order_by("-added_at")
        total = queryset.count()
        items = queryset[offset : offset + limit]

        return Response(
            {
                "items": FavoriteListItemSerializer(items, many=True).data,
                "total": total,
            }
        )


@extend_schema_view(
    post=extend_schema(operation_id="favorites_add", responses=FavoriteMutationSerializer),
    delete=extend_schema(operation_id="favorites_delete", responses=None),
)
class FavoriteDetailView(APIView):
    serializer_class = FavoriteMutationSerializer

    def post(self, request, product_id):
        user_id, error = _get_user_id_for_favorites(request)
        if error:
            return error

        product_uuid = _parse_uuid(product_id)
        if not product_uuid:
            return _error("Некорректный UUID product_id", "INVALID_PARAMETER", status.HTTP_400_BAD_REQUEST)

        favorite, created = Favorite.objects.get_or_create(user_id=user_id, product_id=product_uuid)
        payload = FavoriteMutationSerializer(favorite).data
        payload["message"] = "Товар добавлен в избранное" if created else "Товар уже находится в избранном"
        return Response(payload, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    def delete(self, request, product_id):
        user_id, error = _get_user_id_for_favorites(request)
        if error:
            return error

        product_uuid = _parse_uuid(product_id)
        if not product_uuid:
            return _error("Некорректный UUID product_id", "INVALID_PARAMETER", status.HTTP_400_BAD_REQUEST)

        Favorite.objects.filter(user_id=user_id, product_id=product_uuid).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema_view(
    post=extend_schema(
        operation_id="favorites_subscribe",
        request=SubscribeRequestSerializer,
        responses=OpenApiTypes.OBJECT,
    ),
)
class FavoriteSubscribeView(APIView):
    def post(self, request, product_id):
        user_id, error = _get_user_id_for_favorites(request)
        if error:
            return error

        product_uuid = _parse_uuid(product_id)
        if not product_uuid:
            return _error("Некорректный UUID product_id", "INVALID_PARAMETER", status.HTTP_400_BAD_REQUEST)

        serializer = SubscribeRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return _error("Должен быть указан хотя бы один тип уведомления", "INVALID_NOTIFY_ON", status.HTTP_400_BAD_REQUEST)

        exists = Subscription.objects.filter(user_id=user_id, product_id=product_uuid).exists()
        if exists:
            return _error(
                "Вы уже подписаны на уведомления об этом товаре",
                "SUBSCRIPTION_ALREADY_EXISTS",
                status.HTTP_409_CONFLICT,
            )

        subscription = Subscription.objects.create(
            user_id=user_id,
            product_id=product_uuid,
            notify_on=serializer.validated_data["notify_on"],
        )

        return Response(
            {
                "id": subscription.id,
                "product": {"id": str(subscription.product_id)},
                "notify_on": subscription.notify_on,
                "created_at": subscription.created_at,
            },
            status=status.HTTP_201_CREATED,
        )


@extend_schema_view(
    post=extend_schema(operation_id="home_post_banner_events", request=BannerEventsRequestSerializer, responses=None),
)
class BannerEventsView(APIView):
    @transaction.atomic
    def post(self, request):
        serializer = BannerEventsRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return _error("Массив events не может быть пустым", "EMPTY_EVENTS", status.HTTP_400_BAD_REQUEST)

        user_id, _session_id, _token_error = _extract_identity(request)
        allowed_banner_ids = {item["id"] for item in HOME_BANNERS}
        rows = []

        for event in serializer.validated_data["events"]:
            banner_id = str(event["banner_id"])
            if banner_id not in allowed_banner_ids:
                return _error("Баннер с указанным id не найден", "BANNER_NOT_FOUND", status.HTTP_400_BAD_REQUEST)
            rows.append(
                BannerEvent(
                    banner_id=event["banner_id"],
                    user_id=user_id,
                    event=event["event"],
                    timestamp=event["timestamp"],
                )
            )

        BannerEvent.objects.bulk_create(rows)
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema_view(
    get=extend_schema(operation_id="main_get_collections", responses=OpenApiTypes.OBJECT),
)
class MainCollectionsView(APIView):
    def get(self, request):
        products = _load_catalog_products()
        collections = _build_collections_from_products(products)
        items = [
            {
                "id": collection["id"],
                "title": collection["title"],
                "description": collection["description"],
                "products_count": len(collection["product_ids"]),
            }
            for collection in collections
            if collection["product_ids"]
        ]
        return Response({"items": items})


@extend_schema_view(
    get=extend_schema(operation_id="collections_get_products", responses=OpenApiTypes.OBJECT),
)
class CollectionProductsView(APIView):
    def get(self, request, collection_id):
        products = _load_catalog_products()
        by_id = {item["id"]: item for item in products}
        collections = _build_collections_from_products(products)
        collection = next((item for item in collections if item["id"] == str(collection_id)), None)
        if not collection:
            return _error("Подборка не найдена", "NOT_FOUND", status.HTTP_404_NOT_FOUND)

        product_items = [by_id[pid] for pid in collection["product_ids"] if pid in by_id]
        return Response(
            {
                "collection": {
                    "id": collection["id"],
                    "title": collection["title"],
                    "description": collection["description"],
                },
                "items": product_items,
                "total": len(product_items),
            }
        )


@extend_schema_view(
    get=extend_schema(operation_id="home_get_banners", responses=OpenApiTypes.OBJECT),
)
class HomeBannersView(APIView):
    def get(self, request):
        products = _load_catalog_products()
        collections = _build_collections_from_products(products)
        banners = _build_home_banners(products, collections)
        return Response({"items": banners})


@extend_schema_view(
    get=extend_schema(operation_id="cart_get_also_bought", responses=OpenApiTypes.OBJECT),
)
class AlsoBoughtView(APIView):
    def get(self, request):
        products = _load_catalog_products(limit=12)
        return Response({"items": products[:6], "total": min(6, len(products))})
