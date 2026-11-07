from django.urls import path

from .views import ContentPageView

urlpatterns = [
    path("pages/<slug:key>", ContentPageView.as_view(), name="page"),
]
