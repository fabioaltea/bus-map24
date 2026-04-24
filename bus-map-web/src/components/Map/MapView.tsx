import { useRef, useEffect, useState } from 'react'
import maplibregl from 'maplibre-gl'
import type { Map } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useMapStore } from '../../stores/map.store.js'
import { useMapViewport } from '../../hooks/useMapViewport.js'
import { useAgencyRoutes } from '../../hooks/useAgencyRoutes.js'
import { useAgencyStops } from '../../hooks/useAgencyStops.js'
import { useCheckedRouteStops } from '../../hooks/useCheckedRouteStops.js'
import { useViewportAgencies } from '../../hooks/useViewportAgencies.js'
import { agencyColor } from '../Panels/AgencyPanel.js'
import AgencyPanel from '../Panels/AgencyPanel.js'
import RoutePanel from '../Panels/RoutePanel.js'
import StopPanel from '../Panels/StopPanel.js'
import RouteLayer from './RouteLayer.js'
import StopLayer from './StopLayer.js'
import BusLayer from './BusLayer.js'
import AgencyLayer from './AgencyLayer.js'
import BusTripPanel from '../Panels/BusTripPanel.js'
import TimelineBar from './TimelineBar.js'
import type { TripSchedule } from '../../types/api.js'

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
const AGENCY_MIN_ZOOM = 5
const AGENCY_STOP_MIN_ZOOM = 10  // show agency stops when agency selected, no routes checked
const HIGH_ZOOM_STOPS = 15       // show stops regardless of selection

function computeBboxFromShapeGeom(shapeGeom: string): [number, number, number, number] | null {
  try {
    const geom = JSON.parse(shapeGeom) as GeoJSON.MultiLineString | GeoJSON.GeometryCollection
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity

    const expand = (coords: number[][]) => {
      for (const [lng, lat] of coords) {
        if (lng < minLng) minLng = lng
        if (lat < minLat) minLat = lat
        if (lng > maxLng) maxLng = lng
        if (lat > maxLat) maxLat = lat
      }
    }

    if (geom.type === 'MultiLineString') {
      for (const line of geom.coordinates) expand(line)
    } else if (geom.type === 'LineString') {
      expand((geom as unknown as GeoJSON.LineString).coordinates)
    } else if (geom.type === 'GeometryCollection') {
      for (const g of geom.geometries) {
        if (g.type === 'LineString') expand(g.coordinates)
        else if (g.type === 'MultiLineString') for (const l of g.coordinates) expand(l)
      }
    }

    if (minLng === Infinity) return null
    return [minLng, minLat, maxLng, maxLat]
  } catch {
    return null
  }
}

export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const prevCheckedRef = useRef<string[]>([])

  const viewState = useMapStore((s) => s.viewState)
  const selectedAgencyId = useMapStore((s) => s.selectedAgencyId)
  const selectedStopId = useMapStore((s) => s.selectedStopId)
  const checkedRouteIds = useMapStore((s) => s.checkedRouteIds)
  const selectedTripId = useMapStore((s) => s.selectedTripId)
  const selectStop = useMapStore((s) => s.selectStop)
  const selectTrip = useMapStore((s) => s.selectTrip)

  const { onMoveEnd } = useMapViewport()

  const [selectedBus, setSelectedBus] = useState<{ schedule: TripSchedule; routeId: string } | null>(null)
  const [panelClosing, setPanelClosing] = useState(false)
  const [stopClosing, setStopClosing] = useState(false)

  const closePanel = () => {
    setPanelClosing(true)
    setTimeout(() => {
      selectTrip(null)
      setSelectedBus(null)
      setPanelClosing(false)
    }, 300)
  }

  const closeStopPanel = () => {
    setStopClosing(true)
    setTimeout(() => {
      selectStop(null)
      setStopClosing(false)
    }, 280)
  }

  // Close panel when its route is unchecked
  useEffect(() => {
    if (selectedBus && !checkedRouteIds.includes(selectedBus.routeId)) {
      closePanel()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkedRouteIds])

  // Sync when trip cleared from outside (e.g. panel X button calls selectTrip(null))
  useEffect(() => {
    if (!selectedTripId && selectedBus && !panelClosing) setSelectedBus(null)
  }, [selectedTripId])

  const { routes } = useAgencyRoutes()
  const { stops: agencyStops } = useAgencyStops()
  const routeStops = useCheckedRouteStops(checkedRouteIds)
  const { agencies } = useViewportAgencies()
  const selectedAgency = agencies.find((a) => a.id === selectedAgencyId)
  const stopColor = selectedAgency
    ? (selectedAgency.brandColor ? `#${selectedAgency.brandColor}` : agencyColor(selectedAgency.id))
    : '#888888'

  const visibleRoutes = routes.filter((r) => checkedRouteIds.includes(r.id))
  const zoom = viewState.zoom

  const hasCheckedRoutes = checkedRouteIds.length > 0
  const showAgencyStops = !!selectedAgencyId && !hasCheckedRoutes && zoom >= AGENCY_STOP_MIN_ZOOM
  const showStops = hasCheckedRoutes || showAgencyStops || zoom >= HIGH_ZOOM_STOPS
  const stops = hasCheckedRoutes ? routeStops : agencyStops

  const showAgencyPanel = zoom >= AGENCY_MIN_ZOOM
  const showHint = zoom < AGENCY_MIN_ZOOM

  // fitBounds when agency selected
  useEffect(() => {
    if (!selectedAgencyId || !mapRef.current || !selectedAgency) return
    const bbox = selectedAgency.boundingBox as GeoJSON.Polygon | null
    if (!bbox?.coordinates?.[0]) return
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
    for (const [lng, lat] of bbox.coordinates[0]) {
      if (lng < minLng) minLng = lng
      if (lat < minLat) minLat = lat
      if (lng > maxLng) maxLng = lng
      if (lat > maxLat) maxLat = lat
    }
    if (minLng === Infinity) return
    mapRef.current.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 64, duration: 900 })
  }, [selectedAgencyId])  // eslint-disable-line react-hooks/exhaustive-deps

  // fitBounds when a new route is checked
  useEffect(() => {
    const prev = prevCheckedRef.current
    const added = checkedRouteIds.filter((id) => !prev.includes(id))
    prevCheckedRef.current = checkedRouteIds

    if (added.length === 0 || !mapRef.current) return

    const lastAdded = added[added.length - 1]
    const route = routes.find((r) => r.id === lastAdded)
    if (!route) return

    if (route.shapeGeom) {
      const bbox = computeBboxFromShapeGeom(route.shapeGeom)
      if (bbox) {
        mapRef.current.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], {
          padding: 48,
          maxZoom: 15,
          duration: 800,
        })
        return
      }
    }

    // Fallback: fit to stop locations of this route from already-loaded data
    const routeStopList = routeStops.filter(() => true) // will be populated shortly
    if (routeStopList.length > 0) {
      let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
      for (const s of routeStopList) {
        const m = s.location.match(/POINT\(([^ ]+) ([^ )]+)\)/)
        if (!m) continue
        const lng = parseFloat(m[1]), lat = parseFloat(m[2])
        if (lng < minLng) minLng = lng
        if (lat < minLat) minLat = lat
        if (lng > maxLng) maxLng = lng
        if (lat > maxLat) maxLat = lat
      }
      if (minLng !== Infinity) {
        mapRef.current.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
          padding: 48,
          maxZoom: 15,
          duration: 800,
        })
      }
    }
  }, [checkedRouteIds, routes, routeStops])

  // Initialize MapLibre
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [viewState.longitude, viewState.latitude],
      zoom: viewState.zoom,
      pitch: viewState.pitch,
      bearing: viewState.bearing,
      antialias: true,
    })

    map.on('moveend', () => onMoveEnd(map))

    map.once('load', () => {
      mapRef.current = map
      onMoveEnd(map)
      setMapReady(true)
    })

    return () => {
      map.remove()
      mapRef.current = null
      setMapReady(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Base map */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Wordmark */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 20,
          pointerEvents: 'none',
          fontFamily: "'Inter Tight', Inter, system-ui, sans-serif",
          fontWeight: 700,
          fontSize: 22,
          letterSpacing: '-0.035em',
          lineHeight: 1,
          userSelect: 'none',
        }}
      >
        <span style={{ color: '#F5F6F7' }}>busmap</span>
        <span style={{ color: '#52C87A' }}>24</span>
      </div>

      {/* MapLibre-based data layers */}
      {mapReady && mapRef.current && (
        <>
          {showAgencyPanel && <AgencyLayer map={mapRef.current} />}
          {selectedAgencyId && visibleRoutes.length > 0 && (
            <RouteLayer
              map={mapRef.current}
              routes={visibleRoutes}
            />
          )}
          {visibleRoutes.map((r) => (
            <BusLayer
              key={r.id}
              map={mapRef.current!}
              routeId={r.id}
              color={r.color}
              shortName={r.shortName}
              onTripClick={(tripId, schedule) => {
                selectTrip(tripId)
                setSelectedBus({ schedule, routeId: r.id })
              }}
            />
          ))}
          {selectedAgencyId && showStops && (
            <StopLayer
              map={mapRef.current}
              stops={stops}
              selectedStopId={selectedStopId}
              onStopClick={(id) => id === selectedStopId ? closeStopPanel() : selectStop(id)}
              color={stopColor}
            />
          )}
        </>
      )}

      {/* UI Panels */}
      {showAgencyPanel && <AgencyPanel />}
      {showAgencyPanel && <RoutePanel />}
      {(selectedStopId || stopClosing) && (
        <StopPanel isClosing={stopClosing} onClose={closeStopPanel} />
      )}
      {(selectedTripId || panelClosing) && selectedBus && (() => {
        const route = visibleRoutes.find((r) => r.id === selectedBus.routeId)
        return (
          <BusTripPanel
            schedule={selectedBus.schedule}
            routeColor={route?.color ?? 'AAAAAA'}
            routeShortName={route?.shortName ?? null}
            isClosing={panelClosing}
            onClose={closePanel}
          />
        )
      })()}

      {/* Timeline scrubber */}
      {checkedRouteIds.length > 0 && <TimelineBar />}

      {/* Zoom hint */}
      {showHint && (
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.65)',
            color: '#888',
            fontSize: 13,
            padding: '8px 16px',
            borderRadius: 20,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
          aria-live="polite"
        >
          Zoom in to explore transit networks
        </div>
      )}

      {/* Zoom badge */}
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          right: 8,
          background: 'rgba(0,0,0,0.5)',
          color: '#555',
          fontSize: 10,
          padding: '2px 6px',
          borderRadius: 3,
          pointerEvents: 'none',
          fontVariantNumeric: 'tabular-nums',
        }}
        aria-hidden="true"
      >
        z{zoom.toFixed(1)}
      </div>
    </div>
  )
}
