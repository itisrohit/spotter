import { useEffect, useRef, useState } from 'react'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
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

function formatClock(hours) {
  const totalMinutes = Math.round(hours * 60)
  const hour = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

const logStatuses = [
  ['OFF_DUTY', 'Off duty'],
  ['SLEEPER', 'Sleeper'],
  ['DRIVING', 'Driving'],
  ['ON_DUTY', 'On duty'],
]

function DutyLog({ log }) {
  return (
    <article className="eld-card">
      <div className="eld-header">
        <div><p className="eyebrow">ELD RECORD</p><h3>Day {log.day}</h3></div>
        <span className="eld-total">24-hour log</span>
      </div>
      <div className="eld-grid">
        <div className="eld-labels">
          {logStatuses.map(([, label]) => <span key={label}>{label}</span>)}
        </div>
        <div className="eld-tracks">
          {logStatuses.map(([status]) => (
            <div className="eld-track" key={status}>
              {log.segments.filter((segment) => segment.status === status).map((segment) => (
                <span
                  className={`eld-segment eld-${status.toLowerCase()}`}
                  key={`${status}-${segment.start_hour}-${segment.activity}`}
                  title={`${segment.activity} · ${formatClock(segment.start_hour)}–${formatClock(segment.end_hour)}`}
                  style={{ left: `${segment.start_hour / 24 * 100}%`, width: `${segment.duration_hours / 24 * 100}%` }}
                />
              ))}
            </div>
          ))}
          <div className="eld-hours"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
        </div>
      </div>
      <div className="eld-summary">
        {logStatuses.map(([status, label]) => <span key={status}><strong>{formatHours(log.totals[status])}</strong>{label}</span>)}
      </div>
      {log.remarks.length > 0 && <div className="eld-remarks"><strong>Remarks</strong>{log.remarks.map((remark) => <span key={`${remark.time}-${remark.activity}`}>{formatClock(remark.time)} · {remark.activity} · {remark.location}</span>)}</div>}
    </article>
  )
}

function MapPanel({ geometry }) {
  const mapContainer = useRef(null)
  const mapInstance = useRef(null)
  const routeLayer = useRef(null)

  useEffect(() => {
    if (mapInstance.current || !mapContainer.current) return undefined
    const map = L.map(mapContainer.current, { zoomControl: true }).setView([41.88, -87.63], 5)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)
    mapInstance.current = map
    window.requestAnimationFrame(() => map.invalidateSize())
    return () => {
      map.remove()
      mapInstance.current = null
    }
  }, [])

  useEffect(() => {
    if (!geometry || !mapInstance.current) return undefined
    const map = mapInstance.current
    routeLayer.current?.remove()
    routeLayer.current = L.layerGroup().addTo(map)
    L.geoJSON({ type: 'Feature', properties: {}, geometry }, {
      style: { color: '#f97316', weight: 6, opacity: 0.95, lineCap: 'round', lineJoin: 'round' },
    }).addTo(routeLayer.current)
    const coordinates = geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude])
    L.circleMarker(coordinates[0], { radius: 8, color: '#fffdf8', weight: 3, fillColor: '#ef6c3b', fillOpacity: 1 }).addTo(routeLayer.current)
    L.circleMarker(coordinates.at(-1), { radius: 8, color: '#fffdf8', weight: 3, fillColor: '#252520', fillOpacity: 1 }).addTo(routeLayer.current)
    map.fitBounds(L.latLngBounds(coordinates), { padding: [56, 56], maxZoom: 10 })
    window.requestAnimationFrame(() => map.invalidateSize())
    return () => routeLayer.current?.remove()
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

      {plan && <section className="results"><div className="results-header"><div><p className="eyebrow">PLAN OUTPUT</p><h2>Duty timeline</h2></div><div className="result-stats"><span><strong>{plan.total_miles}</strong> miles</span><span><strong>{formatHours(plan.drive_hours)}</strong> drive time</span><span><strong>{plan.segments.length}</strong> segments</span></div></div><div className="timeline-list">{plan.segments.map((segment, index) => <article className="timeline-row" key={`${segment.start_hour}-${segment.activity}`}><div className="timeline-index">{String(index + 1).padStart(2, '0')}</div><div className={`duty-dot duty-${segment.status.toLowerCase()}`} /><div className="timeline-main"><strong>{segment.activity}</strong><span>{segment.location}</span></div><div className="timeline-status">{segment.status.replace('_', ' ')}</div><div className="timeline-time">{formatHours(segment.duration_hours)}</div></article>)}</div><div className="eld-section"><div className="results-header"><div><p className="eyebrow">COMPLIANCE VIEW</p><h2>Daily ELD logs</h2></div><span className="eld-total">Totals include off-duty time</span></div><div className="eld-list">{plan.daily_logs.map((log) => <DutyLog key={log.day} log={log} />)}</div></div><p className="attribution">Map data © OpenStreetMap contributors · Routing by OSRM</p></section>}
    </main>
  )
}

export default App
