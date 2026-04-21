import type { CSSProperties } from 'react'

export const PANEL_RADIUS = 16
export const PANEL_BG = 'rgba(12,12,14,0.93)'
export const PANEL_BORDER = '1px solid rgba(255,255,255,0.09)'
export const PANEL_BACKDROP = 'blur(12px)'

export const panel: CSSProperties = {
  background: PANEL_BG,
  border: PANEL_BORDER,
  borderRadius: PANEL_RADIUS,
  backdropFilter: PANEL_BACKDROP,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
}

export const panelHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 14px 10px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  flexShrink: 0,
  gap: 10,
}

export const panelLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: '#666',
}

export const closeBtn: CSSProperties = {
  background: 'none',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: '#666',
  fontSize: 14,
  lineHeight: 1,
  width: 24,
  height: 24,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  flexShrink: 0,
  transition: 'border-color 0.15s, color 0.15s',
}

export const rowSelected: CSSProperties = {
  background: 'rgba(255,255,255,0.07)',
}

export const rowBase: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '8px 14px',
  borderBottom: '1px solid rgba(255,255,255,0.04)',
  gap: 10,
  cursor: 'pointer',
  width: '100%',
  boxSizing: 'border-box' as const,
}

export function routeBadge(color: string): CSSProperties {
  return {
    background: `#${color}`,
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    padding: '2px 7px',
    borderRadius: 6,
    flexShrink: 0,
    minWidth: 28,
    textAlign: 'center' as const,
  }
}
