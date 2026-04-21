import { useEffect, useRef } from 'react'
import { useMapStore } from '../../stores/map.store.js'
import { panel, panelHeader, closeBtn } from './panelStyles.js'
import type { TripSchedule } from '../../types/api.js'

function pad(n: number) { return String(n).padStart(2, '0') }
function secToHHMM(sec: number): string {
  const s = ((sec % 86400) + 86400) % 86400
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}`
}
function nowSec(): number {
  const d = new Date()
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()
}
function minDiff(secA: number, secB: number): string {
  const diff = Math.round((secA - secB) / 60)
  if (diff <= 0) return 'now'
  if (diff < 60) return `${diff} min`
  return `${Math.floor(diff / 60)}h ${diff % 60}m`
}

interface Props {
  schedule: TripSchedule
  routeShortName: string | null
  routeColor: string
  isClosing: boolean
  onClose: () => void
}

export default function BusTripPanel({ schedule, routeShortName, routeColor, isClosing, onClose }: Props) {
  const isLive = useMapStore((s) => s.isLive)
  const timelineSec = useMapStore((s) => s.timelineSec)

  const currentSec = isLive ? nowSec() : timelineSec

  const waypoints = schedule.waypoints
  const startSec = waypoints[0]?.sec ?? 0
  const endSec = waypoints[waypoints.length - 1]?.sec ?? 0
  const terminus = waypoints[waypoints.length - 1]

  const progress = endSec > startSec
    ? Math.min(Math.max((currentSec - startSec) / (endSec - startSec), 0), 1)
    : 0

  const nextStopIdx = waypoints.findIndex((w) => w.sec > currentSec)
  const nextStop = nextStopIdx >= 0 ? waypoints[nextStopIdx] : null
  const etaMin = terminus ? Math.max(0, Math.round((terminus.sec - currentSec) / 60)) : 0

  const hex = `#${routeColor}`
  const listRef = useRef<HTMLDivElement>(null)

  // Auto-close in live mode when trip ends
  useEffect(() => {
    if (!isLive) return
    const msLeft = Math.max(0, (endSec - nowSec()) * 1000)
    if (msLeft === 0) { onClose(); return }
    const t = setTimeout(onClose, msLeft)
    return () => clearTimeout(t)
  }, [endSec, isLive, onClose])

  // Scroll to current stop when first loaded
  useEffect(() => {
    if (!listRef.current || nextStopIdx < 0) return
    const row = listRef.current.children[nextStopIdx] as HTMLElement | undefined
    if (!row) return
    const list = listRef.current
    list.scrollTop = row.offsetTop - list.clientHeight / 2 + row.clientHeight / 2
  }, [nextStopIdx, schedule.tripId])

  return (
    <div
      className={isClosing ? undefined : 'panel-slide-up'}
      style={{
        ...panel,
        position: 'absolute',
        bottom: 16,
        left: 16,
        width: 340,
        maxHeight: 'calc(60vh - 32px)',
        zIndex: 20,
        opacity: isClosing ? 0 : undefined,
        transform: isClosing ? 'translateY(16px)' : undefined,
        transition: isClosing ? 'opacity 0.28s ease, transform 0.28s ease' : undefined,
      }}
    >
      {/* Header */}
      <div style={panelHeader}>
        <span style={{ background: hex, color: '#fff', fontWeight: 700, fontSize: 13, padding: '2px 8px', borderRadius: 6, flexShrink: 0 }}>
          {routeShortName ?? '?'}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {schedule.headsign ?? terminus?.name ?? ''}
        </span>
        <button onClick={onClose} aria-label="Close" style={closeBtn}>✕</button>
      </div>

      {/* Progress */}
      <div style={{ padding: '14px 14px 10px', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#666', marginBottom: 8 }}>
          <span>{secToHHMM(startSec)}</span>
          <span style={{ color: '#ffdc32', fontWeight: 600 }}>
            {etaMin < 60 ? `arrives in ${etaMin} min` : `${Math.floor(etaMin / 60)}h ${etaMin % 60}m`}
          </span>
          <span>{secToHHMM(endSec)}</span>
        </div>
        <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, position: 'relative', overflow: 'visible' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${progress * 100}%`, background: hex, borderRadius: 3, transition: 'width 0.5s linear' }} />
          <div style={{ position: 'absolute', top: '50%', left: `${progress * 100}%`, transform: 'translate(-50%, -50%)', width: 14, height: 14, background: hex, border: '2px solid #fff', borderRadius: '50%', boxShadow: `0 0 6px ${hex}`, zIndex: 1, transition: 'left 0.5s linear' }} />
        </div>

        {nextStop && (
          <div style={{ marginTop: 12, background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '7px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 10, color: '#666', marginBottom: 2, letterSpacing: '0.06em' }}>NEXT STOP</div>
              <div style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>{nextStop.name}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, color: hex, fontWeight: 700 }}>{secToHHMM(nextStop.sec)}</div>
              <div style={{ fontSize: 11, color: '#666' }}>{minDiff(nextStop.sec, currentSec)}</div>
            </div>
          </div>
        )}
      </div>

      {/* Stop list */}
      <div ref={listRef} style={{ overflowY: 'auto', flex: 1, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        {waypoints.map((wp, idx) => {
          const isPast = wp.sec < currentSec
          const isNext = idx === nextStopIdx
          const isFirst = idx === 0
          const isLast = idx === waypoints.length - 1
          return (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', padding: '6px 14px', background: isNext ? 'rgba(255,255,255,0.05)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.03)', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 12, flexShrink: 0 }}>
                {!isFirst && <div style={{ width: 2, height: 6, background: isPast ? hex : 'rgba(255,255,255,0.12)', marginBottom: 2 }} />}
                <div style={{ width: isFirst || isLast ? 10 : 8, height: isFirst || isLast ? 10 : 8, borderRadius: '50%', border: `2px solid ${isPast || isNext ? hex : 'rgba(255,255,255,0.2)'}`, background: isNext ? hex : 'transparent' }} />
                {!isLast && <div style={{ width: 2, height: 6, background: isPast ? hex : 'rgba(255,255,255,0.12)', marginTop: 2 }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: isPast ? '#555' : isNext ? '#fff' : '#bbb', fontWeight: isNext || isFirst || isLast ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {wp.name}
                </div>
              </div>
              <div style={{ fontSize: 12, color: isPast ? '#444' : isNext ? hex : '#666', fontWeight: isNext ? 700 : 400, flexShrink: 0 }}>
                {secToHHMM(wp.sec)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
