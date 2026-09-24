"""Small provider adapters for the assessment route workflow.

Nominatim's public service is intentionally used conservatively: one result
per location, a descriptive User-Agent, and an in-process cache. For regular
production traffic, configure a hosted geocoder instead of this public demo
endpoint.
"""

from dataclasses import dataclass
from functools import lru_cache
import json
import os
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


NOMINATIM_URL = os.getenv('NOMINATIM_URL', 'https://nominatim.openstreetmap.org/search')
OSRM_URL = os.getenv('OSRM_URL', 'https://router.project-osrm.org/route/v1/driving')
USER_AGENT = os.getenv('ROUTING_USER_AGENT', 'SpotterAssessment/0.1')


class RoutingError(RuntimeError):
    """Raised when a location cannot be geocoded or routed."""


@dataclass(frozen=True)
class LocationPoint:
    query: str
    display_name: str
    latitude: float
    longitude: float

    def to_dict(self) -> dict:
        return {
            'query': self.query,
            'display_name': self.display_name,
            'latitude': self.latitude,
            'longitude': self.longitude,
        }


def _fetch_json(url: str) -> dict | list:
    request = Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'application/json'})
    try:
        with urlopen(request, timeout=20) as response:
            return json.load(response)
    except (HTTPError, URLError, TimeoutError) as exc:
        raise RoutingError(f'Routing provider request failed: {exc}') from exc


@lru_cache(maxsize=128)
def geocode_location(query: str) -> LocationPoint:
    query = query.strip()
    if not query:
        raise RoutingError('Location cannot be empty.')
    params = urlencode({'q': query, 'format': 'jsonv2', 'limit': 1, 'addressdetails': 1})
    results = _fetch_json(f'{NOMINATIM_URL}?{params}')
    if not results:
        raise RoutingError(f'Location not found: {query}')
    result = results[0]
    try:
        return LocationPoint(
            query=query,
            display_name=result['display_name'],
            latitude=float(result['lat']),
            longitude=float(result['lon']),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise RoutingError(f'Invalid geocoding response for: {query}') from exc


def route_locations(locations: list[str]) -> dict:
    if len(locations) < 2:
        raise RoutingError('At least two locations are required for routing.')

    points = []
    for index, location in enumerate(locations):
        if index:
            # Nominatim asks clients to stay below one request per second.
            time.sleep(1)
        points.append(geocode_location(location))

    coordinates = ';'.join(f'{point.longitude},{point.latitude}' for point in points)
    params = urlencode({'overview': 'full', 'geometries': 'geojson', 'steps': 'false'})
    result = _fetch_json(f'{OSRM_URL}/{coordinates}?{params}')
    if result.get('code') != 'Ok' or not result.get('routes'):
        raise RoutingError('No drivable route was found for these locations.')

    route = result['routes'][0]
    legs = route.get('legs', [])
    route_legs = []
    for index, leg in enumerate(legs):
        route_legs.append({
            'name': f'{points[index].query} to {points[index + 1].query}',
            'miles': round(float(leg['distance']) / 1609.344, 2),
            'drive_hours': round(float(leg['duration']) / 3600, 2),
            'destination': points[index + 1].query,
        })

    return {
        'locations': [point.to_dict() for point in points],
        'route_legs': route_legs,
        'total_miles': round(float(route['distance']) / 1609.344, 2),
        'drive_hours': round(float(route['duration']) / 3600, 2),
        'geometry': route.get('geometry'),
    }
