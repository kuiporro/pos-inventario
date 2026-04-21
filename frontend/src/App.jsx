import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import POS from './pages/POS'
import Inventario from './pages/Inventario'
import Reportes from './pages/Reportes'
import Movimientos from './pages/Movimientos'
import Ventas from './pages/Ventas'
import Devoluciones from './pages/Devoluciones'
import Etiquetas from './pages/Etiquetas'
import ScannerMovil from './pages/ScannerMovil'
import Facturacion from './pages/Facturacion'
import OCRProcesamiento from './pages/OCRProcesamiento'
import DashboardFinanciero from './pages/DashboardFinanciero'
import OCRMovil from './pages/OCRMovil'
import api from './api'

const NAV = [
  { to: '/pos',           icon: '🛒', label: 'Punto de Venta' },
  { to: '/inventario',    icon: '📦', label: 'Inventario',     alertKey: 'stock' },
  { to: '/movimientos',   icon: '📋', label: 'Movimientos'    },
  { to: '/ventas',        icon: '💳', label: 'Ventas'         },
  { to: '/devoluciones',  icon: '↩',  label: 'Devoluciones'  },
  { to: '/etiquetas',     icon: '🏷️', label: 'Etiquetas'     },
  { to: '/reportes',      icon: '📊', label: 'Reportes'      },
  { to: '/facturacion',   icon: '🧾', label: 'Facturación'   },
  { to: '/dashboard-financiero', icon: '💰', label: 'Finanzas' },
]

const SIN_SIDEBAR = ['/scanner-movil', '/login', '/ocr-movil']

function Sidebar() {
  const { usuario, logout } = useAuth()
  const [stockBajo, setStockBajo] = useState(0)

  // Polling de alertas de stock bajo cada 60s
  useEffect(() => {
    const fetchAlertas = async () => {
      try {
        const { data } = await api.get('/inventario/stock-alertas/')
        setStockBajo(data.total ?? 0)
      } catch (_) {}
    }
    fetchAlertas()
    const timer = setInterval(fetchAlertas, 60_000)
    return () => clearInterval(timer)
  }, [])

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        POS <span>Tienda</span>
      </div>

      {NAV.map(({ to, icon, label, alertKey }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <span className="icon">{icon}</span>
          {label}
          {alertKey === 'stock' && stockBajo > 0 && (
            <span style={{
              marginLeft: 'auto',
              background: '#ef4444',
              color: '#fff',
              borderRadius: '999px',
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 7px',
              minWidth: 18,
              textAlign: 'center',
              lineHeight: '16px',
            }}>
              {stockBajo}
            </span>
          )}
        </NavLink>
      ))}

      {/* Footer: usuario + logout */}
      <div style={{
        marginTop: 'auto',
        paddingTop: 16,
        borderTop: '1px solid rgba(255,255,255,.08)',
      }}>
        <div style={{
          padding: '10px 14px',
          borderRadius: 'var(--radius-sm)',
          background: 'rgba(255,255,255,.04)',
          marginBottom: 8,
        }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginBottom: 2 }}>
            SESIÓN ACTIVA
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.85)' }}>
            👤 {usuario?.nombre || usuario?.username}
          </div>
        </div>
        <button
          id="btn-logout"
          onClick={logout}
          style={{
            width: '100%',
            padding: '9px 14px',
            background: 'rgba(239,68,68,.1)',
            border: '1px solid rgba(239,68,68,.2)',
            borderRadius: 'var(--radius-sm)',
            color: '#f87171',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'background .15s',
          }}
          onMouseEnter={e => e.target.style.background = 'rgba(239,68,68,.2)'}
          onMouseLeave={e => e.target.style.background = 'rgba(239,68,68,.1)'}
        >
          🚪 Cerrar sesión
        </button>
      </div>
    </aside>
  )
}

export default function App() {
  const location = useLocation()
  const esSinSidebar = SIN_SIDEBAR.some(p => location.pathname.startsWith(p))

  if (esSinSidebar) {
    return (
      <Routes>
        <Route path="/login"         element={<Login />} />
        <Route path="/scanner-movil" element={<ScannerMovil />} />
        <Route path="/ocr-movil"     element={<OCRMovil />} />
      </Routes>
    )
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/"             element={<ProtectedRoute><POS /></ProtectedRoute>} />
          <Route path="/pos"          element={<ProtectedRoute><POS /></ProtectedRoute>} />
          <Route path="/inventario"   element={<ProtectedRoute><Inventario /></ProtectedRoute>} />
          <Route path="/movimientos"  element={<ProtectedRoute><Movimientos /></ProtectedRoute>} />
          <Route path="/ventas"       element={<ProtectedRoute><Ventas /></ProtectedRoute>} />
          <Route path="/devoluciones" element={<ProtectedRoute><Devoluciones /></ProtectedRoute>} />
          <Route path="/etiquetas"    element={<ProtectedRoute><Etiquetas /></ProtectedRoute>} />
          <Route path="/reportes"     element={<ProtectedRoute><Reportes /></ProtectedRoute>} />
          <Route path="/facturacion"  element={<ProtectedRoute><Facturacion /></ProtectedRoute>} />
          <Route path="/facturacion/ocr/:id" element={<ProtectedRoute><OCRProcesamiento /></ProtectedRoute>} />
          <Route path="/dashboard-financiero" element={<ProtectedRoute><DashboardFinanciero /></ProtectedRoute>} />
        </Routes>
      </main>
    </div>
  )
}
