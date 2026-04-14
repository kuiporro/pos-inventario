/**
 * ProtectedRoute.jsx — Guard de rutas
 * Si no hay sesión → redirige a /login
 * Si está cargando → muestra spinner
 */
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }) {
  const { usuario, cargando } = useAuth()

  if (cargando) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f0f1a',
        flexDirection: 'column',
        gap: 16,
      }}>
        <div style={{
          width: 48, height: 48,
          border: '3px solid rgba(99,102,241,.2)',
          borderTopColor: '#6366f1',
          borderRadius: '50%',
          animation: 'spin .8s linear infinite',
        }} />
        <p style={{ color: 'rgba(255,255,255,.3)', fontSize: 14 }}>
          Verificando sesión...
        </p>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (!usuario) {
    return <Navigate to="/login" replace />
  }

  return children
}
