import { useNavigate } from 'react-router-dom'
import type { AdminFeedListItem } from '../services/admin-api.js'
import { c, getStatusStyle } from '../styles.js'

export function StatusBadge({ status }: { status: string }) {
  const s = getStatusStyle(status)
  return (
    <span
      className={s.blink ? 'badge-blink' : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 9px',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        background: s.bg,
        color: s.text,
        border: `1px solid ${s.text}22`,
      }}
    >
      {s.blink && (
        <span style={{
          width: 5, height: 5, borderRadius: '50%',
          background: s.text, flexShrink: 0,
        }} />
      )}
      {status}
    </span>
  )
}

function MetaBadge({ complete }: { complete: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 9px', borderRadius: 20,
      fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
      background: complete ? 'rgba(82,200,122,0.15)' : 'rgba(227,179,65,0.15)',
      color: complete ? '#52C87A' : '#e3b341',
      border: `1px solid ${complete ? '#52C87A' : '#e3b341'}22`,
    }}>
      {complete ? '✓ Complete' : '⚠ Incomplete'}
    </span>
  )
}

export default function FeedTable({ feeds }: { feeds: AdminFeedListItem[] }) {
  const navigate = useNavigate()

  if (feeds.length === 0) {
    return (
      <div style={{
        padding: '52px 24px', textAlign: 'center',
        background: c.surface, borderRadius: c.radius,
        border: `1px solid ${c.border}`,
      }}>
        <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.4 }}>📭</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: c.text, marginBottom: 4 }}>No feeds yet</div>
        <div style={{ fontSize: 13, color: c.textMuted }}>Add a feed to get started</div>
      </div>
    )
  }

  return (
    <div style={{
      background: c.surface, border: `1px solid ${c.border}`,
      borderRadius: c.radius, overflow: 'hidden', boxShadow: c.shadow,
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${c.border}` }}>
            {['Provider', 'Country', 'Status', 'Last Imported', 'Metadata'].map((h) => (
              <th key={h} style={{
                padding: '10px 16px', textAlign: 'left',
                fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
                textTransform: 'uppercase', color: c.textMuted,
                background: c.bgElevated,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {feeds.map((feed, i) => (
            <tr
              key={feed.id}
              onClick={() => navigate(`/admin/feeds/${feed.id}`)}
              style={{
                borderBottom: i < feeds.length - 1 ? `1px solid ${c.border}` : 'none',
                cursor: 'pointer', transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = c.surfaceHover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = '')}
            >
              <td style={{ padding: '13px 16px' }}>
                <div style={{ fontWeight: 600, color: c.text }}>{feed.provider}</div>
                {feed.municipality && (
                  <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{feed.municipality}</div>
                )}
              </td>
              <td style={{ padding: '13px 16px', color: c.textMuted, fontFamily: 'monospace', fontSize: 12 }}>
                {feed.countryCode ?? '—'}
              </td>
              <td style={{ padding: '13px 16px' }}>
                <StatusBadge status={feed.importStatus} />
              </td>
              <td style={{ padding: '13px 16px', color: c.textMuted, fontSize: 12 }}>
                {feed.lastImportedAt
                  ? new Date(feed.lastImportedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                  : '—'}
              </td>
              <td style={{ padding: '13px 16px' }}>
                <MetaBadge complete={feed.metadataComplete} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
