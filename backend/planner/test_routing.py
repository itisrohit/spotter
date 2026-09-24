from unittest.mock import patch

from django.test import SimpleTestCase

from planner.routing import route_locations


class RoutingTests(SimpleTestCase):
    @patch('planner.routing.time.sleep')
    @patch('planner.routing._fetch_json')
    def test_geocodes_locations_and_converts_osrm_route(self, fetch_json, sleep):
        fetch_json.side_effect = [
            [{'display_name': 'Chicago, Illinois', 'lat': '41.88', 'lon': '-87.63'}],
            [{'display_name': 'Indianapolis, Indiana', 'lat': '39.77', 'lon': '-86.16'}],
            {
                'code': 'Ok',
                'routes': [{
                    'distance': 290000,
                    'duration': 12600,
                    'legs': [{'distance': 290000, 'duration': 12600}],
                    'geometry': {'type': 'LineString', 'coordinates': [[-87.63, 41.88], [-86.16, 39.77]]},
                }],
            },
        ]

        result = route_locations(['Chicago, IL', 'Indianapolis, IN'])

        self.assertEqual(result['total_miles'], 180.2)
        self.assertEqual(result['drive_hours'], 3.5)
        self.assertEqual(result['route_legs'][0]['destination'], 'Indianapolis, IN')
        self.assertEqual(result['geometry']['type'], 'LineString')
        sleep.assert_called_once_with(1)
