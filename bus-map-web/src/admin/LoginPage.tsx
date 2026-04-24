import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { c } from './styles.js'

const BASE = import.meta.env.VITE_API_URL ?? ''

function Logo() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width={36} height={36}>
      <rect width="32" height="32" rx="6" fill="#0E1116" stroke="#30363d" strokeWidth="1"/>
      <text x="16" y="22" fontFamily="Inter Tight, Inter, system-ui, sans-serif" fontSize="16" fontWeight="700" fill="#52C87A" textAnchor="middle" letterSpacing="-0.5">24</text>
    </svg>
  )
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${BASE}/api/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.status === 401) { setError('Invalid password'); return }
      if (!res.ok) throw new Error()
      const { token } = await res.json()
      localStorage.setItem('admin_token', token)
      navigate('/admin')
    } catch {
      setError('Login failed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: c.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{
        background: c.surface, borderRadius: 12, padding: '36px 32px', width: 340,
        border: `1px solid ${c.border}`, boxShadow: c.shadowMd,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <Logo />
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: c.text }}>BusMap Admin</div>
            <div style={{ fontSize: 12, color: c.textMuted }}>Feed management</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: c.textMuted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Password
            </label>
            <input
              type="password"
              placeholder="Admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              style={{
                padding: '9px 11px', fontSize: 14,
                background: c.bgElevated,
                border: `1px solid ${error ? c.danger : c.border}`,
                borderRadius: c.radiusSm, outline: 'none', color: c.text,
              }}
            />
          </div>

          {error && (
            <div style={{
              padding: '8px 11px', background: c.dangerBg,
              border: `1px solid ${c.dangerBorder}`, borderRadius: c.radiusSm,
              fontSize: 13, color: c.danger,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            style={{
              marginTop: 4, padding: '10px', fontSize: 14, fontWeight: 700,
              background: loading || !password ? `${c.primary}55` : c.primary,
              color: c.primaryText, border: 'none', borderRadius: c.radiusSm,
              cursor: loading || !password ? 'default' : 'pointer',
              letterSpacing: '0.02em',
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
