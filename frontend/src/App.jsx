import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './App.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api'

const initialForm = {
  current_location: 'Chicago, IL',
  pickup_location: 'Indianapolis, IN',
  dropoff_location: 'Columbus, OH',
  current_cycle_used: 0,
}

function formatHours(hours) {
  if (hours === undefined || hours === null) return '--'
  const wholeHours = Math.floor(hours)
  const minutes = Math.round((hours - wholeHours) * 60)
  return `${wholeHours}h ${minutes}m`
}

function MapPanel({ geometry }) {
  const mapContainer = useRef(null)
  const mapInstance = useRef(null)

  useEffect(() => {
    if (mapInstance.current || !mapContainer.current) return undefined
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [-87.63, 41.88],
      zoom: 5,
      attributionControl: true,
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    mapInstance.current = map
    return () => {
      map.remove()
      mapInstance.current = null
    }
  }, [])

  useEffect(() => {
    if (!geometry || !mapInstance.current) return undefined
    const map = mapInstance.current
    let routeRendered = false
    const renderRoute = () => {
      if (routeRendered) return
      const routeData = { type: 'Feature', properties: {}, geometry }
      const source = map.getSource('route')
      if (source) source.setData(routeData)
      else {
        map.addSource('route', { type: 'geojson', data: routeData })
        map.addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': '#f97316', 'line-width': 5, 'line-opacity': 0.9 } })
      }
      const bounds = geometry.coordinates.reduce(
        (result, coordinate) => result.extend(coordinate),
        new maplibregl.LngLatBounds(geometry.coordinates[0], geometry.coordinates[0]),
      )
      map.fitBounds(bounds, { padding: 56, maxZoom: 10, duration: 700 })
      routeRendered = true
    }
    const renderWhenReady = () => {
      if (map.isStyleLoaded()) {
        map.resize()
        renderRoute()
      }
    }
    map.on('load', renderWhenReady)
    map.on('idle', renderWhenReady)
    renderWhenReady()
    const retry = window.setTimeout(renderWhenReady, 750)
    return () => {
      map.off('load', renderWhenReady)
      map.off('idle', renderWhenReady)
      window.clearTimeout(retry)
    }
  }, [geometry])

  return <div className="map" ref={mapContainer} aria-label="Trip route map" />
}

function App() {
  const [form, setForm] = useState(initialForm)
  const [plan, setPlan] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const updateField = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: name === 'current_cycle_used' ? Number(value) : value }))
  }

  const submitPlan = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setPlan(null)
    try {
      const response = await fetch(`${API_BASE_URL}/trips/route-plan/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'Could not plan this trip.')
      setPlan(data)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark">S</div>
        <div><p className="eyebrow">SPOTTER DISPATCH</p><h1>Trip planner</h1></div>
        <span className="status-pill"><span /> HOS-aware routing</span>
      </header>

      <section className="intro">
        <div><p className="eyebrow">ROUTE INTELLIGENCE</p><h2>Plan the miles. Protect the hours.</h2><p className="intro-copy">Build a legal trip plan with route distance, rest windows, service stops, and ELD-ready duty segments.</p></div>
        <div className="rule-card"><strong>70 / 8</strong><span>cycle assumption</span></div>
      </section>

      <section className="workspace">
        <form className="panel form-panel" onSubmit={submitPlan}>
          <div className="panel-heading"><div><p className="eyebrow">NEW PLAN</p><h3>Trip details</h3></div><span className="step-label">01 / 01</span></div>
          <label>Current location<input name="current_location" value={form.current_location} onChange={updateField} required /></label>
          <label>Pickup location<input name="pickup_location" value={form.pickup_location} onChange={updateField} required /></label>
          <label>Dropoff location<input name="dropoff_location" value={form.dropoff_location} onChange={updateField} required /></label>
          <label>Current cycle used <span className="input-suffix">hours</span><input name="current_cycle_used" type="number" min="0" max="69.99" step="0.5" value={form.current_cycle_used} onChange={updateField} required /></label>
          <button className="primary-button" type="submit" disabled={loading}>{loading ? 'Building plan…' : 'Build trip plan'} <span>→</span></button>
          {error && <p className="error-message">{error}</p>}
          <p className="form-note">Uses OpenStreetMap geocoding and OSRM routing for this assessment prototype.</p>
        </form>

        <section className="panel map-panel">
          <div className="panel-heading map-heading"><div><p className="eyebrow">LIVE ROUTE</p><h3>{plan ? `${plan.total_miles} miles` : 'Route preview'}</h3></div>{plan && <span className="route-time">{formatHours(plan.drive_hours)} driving</span>}</div>
          {plan ? <MapPanel geometry={plan.geometry} /> : <div className="empty-map"><div className="empty-icon">⌁</div><h3>Your route will appear here</h3><p>Enter trip details and build a plan to see the route and legal rest sequence.</p></div>}
        </section>
      </section>

      {plan && <section className="results"><div className="results-header"><div><p className="eyebrow">PLAN OUTPUT</p><h2>Duty timeline</h2></div><div className="result-stats"><span><strong>{plan.total_miles}</strong> miles</span><span><strong>{formatHours(plan.drive_hours)}</strong> drive time</span><span><strong>{plan.segments.length}</strong> segments</span></div></div><div className="timeline-list">{plan.segments.map((segment, index) => <article className="timeline-row" key={`${segment.start_hour}-${segment.activity}`}><div className="timeline-index">{String(index + 1).padStart(2, '0')}</div><div className={`duty-dot duty-${segment.status.toLowerCase()}`} /><div className="timeline-main"><strong>{segment.activity}</strong><span>{segment.location}</span></div><div className="timeline-status">{segment.status.replace('_', ' ')}</div><div className="timeline-time">{formatHours(segment.duration_hours)}</div></article>)}</div><p className="attribution">Map data © OpenStreetMap contributors · Routing by OSRM</p></section>}
    </main>
  )
}

export default App
