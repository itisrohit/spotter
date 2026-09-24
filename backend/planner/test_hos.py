from django.test import SimpleTestCase

from planner.hos import RouteLeg, plan_trip


class HOSPlannerTests(SimpleTestCase):
    def make_plan(self, **overrides):
        values = {
            'current_location': 'Chicago, IL',
            'pickup_location': 'Indianapolis, IN',
            'dropoff_location': 'Columbus, OH',
            'current_cycle_used': 0,
            'route_legs': [
                RouteLeg('To pickup', 180, 3.5, 'Indianapolis, IN'),
                RouteLeg('To dropoff', 180, 3.5, 'Columbus, OH'),
            ],
        }
        values.update(overrides)
        return plan_trip(**values)

    def test_trip_contains_pickup_and_dropoff(self):
        activities = [segment.activity for segment in self.make_plan()]
        self.assertIn('Pickup', activities)
        self.assertIn('Drop-off', activities)

    def test_long_drive_inserts_thirty_minute_break(self):
        segments = self.make_plan(route_legs=[RouteLeg('Long haul', 600, 12, 'Indianapolis, IN')])
        self.assertIn('30-minute rest break', [segment.activity for segment in segments])

    def test_daily_rest_resets_driving_clock(self):
        segments = self.make_plan(route_legs=[RouteLeg('Long haul', 900, 18, 'Indianapolis, IN')])
        rests = [segment for segment in segments if segment.activity == '10-hour daily rest']
        self.assertGreaterEqual(len(rests), 1)

    def test_cycle_restart_is_inserted_when_needed(self):
        segments = self.make_plan(current_cycle_used=69, route_legs=[RouteLeg('Short haul', 100, 2, 'Indianapolis, IN')])
        self.assertIn('34-hour cycle restart', [segment.activity for segment in segments])
