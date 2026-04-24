import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getAdminFeed, refreshAdminFeed, type AdminFeedListItem } from './services/admin-api.js'
import AgencyMetadataForm from './components/AgencyMetadataForm.js'
import { StatusBadge } from './components/FeedTable.js'
import { c } from './styles.js'

function Logo() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width={28} height={28}>
      <rect width="32" height="32" rx="6" fill="#0E1116" stroke="#30363d" strokeWidth="1"/>
      <text x="16" y="22" fontFamily="Inter Tight, Inter, system-ui, sans-serif" fontSize="16" fontWeight="700" fill="#52C87A" textAnchor="middle" letterSpacing="-0.5">24</text>
    </svg>
  )
}

export default function FeedDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [feed, setFeed] = useState<AdminFeedListItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshError, setRefreshError] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    getAdminFeed(id)
      .then(setFeed)
      .catch(() => setError('Failed to load feed'))
      .finally(() => setLoading(false))
  }, [id])

  async function handleRefresh() {
    if (!feed) return
    setRefreshing(true); setRefreshError('')
    try {
      await refreshAdminFeed(feed.id)
      setFeed((prev) => prev ? { ...prev, importStatus: 'queued' } : prev)
    } catch (err: unknown) {
      const e = err as { status?: number }
      setRefreshError(e.status === 409 ? 'Import already in progress' : 'Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }

  const refreshBlocked = feed?.importStatus === 'downloading' || feed?.importStatus === 'importing'

  if (loading) return (
    <div style={{ minHeight: '100vh', background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: c.textMuted, fontSize: 13 }}>Loading…</span>
    </div>
  )
  if (error || !feed) return (
    <div style={{ minHeight: '100vh', background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: c.danger, fontSize: 13 }}>{error || 'Feed not found'}</span>
    </div>
  )

  const metaComplete = feed.agencies.length > 0 && feed.agencies.every((a) => a.brandColor && a.city)

  return (
    <div className="admin-scroll" style={{ background: c.bg, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Nav */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: c.bgElevated, borderBottom: `1px solid ${c.border}`,
        padding: '0 24px', height: 50,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <Logo />
        <button
          onClick={() => navigate('/admin')}
          style={{
            background: 'none', border: 'none', color: c.textMuted,
            cursor: 'pointer', fontSize: 13, padding: '4px 6px', borderRadius: 4,
            display: 'flex', alignItems: 'center', gap: 4,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = c.text)}
          onMouseLeave={(e) => (e.currentTarget.style.color = c.textMuted)}
        >
          Feeds
        </button>
        <span style={{ color: c.textXMuted, fontSize: 12 }}>/</span>
        <span style={{ color: c.text, fontSize: 13, fontWeight: 500 }}>{feed.provider}</span>
      </nav>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 24px 48px' }}>
        {/* Header card */}
        <div style={{
          background: c.surface, border: `1px solid ${c.border}`,
          borderRadius: c.radius, padding: '20px 22px', marginBottom: 20,
          boxShadow: c.shadow,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <h1 style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 700, color: c.text }}>{feed.provider}</h1>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {feed.countryCode && (
                  <span style={{
                    fontFamily: 'monospace', fontSize: 11,
                    background: c.bgElevated, border: `1px solid ${c.border}`,
                    borderRadius: 4, padding: '2px 7px', color: c.textMuted,
                  }}>
                    {feed.countryCode}
                  </span>
                )}
                <StatusBadge status={feed.importStatus} />
                {feed.municipality && <span style={{ fontSize: 12, color: c.textMuted }}>{feed.municipality}</span>}
                {feed.lastImportedAt && (
                  <span style={{ fontSize: 12, color: c.textMuted }}>
                    Imported {new Date(feed.lastImportedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                )}
              </div>
              <div style={{ marginTop: 10 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                  background: metaComplete ? 'rgba(82,200,122,0.15)' : 'rgba(227,179,65,0.15)',
                  color: metaComplete ? '#52C87A' : '#e3b341',
                  border: `1px solid ${metaComplete ? '#52C87A' : '#e3b341'}22`,
                }}>
                  {metaComplete ? '✓ Metadata complete' : '⚠ Metadata incomplete'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
              <button
                onClick={handleRefresh}
                disabled={refreshing || !!refreshBlocked}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: c.radiusSm,
                  border: `1px solid ${refreshBlocked ? c.border : c.primary}`,
                  background: 'transparent',
                  color: refreshBlocked ? c.textMuted : c.primary,
                  cursor: refreshing || refreshBlocked ? 'default' : 'pointer',
                  fontSize: 12, fontWeight: 600,
                }}
              >
                ↻ {refreshing ? 'Queuing…' : 'Refresh Feed'}
              </button>
              {refreshError && <span style={{ fontSize: 11, color: c.danger }}>{refreshError}</span>}
            </div>
          </div>
        </div>

        {/* Agencies section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: c.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Agencies
          </span>
          <span style={{
            fontSize: 11, background: c.surface, border: `1px solid ${c.border}`,
            borderRadius: 20, padding: '1px 7px', color: c.textMuted,
          }}>
            {feed.agencies.length}
          </span>
        </div>

        {feed.agencies.length === 0 && (
          <div style={{
            background: c.surface, border: `1px solid ${c.border}`,
            borderRadius: c.radius, padding: '32px 24px',
            textAlign: 'center', color: c.textMuted, fontSize: 13,
          }}>
            No agencies loaded. Import the feed first.
          </div>
        )}

        {feed.agencies.map((agency) => (
          <div key={agency.id} style={{
            background: c.surface, border: `1px solid ${c.border}`,
            borderRadius: c.radius, padding: '16px 18px', marginBottom: 10,
            boxShadow: c.shadow,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              {agency.brandColor && (
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: `#${agency.brandColor}`, flexShrink: 0 }} />
              )}
              <span style={{ fontWeight: 600, fontSize: 14, color: c.text }}>{agency.name}</span>
              {(!agency.brandColor || !agency.city) && (
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20,
                  background: 'rgba(227,179,65,0.15)', color: '#e3b341',
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>
                  Incomplete
                </span>
              )}
            </div>
            <AgencyMetadataForm agency={agency} />
          </div>
        ))}
      </div>
    </div>
  )
}
