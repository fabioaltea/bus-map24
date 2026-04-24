import { Navigate } from 'react-router-dom'

function isTokenValid(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return typeof payload.exp === 'number' && payload.exp * 1000 > Date.now()
  } catch {
    return false
  }
}

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('admin_token')
  if (!token || !isTokenValid(token)) {
    return <Navigate to="/admin/login" replace />
  }
  return <>{children}</>
}
