from rest_framework import serializers

from .models import ProductQuestion, ProductReview


class ReviewCreateSerializer(serializers.Serializer):
    product_id = serializers.UUIDField()
    user_id = serializers.UUIDField()
    rating = serializers.IntegerField(min_value=1, max_value=5)
    text = serializers.CharField(required=False, allow_blank=True)


class ReviewModerateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=ProductReview.Status.choices)


class ReviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductReview
        fields = ['id', 'product_id', 'user_id', 'rating', 'text', 'status', 'created_at']


class QuestionCreateSerializer(serializers.Serializer):
    product_id = serializers.UUIDField()
    user_id = serializers.UUIDField()
    question = serializers.CharField(min_length=3, max_length=2000)


class QuestionAnswerSerializer(serializers.Serializer):
    moderator_id = serializers.UUIDField(required=False)
    answer = serializers.CharField(min_length=1, max_length=4000)


class QuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductQuestion
        fields = [
            'id',
            'product_id',
            'user_id',
            'question',
            'answer',
            'answered_by',
            'status',
            'created_at',
            'answered_at',
            'updated_at',
        ]
