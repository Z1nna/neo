from django.urls import path

from .views import ProductQuestionAnswerView, ProductQuestionsView, ProductReviewsView, ReviewModerateView


urlpatterns = [
    path('reviews/', ProductReviewsView.as_view(), name='reviews'),
    path('reviews/<uuid:review_id>/moderate/', ReviewModerateView.as_view(), name='reviews-moderate'),
    path('qa/questions/', ProductQuestionsView.as_view(), name='qa-questions'),
    path('qa/questions/<uuid:question_id>/answer/', ProductQuestionAnswerView.as_view(), name='qa-questions-answer'),
]
