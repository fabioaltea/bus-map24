import { useMapStore } from '../../stores/map.store.js'
import { useStopDetail } from '../../hooks/useStopDetail.js'
import { useStopDepartures } from '../../hooks/useStopDepartures.js'
import LoadingSpinner from '../UI/LoadingSpinner.js'
import EmptyState from '../UI/EmptyState.js'
import { panel, panelHeader, panelLabel, closeBtn, routeBadge } from './panelStyles.js'
import type { DepartureRow } from '../../types/api.js'

interface Props {
  isClosing: boolean
  onClose: () => void
}

export default function StopPanel({ isClosing, onClose }: Props) {
  const selectedStopId = useMapStore((s) => s.selectedStopId)
  const selectedTripId = useMapStore((s) => s.selectedTripId)
  const checkedRouteIds = useMapStore((s) => s.checkedRouteIds)
  const toggleRouteVisibility = useMapStore((s) => s.toggleRouteVisibility)
  const { stop, isLoading: stopLoading } = useStopDetail(selectedStopId)
  const { departures, isLoading: depsLoading } = useStopDepartures(selectedStopId)

  if (selectedTripId) return null

  return (
    <div
      className={isClosing ? undefined : 'panel-slide-up'}
      style={{
        ...panel,
        position: 'absolute',
        bottom: 16,
        left: 16,
        width: 300,
        maxHeight: 'calc(100vh - 32px)',
        zIndex: 20,
        opacity: isClosing ? 0 : undefined,
        transform: isClosing ? 'translateY(16px)' : undefined,
        transition: isClosing ? 'opacity 0.25s ease, transform 0.25s ease' : undefined,
      }}
      role="dialog"
      aria-label="Stop information"
    >
      <div style={panelHeader}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>
            {stopLoading ? '…' : (stop?.name ?? 'Unknown')}
          </div>
          {stop && (
            <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
              {stop.code ? `#${stop.code}` : stop.stopId}
            </div>
          )}
        </div>
        <button onClick={onClose} aria-label="Close stop panel" style={closeBtn}>✕</button>
      </div>

      {stop?.routes && stop.routes.length > 0 && (
        <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
          {stop.routes.map((r) => {
            const active = checkedRouteIds.includes(r.id)
            return (
              <button
                key={r.id}
                onClick={() => toggleRouteVisibility(r.id)}
                style={{
                  ...routeBadge(r.color),
                  cursor: 'pointer',
                  border: 'none',
                  opacity: active ? 1 : 0.45,
                  outline: active ? `2px solid #${r.color}` : 'none',
                  outlineOffset: 2,
                  transition: 'opacity 0.15s, outline 0.15s',
                }}
                title={active ? 'Hide route' : 'Show route'}
              >
                {r.shortName ?? r.id}
              </button>
            )
          })}
        </div>
      )}

      <div style={{ padding: '8px 0 0', flex: 1, overflowY: 'auto' }}>
        <div style={{ ...panelLabel, padding: '0 14px 6px' }}>Departures today</div>
        {depsLoading && <LoadingSpinner />}
        {!depsLoading && departures.length === 0 && (
          <EmptyState message="No service today" hint="No scheduled departures found" />
        )}
        {departures.map((dep, i) => (
          <DepartureItem key={`${dep.tripId}-${i}`} dep={dep} />
        ))}
      </div>
    </div>
  )
}

function DepartureItem({ dep }: { dep: DepartureRow }) {
  const time = dep.departureTime.slice(0, 5)
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', gap: 10 }}>
      <span style={routeBadge(dep.routeColor)}>
        {dep.routeShortName ?? '–'}
      </span>
      <span style={{ flex: 1, fontSize: 12, color: '#bbb', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {dep.headsign ?? dep.routeLongName ?? ''}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#e0e0e0', flexShrink: 0 }}>
        {time}
      </span>
    </div>
  )
}
