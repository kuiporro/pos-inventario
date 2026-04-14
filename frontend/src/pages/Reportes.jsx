import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar,
} from 'recharts'
import { reportesApi } from '../api'
import { formatCLP } from '../utils/formatCLP'

export default function Reportes() {
  const [dashboard,    setDashboard]    = useState(null)
  const [ventasData,   setVentasData]   = useState(null)
  const [masVendidos,  setMasVendidos]  = useState([])
  const [bajStock,     setBajStock]     = useState([])
  const [periodo,      setPeriodo]      = useState('diario')
  const [cargando,     setCargando]     = useState(true)

  const cargarTodo = async () => {
    setCargando(true)
    try {
      const [dash, ventas, vendidos, stock] = await Promise.all([
        reportesApi.getDashboard(),
        reportesApi.getVentas({ periodo }),
        reportesApi.getMasVendidos({ limite: 10, dias: 30 }),
        reportesApi.getStock({ bajo_stock: 'true' }),
      ])
      setDashboard(dash.data)
      setVentasData(ventas.data)
      setMasVendidos(vendidos.data.productos)
      setBajStock(stock.data.stock)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargarTodo() }, [periodo])

  const fmt = (n) => formatCLP(n)

  if (cargando) return (
    <div style={{ textAlign: 'center', padding: 80 }}>
      <span className="spinner" style={{ width: 40, height: 40 }} />
      <p style={{ marginTop: 16, color: 'var(--color-text-muted)' }}>Cargando reportes...</p>
    </div>
  )

  const ventasGrafico = (ventasData?.detalle || []).map((d) => ({
    fecha: new Date(d.periodo).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }),
    ventas: parseFloat(d.total_ventas || 0),
    cantidad: d.cantidad_ventas,
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Reportes</h1>
          <p className="page-subtitle">Resumen general del negocio</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={cargarTodo}>🔄 Actualizar</button>
      </div>

      {/* KPIs */}
      {dashboard && (
        <div className="kpi-grid">
          <div className="kpi-card success">
            <span className="kpi-label">Ventas hoy</span>
            <span className="kpi-value">${fmt(dashboard.ventas_hoy.total)}</span>
            <span className="kpi-sub">{dashboard.ventas_hoy.cantidad} transacciones</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Ventas semana</span>
            <span className="kpi-value">${fmt(dashboard.ventas_semana.total)}</span>
            <span className="kpi-sub">Últimos 7 días</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Ventas mes</span>
            <span className="kpi-value">${fmt(dashboard.ventas_mes.total)}</span>
            <span className="kpi-sub">Mes actual</span>
          </div>
          <div className={`kpi-card ${dashboard.inventario.variantes_bajo_stock > 0 ? 'warning' : ''}`}>
            <span className="kpi-label">Bajo stock</span>
            <span className="kpi-value">{dashboard.inventario.variantes_bajo_stock}</span>
            <span className="kpi-sub">de {dashboard.inventario.total_variantes_activas} variantes activas</span>
          </div>
        </div>
      )}

      {/* Gráfico de ventas */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 className="card-title" style={{ margin: 0 }}>Evolución de ventas</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            {['diario', 'semanal', 'mensual'].map((p) => (
              <button
                key={p}
                className={`btn btn-sm ${periodo === p ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setPeriodo(p)}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {ventasGrafico.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-dim)' }}>
            Sin datos para el período seleccionado
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={ventasGrafico}>
              <defs>
                <linearGradient id="colorVentas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2e3347" />
              <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip
                contentStyle={{
                  background: '#1a1d27', border: '1px solid #2e3347',
                  borderRadius: 8, fontSize: 12,
                }}
                formatter={(v) => [`$${fmt(v)}`, 'Total']}
              />
              <Area
                type="monotone"
                dataKey="ventas"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#colorVentas)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Fila: más vendidos + bajo stock */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Más vendidos */}
        <div className="card">
          <h2 className="card-title">🏆 Más vendidos — últimos 30 días</h2>
          {masVendidos.length === 0 ? (
            <p style={{ color: 'var(--color-text-dim)', fontSize: 13 }}>Sin datos</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={masVendidos.slice(0, 6)} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2e3347" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis
                    type="category"
                    dataKey="variante_nombre"
                    width={90}
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                  />
                  <Tooltip
                    contentStyle={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 8, fontSize: 12 }}
                    formatter={(v) => [v, 'Unidades']}
                  />
                  <Bar dataKey="total_unidades" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th><th>Producto · Variante</th><th>Unidades</th><th>Ingresos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {masVendidos.map((p, i) => (
                      <tr key={p.variante_id}>
                        <td style={{ color: 'var(--color-text-dim)' }}>{i + 1}</td>
                        <td>
                          <div style={{ fontWeight: 500 }}>{p.producto_nombre}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>{p.variante_nombre}</div>
                        </td>
                        <td><span className="badge badge-primary">{p.total_unidades}</span></td>
                        <td style={{ fontWeight: 600 }}>${fmt(p.total_ingresos)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Bajo stock */}
        <div className="card">
          <h2 className="card-title">⚠️ Productos con bajo stock</h2>
          {bajStock.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--color-success)' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
              <p>Todo el stock está en niveles normales</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Producto</th><th>Stock</th><th>Mínimo</th>
                  </tr>
                </thead>
                <tbody>
                  {bajStock.map((s) => (
                    <tr key={s.variante_id}>
                      <td>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{s.producto_nombre}</div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{s.variante_nombre}</div>
                      </td>
                      <td>
                        <span className={`badge ${s.cantidad === 0 ? 'badge-danger' : 'badge-warning'}`}>
                          {s.cantidad}
                        </span>
                      </td>
                      <td style={{ color: 'var(--color-text-muted)' }}>{s.stock_minimo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
