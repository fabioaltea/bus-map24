export const c = {
  bg: '#0E1116',
  bgElevated: '#161b22',
  surface: '#1c2128',
  surfaceHover: '#21262d',
  border: '#30363d',
  borderStrong: '#484f58',
  text: '#e6edf3',
  textMuted: '#8b949e',
  textXMuted: '#484f58',
  primary: '#52C87A',
  primaryHover: '#3db563',
  primaryText: '#0E1116',
  danger: '#f85149',
  dangerBg: 'rgba(248,81,73,0.1)',
  dangerBorder: 'rgba(248,81,73,0.3)',
  success: '#52C87A',
  successBg: 'rgba(82,200,122,0.1)',
  warning: '#e3b341',
  warningBg: 'rgba(227,179,65,0.1)',
  shadow: '0 1px 3px rgba(0,0,0,0.4)',
  shadowMd: '0 8px 24px rgba(0,0,0,0.5)',
  radius: '8px',
  radiusSm: '6px',
}

export const statusColor: Record<string, { bg: string; text: string; blink?: boolean }> = {
  ready:       { bg: 'rgba(82,200,122,0.15)',  text: '#52C87A' },
  queued:      { bg: 'rgba(227,179,65,0.15)',  text: '#e3b341' },
  downloading: { bg: 'rgba(227,179,65,0.15)',  text: '#e3b341', blink: true },
  importing:   { bg: 'rgba(139,148,158,0.15)', text: '#8b949e', blink: true },
  failed:      { bg: 'rgba(248,81,73,0.15)',   text: '#f85149' },
  pending:     { bg: 'rgba(139,148,158,0.12)', text: '#8b949e' },
}

export function getStatusStyle(status: string) {
  return statusColor[status] ?? statusColor.pending
}
