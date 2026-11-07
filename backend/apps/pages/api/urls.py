from django.urls import path

from .views import ContentPageView, PreviewView

urlpatterns = [
    # Đặt trước pages/<key> để "preview" không bị hiểu là khoá trang
    path("pages/preview/<str:token>", PreviewView.as_view(), name="page-preview"),
    path("pages/<slug:key>", ContentPageView.as_view(), name="page"),
]
