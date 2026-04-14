/**
 * Devoluciones.jsx — Pantalla para procesar devoluciones de clientes
 * Busca una venta, selecciona ítems y cantidad a devolver, confirma
 */
import { useState } from 'react'
import toast from 'react-hot-toast'
import api from '../api'
import { formatCLP } from '../utils/formatCLP'

const METODOS = [
  { value: 'EFECTIVO',         label: 'Efectivo' },
  { value: 'TARJETA_DEBITO',   label: 'Tarjeta débito' },
  { value: 'TARJETA_CREDITO',  label: 'Tarjeta crédito' },
  { value: 'TRANSFERENCIA',    label: 'Transferencia' },
  { value: 'OTRO',             label: 'Otro' },
]

export default function Devoluciones() {
  const [busqueda,   setBusqueda]   = useState('')
  const [venta,      setVenta]      = useState(null)
  const [items,      setItems]      = useState([])   // { detalle, cantidad }
  const [motivo,     setMotivo]     = useState('')
  const [metodoRemb, setMetodoRemb] = useState('EFECTIVO')
  const [buscando,   setBuscando]   = useState(false)
  const [procesando, setProcesando] = useState(false)

  /* ── Buscar venta ─────────────────────────────────────── */
  const buscarVenta = async () => {
    if (!busqueda.trim()) return
    setBuscando(true)
    try {
      // Buscar por comprobante exacto
      const { data } = await api.get('/ventas/ventas/', {
        params: { search: busqueda.trim() }
      })
      const resultados = data.results ?? data
      if (resultados.length === 0) {
        toast.error('No se encontró ninguna venta con ese número')
        setVenta(null); return
      }
      // Cargar detalle completo
      const { data: detalle } = await api.get(`/ventas/ventas/${resultados[0].id}/`)
      if (detalle.estado === 'ANULADA') {
        toast.error('Esta venta está anulada — no se puede devolver')
        setVenta(null); return
      }
      if (detalle.estado === 'DEVOLUCION_TOTAL') {
        toast.error('Esta venta ya fue devuelta completamente')
        setVenta(null); return
      }
      setVenta(detalle)
      // Inicializar ítems con cantidad 0
      setItems(detalle.detalles.map(d => ({ detalle: d, cantidad: 0 })))
    } catch (err) {
      toast.error('Error al buscar la venta')
    } finally {
      setBuscando(false)
    }
  }

  /* ── Procesar devolución ───────────────────────────────── */
  const procesarDevolucion = async () => {
    const itemsSeleccionados = items.filter(i => i.cantidad > 0)
    if (itemsSeleccionados.length === 0) {
      toast.error('Selecciona al menos un ítem a devolver')
      return
    }
    if (!motivo.trim()) {
      toast.error('El motivo de devolución es obligatorio')
      return
    }
    setProcesando(true)
    try {
      await api.post('/ventas/devoluciones/', {
        venta_id:        venta.id,
        motivo:          motivo.trim(),
        metodo_reembolso: metodoRemb,
        items: itemsSeleccionados.map(i => ({
          venta_detalle_id: i.detalle.id,
          cantidad_devuelta: i.cantidad,
        }))
      })
      toast.success('Devolución procesada ✅ — stock repuesto automáticamente')
      setVenta(null); setItems([]); setBusqueda('')
      setMotivo(''); setMetodoRemb('EFECTIVO')
    } catch (err) {
      const msg = err?.response?.data
      toast.error(typeof msg === 'string' ? msg : (msg?.items?.[0] ?? msg?.non_field_errors?.[0] ?? 'Error al procesar devolución'))
    } finally {
      setProcesando(false)
    }
  }

  const totalDevolucion = items
    .filter(i => i.cantidad > 0)
    .reduce((sum, i) => sum + (Number(i.detalle.precio_unitario) * i.cantidad), 0)

  const setItemCantidad = (idx, val) => {
    const max = items[idx].detalle.cantidad
    const num = Math.max(0, Math.min(Number(val), max))
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, cantidad: num } : it))
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>↩ Devoluciones</h1>
        <p style={{ fontSize: 14, color: 'var(--color-text-muted)', marginTop: 4 }}>
          Busca una venta para procesar la devolución
        </p>
      </div>

      {/* Buscador */}
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius)',
        padding: 24,
        marginBottom: 24,
      }}>
        <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'block' }}>
          🔍 Número de comprobante
        </label>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            className="input"
            style={{ flex: 1 }}
            placeholder="Ej: 0001-00000001"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && buscarVenta()}
          />
          <button
            className="btn btn-primary"
            onClick={buscarVenta}
            disabled={buscando || !busqueda.trim()}
          >
            {buscando ? <span className="spinner" /> : '🔍 Buscar'}
          </button>
        </div>
      </div>

      {/* Resultado de la venta */}
      {venta && (
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)',
          padding: 24,
        }}>
          {/* Info venta */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            paddingBottom: 16, borderBottom: '1px solid var(--color-border)', marginBottom: 20,
            flexWrap: 'wrap', gap: 12,
          }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                #{venta.numero_comprobante}
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 3 }}>
                {new Date(venta.fecha).toLocaleString('es-CL')} · {venta.metodo_pago_display}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-primary)' }}>
                {formatCLP(venta.total)}
              </div>
              <span className={`badge ${venta.estado === 'COMPLETADA' ? 'badge-success' : 'badge-warning'}`}>
                {venta.estado_display}
              </span>
            </div>
          </div>

          {/* Tabla de ítems */}
          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
            Selecciona qué devolver:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {items.map((item, idx) => {
              const d = item.detalle
              const nombre = d.variante_info?.producto_nombre ?? `Variante #${d.variante}`
              const variante = d.variante_info?.nombre ?? ''
              return (
                <div key={d.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto auto',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  background: item.cantidad > 0
                    ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)'
                    : 'var(--color-surface-2)',
                  border: `1px solid ${item.cantidad > 0 ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  borderRadius: 'var(--radius-sm)',
                  transition: 'all .2s',
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{nombre}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      {variante} · {formatCLP(d.precio_unitario)} × {d.cantidad}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'right' }}>
                    {formatCLP(d.subtotal)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px' }}
                      onClick={() => setItemCantidad(idx, item.cantidad - 1)}>−</button>
                    <input
                      type="number" min="0" max={d.cantidad}
                      value={item.cantidad}
                      onChange={e => setItemCantidad(idx, e.target.value)}
                      style={{
                        width: 48, textAlign: 'center',
                        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                        borderRadius: 6, padding: '4px 6px', color: 'var(--color-text)',
                        fontSize: 14,
                      }}
                    />
                    <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px' }}
                      onClick={() => setItemCantidad(idx, item.cantidad + 1)}>+</button>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'right' }}>
                    / {d.cantidad}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Motivo + método */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 12, marginBottom: 20 }}>
            <div className="input-group">
              <label className="input-label">Motivo de devolución *</label>
              <input className="input" placeholder="Ej: Producto defectuoso, error de cobro..."
                value={motivo} onChange={e => setMotivo(e.target.value)} />
            </div>
            <div className="input-group">
              <label className="input-label">Método de reembolso</label>
              <select className="input" value={metodoRemb} onChange={e => setMetodoRemb(e.target.value)}>
                {METODOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>

          {/* Resumen y botón */}
          {totalDevolucion > 0 && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '16px 20px',
              background: 'color-mix(in srgb, var(--color-success) 10%, transparent)',
              border: '1px solid var(--color-success)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 16,
            }}>
              <span style={{ fontSize: 14, color: 'var(--color-success)', fontWeight: 600 }}>
                Total a devolver al cliente:
              </span>
              <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-success)' }}>
                {formatCLP(totalDevolucion)}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => { setVenta(null); setBusqueda('') }}>
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              onClick={procesarDevolucion}
              disabled={procesando || items.every(i => i.cantidad === 0)}
            >
              {procesando ? <span className="spinner" /> : '✅ Procesar devolución'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
