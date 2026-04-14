import { useState } from 'react'
import Modal from './Modal'
import { formatCLP } from '../utils/formatCLP'
import toast from 'react-hot-toast'

const METODOS_OPCIONES = [
  { value: 'EFECTIVO',        label: '💵 Efectivo'      },
  { value: 'TARJETA_DEBITO',  label: '💳 Débito'        },
  { value: 'TARJETA_CREDITO', label: '💳 Crédito'       },
  { value: 'TRANSFERENCIA',   label: '🏦 Transferencia'  },
  { value: 'OTRO',            label: '🔧 Otro'           },
]
const METODOS_LABEL = Object.fromEntries(METODOS_OPCIONES.map(m => [m.value, m.label]))

export default function ModalConfirmarVenta({ carrito, total, metodoPago, onConfirmar, onCancelar, cargando }) {
  const [descuento,     setDescuento]     = useState('')
  const [observaciones, setObservaciones] = useState('')

  // Multi-pago: lista de { metodo, monto }
  const [pagos, setPagos] = useState([{ metodo: metodoPago, monto: '' }])
  const [multiPago, setMultiPago] = useState(false)

  const descuentoNum = Math.round(Number(descuento) || 0)
  const totalFinal   = Math.max(0, total - descuentoNum)

  // Suma de pagos ingresados
  const sumaPagos = pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0)
  const vuelto    = Math.max(0, sumaPagos - totalFinal)
  const falta     = Math.max(0, totalFinal - sumaPagos)

  const addPago = () => setPagos(prev => [...prev, { metodo: 'EFECTIVO', monto: '' }])
  const removePago = (i) => setPagos(prev => prev.filter((_, idx) => idx !== i))
  const updatePago = (i, field, val) => setPagos(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: val } : p))

  const handleConfirmar = () => {
    if (multiPago) {
      if (falta > 0) {
        toast.error(`Faltan ${formatCLP(falta)} — el total de pagos no cubre el cobro`)
        return
      }
      // Construir lista de pagos limpia
      const pagosValidos = pagos
        .filter(p => Number(p.monto) > 0)
        .map(p => ({ metodo: p.metodo, monto: Number(p.monto) }))
      const metodoPrincipal = pagosValidos[0]?.metodo ?? metodoPago
      onConfirmar(descuentoNum, observaciones, pagosValidos, metodoPrincipal)
    } else {
      onConfirmar(descuentoNum, observaciones, [], metodoPago)
    }
  }

  return (
    <Modal titulo="Confirmar venta" onCerrar={onCancelar} ancho={520}>
      {/* Resumen */}
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8, fontWeight: 600 }}>RESUMEN</p>
        {carrito.map((item) => (
          <div key={item.variante_id} style={{
            display: 'flex', justifyContent: 'space-between',
            padding: '7px 0', borderBottom: '1px solid var(--color-border)', fontSize: 13,
          }}>
            <span>{item.nombre} — {item.variante} × {item.cantidad}</span>
            <span style={{ fontWeight: 600 }}>{formatCLP(item.precio * item.cantidad)}</span>
          </div>
        ))}
      </div>

      {/* Descuento */}
      <div className="input-group" style={{ marginBottom: 12 }}>
        <label className="input-label">Descuento global (CLP)</label>
        <input id="modal-descuento" type="number" min="0" step="1" className="input"
          placeholder="0" value={descuento} onChange={e => setDescuento(e.target.value)} />
      </div>

      {/* Observaciones */}
      <div className="input-group" style={{ marginBottom: 16 }}>
        <label className="input-label">Observaciones</label>
        <textarea id="modal-observaciones" className="input" rows={2}
          placeholder="Nota opcional..." value={observaciones}
          onChange={e => setObservaciones(e.target.value)} />
      </div>

      {/* Toggle multi-pago */}
      <div style={{ marginBottom: 14 }}>
        <button
          type="button" className={`btn btn-sm ${multiPago ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => {
            setMultiPago(v => !v)
            setPagos([{ metodo: metodoPago, monto: '' }])
          }}
        >
          {multiPago ? '✅ Múltiple pago activo' : '➕ Dividir en múltiples métodos'}
        </button>
      </div>

      {/* Tabla de pagos (cuando multi-pago activo) */}
      {multiPago && (
        <div style={{
          background: 'var(--color-surface-2)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          padding: '12px 14px',
          marginBottom: 14,
        }}>
          <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Detalle de pagos:</p>
          {pagos.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <select
                className="input" style={{ width: 160, flexShrink: 0 }}
                value={p.metodo} onChange={e => updatePago(i, 'metodo', e.target.value)}>
                {METODOS_OPCIONES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <input
                type="number" min="0" step="1" className="input" style={{ flex: 1 }}
                placeholder="Monto" value={p.monto} onChange={e => updatePago(i, 'monto', e.target.value)} />
              {pagos.length > 1 && (
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger)' }}
                  onClick={() => removePago(i)}>✕</button>
              )}
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={addPago} style={{ marginTop: 4 }}>
            ➕ Agregar método
          </button>

          {/* Vuelto / falta */}
          <div style={{ marginTop: 10, display: 'flex', gap: 12, fontSize: 12 }}>
            {sumaPagos > 0 && vuelto > 0 && (
              <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                💵 Vuelto: {formatCLP(vuelto)}
              </span>
            )}
            {falta > 0 && (
              <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
                ⚠️ Falta: {formatCLP(falta)}
              </span>
            )}
            {sumaPagos > 0 && falta === 0 && (
              <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>✅ Cubierto</span>
            )}
          </div>
        </div>
      )}

      {/* Total */}
      <div style={{
        background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius)', padding: '14px 18px', marginBottom: 20,
      }}>
        {descuentoNum > 0 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Subtotal</span>
              <span>{formatCLP(total)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span style={{ color: 'var(--color-warning)' }}>Descuento</span>
              <span style={{ color: 'var(--color-warning)' }}>− {formatCLP(descuentoNum)}</span>
            </div>
          </>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>TOTAL</span>
          <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-success)' }}>
            {formatCLP(totalFinal)}
          </span>
        </div>
        {!multiPago && (
          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--color-text-muted)' }}>
            {METODOS_LABEL[metodoPago] || metodoPago}
          </div>
        )}
      </div>

      {/* Acciones */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={onCancelar}>
          Cancelar
        </button>
        <button id="modal-confirmar-btn" className="btn btn-success"
          style={{ flex: 2, justifyContent: 'center', fontSize: 15 }}
          onClick={handleConfirmar} disabled={cargando}>
          {cargando ? <span className="spinner" /> : `✅ Cobrar ${formatCLP(totalFinal)}`}
        </button>
      </div>
    </Modal>
  )
}
