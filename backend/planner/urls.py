from django.urls import path

from .views import HealthView, RoutePlanView, TripPlanView

urlpatterns = [
    path('health/', HealthView.as_view(), name='health'),
    path('trips/plan/', TripPlanView.as_view(), name='trip-plan'),
    path('trips/route-plan/', RoutePlanView.as_view(), name='route-plan'),
]
