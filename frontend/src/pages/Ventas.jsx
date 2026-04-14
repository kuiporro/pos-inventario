/**
 * Ventas.jsx — Historial de ventas con detalle e impresión de ticket
 */
import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { ventasApi } from '../api'
import api from '../api'
import { formatCLP } from '../utils/formatCLP'
import Modal from '../components/Modal'

const ESTADO_BADGE = {
  COMPLETADA: 'badge-success',
  ANULADA:    'badge-danger',
  PENDIENTE:  'badge-warning',
}

const ESTADO_LABEL = {
  COMPLETADA: '✅ Completada',
  ANULADA:    '🚫 Anulada',
  PENDIENTE:  '⏳ Pendiente',
}

const METODO_LABEL = {
  EFECTIVO:       '💵 Efectivo',
  TARJETA_DEBITO: '💳 Débito',
  TARJETA_CREDITO:'💳 Crédito',
  TRANSFERENCIA:  '🏦 Transferencia',
  OTRO:           'Otro',
}

export default function Ventas() {
  const [ventas,      setVentas]      = useState([])
  const [cargando,    setCargando]    = useState(true)
  const [ventaDetalle, setVentaDetalle] = useState(null)  // venta abierta en modal
  const [motivoAnular, setMotivoAnular] = useState('')
  const [anulando,    setAnulando]    = useState(false)
  const [mostrarAnular, setMostrarAnular] = useState(false)

  // Filtros
  const [filtroFecha, setFiltroFecha] = useState('hoy')  // hoy | semana | mes | todos
  const [busqueda,    setBusqueda]    = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const params = { ordering: '-fecha', page_size: 200 }
      const hoy    = new Date()
      if (filtroFecha === 'hoy') {
        params.fecha_inicio = hoy.toISOString().slice(0, 10)
        params.fecha_fin    = hoy.toISOString().slice(0, 10)
      } else if (filtroFecha === 'semana') {
        const ini = new Date(hoy)
        ini.setDate(hoy.getDate() - 7)
        params.fecha_inicio = ini.toISOString().slice(0, 10)
      } else if (filtroFecha === 'mes') {
        const ini = new Date(hoy)
        ini.setDate(1)
        params.fecha_inicio = ini.toISOString().slice(0, 10)
      }
      const { data } = await ventasApi.getVentas(params)
      setVentas(data.results ?? data)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setCargando(false)
    }
  }, [filtroFecha])

  useEffect(() => { cargar() }, [cargar])

  const abrirDetalle = async (venta) => {
    try {
      const { data } = await ventasApi.getVenta(venta.id)
      setVentaDetalle(data)
      setMostrarAnular(false)
      setMotivoAnular('')
    } catch (err) { toast.error(err.message) }
  }

  const handleAnular = async () => {
    if (!motivoAnular.trim()) { toast.error('Ingresa el motivo de anulación'); return }
    setAnulando(true)
    try {
      await ventasApi.anularVenta(ventaDetalle.id, motivoAnular)
      toast.success('Venta anulada correctamente')
      setVentaDetalle(null)
      cargar()
    } catch (err) { toast.error(err.message) }
    finally { setAnulando(false) }
  }

  const imprimirTicket = (venta) => {
    const win = window.open('', '_blank', 'width=400,height=600')
    const fecha = new Date(venta.fecha).toLocaleString('es-CL')
    const items = (venta.detalles ?? []).map(d =>
      `<tr>
        <td>${d.variante_nombre ?? d.variante}</td>
        <td style="text-align:right">${d.cantidad}</td>
        <td style="text-align:right">${formatCLP(d.precio_unitario)}</td>
        <td style="text-align:right">${formatCLP(d.subtotal)}</td>
      </tr>`
    ).join('')

    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Ticket #${venta.numero_comprobante}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Courier New', monospace; font-size: 12px; padding: 10px; max-width: 280px; }
          h1 { font-size: 18px; text-align: center; margin-bottom: 4px; }
          .sub { text-align: center; font-size: 11px; color: #666; margin-bottom: 12px; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          table { width: 100%; border-collapse: collapse; margin: 6px 0; }
          th { font-size: 10px; text-align: left; border-bottom: 1px solid #000; padding-bottom: 4px; }
          td { padding: 3px 0; font-size: 11px; vertical-align: top; }
          .total-row { font-size: 16px; font-weight: bold; display: flex; justify-content: space-between; margin-top: 8px; }
          .footer { text-align: center; margin-top: 14px; font-size: 10px; color: #666; }
          @media print { body { max-width: 100%; } }
        </style>
      </head>
      <body>
        <h1>🛒 POS Tienda</h1>
        <div class="sub">Comprobante de Venta</div>
        <div class="divider"></div>
        <p><strong>N°:</strong> ${venta.numero_comprobante}</p>
        <p><strong>Fecha:</strong> ${fecha}</p>
        <p><strong>Pago:</strong> ${METODO_LABEL[venta.metodo_pago] || venta.metodo_pago}</p>
        <div class="divider"></div>
        <table>
          <thead><tr><th>Producto</th><th>Cant</th><th>P.Unit</th><th>Total</th></tr></thead>
          <tbody>${items}</tbody>
        </table>
        <div class="divider"></div>
        ${venta.descuento > 0 ? `<p style="display:flex;justify-content:space-between"><span>Descuento:</span><span>- ${formatCLP(venta.descuento)}</span></p>` : ''}
        <div class="total-row">
          <span>TOTAL:</span>
          <span>${formatCLP(venta.total)}</span>
        </div>
        <div class="divider"></div>
        <div class="footer">¡Gracias por su compra!<br>Conserve este comprobante</div>
        <script>window.onload = () => { window.print(); window.close(); }<\/script>
      </body>
      </html>
    `)
    win.document.close()
  }

  // Filtrar por búsqueda
  const ventasFiltradas = ventas.filter(v =>
    !busqueda ||
    v.numero_comprobante?.toLowerCase().includes(busqueda.toLowerCase()) ||
    String(v.total).includes(busqueda)
  )

  const totalDelPeriodo = ventasFiltradas
    .filter(v => v.estado === 'COMPLETADA')
    .reduce((acc, v) => acc + Number(v.total || 0), 0)

  const exportarExcel = async () => {
    try {
      const hoy   = new Date()
      const params = new URLSearchParams()
      if (filtroFecha === 'hoy') {
        const f = hoy.toISOString().slice(0, 10)
        params.set('fecha_inicio', f); params.set('fecha_fin', f)
      } else if (filtroFecha === 'semana') {
        const ini = new Date(hoy); ini.setDate(hoy.getDate() - 7)
        params.set('fecha_inicio', ini.toISOString().slice(0, 10))
      } else if (filtroFecha === 'mes') {
        const ini = new Date(hoy); ini.setDate(1)
        params.set('fecha_inicio', ini.toISOString().slice(0, 10))
      }
      const token = localStorage.getItem('pos_token')
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? 'https://localhost:8000/api'}/reportes/exportar/ventas/?${params}`, {
        headers: { Authorization: `Token ${token}` }
      })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `ventas_${filtroFecha}.xlsx`
      a.click(); URL.revokeObjectURL(url)
      toast.success('📊 Excel descargado')
    } catch { toast.error('Error al exportar Excel') }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Historial de Ventas</h1>
          <p className="page-subtitle">
            {ventasFiltradas.length} venta{ventasFiltradas.length !== 1 ? 's' : ''} ·{' '}
            Total: <strong>{formatCLP(totalDelPeriodo)}</strong>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={exportarExcel} title="Exportar a Excel">
            📊 Excel
          </button>
          <button className="btn btn-ghost btn-sm" onClick={cargar} disabled={cargando}>
            🔄 Actualizar
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="card" style={{ padding: '14px 20px', marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {['hoy', 'semana', 'mes', 'todos'].map(f => (
          <button
            key={f}
            className={`btn btn-sm ${filtroFecha === f ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFiltroFecha(f)}
          >
            {{ hoy: '📅 Hoy', semana: '📅 Semana', mes: '📅 Mes', todos: '📅 Todos' }[f]}
          </button>
        ))}
        <input
          className="input"
          style={{ flex: 1, maxWidth: 240, marginLeft: 'auto' }}
          placeholder="Buscar comprobante..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
        />
      </div>

      {/* Tabla */}
      <div className="card" style={{ overflow: 'auto' }}>
        {cargando ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--color-text-dim)' }}>
            <span className="spinner" style={{ width: 28, height: 28 }} />
          </div>
        ) : ventasFiltradas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--color-text-dim)' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>💳</div>
            <p>Sin ventas en el período seleccionado</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                {['Comprobante', 'Fecha', 'Items', 'Método', 'Total', 'Estado', 'Acciones'].map(h => (
                  <th key={h} style={{
                    padding: '10px 14px', textAlign: 'left',
                    fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ventasFiltradas.map(v => (
                <tr key={v.id} style={{
                  borderBottom: '1px solid var(--color-border)',
                  opacity: v.estado === 'ANULADA' ? 0.5 : 1,
                }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600, fontSize: 13 }}>
                    #{v.numero_comprobante}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {new Date(v.fecha).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13 }}>
                    {v.cantidad_items ?? '—'} item{v.cantidad_items !== 1 ? 's' : ''}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12 }}>
                    {METODO_LABEL[v.metodo_pago] || v.metodo_pago}
                  </td>
                  <td style={{ padding: '10px 14px', fontWeight: 700, fontSize: 14, color: 'var(--color-success)' }}>
                    {formatCLP(v.total)}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span className={`badge ${ESTADO_BADGE[v.estado] || 'badge-muted'}`}>
                      {ESTADO_LABEL[v.estado] || v.estado}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => abrirDetalle(v)}
                      >
                        👁️ Ver
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => { abrirDetalle(v).then?.(() => imprimirTicket(v)); imprimirTicket(v) }}
                        title="Imprimir ticket"
                      >
                        🖨️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal detalle */}
      {ventaDetalle && (
        <Modal
          titulo={`Venta #${ventaDetalle.numero_comprobante}`}
          onCerrar={() => setVentaDetalle(null)}
          ancho={580}
        >
          {/* Info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            {[
              ['📅 Fecha', new Date(ventaDetalle.fecha).toLocaleString('es-CL')],
              ['💳 Método', METODO_LABEL[ventaDetalle.metodo_pago] || ventaDetalle.metodo_pago],
              ['📋 Estado', ESTADO_LABEL[ventaDetalle.estado]],
              ['💰 Total', formatCLP(ventaDetalle.total)],
            ].map(([lbl, val]) => (
              <div key={lbl} style={{ background: 'var(--color-surface-2)', borderRadius: 'var(--radius-sm)', padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 3 }}>{lbl}</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Productos */}
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 8 }}>PRODUCTOS</p>
          {(ventaDetalle.detalles ?? []).map((d, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 0', borderBottom: '1px solid var(--color-border)', fontSize: 13,
            }}>
              <div>
                <div style={{ fontWeight: 500 }}>
                  {d.variante_info?.producto_nombre ?? d.variante_info?.nombre ?? `Variante #${d.variante}`}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                  {d.variante_info?.nombre} · {formatCLP(d.precio_unitario)} × {d.cantidad}
                </div>
              </div>
              <span style={{ fontWeight: 700 }}>{formatCLP(d.subtotal)}</span>
            </div>
          ))}

          {/* Total */}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontSize: 18, fontWeight: 700 }}>
            <span>TOTAL</span>
            <span style={{ color: 'var(--color-success)' }}>{formatCLP(ventaDetalle.total)}</span>
          </div>

          {/* Acciones */}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button
              className="btn btn-ghost"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => imprimirTicket(ventaDetalle)}
            >
              🖨️ Imprimir ticket
            </button>
            {ventaDetalle.estado === 'COMPLETADA' && !mostrarAnular && (
              <button
                className="btn btn-sm"
                style={{ background: 'rgba(239,68,68,.1)', color: '#f87171', border: '1px solid rgba(239,68,68,.2)' }}
                onClick={() => setMostrarAnular(true)}
              >
                🚫 Anular venta
              </button>
            )}
          </div>

          {/* Form anulación */}
          {mostrarAnular && (
            <div style={{
              marginTop: 12, background: 'color-mix(in srgb, var(--color-danger) 10%, transparent)',
              border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-sm)', padding: 14,
            }}>
              <p style={{ fontSize: 13, marginBottom: 8, fontWeight: 600, color: 'var(--color-danger)' }}>
                ⚠️ Confirmar anulación
              </p>
              <input
                className="input"
                placeholder="Motivo de anulación (obligatorio)..."
                value={motivoAnular}
                onChange={e => setMotivoAnular(e.target.value)}
                style={{ marginBottom: 10 }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setMostrarAnular(false)}>Cancelar</button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={handleAnular}
                  disabled={anulando || !motivoAnular.trim()}
                >
                  {anulando ? <span className="spinner" /> : '🚫 Confirmar anulación'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
