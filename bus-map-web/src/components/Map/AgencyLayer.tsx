import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { useViewportAgencies } from '../../hooks/useViewportAgencies.js'
import { useMapStore } from '../../stores/map.store.js'
import type { AgencyFeature } from '../../types/api.js'

function parseWkt(wkt: string): [number, number] | null {
  const m = wkt.match(/POINT\(([^ ]+) ([^ )]+)\)/)
  if (!m) return null
  return [parseFloat(m[1]), parseFloat(m[2])]
}

function agencyColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0
  }
  return `hsl(${Math.abs(hash) % 360},60%,52%)`
}

function logoUrl(url: string | null): string | null {
  if (!url) return null
  try {
    const domain = new URL(url).hostname
    return `https://logo.clearbit.com/${domain}`
  } catch {
    return null
  }
}

function buildMarkerEl(agency: AgencyFeature, selected: boolean): HTMLDivElement {
  const color = agency.brandColor ? `#${agency.brandColor}` : agencyColor(agency.id)
  const logo = agency.logoUrl ?? logoUrl(agency.url)

  const el = document.createElement('div')
  el.style.cssText = `
    width: 38px; height: 38px; border-radius: 50%;
    background: #fff;
    border: 3px solid ${selected ? color : color + 'aa'};
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    box-shadow: 0 2px 10px rgba(0,0,0,0.5), 0 0 0 ${selected ? '3px' : '0px'} ${color}66;
    overflow: hidden;
    transition: border-color 0.2s, box-shadow 0.2s;
    flex-shrink: 0;
  `

  if (logo) {
    const img = document.createElement('img')
    img.src = logo
    img.style.cssText = 'width:28px;height:28px;object-fit:contain;'
    img.onerror = () => {
      img.remove()
      const span = document.createElement('span')
      span.textContent = agency.name.slice(0, 2).toUpperCase()
      span.style.cssText = `font-size:12px;font-weight:700;color:${color};font-family:system-ui;`
      el.appendChild(span)
    }
    el.appendChild(img)
  } else {
    const span = document.createElement('span')
    span.textContent = agency.name.slice(0, 2).toUpperCase()
    span.style.cssText = `font-size:12px;font-weight:700;color:${color};font-family:system-ui;`
    el.appendChild(span)
  }

  return el
}

interface Props {
  map: MapLibreMap
}

export default function AgencyLayer({ map }: Props) {
  const { agencies } = useViewportAgencies()
  const selectedAgencyId = useMapStore((s) => s.selectedAgencyId)
  const selectAgency = useMapStore((s) => s.selectAgency)

  // Use ref to keep stable callback refs
  const selectAgencyRef = useRef(selectAgency)
  useEffect(() => { selectAgencyRef.current = selectAgency }, [selectAgency])

  const markersRef = useRef<globalThis.Map<string, { marker: maplibregl.Marker; el: HTMLDivElement }>>()
  if (!markersRef.current) markersRef.current = new globalThis.Map()

  useEffect(() => {
    const current = markersRef.current!
    const newIds = new Set(agencies.map((a) => a.id))

    // Remove stale
    for (const [id, { marker }] of current.entries()) {
      if (!newIds.has(id)) {
        marker.remove()
        current.delete(id)
      }
    }

    // Add / update
    for (const agency of agencies) {
      if (!agency.centroid) continue
      const coords = parseWkt(agency.centroid)
      if (!coords) continue

      const selected = agency.id === selectedAgencyId

      if (!current.has(agency.id)) {
        const el = buildMarkerEl(agency, selected)
        el.addEventListener('click', () => {
          selectAgencyRef.current(
            agency.id === selectedAgencyId ? null : agency.id,
          )
        })

        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat(coords)
          .addTo(map)

        current.set(agency.id, { marker, el })
      } else {
        // Update selection styling without recreating
        const { el } = current.get(agency.id)!
        const col = agency.brandColor ? `#${agency.brandColor}` : agencyColor(agency.id)
        el.style.border = `3px solid ${selected ? col : col + 'aa'}`
        el.style.boxShadow = `0 2px 10px rgba(0,0,0,0.5), 0 0 0 ${selected ? '3px' : '0px'} ${col}66`
      }
    }
  }, [agencies, selectedAgencyId, map])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      markersRef.current?.forEach(({ marker }) => marker.remove())
      markersRef.current?.clear()
    }
  }, [])

  return null
}
