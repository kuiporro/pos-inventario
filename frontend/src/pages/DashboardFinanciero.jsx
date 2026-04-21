/**
 * DashboardFinanciero.jsx — Dashboard de reportes financieros avanzados
 * 
 * Muestra:
 * - Cards de ganancia (diaria, semanal, mensual)
 * - Gráfico de flujo de caja (ingresos vs egresos)
 * - Gráfico de ganancia por periodo
 * - Tabla de margen por producto
 * - Top productos más rentables
 */
import { useState, useEffect } from 'react'
import { facturacionApi } from '../api'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, Cell,
} from 'recharts'
import toast from 'react-hot-toast'

const fmtCLP = (n) => '$' + Number(n || 0).toLocaleString('es-CL')

const PERIODOS = [
  { value: 7, label: '7 días' },
  { value: 15, label: '15 días' },
  { value: 30, label: '30 días' },
  { value: 90, label: '90 días' },
]

export default function DashboardFinanciero() {
  const [dias, setDias] = useState(30)
  const [ganancia, setGanancia] = useState(null)
  const [flujo, setFlujo] = useState(null)
  const [margen, setMargen] = useState(null)
  const [topRentables, setTopRentables] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const cargar = async () => {
      setLoading(true)
      try {
        const [gRes, fRes, mRes, tRes] = await Promise.all([
          facturacionApi.getGanancia({ dias, periodo: 'diario' }),
          facturacionApi.getFlujoCaja({ dias, periodo: 'diario' }),
          facturacionApi.getMargen({ dias, limite: 15 }),
          facturacionApi.getTopRentables({ dias, limite: 10 }),
        ])
        setGanancia(gRes.data)
        setFlujo(fRes.data)
        setMargen(mRes.data)
        setTopRentables(tRes.data)
      } catch (e) {
        toast.error('Error cargando reportes financieros')
      } finally {
        setLoading(false)
      }
    }
    cargar()
  }, [dias])

  // Preparar datos para gráficos
  const gananciaData = (ganancia?.detalle || []).map(d => ({
    fecha: new Date(d.periodo).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }),
    ingresos: d.ingresos,
    ganancia_neta: d.ganancia_neta,
    devoluciones: d.devoluciones,
  }))

  const flujoData = (flujo?.detalle || []).map(d => ({
    fecha: new Date(d.periodo).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }),
    ingresos: d.ingresos,
    egresos: d.egresos,
    flujo_neto: d.flujo_neto,
  }))

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,.5)' }}>
        ⏳ Cargando reportes financieros...
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>📊 Dashboard Financiero</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          {PERIODOS.map(p => (
            <button
              key={p.value}
              onClick={() => setDias(p.value)}
              style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                border: 'none', cursor: 'pointer',
                background: dias === p.value ? 'rgba(99,102,241,.2)' : 'rgba(255,255,255,.05)',
                color: dias === p.value ? '#a5b4fc' : 'rgba(255,255,255,.5)',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cards resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        <MetricCard
          icon="💰"
          label="Ganancia Total"
          value={fmtCLP(ganancia?.ganancia_total)}
          color="#22c55e"
        />
        <MetricCard
          icon="📈"
          label="Ingresos"
          value={fmtCLP(flujo?.total_ingresos)}
          color="#60a5fa"
        />
        <MetricCard
          icon="📉"
          label="Egresos (Compras)"
          value={fmtCLP(flujo?.total_egresos)}
          color="#f87171"
        />
        <MetricCard
          icon="💵"
          label="Flujo Neto"
          value={fmtCLP(flujo?.flujo_neto)}
          color={flujo?.flujo_neto >= 0 ? '#22c55e' : '#ef4444'}
        />
      </div>

      {/* Gráficos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
        {/* Ganancia por periodo */}
        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>📈 Ganancia por Período</h3>
          <div style={{ padding: '0 12px 16px' }}>
            {gananciaData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={gananciaData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 10, fill: 'rgba(255,255,255,.4)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,.4)' }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: '#1e1e2e', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8 }}
                    labelStyle={{ color: 'rgba(255,255,255,.7)' }}
                    formatter={(v) => [fmtCLP(v)]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="ingresos" name="Ingresos" fill="#60a5fa" radius={[4,4,0,0]} />
                  <Bar dataKey="ganancia_neta" name="Ganancia neta" fill="#22c55e" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </div>
        </div>

        {/* Flujo de caja */}
        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>💵 Flujo de Caja</h3>
          <div style={{ padding: '0 12px 16px' }}>
            {flujoData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={flujoData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 10, fill: 'rgba(255,255,255,.4)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,.4)' }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: '#1e1e2e', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8 }}
                    formatter={(v) => [fmtCLP(v)]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="ingresos" name="Ingresos" stroke="#60a5fa" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="egresos" name="Egresos" stroke="#f87171" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="flujo_neto" name="Neto" stroke="#22c55e" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </div>
        </div>
      </div>

      {/* Tablas inferior */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Margen por producto */}
        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>📊 Margen por Producto</h3>
          <div style={{ maxHeight: 400, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Producto', 'Costo', 'Venta', 'Margen', 'Ganancia'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(margen?.productos || []).map((p, i) => (
                  <tr key={i} style={trStyle}>
                    <td style={{ ...tdStyle, maxWidth: 180 }}>
                      <div style={{ fontWeight: 500, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.producto_nombre}
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)' }}>
                        {p.variante_nombre} · {p.unidades_vendidas} uds
                      </div>
                    </td>
                    <td style={tdNumStyle}>{fmtCLP(p.precio_costo)}</td>
                    <td style={tdNumStyle}>{fmtCLP(p.precio_venta_promedio)}</td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: p.margen_porcentaje > 30 ? 'rgba(34,197,94,.15)' :
                                    p.margen_porcentaje > 15 ? 'rgba(251,191,36,.15)' : 'rgba(239,68,68,.15)',
                        color: p.margen_porcentaje > 30 ? '#22c55e' :
                               p.margen_porcentaje > 15 ? '#fbbf24' : '#ef4444',
                      }}>
                        {p.margen_porcentaje}%
                      </span>
                    </td>
                    <td style={{ ...tdNumStyle, fontWeight: 600, color: '#22c55e' }}>
                      {fmtCLP(p.ganancia_total)}
                    </td>
                  </tr>
                ))}
                {(margen?.productos || []).length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: 'rgba(255,255,255,.4)' }}>
                      Sin datos en el periodo
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top rentables */}
        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>🏆 Top Productos más Rentables</h3>
          <div style={{ maxHeight: 400, overflow: 'auto' }}>
            {(topRentables?.productos || []).map((p, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '12px 16px',
                  borderBottom: '1px solid rgba(255,255,255,.04)',
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 8, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14,
                  background: i < 3 ? 'rgba(251,191,36,.15)' : 'rgba(255,255,255,.05)',
                  color: i < 3 ? '#fbbf24' : 'rgba(255,255,255,.4)',
                }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.producto_nombre}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>
                    {p.variante_nombre} · {p.unidades} uds vendidas
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#22c55e' }}>
                    {fmtCLP(p.ganancia)}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>
                    ingresos: {fmtCLP(p.ingresos)}
                  </div>
                </div>
              </div>
            ))}
            {(topRentables?.productos || []).length === 0 && (
              <p style={{ textAlign: 'center', padding: 32, color: 'rgba(255,255,255,.4)' }}>
                Sin datos en el periodo
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Componentes auxiliares ───────────────────────────────────────
function MetricCard({ icon, label, value, color }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,.03)',
      border: '1px solid rgba(255,255,255,.06)',
      borderRadius: 12, padding: '18px 20px',
    }}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', fontWeight: 500, marginBottom: 8 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  )
}

function EmptyChart() {
  return (
    <div style={{
      height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'rgba(255,255,255,.3)', fontSize: 13,
    }}>
      Sin datos para mostrar
    </div>
  )
}

// ─── Estilos ──────────────────────────────────────────────────────
const cardStyle = {
  background: 'rgba(255,255,255,.03)',
  border: '1px solid rgba(255,255,255,.06)',
  borderRadius: 12, overflow: 'hidden',
}
const cardTitleStyle = {
  fontSize: 14, fontWeight: 600, padding: '14px 16px',
  borderBottom: '1px solid rgba(255,255,255,.06)',
}
const thStyle = {
  textAlign: 'left', padding: '8px 14px', fontSize: 10, fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '.5px', color: 'rgba(255,255,255,.4)',
  borderBottom: '1px solid rgba(255,255,255,.06)', position: 'sticky', top: 0,
  background: 'rgba(15,15,25,.95)',
}
const tdStyle = { padding: '8px 14px', fontSize: 12, color: 'rgba(255,255,255,.8)' }
const tdNumStyle = { ...tdStyle, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }
const trStyle = { borderBottom: '1px solid rgba(255,255,255,.04)' }
