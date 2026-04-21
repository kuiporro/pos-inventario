/**
 * OCRProcesamiento.jsx — Revisión y confirmación de datos OCR
 * 
 * Flujo:
 * 1. Muestra estado del procesamiento (polling si está en proceso)
 * 2. Tabla de productos detectados con indicadores de confianza
 * 3. Para cada producto: badge ENCONTRADO/NUEVO + campos editables
 * 4. Para productos NUEVOS: formulario para crear producto
 * 5. Botón confirmar → crea factura + productos nuevos + stock
 */
import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { facturacionApi } from '../api'
import toast from 'react-hot-toast'

const fmtCLP = (n) => '$' + Number(n || 0).toLocaleString('es-CL')

export default function OCRProcesamiento() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [proc, setProc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [productos, setProductos] = useState([])
  const [numFactura, setNumFactura] = useState('')
  const [proveedores, setProveedores] = useState([])
  const [proveedorId, setProveedorId] = useState('')
  const [confirmando, setConfirmando] = useState(false)

  // Cargar resultado OCR
  const cargar = useCallback(async () => {
    try {
      const { data } = await facturacionApi.getOCRResultado(id)
      setProc(data)

      if (data.datos_extraidos?.numero_factura) {
        setNumFactura(data.datos_extraidos.numero_factura)
      }

      // Inicializar productos editables
      if (data.datos_extraidos?.productos && data.estado === 'PROCESADO') {
        setProductos(data.datos_extraidos.productos.map((p, i) => ({
          _key: i,
          descripcion: p.descripcion || '',
          codigo_barras: p.codigo_barras || '',
          cantidad: p.cantidad || 1,
          precio_unitario: p.precio_unitario || 0,
          confianza: p.confianza || 0,
          match_tipo: p.match_tipo || 'NUEVO',
          variante_id: p.variante_id || null,
          variante_info: p.variante_info || null,
          es_nuevo: p.match_tipo === 'NUEVO',
          // Campos para producto nuevo
          nuevo_producto_nombre: p.descripcion || '',
          nuevo_variante_nombre: 'Única',
          nuevo_precio_venta: 0,
          nuevo_categoria: '',
        })))
      }
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { cargar() }, [cargar])

  // Polling si está pendiente/procesando
  useEffect(() => {
    if (!proc) return
    if (proc.estado === 'PENDIENTE' || proc.estado === 'PROCESANDO') {
      const timer = setInterval(cargar, 3000)
      return () => clearInterval(timer)
    }
  }, [proc, cargar])

  // Cargar proveedores
  useEffect(() => {
    facturacionApi.getProveedores()
      .then(({ data }) => setProveedores(data.results || data || []))
      .catch(() => {})
  }, [])

  const updateProducto = (index, field, value) => {
    setProductos(prev => {
      const copy = [...prev]
      copy[index] = { ...copy[index], [field]: value }
      return copy
    })
  }

  const eliminarProducto = (index) => {
    setProductos(prev => prev.filter((_, i) => i !== index))
  }

  const handleConfirmar = async () => {
    if (!numFactura.trim()) return toast.error('Ingrese el número de factura')
    if (productos.length === 0) return toast.error('No hay productos para confirmar')

    // Validar productos nuevos
    for (const p of productos) {
      if (p.es_nuevo && !p.nuevo_producto_nombre?.trim()) {
        return toast.error(`Producto nuevo sin nombre: "${p.descripcion}"`)
      }
      if (p.cantidad <= 0) return toast.error('Todas las cantidades deben ser mayores a 0')
      if (p.precio_unitario <= 0) return toast.error('Todos los precios deben ser mayores a 0')
    }

    setConfirmando(true)
    try {
      const payload = {
        numero_factura: numFactura.trim(),
        proveedor_id: proveedorId ? parseInt(proveedorId) : null,
        productos: productos.map(p => ({
          variante_id: p.variante_id,
          es_nuevo: p.es_nuevo,
          cantidad: p.cantidad,
          precio_unitario: p.precio_unitario,
          descripcion: p.descripcion,
          codigo_barras: p.codigo_barras,
          nuevo_producto_nombre: p.nuevo_producto_nombre,
          nuevo_variante_nombre: p.nuevo_variante_nombre,
          nuevo_precio_venta: p.nuevo_precio_venta,
          nuevo_categoria: p.nuevo_categoria,
        })),
      }

      const { data } = await facturacionApi.confirmarOCR(id, payload)
      toast.success('✅ Factura creada y stock actualizado')
      navigate('/facturacion')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setConfirmando(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,.5)' }}>
        Cargando resultado OCR...
      </div>
    )
  }

  if (!proc) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,.5)' }}>
        Documento no encontrado
      </div>
    )
  }

  // En procesamiento
  if (proc.estado === 'PENDIENTE' || proc.estado === 'PROCESANDO') {
    return (
      <div style={{ padding: '60px 28px', textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 20 }}>⚙️</div>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
          Procesando documento...
        </h2>
        <p style={{ color: 'rgba(255,255,255,.5)' }}>
          OCR en progreso. Esta página se actualizará automáticamente.
        </p>
        <div style={{
          marginTop: 30, width: 200, height: 4, background: 'rgba(255,255,255,.08)',
          borderRadius: 2, margin: '30px auto', overflow: 'hidden',
        }}>
          <div style={{
            width: '60%', height: '100%', background: '#818cf8',
            borderRadius: 2, animation: 'pulse 1.5s infinite',
          }} />
        </div>
      </div>
    )
  }

  // Error
  if (proc.estado === 'ERROR') {
    return (
      <div style={{ padding: '40px 28px' }}>
        <div style={{
          background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)',
          borderRadius: 12, padding: 24, textAlign: 'center',
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>❌</div>
          <h3 style={{ color: '#f87171', marginBottom: 8 }}>Error en el procesamiento</h3>
          <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 13 }}>
            {proc.errores?.[0]?.mensaje || 'Error desconocido'}
          </p>
          <button
            onClick={() => navigate('/facturacion')}
            style={{ ...btnPrimary, marginTop: 16 }}
          >
            Volver a facturación
          </button>
        </div>
      </div>
    )
  }

  // Ya confirmado
  if (proc.estado === 'CONFIRMADO') {
    return (
      <div style={{ padding: '40px 28px', textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>Documento ya confirmado</h2>
        <p style={{ color: 'rgba(255,255,255,.5)', marginTop: 8 }}>
          Este documento ya generó una factura.
        </p>
        <button
          onClick={() => navigate('/facturacion')}
          style={{ ...btnPrimary, marginTop: 20 }}
        >
          Ver facturas
        </button>
      </div>
    )
  }

  // ─── PROCESADO: Pantalla de revisión ────────────────────────────
  const datos = proc.datos_extraidos || {}

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <button onClick={() => navigate('/facturacion')} style={btnSecondary}>
          ← Volver
        </button>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 2 }}>
            📄 Revisión OCR — {proc.nombre_archivo}
          </h1>
          <p style={{ color: 'rgba(255,255,255,.45)', fontSize: 12 }}>
            Confianza global: {proc.confianza_global}% · Productos detectados: {productos.length}
          </p>
        </div>
      </div>

      {/* Datos de factura */}
      <div style={{
        ...cardStyle, padding: 20, marginBottom: 20,
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14,
      }}>
        <div>
          <label style={labelStyle}>N° Factura *</label>
          <input
            value={numFactura}
            onChange={e => setNumFactura(e.target.value)}
            placeholder={datos.numero_factura || 'Número de factura'}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Proveedor</label>
          <select
            value={proveedorId}
            onChange={e => setProveedorId(e.target.value)}
            style={inputStyle}
          >
            <option value="">
              {datos.proveedor_nombre ? `Detectado: ${datos.proveedor_nombre}` : 'Seleccionar...'}
            </option>
            {proveedores.map(p => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Total detectado</label>
          <div style={{
            padding: '10px 14px', background: 'rgba(255,255,255,.03)',
            borderRadius: 8, fontSize: 16, fontWeight: 700,
            fontVariantNumeric: 'tabular-nums', color: '#a5b4fc',
          }}>
            {fmtCLP(datos.total_detectado)}
          </div>
        </div>
      </div>

      {/* Tabla de productos */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,.06)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 600 }}>
            Productos detectados ({productos.length})
          </h3>
        </div>

        {productos.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 32, color: 'rgba(255,255,255,.4)' }}>
            No se detectaron productos
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr>
                  {['Estado', 'Descripción', 'Código', 'Cant.', 'Precio Unit.', 'Subtotal', 'Confianza', ''].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {productos.map((p, i) => (
                  <ProductoRow
                    key={p._key}
                    producto={p}
                    index={i}
                    onUpdate={updateProducto}
                    onDelete={eliminarProducto}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Resumen y confirmar */}
      <div style={{
        ...cardStyle, padding: 20,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <span style={{ color: 'rgba(255,255,255,.5)', fontSize: 13 }}>
            Total calculado:{' '}
          </span>
          <span style={{ fontWeight: 700, fontSize: 18, color: '#a5b4fc' }}>
            {fmtCLP(productos.reduce((s, p) => s + (p.cantidad * p.precio_unitario), 0))}
          </span>
          <span style={{ color: 'rgba(255,255,255,.35)', fontSize: 12, marginLeft: 10 }}>
            + IVA 19%
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => navigate('/facturacion')} style={btnSecondary}>
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            disabled={confirmando}
            style={{
              ...btnPrimary,
              opacity: confirmando ? 0.6 : 1,
              padding: '10px 28px',
              fontSize: 14,
            }}
          >
            {confirmando ? '⏳ Procesando...' : '✅ Confirmar y aplicar stock'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Fila de producto ─────────────────────────────────────────────
function ProductoRow({ producto, index, onUpdate, onDelete }) {
  const p = producto
  const esNuevo = p.es_nuevo

  const matchBadge = {
    CODIGO_BARRAS: { label: '🔗 Código barras', bg: 'rgba(34,197,94,.15)', color: '#22c55e' },
    SKU: { label: '🏷 SKU', bg: 'rgba(59,130,246,.15)', color: '#60a5fa' },
    NOMBRE: { label: '📝 Nombre', bg: 'rgba(251,191,36,.15)', color: '#fbbf24' },
    NUEVO: { label: '➕ Nuevo', bg: 'rgba(168,85,247,.15)', color: '#c084fc' },
  }[p.match_tipo] || { label: '❓', bg: 'rgba(255,255,255,.06)', color: '#999' }

  return (
    <>
      <tr style={{
        borderBottom: esNuevo ? 'none' : '1px solid rgba(255,255,255,.04)',
        background: esNuevo ? 'rgba(168,85,247,.03)' : 'transparent',
      }}>
        <td style={tdStyle}>
          <span style={{
            padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
            background: matchBadge.bg, color: matchBadge.color,
            whiteSpace: 'nowrap',
          }}>
            {matchBadge.label}
          </span>
          {p.variante_info && (
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', marginTop: 4 }}>
              {p.variante_info.producto_nombre} — {p.variante_info.variante_nombre}
            </div>
          )}
        </td>
        <td style={tdStyle}>
          <input
            value={p.descripcion}
            onChange={e => onUpdate(index, 'descripcion', e.target.value)}
            style={{ ...inputSmall, width: '100%', minWidth: 180 }}
          />
        </td>
        <td style={tdStyle}>
          <input
            value={p.codigo_barras}
            onChange={e => onUpdate(index, 'codigo_barras', e.target.value)}
            style={{ ...inputSmall, width: 120 }}
            placeholder="—"
          />
        </td>
        <td style={tdStyle}>
          <input
            type="number"
            min="1"
            value={p.cantidad}
            onChange={e => onUpdate(index, 'cantidad', parseInt(e.target.value) || 1)}
            style={{ ...inputSmall, width: 60, textAlign: 'center' }}
          />
        </td>
        <td style={tdStyle}>
          <input
            type="number"
            min="0"
            value={p.precio_unitario}
            onChange={e => onUpdate(index, 'precio_unitario', parseInt(e.target.value) || 0)}
            style={{ ...inputSmall, width: 100, textAlign: 'right' }}
          />
        </td>
        <td style={{ ...tdStyle, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {fmtCLP(p.cantidad * p.precio_unitario)}
        </td>
        <td style={tdStyle}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <div style={{
              width: 40, height: 5, background: 'rgba(255,255,255,.08)',
              borderRadius: 3, overflow: 'hidden',
            }}>
              <div style={{
                width: `${p.confianza}%`, height: '100%',
                background: p.confianza > 70 ? '#22c55e' : p.confianza > 40 ? '#fbbf24' : '#ef4444',
                borderRadius: 3,
              }} />
            </div>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>{p.confianza}%</span>
          </div>
        </td>
        <td style={tdStyle}>
          <button onClick={() => onDelete(index)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(239,68,68,.6)', fontSize: 14,
          }}>🗑</button>
        </td>
      </tr>
      {/* Fila expandida para productos nuevos */}
      {esNuevo && (
        <tr style={{
          borderBottom: '1px solid rgba(255,255,255,.04)',
          background: 'rgba(168,85,247,.03)',
        }}>
          <td colSpan={8} style={{ padding: '8px 14px 14px' }}>
            <div style={{
              display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
              padding: '10px 14px',
              background: 'rgba(168,85,247,.06)',
              border: '1px solid rgba(168,85,247,.15)',
              borderRadius: 8,
            }}>
              <span style={{ fontSize: 11, color: '#c084fc', fontWeight: 600, marginRight: 4 }}>
                DATOS PRODUCTO NUEVO:
              </span>
              <input
                placeholder="Nombre producto *"
                value={p.nuevo_producto_nombre}
                onChange={e => onUpdate(index, 'nuevo_producto_nombre', e.target.value)}
                style={{ ...inputSmall, flex: 1, minWidth: 150 }}
              />
              <input
                placeholder="Variante"
                value={p.nuevo_variante_nombre}
                onChange={e => onUpdate(index, 'nuevo_variante_nombre', e.target.value)}
                style={{ ...inputSmall, width: 100 }}
              />
              <input
                type="number"
                placeholder="Precio venta"
                value={p.nuevo_precio_venta || ''}
                onChange={e => onUpdate(index, 'nuevo_precio_venta', parseInt(e.target.value) || 0)}
                style={{ ...inputSmall, width: 100 }}
              />
              <input
                placeholder="Categoría"
                value={p.nuevo_categoria}
                onChange={e => onUpdate(index, 'nuevo_categoria', e.target.value)}
                style={{ ...inputSmall, width: 110 }}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Estilos ──────────────────────────────────────────────────────
const cardStyle = {
  background: 'rgba(255,255,255,.03)',
  border: '1px solid rgba(255,255,255,.06)',
  borderRadius: 12,
  overflow: 'hidden',
}
const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.45)',
  marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.3px',
}
const inputStyle = {
  padding: '10px 14px', background: 'rgba(255,255,255,.05)',
  border: '1px solid rgba(255,255,255,.1)', borderRadius: 8,
  color: '#fff', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
}
const inputSmall = {
  padding: '6px 10px', background: 'rgba(255,255,255,.05)',
  border: '1px solid rgba(255,255,255,.08)', borderRadius: 6,
  color: '#fff', fontSize: 12, outline: 'none', boxSizing: 'border-box',
}
const thStyle = {
  textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '.5px', color: 'rgba(255,255,255,.4)',
  borderBottom: '1px solid rgba(255,255,255,.06)',
}
const tdStyle = { padding: '10px 14px', fontSize: 13, color: 'rgba(255,255,255,.8)' }
const btnPrimary = {
  padding: '8px 18px', background: 'linear-gradient(135deg, #6366f1, #818cf8)',
  border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const btnSecondary = {
  padding: '8px 16px', background: 'rgba(255,255,255,.06)',
  border: '1px solid rgba(255,255,255,.1)', borderRadius: 8,
  color: 'rgba(255,255,255,.7)', fontSize: 13, cursor: 'pointer',
}
