import { useEffect, useRef, useState } from 'react'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import paperLogTemplate from './assets/blank-paper-log.png'
import './App.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api'

const initialForm = {
  current_location: 'Chicago, IL',
  pickup_location: 'Indianapolis, IN',
  dropoff_location: 'Columbus, OH',
  current_cycle_used: 0,
  paper_date: new Date().toISOString().slice(0, 10),
  paper_driver: '',
  paper_initials: '',
  paper_signature: '',
  paper_co_driver: '',
  paper_carrier: '',
  paper_terminal: '',
  paper_truck: '',
  paper_trailer: '',
  paper_load_id: '',
  paper_commodity: '',
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

function formatPaperDate(value) {
  if (!value) return 'N/A'
  const [year, month, day] = value.split('-')
  return year && month && day ? `${month}/${day}/${year}` : value
}

function buildPaperPlan(plan, form) {
  const firstLog = plan.daily_logs?.[0]
  const shiftWork = firstLog ? (firstLog.totals.DRIVING + firstLog.totals.ON_DUTY).toFixed(1) : 'N/A'
  return {
    ...plan,
    paper_fields: {
      date: formatPaperDate(form.paper_date),
      driver: form.paper_driver || 'N/A',
      initials: form.paper_initials || 'N/A',
      signature: form.paper_signature || 'N/A',
      co_driver: form.paper_co_driver || 'N/A',
      carrier: form.paper_carrier || 'N/A',
      office: form.paper_terminal || 'N/A',
      terminal: form.paper_terminal || 'N/A',
      truck: form.paper_truck || 'N/A',
      trailer: form.paper_trailer || 'N/A',
      load_id: form.paper_load_id || 'N/A',
      commodity: form.paper_commodity || 'N/A',
      shift_work: `${shiftWork}h`,
    },
  }
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

function PaperLog({ log, plan, title = `Filled FMCSA daily log · Day ${log.day}` }) {
  const graph = { left: 65, right: 454, top: 184, bottom: 254 }
  const statusRows = { OFF_DUTY: 193, SLEEPER: 211, DRIVING: 229, ON_DUTY: 247 }
  const xForHour = (hour) => graph.left + (hour / 24) * (graph.right - graph.left)
  const from = plan.locations?.[0]?.query || 'Current location'
  const to = plan.locations?.at(-1)?.query || 'Dropoff location'
  const remarks = log.remarks.slice(0, 7)
  const fields = plan.paper_fields || {}
  const dateParts = fields.date?.split('/') || []
  const dutyPath = log.segments.reduce((path, segment, index) => {
    const startX = xForHour(segment.start_hour)
    const endX = xForHour(segment.end_hour)
    const rowY = statusRows[segment.status]
    if (index === 0) return `M ${startX} ${rowY} H ${endX}`
    return `${path} V ${rowY} H ${endX}`
  }, '')

  return (
    <article className="paper-log-card">
      <div className="paper-log-title">{title}</div>
      {fields.driver && <div className="paper-log-meta">Date {fields.date} · Driver {fields.driver} · Initials {fields.initials} · Signature {fields.signature} · Co-driver {fields.co_driver} · Load {fields.load_id} · {fields.commodity} · Work {fields.shift_work}</div>}
      <div className="paper-log-sheet">
        <img src={paperLogTemplate} alt="Blank FMCSA driver daily log template" />
        <svg className="paper-log-overlay" viewBox="0 0 513 518" role="img" aria-label={`Filled daily log for day ${log.day}`}>
          <defs>
            <clipPath id={`paper-log-grid-${log.day}`}>
              <rect x={graph.left} y={graph.top} width={graph.right - graph.left} height={graph.bottom - graph.top} />
            </clipPath>
          </defs>
          <g className="paper-log-fields">
            {dateParts.map((part, index) => <text key={`date-${part}-${index}`} x={[185, 229, 272][index]} y="19" textAnchor="middle">{part}</text>)}
            <text x="150" y="44" textAnchor="middle">{from}</text>
            <text x="350" y="44" textAnchor="middle">{to}</text>
            <text x="60" y="83">{plan.total_miles}</text>
            <text x="148" y="83">{plan.total_miles}</text>
            {fields.carrier && <text x="348" y="76" textAnchor="middle">{fields.carrier}</text>}
            {fields.office && <text x="348" y="97" textAnchor="middle">{fields.office}</text>}
            {fields.terminal && <text x="348" y="120" textAnchor="middle">{fields.terminal}</text>}
            {fields.truck && <text x="60" y="112">{fields.truck} / {fields.trailer}</text>}
          </g>
          <g className="paper-log-lines" clipPath={`url(#paper-log-grid-${log.day})`}>
            <path d={dutyPath} />
          </g>
          <g className="paper-log-remarks">
            {remarks.map((remark, index) => <text key={`${remark.time}-${remark.activity}`} x="165" y={296 + index * 13}>{formatClock(remark.time)} · {remark.activity} · {remark.location}</text>)}
          </g>
          <g className="paper-log-totals">
            <text x="471" y="193">{log.totals.OFF_DUTY}</text>
            <text x="471" y="211">{log.totals.SLEEPER}</text>
            <text x="471" y="229">{log.totals.DRIVING}</text>
            <text x="471" y="247">{log.totals.ON_DUTY}</text>
          </g>
        </svg>
      </div>
    </article>
  )
}

function MapPanel({ geometry, locations, segments, totalMiles }) {
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
    const resizeTimer = window.setTimeout(() => map.invalidateSize(), 300)
    return () => {
      window.clearTimeout(resizeTimer)
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
    locations.forEach((location, index) => {
      const activities = segments
        .filter((segment) => segment.location === location.query && segment.activity !== 'Off duty')
        .map((segment) => `${segment.activity} · ${formatHours(segment.duration_hours)}`)
      const label = index === 0 ? 'Current location' : index === locations.length - 1 ? 'Dropoff' : 'Pickup'
      const color = index === 0 ? '#ef6c3b' : index === locations.length - 1 ? '#252520' : '#4369a5'
      L.circleMarker([location.latitude, location.longitude], {
        radius: 7,
        color: '#fffdf8',
        weight: 3,
        fillColor: color,
        fillOpacity: 1,
      }).bindPopup(`<strong>${label}</strong><br>${location.query}${activities.length ? `<br><br>${activities.join('<br>')}` : ''}`).addTo(routeLayer.current)
    })
    const eventStyles = {
      Fueling: { label: 'Fuel stop', color: '#d97706' },
      '30-minute rest break': { label: '30-minute rest', color: '#7a62a4' },
      '10-hour daily rest': { label: '10-hour sleeper rest', color: '#5b4a8a' },
      '34-hour cycle restart': { label: '34-hour cycle restart', color: '#334155' },
    }
    const eventGroups = new Map()
    segments.filter((segment) => eventStyles[segment.activity]).forEach((segment) => {
      const knownLocation = locations.find((location) => location.query === segment.location)
      const enRouteMiles = segment.location.match(/^En route \(([\d.]+) mi\)$/)?.[1]
      const routeIndex = enRouteMiles && totalMiles
        ? Math.min(geometry.coordinates.length - 1, Math.round(Number(enRouteMiles) / totalMiles * (geometry.coordinates.length - 1)))
        : null
      const routeCoordinate = routeIndex === null ? null : geometry.coordinates[routeIndex]
      const position = knownLocation
        ? [knownLocation.latitude, knownLocation.longitude]
        : routeCoordinate
          ? [routeCoordinate[1], routeCoordinate[0]]
          : null
      if (!position) return
      const key = knownLocation ? `location:${knownLocation.query}` : `route:${routeIndex}`
      const group = eventGroups.get(key) || { position, location: segment.location, events: [] }
      group.events.push({ ...eventStyles[segment.activity], duration: formatHours(segment.duration_hours) })
      eventGroups.set(key, group)
    })
    eventGroups.forEach((group) => {
      const popup = group.events.map((event) => `${event.label} · ${event.duration}`).join('<br>')
      L.circleMarker(group.position, { radius: 7, color: '#fffdf8', weight: 2, fillColor: '#7a62a4', fillOpacity: 1 })
        .bindPopup(`<strong>Route events</strong><br>${group.location}<br><br>${popup}`)
        .addTo(routeLayer.current)
    })
    map.fitBounds(L.latLngBounds(coordinates), { padding: [56, 56], maxZoom: 10 })
    window.requestAnimationFrame(() => map.invalidateSize())
    const resizeTimer = window.setTimeout(() => map.invalidateSize(), 300)
    return () => {
      window.clearTimeout(resizeTimer)
      routeLayer.current?.remove()
    }
  }, [geometry, locations, segments, totalMiles])

  return <>
    <div className="map" ref={mapContainer} aria-label="Trip route map" />
    <div className="map-legend" aria-label="Map marker legend">
      <span><i className="legend-dot legend-current" />Current</span>
      <span><i className="legend-dot legend-pickup" />Pickup</span>
      <span><i className="legend-dot legend-dropoff" />Dropoff</span>
      <span><i className="legend-dot legend-event" />Rest / fuel</span>
    </div>
  </>
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

  const paperPlan = plan ? buildPaperPlan(plan, form) : null

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
          <details className="optional-fields">
            <summary>Paper log details <span>optional</span></summary>
            <div className="optional-fields-grid">
              <label>Date<input name="paper_date" type="date" value={form.paper_date} onChange={updateField} /></label>
              <label>Driver number<input name="paper_driver" value={form.paper_driver} onChange={updateField} placeholder="N/A" /></label>
              <label>Initials<input name="paper_initials" value={form.paper_initials} onChange={updateField} placeholder="N/A" /></label>
              <label>Signature<input name="paper_signature" value={form.paper_signature} onChange={updateField} placeholder="N/A" /></label>
              <label>Co-driver<input name="paper_co_driver" value={form.paper_co_driver} onChange={updateField} placeholder="N/A" /></label>
              <label>Carrier<input name="paper_carrier" value={form.paper_carrier} onChange={updateField} placeholder="N/A" /></label>
              <label>Home terminal<input name="paper_terminal" value={form.paper_terminal} onChange={updateField} placeholder="N/A" /></label>
              <label>Truck / tractor<input name="paper_truck" value={form.paper_truck} onChange={updateField} placeholder="N/A" /></label>
              <label>Trailer<input name="paper_trailer" value={form.paper_trailer} onChange={updateField} placeholder="N/A" /></label>
              <label>Load ID<input name="paper_load_id" value={form.paper_load_id} onChange={updateField} placeholder="N/A" /></label>
              <label>Commodity<input name="paper_commodity" value={form.paper_commodity} onChange={updateField} placeholder="N/A" /></label>
            </div>
          </details>
          <button className="primary-button" type="submit" disabled={loading}>{loading ? 'Building plan…' : 'Build trip plan'} <span>→</span></button>
          {error && <p className="error-message">{error}</p>}
          <p className="form-note">Uses OpenStreetMap geocoding and OSRM routing for this assessment prototype.</p>
        </form>

        <section className="panel map-panel">
          <div className="panel-heading map-heading"><div><p className="eyebrow">LIVE ROUTE</p><h3>{plan ? `${plan.total_miles} miles` : 'Route preview'}</h3></div>{plan && <span className="route-time">{formatHours(plan.drive_hours)} driving</span>}</div>
          {plan ? <MapPanel geometry={plan.geometry} locations={plan.locations} segments={plan.segments} totalMiles={plan.total_miles} /> : <div className="empty-map"><div className="empty-icon">⌁</div><h3>Your route will appear here</h3><p>Enter trip details and build a plan to see the route and legal rest sequence.</p></div>}
        </section>
      </section>

      {plan && <section className="results"><div className="results-header"><div><p className="eyebrow">PLAN OUTPUT</p><h2>Duty timeline</h2></div><div className="result-stats"><span><strong>{plan.total_miles}</strong> miles</span><span><strong>{formatHours(plan.drive_hours)}</strong> drive time</span><span><strong>{plan.segments.length}</strong> segments</span></div></div><div className="timeline-list">{plan.segments.map((segment, index) => <article className="timeline-row" key={`${segment.start_hour}-${segment.activity}`}><div className="timeline-index">{String(index + 1).padStart(2, '0')}</div><div className={`duty-dot duty-${segment.status.toLowerCase()}`} /><div className="timeline-main"><strong>{segment.activity}</strong><span>{segment.location}</span></div><div className="timeline-status">{segment.status.replace('_', ' ')}</div><div className="timeline-time">{formatHours(segment.duration_hours)}</div></article>)}</div><div className="eld-section"><div className="results-header"><div><p className="eyebrow">COMPLIANCE VIEW</p><h2>Daily ELD logs</h2></div><span className="eld-total">Totals include off-duty time</span></div><div className="eld-list">{plan.daily_logs.map((log) => <DutyLog key={log.day} log={log} />)}</div></div><div className="paper-log-section"><div className="results-header"><div><p className="eyebrow">ASSESSMENT OUTPUT</p><h2>Filled daily log sheets</h2></div><span className="eld-total">Based on supplied FMCSA template</span></div><div className="paper-log-list">{plan.daily_logs.map((log) => <PaperLog key={`paper-${log.day}`} log={log} plan={paperPlan} />)}</div></div><p className="attribution">Map data © OpenStreetMap contributors · Routing by OSRM</p></section>}
    </main>
  )
}

export default App
