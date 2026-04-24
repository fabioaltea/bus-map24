import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAdminFeeds, type AdminFeedListItem } from './services/admin-api.js'
import FeedTable from './components/FeedTable.js'
import AddFeedModal from './components/AddFeedModal.js'
import { c } from './styles.js'

function Logo() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width={28} height={28}>
      <rect width="32" height="32" rx="6" fill="#0E1116" stroke="#30363d" strokeWidth="1"/>
      <text x="16" y="22" fontFamily="Inter Tight, Inter, system-ui, sans-serif" fontSize="16" fontWeight="700" fill="#52C87A" textAnchor="middle" letterSpacing="-0.5">24</text>
    </svg>
  )
}

export default function FeedListPage() {
  const navigate = useNavigate()
  const [feeds, setFeeds] = useState<AdminFeedListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)

  async function loadFeeds() {
    setLoading(true); setError('')
    try { setFeeds((await getAdminFeeds()).data) }
    catch { setError('Failed to load feeds') }
    finally { setLoading(false) }
  }

  useEffect(() => { loadFeeds() }, [])

  const ready = feeds.filter((f) => f.importStatus === 'ready').length
  const incomplete = feeds.filter((f) => !f.metadataComplete && f.importStatus === 'ready').length

  return (
    <div className="admin-scroll" style={{ background: c.bg, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Nav */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: c.bgElevated, borderBottom: `1px solid ${c.border}`,
        padding: '0 24px', height: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Logo />
          <span style={{ color: c.text, fontWeight: 700, fontSize: 14 }}>BusMap</span>
          <span style={{ color: c.textXMuted, fontSize: 12 }}>/</span>
          <span style={{ color: c.textMuted, fontSize: 13 }}>Feeds</span>
        </div>
        <button
          onClick={() => { localStorage.removeItem('admin_token'); navigate('/admin/login') }}
          style={{
            background: 'transparent', border: `1px solid ${c.border}`,
            color: c.textMuted, padding: '5px 12px', borderRadius: c.radiusSm,
            fontSize: 12, cursor: 'pointer',
          }}
        >
          Sign out
        </button>
      </nav>

      <div style={{ maxWidth: 1060, margin: '0 auto', padding: '28px 24px 48px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: c.text }}>Feeds</h1>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: c.textMuted }}>GTFS transit data sources</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: c.radiusSm,
              border: `1px solid ${c.primary}`, background: 'transparent',
              color: c.primary, cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}
          >
            + Add Feed
          </button>
        </div>

        {/* Stat chips */}
        {!loading && feeds.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Total', value: feeds.length, color: c.textMuted },
              { label: 'Ready', value: ready, color: c.primary },
              ...(incomplete > 0 ? [{ label: 'Incomplete metadata', value: incomplete, color: c.warning }] : []),
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                background: c.surface, border: `1px solid ${c.border}`,
                borderRadius: c.radiusSm, padding: '8px 14px',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontSize: 18, fontWeight: 700, color }}>{value}</span>
                <span style={{ fontSize: 11, color: c.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
              </div>
            ))}
          </div>
        )}

        {loading && <div style={{ padding: '48px 0', textAlign: 'center', color: c.textMuted, fontSize: 13 }}>Loading…</div>}
        {error && (
          <div style={{ padding: '11px 14px', background: c.dangerBg, border: `1px solid ${c.dangerBorder}`, borderRadius: c.radius, color: c.danger, fontSize: 13 }}>
            {error}
          </div>
        )}
        {!loading && !error && <FeedTable feeds={feeds} />}
      </div>

      {showModal && <AddFeedModal onSuccess={loadFeeds} onClose={() => setShowModal(false)} />}
    </div>
  )
}
