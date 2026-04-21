import { useState } from 'react'
import { useMapStore } from '../../stores/map.store.js'
import { useViewportAgencies } from '../../hooks/useViewportAgencies.js'
import LoadingSpinner from '../UI/LoadingSpinner.js'
import EmptyState from '../UI/EmptyState.js'
import { panel, panelHeader, panelLabel, rowBase } from './panelStyles.js'
import type { AgencyFeature } from '../../types/api.js'

function cityFromTimezone(tz: string): string {
  const parts = tz.split('/')
  return parts[parts.length - 1].replace(/_/g, ' ')
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

function agencyColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0
  }
  return `hsl(${Math.abs(hash) % 360},60%,52%)`
}

export default function AgencyPanel() {
  const { agencies, isLoading } = useViewportAgencies()
  const selectedAgencyId = useMapStore((s) => s.selectedAgencyId)
  const selectAgency = useMapStore((s) => s.selectAgency)

  return (
    <div
      style={{
        ...panel,
        position: 'absolute',
        top: 16,
        left: 16,
        width: 272,
        maxHeight: 'calc(50vh - 32px)',
        zIndex: 10,
      }}
      role="complementary"
      aria-label="Transit agencies"
    >
      <div style={panelHeader}>
        <span style={panelLabel}>Agencies</span>
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {isLoading && <LoadingSpinner />}
        {!isLoading && agencies.length === 0 && (
          <EmptyState message="No agencies in view" hint="Zoom in on a city" />
        )}
        {agencies.map((agency) => (
          <AgencyRow
            key={agency.id}
            agency={agency}
            selected={agency.id === selectedAgencyId}
            onSelect={() => selectAgency(agency.id === selectedAgencyId ? null : agency.id)}
          />
        ))}
      </div>
    </div>
  )
}

function AgencyRow({
  agency,
  selected,
  onSelect,
}: {
  agency: AgencyFeature
  selected: boolean
  onSelect: () => void
}) {
  const [logoError, setLogoError] = useState(false)
  const [hovered, setHovered] = useState(false)
  const logo = agency.logoUrl ?? logoUrl(agency.url)
  const color = agency.brandColor ? `#${agency.brandColor}` : agencyColor(agency.id)
  const city = agency.city ?? cityFromTimezone(agency.timezone)

  const bg = selected
    ? 'rgba(255,255,255,0.10)'
    : hovered
    ? 'rgba(255,255,255,0.05)'
    : 'transparent'

  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-pressed={selected}
      style={{
        ...rowBase,
        background: bg,
        border: 'none',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        color: selected ? '#fff' : '#ccc',
        textAlign: 'left',
        transition: 'background 0.12s',
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: '50%',
          background: '#fff',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          border: `3px solid ${selected ? color : color + 'aa'}`,
          boxSizing: 'border-box',
        }}
        aria-hidden="true"
      >
        {logo && !logoError ? (
          <img
            src={logo}
            alt=""
            width={22}
            height={22}
            style={{ objectFit: 'contain' }}
            onError={() => setLogoError(true)}
          />
        ) : (
          <span style={{ fontSize: 11, fontWeight: 700, color, lineHeight: 1 }}>
            {agency.name.slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>

      <span style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: selected ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {agency.name}
        </div>
        <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
          {city} · {agency.routeCount} routes
        </div>
      </span>
    </button>
  )
}

export { agencyColor, logoUrl }
