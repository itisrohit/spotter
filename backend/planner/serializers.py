from rest_framework import serializers


class RouteLegSerializer(serializers.Serializer):
    name = serializers.CharField()
    miles = serializers.FloatField(min_value=0)
    drive_hours = serializers.FloatField(min_value=0)
    destination = serializers.CharField()


class TripPlanSerializer(serializers.Serializer):
    current_location = serializers.CharField()
    pickup_location = serializers.CharField()
    dropoff_location = serializers.CharField()
    current_cycle_used = serializers.FloatField(min_value=0, max_value=69.999)
    route_legs = RouteLegSerializer(many=True, allow_empty=False)


class LocationTripSerializer(serializers.Serializer):
    current_location = serializers.CharField()
    pickup_location = serializers.CharField()
    dropoff_location = serializers.CharField()
    current_cycle_used = serializers.FloatField(min_value=0, max_value=69.999)
