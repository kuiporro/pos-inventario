import { useState } from 'react'
import toast from 'react-hot-toast'
import Modal from './Modal'
import { inventarioApi } from '../api'

const formatCLP = (value) => {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(value)
}

const TIPOS = [
  { value: 'INGRESO',            label: '📥 Ingreso de mercadería' },
  { value: 'AJUSTE_POSITIVO',    label: '➕ Ajuste positivo'       },
  { value: 'AJUSTE_NEGATIVO',    label: '➖ Ajuste negativo'       },
  { value: 'INICIAL',            label: '🏁 Carga inicial'         },
  { value: 'DEVOLUCION_PROVEEDOR', label: '↩️ Devolución proveedor' },
]

export default function ModalAjusteStock({ variante, onGuardar, onCerrar }) {
  const [tipo,     setTipo]     = useState('INGRESO')
  const [cantidad, setCantidad] = useState('')
  const [motivo,   setMotivo]   = useState('')
  const [cargando, setCargando] = useState(false)

  const stockActual = variante?.stock?.cantidad ?? 0

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!cantidad || parseInt(cantidad) <= 0) {
      toast.error('La cantidad debe ser mayor a 0')
      return
    }
    setCargando(true)
    try {
      await inventarioApi.ajustarStock(variante.stock.id, {
        variante_id: variante.id,
        tipo,
        cantidad:    parseInt(cantidad),
        motivo,
      })
      toast.success('Stock ajustado correctamente')
      onGuardar()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setCargando(false)
    }
  }

  const esSalida = ['AJUSTE_NEGATIVO', 'DEVOLUCION_PROVEEDOR'].includes(tipo)

  return (
    <Modal titulo={`Ajuste de stock — ${variante?.nombre}`} onCerrar={onCerrar} ancho={440}>
      <div style={{
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius)',
        padding: '12px 16px',
        marginBottom: 16,
        fontSize: 13,
      }}>
        <div style={{ color: 'var(--color-text-muted)' }}>Stock actual</div>
        <div style={{ fontSize: 28, fontWeight: 700, marginTop: 2 }}>{stockActual} unidades</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-dim)', marginTop: 2 }}>
          {variante?.producto_nombre ?? ''} — SKU: {variante?.sku}
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="input-group">
          <label className="input-label">Tipo de movimiento</label>
          <select id="ajuste-tipo" className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <div className="input-group">
          <label className="input-label">Cantidad</label>
          <input
            id="ajuste-cantidad"
            type="number"
            min="1"
            className="input"
            style={{ borderColor: esSalida ? 'var(--color-danger)' : 'var(--color-success)' }}
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            placeholder="0"
            required
          />
          {esSalida && cantidad && (
            <span style={{ fontSize: 12, color: 'var(--color-warning)', marginTop: 2 }}>
              Stock resultante: {stockActual - parseInt(cantidad || 0)} unidades
            </span>
          )}
          {!esSalida && cantidad && (
            <span style={{ fontSize: 12, color: 'var(--color-success)', marginTop: 2 }}>
              Stock resultante: {stockActual + parseInt(cantidad || 0)} unidades
            </span>
          )}
        </div>

        <div className="input-group">
          <label className="input-label">Motivo / Observación</label>
          <textarea
            id="ajuste-motivo"
            className="input"
            rows={2}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: Compra a proveedor, corrección de inventario..."
          />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button type="button" className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={onCerrar}>
            Cancelar
          </button>
          <button
            id="ajuste-guardar-btn"
            type="submit"
            className={`btn ${esSalida ? 'btn-danger' : 'btn-success'}`}
            style={{ flex: 2, justifyContent: 'center' }}
            disabled={cargando}
          >
            {cargando ? <span className="spinner" /> : 'Aplicar ajuste'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
