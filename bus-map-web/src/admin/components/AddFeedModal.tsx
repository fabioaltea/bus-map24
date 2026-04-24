import { useState, type FormEvent } from 'react'
import { postAdminFeed } from '../services/admin-api.js'
import { c } from '../styles.js'

interface Props { onSuccess: () => void; onClose: () => void }

export default function AddFeedModal({ onSuccess, onClose }: Props) {
  const [tab, setTab] = useState<'mobilityId' | 'url'>('mobilityId')
  const [mobilityId, setMobilityId] = useState('')
  const [url, setUrl] = useState('')
  const [provider, setProvider] = useState('')
  const [countryCode, setCountryCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      if (tab === 'mobilityId') await postAdminFeed({ mobilityId })
      else await postAdminFeed({ url, provider, countryCode })
      onSuccess(); onClose()
    } catch (err: unknown) {
      const e = err as { status?: number; body?: { detail?: string } }
      if (e.status === 409) setError('Feed already exists')
      else if (e.status === 400) setError(e.body?.detail ?? 'Validation error')
      else setError('Failed to add feed')
    } finally { setLoading(false) }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: c.surface, borderRadius: 12, padding: '24px',
        width: 420, maxWidth: '92vw',
        border: `1px solid ${c.border}`, boxShadow: c.shadowMd,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: c.text }}>Add Feed</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, color: c.textMuted, cursor: 'pointer', lineHeight: 1, padding: 2 }}>×</button>
        </div>

        {/* Tab switcher */}
        <div style={{
          display: 'flex', gap: 2, background: c.bgElevated,
          padding: 3, borderRadius: c.radiusSm, marginBottom: 20,
          border: `1px solid ${c.border}`,
        }}>
          {(['mobilityId', 'url'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} style={{
              flex: 1, padding: '6px 10px', borderRadius: 4, border: 'none',
              background: tab === t ? c.surface : 'transparent',
              color: tab === t ? c.text : c.textMuted,
              fontSize: 12, fontWeight: tab === t ? 600 : 400,
              cursor: 'pointer', transition: 'all 0.15s',
              boxShadow: tab === t ? c.shadow : 'none',
            }}>
              {t === 'mobilityId' ? 'MobilityDB ID' : 'Direct URL'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tab === 'mobilityId' ? (
            <Field label="MobilityDB Feed ID">
              <input placeholder="e.g. tld-576" value={mobilityId} onChange={(e) => setMobilityId(e.target.value)} required style={inp} />
              <span style={{ fontSize: 11, color: c.textXMuted }}>Find IDs at api.mobilitydatabase.org</span>
            </Field>
          ) : (
            <>
              <Field label="Download URL">
                <input type="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} required style={inp} />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px', gap: 10 }}>
                <Field label="Provider name">
                  <input placeholder="Transit Agency" value={provider} onChange={(e) => setProvider(e.target.value)} required style={inp} />
                </Field>
                <Field label="Country">
                  <input placeholder="IT" value={countryCode} onChange={(e) => setCountryCode(e.target.value.toUpperCase())} maxLength={2} required style={{ ...inp, textAlign: 'center', fontFamily: 'monospace' }} />
                </Field>
              </div>
            </>
          )}

          {error && (
            <div style={{ padding: '8px 11px', background: c.dangerBg, border: `1px solid ${c.dangerBorder}`, borderRadius: c.radiusSm, fontSize: 12, color: c.danger }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={secBtn}>Cancel</button>
            <button type="submit" disabled={loading} style={{
              padding: '7px 16px', borderRadius: c.radiusSm, border: `1px solid ${c.primary}`,
              background: 'transparent', color: loading ? `${c.primary}66` : c.primary,
              fontSize: 12, fontWeight: 600, cursor: loading ? 'default' : 'pointer',
            }}>
              {loading ? 'Adding…' : 'Add Feed'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: c.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
      {children}
    </div>
  )
}

const inp: React.CSSProperties = {
  padding: '8px 10px', fontSize: 13,
  background: c.bgElevated, border: `1px solid ${c.border}`,
  borderRadius: c.radiusSm, color: c.text, outline: 'none', width: '100%', boxSizing: 'border-box',
}

const secBtn: React.CSSProperties = {
  padding: '7px 14px', borderRadius: c.radiusSm,
  border: `1px solid ${c.border}`, background: 'transparent',
  color: c.textMuted, fontSize: 12, fontWeight: 500, cursor: 'pointer',
}
