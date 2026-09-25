# Spotter Route Intelligence

Spotter is a full-stack trip-planning prototype for property-carrying drivers. It accepts a trip, calculates a route, applies the assessment HOS assumptions, and renders the result as a map, duty timeline, ELD view, and filled FMCSA daily log sheet.

## Assessment requirements covered

The assessment asks for:

- A full-stack Django and React application.
- Inputs for current location, pickup location, dropoff location, and current cycle used.
- A map showing the route, stops, and rest/fuel events.
- Filled daily log sheets, including multiple sheets for longer trips.
- A hosted version, GitHub source code, and a short Loom walkthrough.

## Features

- OpenStreetMap Nominatim geocoding.
- OSRM driving-route calculation.
- Leaflet route map with current, pickup, dropoff, rest, and fuel markers.
- HOS-aware duty planning with 24-hour ELD logs.
- Filled FMCSA daily log sheets using the supplied template asset.
- Optional paper-log details for driver, carrier, vehicle, load, and commodity fields.
- Multi-day log splitting for trips that cross 24-hour boundaries.
- Frontend linting, production build, and backend tests.

## Planning assumptions

The planner follows the assumptions supplied with the assessment:

- Property-carrying driver.
- 70-hour / 8-day cycle.
- 11-hour driving limit.
- 14-hour driving window.
- 30-minute break after 8 hours of driving.
- 10-hour daily rest.
- 34-hour cycle restart when the cycle limit is reached.
- One hour for pickup and one hour for dropoff.
- Fuel stop every 1,000 miles, with a 30-minute service duration.
- No adverse driving conditions.

The route provider calls are made server-side. Nominatim is called conservatively with a descriptive User-Agent and an in-process cache. For production traffic, use a hosted geocoder and routing provider instead of the public demo services.

## Project structure

```text
spotter/
├── backend/                 # Django REST API and HOS planner
│   ├── config/              # Django project settings and URLs
│   ├── planner/             # Routing adapters, HOS logic, and API views
│   └── requirements.txt
├── frontend/                # React + Vite client
│   ├── src/App.jsx          # Planner UI, map, ELD view, and paper log
│   └── src/assets/          # Supplied FMCSA log template
└── assets/                  # Assessment documents and source assets
```

## Run locally

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 127.0.0.1:8000
```

The API runs at `http://127.0.0.1:8000/api/`.

### Frontend

In a second terminal:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`.

## Test and quality checks

Frontend:

```bash
cd frontend
npm run lint
npm run build
```

Backend:

```bash
cd backend
.venv/bin/python manage.py test
```

## API endpoint

### `POST /api/trips/route-plan/`

Request:

```json
{
  "current_location": "Chicago, IL",
  "pickup_location": "Indianapolis, IN",
  "dropoff_location": "Columbus, OH",
  "current_cycle_used": 0
}
```

The response includes geocoded locations, route geometry, route legs, total miles, drive time, HOS duty segments, and daily logs.

## Paper-log details

The four trip fields are the required assessment inputs. The optional **Paper log details** section lets a user provide driver, carrier, terminal, vehicle, load, and commodity information when those details are available. Empty optional values are displayed as `N/A`; they are not invented or hardcoded from the video example.

## Free deployment

The current Rollout deployment is live at:

- Frontend: https://frontend-1813.rollout.click
- Backend health check: https://backend-b76a.rollout.click/health/

The frontend is deployed as a React web service and the Django API as a Python web service. The repository includes a helper script that configures both linked Rollout apps and verifies the production bundle:

```bash
bash scripts/deploy-rollout.sh
```

For another host, configure the production frontend variable with the deployed API URL:

```env
VITE_API_BASE_URL=https://your-api-host.example/api
```

For production, set `DEBUG=False`, provide a secret `SECRET_KEY`, configure `ALLOWED_HOSTS`, and add the hosted frontend URL to Django CORS settings. The current prototype does not require a database because it does not persist user trip plans.

## Assessment submission checklist

- [x] Django + React source code
- [x] Required trip inputs
- [x] Route map and route information
- [x] HOS/ELD duty logs
- [x] Filled FMCSA daily log sheets
- [x] Multiple daily logs for longer trips
- [x] Lint and automated tests
- [x] Hosted application URL
- [ ] 3–5 minute Loom walkthrough URL
