#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

BACKEND_URL="${BACKEND_URL:-https://backend-b76a.rollout.click}"
FRONTEND_URL="${FRONTEND_URL:-https://frontend-1813.rollout.click}"

if ! command -v rollout >/dev/null 2>&1; then
  echo "rollout CLI is not installed or is not on PATH." >&2
  exit 1
fi

if [[ ! -f "$BACKEND_DIR/.rollout/config.json" ]]; then
  echo "Backend Rollout app is not linked: $BACKEND_DIR/.rollout/config.json" >&2
  exit 1
fi

if [[ ! -f "$FRONTEND_DIR/.rollout/config.json" ]]; then
  echo "Frontend Rollout app is not linked: $FRONTEND_DIR/.rollout/config.json" >&2
  exit 1
fi

echo "Deploying linked frontend with build API URL: $BACKEND_URL/api"
(
  cd "$FRONTEND_DIR"
  rollout env "VITE_API_BASE_URL=$BACKEND_URL/api"
  rollout
)

echo "Configuring backend CORS origin: $FRONTEND_URL"
(
  cd "$BACKEND_DIR"
  rollout env "CORS_ALLOWED_ORIGINS=$FRONTEND_URL"
  rollout
)

echo "Checking backend health..."
health_response="$(curl --fail --silent --show-error "$BACKEND_URL/health/")"
if [[ "$health_response" != *'"status": "ok"'* ]]; then
  echo "Unexpected health response: $health_response" >&2
  exit 1
fi

echo "Checking deployed frontend bundle..."
frontend_html="$(curl --fail --silent --show-error "$FRONTEND_URL/")"
asset_path="$(printf '%s' "$frontend_html" | sed -n 's/.*src="\([^" ]*\.js\)".*/\1/p' | head -n 1)"
if [[ -z "$asset_path" ]]; then
  echo "Could not find a JavaScript bundle at $FRONTEND_URL." >&2
  exit 1
fi

if [[ "$asset_path" == /* ]]; then
  asset_url="$FRONTEND_URL$asset_path"
else
  asset_url="$FRONTEND_URL/$asset_path"
fi

frontend_bundle="$(curl --fail --silent --show-error "$asset_url")"
if [[ "$frontend_bundle" == *'127.0.0.1:8000'* || "$frontend_bundle" == *'localhost:8000'* ]]; then
  echo "The deployed frontend still contains the local API URL: $asset_url" >&2
  exit 1
fi

echo "Rollout configuration complete."
echo "Frontend: $FRONTEND_URL"
echo "Backend:  $BACKEND_URL"
echo "Next: hard-refresh the frontend with Cmd+Shift+R."
