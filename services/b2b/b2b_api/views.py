from datetime import datetime, timezone
from uuid import UUID

import jwt
from django.conf import settings
from django.db import transaction
from django.db.models import Count, F, Q, Sum
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema, extend_schema_view
from jwt import InvalidTokenError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Category, IntegrationOutbox, Invoice, InvoiceItem, Product, SellerProfile, Sku
from .serializers import (
    AcceptInvoiceRequestSerializer,
    CreateInvoiceRequestSerializer,
    CreateProductRequestSerializer,
    CreateSkuRequestSerializer,
    DashboardOverviewSerializer,
    DashboardStatsSerializer,
    InvoiceSerializer,
    ProductSerializer,
    SellerProfileSerializer,
    SellerProfileUpdateSerializer,
    SkuSerializer,
    UpdateProductRequestSerializer,
    UpdateSkuRequestSerializer,
)


def _error(code, message, http_status):
    return Response({'code': code, 'message': message}, status=http_status)


def _parse_uuid(value):
    if not value:
        return None
    try:
        return UUID(str(value))
    except (TypeError, ValueError):
        return None


def _decode_token(token):
    algorithm = settings.JWT_ALGORITHM
    key = settings.JWT_SECRET if algorithm.startswith('HS') else settings.JWT_PUBLIC_KEY
    if not key:
        return None

    decode_kwargs = {
        'algorithms': [algorithm],
        'options': {
            'verify_signature': True,
            'verify_exp': True,
            'verify_aud': bool(settings.JWT_AUDIENCE),
            'verify_iss': bool(settings.JWT_ISSUER),
        },
    }
    if settings.JWT_AUDIENCE:
        decode_kwargs['audience'] = settings.JWT_AUDIENCE
    if settings.JWT_ISSUER:
        decode_kwargs['issuer'] = settings.JWT_ISSUER

    try:
        return jwt.decode(token, key=key, **decode_kwargs)
    except InvalidTokenError:
        return None


def _get_seller_id(request):
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        token = auth_header.split(' ', 1)[1].strip()
        payload = _decode_token(token)
        if payload is None:
            return None, _error('UNAUTHORIZED', 'Invalid JWT token', status.HTTP_401_UNAUTHORIZED)

        seller_id = _parse_uuid(payload.get('sub') or payload.get('seller_id') or payload.get('user_id'))
        if seller_id:
            return seller_id, None
        return None, _error('UNAUTHORIZED', 'JWT does not contain seller id', status.HTTP_401_UNAUTHORIZED)

    # Local bootstrap compatibility for internal testing.
    seller_id = _parse_uuid(request.headers.get('X-Seller-Id') or request.headers.get('X-User-Id'))
    if seller_id:
        return seller_id, None
    return None, _error('UNAUTHORIZED', 'Seller identity is required', status.HTTP_401_UNAUTHORIZED)


def _outbox_event(aggregate_id, event_type, payload):
    IntegrationOutbox.objects.create(
        aggregate_id=aggregate_id,
        event_type=event_type,
        payload=payload,
    )


def _resolve_category(validated_data):
    category_id = validated_data.get('category_id')
    category_name = (validated_data.get('category_name') or '').strip()

    if category_id:
        category, _ = Category.objects.get_or_create(
            id=category_id,
            defaults={'name': category_name or 'General'},
        )
        if category_name and category.name != category_name:
            category.name = category_name
            category.save(update_fields=['name'])
        return category

    existing = Category.objects.filter(name__iexact=category_name).first()
    if existing:
        return existing
    return Category.objects.create(name=category_name)


def _get_or_create_profile(seller_id):
    return SellerProfile.objects.get_or_create(
        seller_id=seller_id,
        defaults={
            'company_name': 'NeoMarket Seller',
            'contact_person': 'Команда продаж',
        },
    )[0]


@extend_schema_view(
    get=extend_schema(operation_id='b2b_dashboard_overview', responses=DashboardOverviewSerializer),
)
class DashboardOverviewView(APIView):
    def get(self, request):
        seller_id, error = _get_seller_id(request)
        if error:
            return error

        products = Product.objects.filter(seller_id=seller_id)
        skus = Sku.objects.filter(product__seller_id=seller_id)
        invoices = Invoice.objects.filter(seller_id=seller_id)

        overview = {
            'total_products': products.count(),
            'total_skus': skus.count(),
            'total_stock': skus.aggregate(total=Sum('active_quantity'))['total'] or 0,
            'created_products': products.filter(status=Product.Status.CREATED).count(),
            'on_moderation_products': products.filter(status=Product.Status.ON_MODERATION).count(),
            'blocked_products': products.filter(status=Product.Status.BLOCKED).count(),
            'pending_invoices': invoices.filter(status=Invoice.Status.CREATED).count(),
            'accepted_invoices': invoices.filter(status=Invoice.Status.ACCEPTED).count(),
        }
        return Response(overview)


@extend_schema_view(
    get=extend_schema(operation_id='b2b_dashboard_stats', responses=DashboardStatsSerializer),
)
class DashboardStatsView(APIView):
    def get(self, request):
        seller_id, error = _get_seller_id(request)
        if error:
            return error

        products = Product.objects.filter(seller_id=seller_id).select_related('category').prefetch_related('skus')
        low_stock_skus = (
            Sku.objects.select_related('product')
            .filter(product__seller_id=seller_id, active_quantity__lte=5)
            .order_by('active_quantity', 'name')[:8]
        )
        recent_products = products.order_by('-created_at')[:5]
        recent_invoices = Invoice.objects.filter(seller_id=seller_id).prefetch_related('items__sku').order_by('-created_at')[:5]
        status_rows = (
            products.values('status')
            .annotate(value=Count('id'))
            .order_by('status')
        )

        return Response(
            {
                'product_statuses': [{'label': row['status'], 'value': row['value']} for row in status_rows],
                'low_stock_skus': SkuSerializer(low_stock_skus, many=True).data,
                'recent_products': ProductSerializer(recent_products, many=True).data,
                'recent_invoices': InvoiceSerializer(recent_invoices, many=True).data,
            }
        )


@extend_schema_view(
    get=extend_schema(operation_id='b2b_get_profile', responses=SellerProfileSerializer),
    patch=extend_schema(operation_id='b2b_update_profile', request=SellerProfileUpdateSerializer, responses=SellerProfileSerializer),
)
class SellerProfileView(APIView):
    def get(self, request):
        seller_id, error = _get_seller_id(request)
        if error:
            return error

        profile = _get_or_create_profile(seller_id)
        return Response(SellerProfileSerializer(profile).data)

    @transaction.atomic
    def patch(self, request):
        seller_id, error = _get_seller_id(request)
        if error:
            return error

        serializer = SellerProfileUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return _error('BAD_REQUEST', 'Invalid profile payload', status.HTTP_400_BAD_REQUEST)

        profile = _get_or_create_profile(seller_id)
        for field, value in serializer.validated_data.items():
            setattr(profile, field, value)
        profile.save()
        return Response(SellerProfileSerializer(profile).data)


@extend_schema_view(
    get=extend_schema(operation_id='b2b_list_products', responses=OpenApiTypes.OBJECT),
    post=extend_schema(operation_id='b2b_create_product', request=CreateProductRequestSerializer, responses=ProductSerializer),
)
class ProductsView(APIView):
    def get(self, request):
        seller_id, error = _get_seller_id(request)
        if error:
            return error

        try:
            limit = max(1, min(int(request.query_params.get('limit', 20)), 100))
            offset = max(0, int(request.query_params.get('offset', 0)))
        except ValueError:
            return _error('BAD_REQUEST', 'Invalid pagination params', status.HTTP_400_BAD_REQUEST)

        queryset = Product.objects.filter(seller_id=seller_id).select_related('category').prefetch_related('skus')

        category_id = request.query_params.get('category_id')
        if category_id:
            queryset = queryset.filter(category_id=category_id)

        product_status = request.query_params.get('status')
        if product_status:
            queryset = queryset.filter(status=product_status)

        search = request.query_params.get('search')
        if search:
            queryset = queryset.filter(Q(title__icontains=search) | Q(description__icontains=search))

        total = queryset.count()
        items = queryset[offset : offset + limit]

        return Response(
            {
                'items': ProductSerializer(items, many=True).data,
                'total': total,
                'limit': limit,
                'offset': offset,
            }
        )

    @transaction.atomic
    def post(self, request):
        seller_id, error = _get_seller_id(request)
        if error:
            return error

        serializer = CreateProductRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return _error('BAD_REQUEST', 'Invalid create payload', status.HTTP_400_BAD_REQUEST)

        category = _resolve_category(serializer.validated_data)

        product = Product.objects.create(
            seller_id=seller_id,
            title=serializer.validated_data['title'],
            description=serializer.validated_data.get('description', ''),
            category=category,
            images=serializer.validated_data.get('images', []),
            characteristics=serializer.validated_data.get('characteristics', []),
        )
        _outbox_event(
            product.id,
            'PRODUCT_CREATED',
            {
                'product_id': str(product.id),
                'event_type': 'CREATED',
                'snapshot_after': ProductSerializer(product).data,
            },
        )

        return Response(ProductSerializer(product).data, status=status.HTTP_201_CREATED)


@extend_schema_view(
    get=extend_schema(operation_id='b2b_get_product', responses=ProductSerializer),
    put=extend_schema(operation_id='b2b_update_product', request=UpdateProductRequestSerializer, responses=ProductSerializer),
    delete=extend_schema(operation_id='b2b_delete_product', responses=None),
)
class ProductDetailView(APIView):
    def get(self, request, id):
        seller_id, error = _get_seller_id(request)
        if error:
            return error

        product = Product.objects.filter(id=id, seller_id=seller_id).select_related('category').prefetch_related('skus').first()
        if not product:
            return _error('NOT_FOUND', 'Product not found', status.HTTP_404_NOT_FOUND)

        return Response(ProductSerializer(product).data)

    @transaction.atomic
    def put(self, request, id):
        seller_id, error = _get_seller_id(request)
        if error:
            return error

        serializer = UpdateProductRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return _error('BAD_REQUEST', 'Invalid update payload', status.HTTP_400_BAD_REQUEST)

        product = Product.objects.filter(id=id, seller_id=seller_id).first()
        if not product:
            return _error('NOT_FOUND', 'Product not found', status.HTTP_404_NOT_FOUND)

        if 'category_id' in serializer.validated_data or 'category_name' in serializer.validated_data:
            category = _resolve_category(serializer.validated_data)
            product.category = category

        for field in ['title', 'description', 'status', 'images', 'characteristics']:
            if field in serializer.validated_data:
                setattr(product, field, serializer.validated_data[field])

        product.save()
        _outbox_event(
            product.id,
            'PRODUCT_UPDATED',
            {
                'product_id': str(product.id),
                'event_type': 'UPDATED',
                'snapshot_after': ProductSerializer(product).data,
            },
        )
        return Response(ProductSerializer(product).data)

    @transaction.atomic
    def delete(self, request, id):
        seller_id, error = _get_seller_id(request)
        if error:
            return error

        deleted, _ = Product.objects.filter(id=id, seller_id=seller_id).delete()
        if not deleted:
            return _error('NOT_FOUND', 'Product not found', status.HTTP_404_NOT_FOUND)
        _outbox_event(id, 'PRODUCT_DELETED', {'product_id': str(id), 'event_type': 'DELETED'})
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema_view(
    post=extend_schema(operation_id='b2b_create_sku', request=CreateSkuRequestSerializer, responses=SkuSerializer),
    put=extend_schema(operation_id='b2b_update_sku', request=UpdateSkuRequestSerializer, responses=SkuSerializer),
    delete=extend_schema(operation_id='b2b_delete_sku', responses=None),
)
class SkuMutationView(APIView):
    @transaction.atomic
    def post(self, request):
        seller_id, error = _get_seller_id(request)
        if error:
            return error

        serializer = CreateSkuRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return _error('BAD_REQUEST', 'Invalid SKU payload', status.HTTP_400_BAD_REQUEST)

        product = Product.objects.filter(id=serializer.validated_data['product_id'], seller_id=seller_id).first()
        if not product:
            return _error('NOT_FOUND', 'Product not found', status.HTTP_404_NOT_FOUND)

        sku = Sku.objects.create(
            product=product,
            name=serializer.validated_data['name'],
            price=serializer.validated_data['price'],
            active_quantity=serializer.validated_data['active_quantity'],
            characteristics=serializer.validated_data.get('characteristics', []),
        )
        return Response(SkuSerializer(sku).data, status=status.HTTP_201_CREATED)

    @transaction.atomic
    def put(self, request):
        seller_id, error = _get_seller_id(request)
        if error:
            return error

        serializer = UpdateSkuRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return _error('BAD_REQUEST', 'Invalid SKU update payload', status.HTTP_400_BAD_REQUEST)

        sku = Sku.objects.select_related('product').filter(id=serializer.validated_data['id']).first()
        if not sku or sku.product.seller_id != seller_id:
            return _error('NOT_FOUND', 'SKU not found', status.HTTP_404_NOT_FOUND)

        for field in ['name', 'price', 'active_quantity', 'characteristics']:
            if field in serializer.validated_data:
                setattr(sku, field, serializer.validated_data[field])

        sku.save()
        return Response(SkuSerializer(sku).data)

    @transaction.atomic
    def delete(self, request):
        seller_id, error = _get_seller_id(request)
        if error:
            return error

        sku_id = request.query_params.get('id')
        parsed_id = _parse_uuid(sku_id)
        if not parsed_id:
            return _error('BAD_REQUEST', 'SKU id query parameter is required', status.HTTP_400_BAD_REQUEST)

        sku = Sku.objects.select_related('product').filter(id=parsed_id).first()
        if not sku or sku.product.seller_id != seller_id:
            return _error('NOT_FOUND', 'SKU not found', status.HTTP_404_NOT_FOUND)

        sku.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema_view(
    get=extend_schema(operation_id='b2b_list_invoices', responses=OpenApiTypes.OBJECT),
    post=extend_schema(operation_id='b2b_create_invoice', request=CreateInvoiceRequestSerializer, responses=InvoiceSerializer),
)
class InvoicesView(APIView):
    def get(self, request):
        seller_id, error = _get_seller_id(request)
        if error:
            return error

        invoices = Invoice.objects.filter(seller_id=seller_id).prefetch_related('items__sku')
        return Response({'items': InvoiceSerializer(invoices, many=True).data, 'total': invoices.count()})

    @transaction.atomic
    def post(self, request):
        seller_id, error = _get_seller_id(request)
        if error:
            return error

        serializer = CreateInvoiceRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return _error('BAD_REQUEST', 'Invalid invoice payload', status.HTTP_400_BAD_REQUEST)

        if serializer.validated_data.get('seller_id') and serializer.validated_data['seller_id'] != seller_id:
            return _error('FORBIDDEN', 'seller_id in payload must match authenticated seller', status.HTTP_403_FORBIDDEN)

        invoice = Invoice.objects.create(
            seller_id=seller_id,
            warehouse_id=serializer.validated_data['warehouse_id'],
            status=Invoice.Status.CREATED,
        )

        sku_ids = [row['sku_id'] for row in serializer.validated_data['items']]
        sku_by_id = {
            sku.id: sku
            for sku in Sku.objects.select_related('product').filter(id__in=sku_ids, product__seller_id=seller_id)
        }

        rows = []
        for item in serializer.validated_data['items']:
            sku = sku_by_id.get(item['sku_id'])
            if not sku:
                return _error('BAD_REQUEST', 'Invoice contains foreign sku', status.HTTP_400_BAD_REQUEST)
            rows.append(InvoiceItem(invoice=invoice, sku=sku, quantity=item['quantity']))

        InvoiceItem.objects.bulk_create(rows)
        return Response(InvoiceSerializer(invoice).data, status=status.HTTP_201_CREATED)


@extend_schema_view(
    post=extend_schema(operation_id='b2b_accept_invoice', request=AcceptInvoiceRequestSerializer, responses=InvoiceSerializer),
)
class InvoiceAcceptView(APIView):
    @transaction.atomic
    def post(self, request):
        seller_id, error = _get_seller_id(request)
        if error:
            return error

        serializer = AcceptInvoiceRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return _error('BAD_REQUEST', 'Invalid accept payload', status.HTTP_400_BAD_REQUEST)

        invoice = Invoice.objects.select_for_update().filter(id=serializer.validated_data['invoice_id'], seller_id=seller_id).first()
        if not invoice:
            return _error('NOT_FOUND', 'Invoice not found', status.HTTP_404_NOT_FOUND)

        if invoice.status != Invoice.Status.CREATED:
            return _error('BAD_REQUEST', 'Only CREATED invoice can be accepted', status.HTTP_400_BAD_REQUEST)

        items = list(invoice.items.select_related('sku'))
        for item in items:
            Sku.objects.filter(id=item.sku_id).update(active_quantity=F('active_quantity') + item.quantity)

        invoice.status = Invoice.Status.ACCEPTED
        invoice.accepted_at = datetime.now(timezone.utc)
        invoice.save(update_fields=['status', 'accepted_at'])

        _outbox_event(
            invoice.id,
            'INVOICE_ACCEPTED',
            {'invoice_id': str(invoice.id), 'seller_id': str(invoice.seller_id), 'event_type': 'ACCEPTED'},
        )

        return Response(InvoiceSerializer(invoice).data)
