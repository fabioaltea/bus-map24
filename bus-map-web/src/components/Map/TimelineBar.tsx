import { useEffect, useRef, useState } from 'react'
import { useMapStore } from '../../stores/map.store.js'

function pad(n: number) { return String(n).padStart(2, '0') }

function secToDisplay(sec: number): string {
  const s = ((sec % 86400) + 86400) % 86400
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(Math.floor(s % 60))}`
}

function nowSec(): number {
  const d = new Date()
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()
}

const SPEEDS = [1, 2, 4, 8, 16, 32]

export default function TimelineBar() {
  const isLive       = useMapStore((s) => s.isLive)
  const timelineDate = useMapStore((s) => s.timelineDate)
  const timelineSec  = useMapStore((s) => s.timelineSec)
  const isPlaying    = useMapStore((s) => s.isPlaying)
  const playbackSpeed = useMapStore((s) => s.playbackSpeed)
  const setTimeline  = useMapStore((s) => s.setTimeline)
  const setLive      = useMapStore((s) => s.setLive)
  const setPlaying   = useMapStore((s) => s.setPlaying)
  const setPlaybackSpeed = useMapStore((s) => s.setPlaybackSpeed)

  const [displaySec, setDisplaySec] = useState(nowSec)

  const rafRef      = useRef<number>(0)
  const lastTsRef   = useRef<number>(0)
  const secRef      = useRef(timelineSec)
  const speedRef    = useRef(playbackSpeed)
  const dateRef     = useRef(timelineDate)

  // Keep refs in sync
  useEffect(() => { secRef.current = timelineSec }, [timelineSec])
  useEffect(() => { speedRef.current = playbackSpeed }, [playbackSpeed])
  useEffect(() => { dateRef.current = timelineDate }, [timelineDate])

  // Live clock tick
  useEffect(() => {
    if (!isLive) return
    const id = setInterval(() => setDisplaySec(nowSec()), 1_000)
    setDisplaySec(nowSec())
    return () => clearInterval(id)
  }, [isLive])

  // Sync display when in history + not playing
  useEffect(() => {
    if (!isLive && !isPlaying) setDisplaySec(timelineSec)
  }, [isLive, isPlaying, timelineSec])

  // Playback RAF loop
  useEffect(() => {
    if (!isPlaying || isLive) {
      cancelAnimationFrame(rafRef.current)
      return
    }

    lastTsRef.current = performance.now()

    const tick = (ts: number) => {
      const delta = ts - lastTsRef.current
      lastTsRef.current = ts

      const next = Math.min(secRef.current + (delta / 1000) * speedRef.current, 86399)
      secRef.current = next
      setDisplaySec(next)
      setTimeline(dateRef.current, next)

      if (next >= 86399) {
        setPlaying(false)
        return
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isPlaying, isLive, setTimeline, setPlaying])

  const today = new Date().toISOString().slice(0, 10)

  const handleSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sec = Number(e.target.value)
    setDisplaySec(sec)
    setTimeline(isLive ? today : timelineDate, sec)
    if (isPlaying) setPlaying(false)
  }

  const handleDate = (e: React.ChangeEvent<HTMLInputElement>) => {
    const d = e.target.value
    if (!d) return
    setTimeline(d, timelineSec)
  }

  const handleGoLive = () => {
    setLive()
    setDisplaySec(nowSec())
  }

  const togglePlay = () => {
    if (isLive) setTimeline(today, displaySec)
    setPlaying(!isPlaying)
  }

  const sliderVal = isLive ? displaySec : timelineSec

  const btnBase: React.CSSProperties = {
    background: 'none',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    color: '#888',
    fontSize: 11,
    fontWeight: 700,
    height: 28,
    padding: '0 8px',
    cursor: 'pointer',
    transition: 'background 0.15s, color 0.15s, border-color 0.15s',
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 36,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: 'rgba(12,12,14,0.93)',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 999,
        backdropFilter: 'blur(12px)',
        padding: '8px 18px',
        zIndex: 15,
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {/* Live */}
      <button
        onClick={isLive ? undefined : handleGoLive}
        style={{
          ...btnBase,
          background: isLive ? '#22c55e' : 'rgba(255,255,255,0.07)',
          border: 'none',
          borderRadius: 999,
          color: isLive ? '#fff' : '#555',
          padding: '3px 10px',
          cursor: isLive ? 'default' : 'pointer',
        }}
      >
        {isLive ? '● LIVE' : 'LIVE'}
      </button>

      {/* Date */}
      <input
        type="date"
        value={isLive ? today : timelineDate}
        max={today}
        onChange={handleDate}
        onFocus={() => { if (isLive) setTimeline(today, displaySec) }}
        style={{
          background: 'transparent',
          border: 'none',
          color: isLive ? '#444' : '#bbb',
          fontSize: 12,
          fontFamily: 'system-ui',
          cursor: 'pointer',
          outline: 'none',
          colorScheme: 'dark',
        }}
      />

      {/* Play/Pause */}
      <button
        onClick={togglePlay}
        style={{
          ...btnBase,
          background: isPlaying ? 'rgba(255,255,255,0.12)' : 'none',
          color: isPlaying ? '#fff' : '#888',
          width: 28,
          height: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          fontSize: 14,
        }}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isLive || isPlaying ? '⏸' : '▶'}
      </button>

      {/* Speed buttons */}
      <div style={{ display: 'flex', gap: 4 }}>
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => {
              setPlaybackSpeed(s)
              if (isLive) setTimeline(today, displaySec)
              if (!isPlaying) setPlaying(true)
            }}
            style={{
              ...btnBase,
              background: !isLive && isPlaying && playbackSpeed === s ? 'rgba(255,255,255,0.15)' : 'none',
              color: !isLive && isPlaying && playbackSpeed === s ? '#fff' : '#555',
              borderColor: !isLive && isPlaying && playbackSpeed === s ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)',
            }}
          >
            {s}×
          </button>
        ))}
      </div>

      {/* Time display */}
      <span style={{
        fontSize: 14,
        fontWeight: 700,
        color: isLive ? '#555' : '#fff',
        fontVariantNumeric: 'tabular-nums',
        minWidth: 68,
        height: 28,
        display: 'flex',
        alignItems: 'center',
      }}>
        {secToDisplay(displaySec)}
      </span>

      {/* Slider */}
      <input
        type="range"
        min={0}
        max={86399}
        step={60}
        value={sliderVal}
        onChange={handleSlider}
        onMouseDown={() => { if (isLive) setTimeline(today, displaySec) }}
        style={{
          width: 200,
          accentColor: isLive ? '#444' : '#fff',
          cursor: 'pointer',
          opacity: isLive ? 0.3 : 1,
        }}
      />
    </div>
  )
}
