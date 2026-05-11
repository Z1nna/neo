from django.db.models import Avg, Count
from django.utils import timezone
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ProductQuestion, ProductReview
from .serializers import (
    QuestionAnswerSerializer,
    QuestionCreateSerializer,
    QuestionSerializer,
    ReviewCreateSerializer,
    ReviewModerateSerializer,
    ReviewSerializer,
)


def _roles_from_header(request):
    header = request.headers.get('X-Roles', '')
    if not header:
        return []
    return [role.strip().upper() for role in header.split(',') if role.strip()]


def _is_moderator(request):
    roles = _roles_from_header(request)
    return 'MODERATOR' in roles or 'ADMIN' in roles


@extend_schema_view(
    get=extend_schema(operation_id='reviews_list'),
    post=extend_schema(operation_id='reviews_create', request=ReviewCreateSerializer, responses=ReviewSerializer),
)
class ProductReviewsView(APIView):
    def get(self, request):
        product_id = request.query_params.get('product_id')
        qs = ProductReview.objects.filter(status=ProductReview.Status.PUBLISHED).order_by('-created_at')
        if product_id:
            qs = qs.filter(product_id=product_id)

        summary = qs.aggregate(avg_rating=Avg('rating'), total=Count('id'))
        return Response({'items': ReviewSerializer(qs, many=True).data, 'summary': {'avg_rating': summary['avg_rating'] or 0, 'total': summary['total']}})

    def post(self, request):
        serializer = ReviewCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({'code': 'BAD_REQUEST', 'message': 'Invalid review payload'}, status=status.HTTP_400_BAD_REQUEST)

        review = ProductReview.objects.create(**serializer.validated_data)
        return Response(ReviewSerializer(review).data, status=status.HTTP_201_CREATED)


@extend_schema_view(post=extend_schema(operation_id='reviews_moderate', request=ReviewModerateSerializer, responses=ReviewSerializer))
class ReviewModerateView(APIView):
    def post(self, request, review_id):
        serializer = ReviewModerateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({'code': 'BAD_REQUEST', 'message': 'Invalid moderate payload'}, status=status.HTTP_400_BAD_REQUEST)

        review = ProductReview.objects.filter(id=review_id).first()
        if not review:
            return Response({'code': 'NOT_FOUND', 'message': 'Review not found'}, status=status.HTTP_404_NOT_FOUND)

        review.status = serializer.validated_data['status']
        review.save(update_fields=['status'])
        return Response(ReviewSerializer(review).data)


@extend_schema_view(
    get=extend_schema(operation_id='qa_list'),
    post=extend_schema(operation_id='qa_create', request=QuestionCreateSerializer, responses=QuestionSerializer),
)
class ProductQuestionsView(APIView):
    def get(self, request):
        product_id = request.query_params.get('product_id')
        status_filter = request.query_params.get('status')

        qs = ProductQuestion.objects.all().order_by('-created_at')
        if product_id:
            qs = qs.filter(product_id=product_id)
        if status_filter:
            qs = qs.filter(status=status_filter.upper())

        return Response({'items': QuestionSerializer(qs, many=True).data, 'total': qs.count()})

    def post(self, request):
        serializer = QuestionCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({'code': 'BAD_REQUEST', 'message': 'Invalid question payload'}, status=status.HTTP_400_BAD_REQUEST)

        question = ProductQuestion.objects.create(**serializer.validated_data)
        return Response(QuestionSerializer(question).data, status=status.HTTP_201_CREATED)


@extend_schema_view(
    post=extend_schema(operation_id='qa_answer', request=QuestionAnswerSerializer, responses=QuestionSerializer),
)
class ProductQuestionAnswerView(APIView):
    def post(self, request, question_id):
        if not _is_moderator(request):
            return Response({'code': 'FORBIDDEN', 'message': 'Moderator role required'}, status=status.HTTP_403_FORBIDDEN)

        serializer = QuestionAnswerSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({'code': 'BAD_REQUEST', 'message': 'Invalid answer payload'}, status=status.HTTP_400_BAD_REQUEST)

        question = ProductQuestion.objects.filter(id=question_id).first()
        if not question:
            return Response({'code': 'NOT_FOUND', 'message': 'Question not found'}, status=status.HTTP_404_NOT_FOUND)

        question.answer = serializer.validated_data['answer']
        question.status = ProductQuestion.Status.ANSWERED
        question.answered_by = serializer.validated_data.get('moderator_id')
        question.answered_at = timezone.now()
        question.save(update_fields=['answer', 'status', 'answered_by', 'answered_at', 'updated_at'])

        return Response(QuestionSerializer(question).data)
