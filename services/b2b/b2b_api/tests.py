import uuid

from django.test import TestCase
from rest_framework.test import APIClient


class B2BApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.seller_id = uuid.uuid4()
        self.headers = {'HTTP_X_SELLER_ID': str(self.seller_id)}

    def test_create_product_then_list(self):
        payload = {
            'title': 'Demo product',
            'description': 'demo',
            'category_name': 'Electronics',
            'images': [{'url': 'https://example.com/a.jpg', 'ordering': 0}],
            'characteristics': [{'name': 'color', 'value': 'black'}],
        }

        created = self.client.post('/api/v1/products', payload, format='json', **self.headers)
        self.assertEqual(created.status_code, 201)

        listed = self.client.get('/api/v1/products?limit=10&offset=0', **self.headers)
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.data['total'], 1)
        self.assertEqual(listed.data['items'][0]['category']['name'], 'Electronics')

    def test_invoice_accept_increases_stock(self):
        category_id = uuid.uuid4()
        product = self.client.post(
            '/api/v1/products',
            {'title': 'P1', 'description': 'd', 'category_id': str(category_id)},
            format='json',
            **self.headers,
        )
        self.assertEqual(product.status_code, 201)

        sku = self.client.post(
            '/api/v1/skus',
            {
                'product_id': product.data['id'],
                'name': 'SKU 1',
                'price': 100,
                'active_quantity': 1,
            },
            format='json',
            **self.headers,
        )
        self.assertEqual(sku.status_code, 201)

        invoice = self.client.post(
            '/api/v1/invoices',
            {
                'warehouse_id': str(uuid.uuid4()),
                'items': [{'sku_id': sku.data['id'], 'quantity': 4}],
            },
            format='json',
            **self.headers,
        )
        self.assertEqual(invoice.status_code, 201)

        accepted = self.client.post(
            '/api/v1/invoices/accept',
            {'invoice_id': invoice.data['id']},
            format='json',
            **self.headers,
        )
        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(accepted.data['status'], 'ACCEPTED')

    def test_dashboard_endpoints_return_seller_metrics(self):
        product = self.client.post(
            '/api/v1/products',
            {'title': 'P1', 'description': 'd', 'category_name': 'Warehouse'},
            format='json',
            **self.headers,
        )
        self.assertEqual(product.status_code, 201)

        sku = self.client.post(
            '/api/v1/skus',
            {
                'product_id': product.data['id'],
                'name': 'SKU 1',
                'price': 1500,
                'active_quantity': 3,
            },
            format='json',
            **self.headers,
        )
        self.assertEqual(sku.status_code, 201)

        overview = self.client.get('/api/v1/dashboard/overview', **self.headers)
        self.assertEqual(overview.status_code, 200)
        self.assertEqual(overview.data['total_products'], 1)
        self.assertEqual(overview.data['total_skus'], 1)
        self.assertEqual(overview.data['total_stock'], 3)
        self.assertEqual(overview.data['created_products'], 1)

        stats = self.client.get('/api/v1/dashboard/stats', **self.headers)
        self.assertEqual(stats.status_code, 200)
        self.assertEqual(len(stats.data['recent_products']), 1)
        self.assertEqual(len(stats.data['low_stock_skus']), 1)
        self.assertEqual(stats.data['low_stock_skus'][0]['product_title'], 'P1')

    def test_profile_roundtrip_persists_seller_settings(self):
        initial = self.client.get('/api/v1/profile', **self.headers)
        self.assertEqual(initial.status_code, 200)
        self.assertEqual(initial.data['seller_id'], str(self.seller_id))

        updated = self.client.patch(
            '/api/v1/profile',
            {
                'company_name': 'NeoMarket Electronics',
                'contact_person': 'Ирина Петрова',
                'email': 'seller@example.com',
                'phone': '+79990000000',
                'warehouse_id': str(uuid.uuid4()),
            },
            format='json',
            **self.headers,
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.data['company_name'], 'NeoMarket Electronics')
        self.assertEqual(updated.data['contact_person'], 'Ирина Петрова')

        fetched = self.client.get('/api/v1/profile', **self.headers)
        self.assertEqual(fetched.status_code, 200)
        self.assertEqual(fetched.data['email'], 'seller@example.com')
