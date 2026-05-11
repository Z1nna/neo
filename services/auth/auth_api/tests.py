import uuid

from django.test import TestCase
from rest_framework.test import APIClient

from .models import ClientApp, User


class AuthApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        ClientApp.objects.update_or_create(
            client_id='neomarket-web',
            defaults={
                'client_secret': 'dev-secret',
                'name': 'NeoMarket Web',
                'scopes': ['catalog.read', 'orders.create'],
                'is_active': True,
            },
        )

    def test_issue_and_introspect_token(self):
        user_id = uuid.uuid4()
        token_response = self.client.post(
            '/api/v1/auth/token/',
            {
                'client_id': 'neomarket-web',
                'client_secret': 'dev-secret',
                'user_id': str(user_id),
                'roles': ['CUSTOMER'],
            },
            format='json',
        )
        self.assertEqual(token_response.status_code, 200)
        token = token_response.data['access_token']

        introspect_response = self.client.post('/api/v1/auth/introspect/', {'token': token}, format='json')
        self.assertEqual(introspect_response.status_code, 200)
        self.assertTrue(introspect_response.data['active'])

    def test_register_login_me_and_refresh(self):
        register_response = self.client.post(
            '/api/v1/auth/register/',
            {
                'email': 'seller@example.com',
                'username': 'seller1',
                'first_name': 'Neo',
                'last_name': 'Seller',
                'phone': '+79990000000',
                'role': 'SELLER',
                'company_name': 'NeoMarket Seller LLC',
                'password': 'strongpass123',
                'password_confirm': 'strongpass123',
            },
            format='json',
        )
        self.assertEqual(register_response.status_code, 201)
        self.assertIn('access_token', register_response.data)
        self.assertEqual(register_response.data['user']['role'], 'SELLER')

        login_response = self.client.post(
            '/api/v1/auth/login/',
            {
                'email': 'seller@example.com',
                'password': 'strongpass123',
            },
            format='json',
        )
        self.assertEqual(login_response.status_code, 200)
        access_token = login_response.data['access_token']
        refresh_token = login_response.data['refresh_token']

        me_response = self.client.get('/api/v1/auth/me/', HTTP_AUTHORIZATION=f'Bearer {access_token}')
        self.assertEqual(me_response.status_code, 200)
        self.assertEqual(me_response.data['email'], 'seller@example.com')

        patch_response = self.client.patch(
            '/api/v1/auth/me/',
            {'company_name': 'Updated Seller LLC'},
            format='json',
            HTTP_AUTHORIZATION=f'Bearer {access_token}',
        )
        self.assertEqual(patch_response.status_code, 200)
        self.assertEqual(patch_response.data['company_name'], 'Updated Seller LLC')

        refresh_response = self.client.post(
            '/api/v1/auth/refresh/',
            {'refresh_token': refresh_token},
            format='json',
        )
        self.assertEqual(refresh_response.status_code, 200)
        self.assertIn('access_token', refresh_response.data)
        self.assertTrue(User.objects.filter(email='seller@example.com').exists())
