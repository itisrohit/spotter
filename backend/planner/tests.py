from django.test import TestCase


class HealthCheckTests(TestCase):
    def test_health_check_returns_ok(self):
        response = self.client.get('/health/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok'})

    def test_rollout_frontend_can_make_cors_preflight_request(self):
        response = self.client.options(
            '/api/trips/route-plan/',
            HTTP_ORIGIN='https://frontend-1813.rollout.click',
            HTTP_ACCESS_CONTROL_REQUEST_METHOD='POST',
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS='content-type',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers['Access-Control-Allow-Origin'],
            'https://frontend-1813.rollout.click',
        )
