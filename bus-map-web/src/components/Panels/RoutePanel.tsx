import { useState } from 'react'
import { useMapStore } from '../../stores/map.store.js'
import { useAgencyRoutes } from '../../hooks/useAgencyRoutes.js'
import LoadingSpinner from '../UI/LoadingSpinner.js'
import EmptyState from '../UI/EmptyState.js'
import { panel, panelHeader, panelLabel, routeBadge } from './panelStyles.js'
import type { RouteFeature } from '../../types/api.js'

export default function RoutePanel() {
  const selectedAgencyId = useMapStore((s) => s.selectedAgencyId)
  const checkedRouteIds = useMapStore((s) => s.checkedRouteIds)
  const toggleRouteVisibility = useMapStore((s) => s.toggleRouteVisibility)
  const { routes, isLoading } = useAgencyRoutes()

  if (!selectedAgencyId) return null

  return (
    <div
      className="panel-slide-up"
      style={{
        ...panel,
        position: 'absolute',
        bottom:36,
        right: 16,
        width: 300,
        maxHeight: 'calc(50vh - 112px)',
        zIndex: 10,
      }}
      role="complementary"
      aria-label="Agency routes"
    >
      <div style={panelHeader}>
        <span style={panelLabel}>Routes</span>
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {isLoading && <LoadingSpinner />}
        {!isLoading && routes.length === 0 && <EmptyState message="No routes found" />}
        {routes.map((route) => (
          <RouteRow
            key={route.id}
            route={route}
            checked={checkedRouteIds.includes(route.id)}
            onToggle={() => toggleRouteVisibility(route.id)}
          />
        ))}
      </div>
    </div>
  )
}

function RouteRow({ route, checked, onToggle }: { route: RouteFeature; checked: boolean; onToggle: () => void }) {
  const [hovered, setHovered] = useState(false)

  const bg = checked
    ? 'rgba(255,255,255,0.10)'
    : hovered
    ? 'rgba(255,255,255,0.05)'
    : 'transparent'

  return (
    <button
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-pressed={checked}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        width: '100%',
        padding: '9px 14px',
        background: bg,
        border: 'none',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        cursor: 'pointer',
        boxSizing: 'border-box',
        textAlign: 'left',
        transition: 'background 0.12s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ ...routeBadge(route.color), flexShrink: 0 }}>
          {route.shortName ?? route.routeId}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: checked ? '#fff' : '#bbb', lineHeight: 1.3, wordBreak: 'break-word' }}>
          {route.longName ?? route.routeId}
        </span>
      </div>
      {(route.fromStop || route.toStop) && (
        <div style={{ fontSize: 11, color: '#555', lineHeight: 1.4 }}>
          {route.fromStop ?? '?'} → {route.toStop ?? '?'}
        </div>
      )}
    </button>
  )
}
