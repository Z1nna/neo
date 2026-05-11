import uuid

from django.test import TestCase
from rest_framework.test import APIClient


class ReviewsApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_create_and_list_reviews(self):
        product_id = uuid.uuid4()
        created = self.client.post('/api/v1/reviews', {
            'product_id': str(product_id),
            'user_id': str(uuid.uuid4()),
            'rating': 5,
            'text': 'Great product',
        }, format='json')
        self.assertEqual(created.status_code, 201)

        listed = self.client.get(f'/api/v1/reviews?product_id={product_id}')
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.data['summary']['total'], 1)

    def test_create_list_and_answer_questions(self):
        product_id = uuid.uuid4()
        customer_id = uuid.uuid4()
        moderator_id = uuid.uuid4()

        created = self.client.post('/api/v1/qa/questions', {
            'product_id': str(product_id),
            'user_id': str(customer_id),
            'question': 'Есть ли гарантия на товар?',
        }, format='json')
        self.assertEqual(created.status_code, 201)

        listed = self.client.get(f'/api/v1/qa/questions?product_id={product_id}')
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.data['total'], 1)

        question_id = created.data['id']

        denied = self.client.post(f'/api/v1/qa/questions/{question_id}/answer', {
            'moderator_id': str(moderator_id),
            'answer': 'Да, 12 месяцев',
        }, format='json')
        self.assertEqual(denied.status_code, 403)

        allowed = self.client.post(
            f'/api/v1/qa/questions/{question_id}/answer',
            {
                'moderator_id': str(moderator_id),
                'answer': 'Да, 12 месяцев',
            },
            format='json',
            HTTP_X_ROLES='MODERATOR',
        )
        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(allowed.data['status'], 'ANSWERED')
