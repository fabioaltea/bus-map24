import { useEffect, useRef, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import type { Map, MapMouseEvent } from 'maplibre-gl'
import { useRouteSchedule } from '../../hooks/useRouteSchedule.js'
import { useMapStore } from '../../stores/map.store.js'
import type { TripSchedule, ScheduleWaypoint } from '../../types/api.js'

function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

function pad(n: number) { return String(n).padStart(2, '0') }
function secToHHMM(sec: number): string {
  const s = ((sec % 86400) + 86400) % 86400
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}`
}

function nowSec(): number {
  const d = new Date()
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()
}

/** Interpolate lat/lng for a trip at time `sec`. Returns null if trip not active. */
function interpolatePosition(
  waypoints: ScheduleWaypoint[],
  sec: number,
): { lng: number; lat: number; nextStop: string } | null {
  if (waypoints.length < 2) return null
  const first = waypoints[0].sec
  const last = waypoints[waypoints.length - 1].sec
  if (sec < first || sec > last) return null

  let i = 0
  for (let j = 0; j < waypoints.length - 1; j++) {
    if (sec >= waypoints[j].sec && sec <= waypoints[j + 1].sec) { i = j; break }
  }

  const from = waypoints[i]
  const to = waypoints[i + 1]
  const t = to.sec === from.sec ? 0 : (sec - from.sec) / (to.sec - from.sec)
  return {
    lng: lerp(from.lng, to.lng, t),
    lat: lerp(from.lat, to.lat, t),
    nextStop: to.name,
  }
}

interface Props {
  map: Map
  routeId: string
  color: string
  shortName: string | null
  onTripClick: (tripId: string, schedule: TripSchedule) => void
}

let popupInstance: maplibregl.Popup | null = null

export default function BusLayer({ map, routeId, color, shortName, onTripClick }: Props) {
  const sourceId = `buses-${routeId}`
  const layerId = `buses-layer-${routeId}`

  const isLive = useMapStore((s) => s.isLive)
  const timelineSec = useMapStore((s) => s.timelineSec)
  const isLiveRef = useRef(isLive)
  const timelineSecRef = useRef(timelineSec)

  useEffect(() => { isLiveRef.current = isLive }, [isLive])
  useEffect(() => { timelineSecRef.current = timelineSec }, [timelineSec])

  const { trips } = useRouteSchedule(routeId)
  const tripsRef = useRef<TripSchedule[]>([])
  useEffect(() => { tripsRef.current = trips }, [trips])

  const rafRef = useRef<number>(0)

  // Setup source + layer + event handlers once
  useEffect(() => {
    if (map.getSource(sourceId)) return

    map.addSource(sourceId, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })

    map.addLayer({
      id: layerId,
      type: 'circle',
      source: sourceId,
      paint: {
        'circle-radius': 9,
        'circle-color': `#${color}`,
        'circle-stroke-width': 2.5,
        'circle-stroke-color': '#ffffff',
      },
    })

    const handleMouseEnter = (e: MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      map.getCanvas().style.cursor = 'pointer'
      const props = e.features?.[0]?.properties
      if (!props) return

      const html = `
        <div style="
          font-family:system-ui;min-width:172px;
          padding:10px 12px;
          background:rgba(12,12,14,0.95);
          border:1px solid rgba(255,255,255,0.09);
          border-radius:12px;
          backdrop-filter:blur(12px);
        ">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <span style="background:#${color};color:#fff;font-size:11px;font-weight:700;padding:2px 7px;border-radius:6px;flex-shrink:0">${shortName ?? ''}</span>
            <span style="font-size:13px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${props.headsign as string ?? ''}</span>
          </div>
          <div style="font-size:11px;color:#666;margin-bottom:2px;letter-spacing:0.05em;text-transform:uppercase">Next stop</div>
          <div style="font-size:12px;color:#bbb;margin-bottom:6px">${props.nextStop as string ?? ''}</div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:11px;color:#555">${secToHHMM(props.startSec as number)} → ${secToHHMM(props.endSec as number)}</span>
          </div>
        </div>`

      popupInstance?.remove()
      popupInstance = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14, className: 'bus-popup', maxWidth: 'none' })
        .setLngLat(e.lngLat).setHTML(html).addTo(map)
    }

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = ''
      popupInstance?.remove()
      popupInstance = null
    }

    const handleClick = (e: MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      const props = e.features?.[0]?.properties
      if (!props?.tripId) return
      const trip = tripsRef.current.find((t) => t.tripId === (props.tripId as string))
      if (trip) onTripClick(trip.tripId, trip)
    }

    map.on('mouseenter', layerId, handleMouseEnter as (e: MapMouseEvent) => void)
    map.on('mouseleave', layerId, handleMouseLeave)
    map.on('click', layerId, handleClick as (e: MapMouseEvent) => void)

    return () => {
      cancelAnimationFrame(rafRef.current)
      popupInstance?.remove()
      popupInstance = null
      map.off('mouseenter', layerId, handleMouseEnter as (e: MapMouseEvent) => void)
      map.off('mouseleave', layerId, handleMouseLeave)
      map.off('click', layerId, handleClick as (e: MapMouseEvent) => void)
      if (map.getLayer(layerId)) map.removeLayer(layerId)
      if (map.getSource(sourceId)) map.removeSource(sourceId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // RAF loop — reads refs, no re-mount needed
  const animate = useCallback(() => {
    const sec = isLiveRef.current ? nowSec() : timelineSecRef.current

    const features: GeoJSON.Feature[] = tripsRef.current.flatMap((trip) => {
      const pos = interpolatePosition(trip.waypoints, sec)
      if (!pos) return []
      return [{
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [pos.lng, pos.lat] },
        properties: {
          tripId: trip.tripId,
          headsign: trip.headsign ?? '',
          nextStop: pos.nextStop,
          startSec: trip.waypoints[0].sec,
          endSec: trip.waypoints[trip.waypoints.length - 1].sec,
        },
      }]
    })

    if (map.getSource(sourceId)) {
      ;(map.getSource(sourceId) as maplibregl.GeoJSONSource).setData({
        type: 'FeatureCollection', features,
      })
    }

    rafRef.current = requestAnimationFrame(animate)
  }, [map, sourceId])

  // Start/restart RAF when schedule loads
  useEffect(() => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [animate, trips])

  return null
}
