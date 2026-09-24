from rest_framework.response import Response
from rest_framework.views import APIView

from .hos import RouteLeg, plan_trip
from .serializers import TripPlanSerializer


class HealthView(APIView):
    def get(self, request):
        return Response({'status': 'ok', 'service': 'spotter-api'})


class TripPlanView(APIView):
    def post(self, request):
        serializer = TripPlanSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        segments = plan_trip(
            current_location=data['current_location'],
            pickup_location=data['pickup_location'],
            dropoff_location=data['dropoff_location'],
            current_cycle_used=data['current_cycle_used'],
            route_legs=[RouteLeg(**leg) for leg in data['route_legs']],
        )
        return Response({'segments': [segment.to_dict() for segment in segments]})

# Create your views here.
