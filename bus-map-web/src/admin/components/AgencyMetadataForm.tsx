import { useState, type FormEvent } from 'react'
import { patchAdminAgency, type AdminAgency } from '../services/admin-api.js'
import { c } from '../styles.js'

export default function AgencyMetadataForm({ agency }: { agency: AdminAgency }) {
  const [brandColor, setBrandColor] = useState(agency.brandColor ?? '')
  const [logoUrl, setLogoUrl] = useState(agency.logoUrl ?? '')
  const [city, setCity] = useState(agency.city ?? '')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [imgErr, setImgErr] = useState(false)

  const hexColor = brandColor.length === 6 ? `#${brandColor}` : undefined

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setStatus('saving'); setErrorMsg('')
    try {
      await patchAdminAgency(agency.id, {
        brandColor: brandColor || null, logoUrl: logoUrl || null, city: city || null,
      })
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2500)
    } catch (err: unknown) {
      const e = err as { body?: { detail?: string } }
      setErrorMsg(e.body?.detail ?? 'Save failed'); setStatus('error')
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr 160px', gap: 14, alignItems: 'start' }}>
        {/* Brand color */}
        <div>
          <label style={lbl}>Brand Color</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 5 }}>
            <input
              type="color"
              value={hexColor ?? '#cccccc'}
              onChange={(e) => setBrandColor(e.target.value.replace('#', ''))}
              style={{ width: 32, height: 32, padding: 2, border: `1px solid ${c.border}`, borderRadius: 4, cursor: 'pointer', background: c.bgElevated }}
            />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 11, color: c.textMuted, fontFamily: 'monospace' }}>#</span>
                <input
                  type="text" placeholder="RRGGBB" value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value.replace(/[^0-9A-Fa-f]/g, '').slice(0, 6))}
                  maxLength={6}
                  style={{ ...inp, width: 68, fontFamily: 'monospace', textTransform: 'uppercase', fontSize: 12 }}
                />
              </div>
              {hexColor && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 2, background: hexColor, border: `1px solid ${c.border}` }} />
                  <span style={{ fontSize: 10, color: c.textXMuted }}>preview</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Logo URL */}
        <div>
          <label style={lbl}>Logo URL</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 5 }}>
            <input
              type="url" placeholder="https://…" value={logoUrl}
              onChange={(e) => { setLogoUrl(e.target.value); setImgErr(false) }}
              style={{ ...inp, flex: 1 }}
            />
            {logoUrl && !imgErr && (
              <div style={{
                width: 32, height: 32, border: `1px solid ${c.border}`, borderRadius: 4,
                overflow: 'hidden', background: c.bgElevated, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <img src={logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={() => setImgErr(true)} />
              </div>
            )}
          </div>
        </div>

        {/* City */}
        <div>
          <label style={lbl}>City</label>
          <input
            type="text" placeholder="City name" value={city}
            onChange={(e) => setCity(e.target.value)} maxLength={128}
            style={{ ...inp, marginTop: 5, display: 'block' }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
        <button
          type="submit" disabled={status === 'saving'}
          style={{
            padding: '6px 14px', borderRadius: c.radiusSm,
            border: `1px solid ${status === 'saving' ? c.border : c.primary}`,
            background: 'transparent',
            color: status === 'saving' ? c.textMuted : c.primary,
            cursor: status === 'saving' ? 'default' : 'pointer',
            fontSize: 12, fontWeight: 600,
          }}
        >
          {status === 'saving' ? 'Saving…' : 'Save'}
        </button>
        {status === 'saved' && <span style={{ fontSize: 12, color: c.success, fontWeight: 500 }}>✓ Saved</span>}
        {status === 'error' && <span style={{ fontSize: 12, color: c.danger }}>{errorMsg}</span>}
      </div>
    </form>
  )
}

const lbl: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: c.textMuted,
  textTransform: 'uppercase', letterSpacing: '0.05em',
}

const inp: React.CSSProperties = {
  padding: '7px 9px', fontSize: 12,
  background: c.bgElevated, border: `1px solid ${c.border}`,
  borderRadius: c.radiusSm, color: c.text, outline: 'none', boxSizing: 'border-box',
}
