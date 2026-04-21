/**
 * Facturacion.jsx — Página principal de Facturación
 * 
 * Tabs: Facturas | Subir Factura (OCR) | Proveedores
 * - Lista de facturas con filtros (tipo, estado)
 * - Upload de documentos para OCR con drag-and-drop
 * - CRUD de proveedores
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { facturacionApi } from '../api'
import toast from 'react-hot-toast'

const TABS = [
  { key: 'facturas', icon: '🧾', label: 'Facturas' },
  { key: 'ocr', icon: '📷', label: 'Subir Factura (OCR)' },
  { key: 'proveedores', icon: '🏭', label: 'Proveedores' },
]

// ─── Formateo moneda CLP ──────────────────────────────────────────
const fmtCLP = (n) => {
  if (n == null) return '$0'
  return '$' + Number(n).toLocaleString('es-CL')
}

// ─── Componente principal ─────────────────────────────────────────
export default function Facturacion() {
  const [tab, setTab] = useState('facturas')

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>
        🧾 Facturación
      </h1>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 24,
        borderBottom: '1px solid rgba(255,255,255,.06)',
        paddingBottom: 0,
      }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '10px 20px',
              background: tab === t.key ? 'rgba(99,102,241,.15)' : 'transparent',
              border: 'none',
              borderBottom: tab === t.key ? '2px solid #818cf8' : '2px solid transparent',
              color: tab === t.key ? '#a5b4fc' : 'rgba(255,255,255,.5)',
              fontSize: 13,
              fontWeight: tab === t.key ? 600 : 400,
              cursor: 'pointer',
              transition: 'all .15s',
              borderRadius: '8px 8px 0 0',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'facturas' && <TabFacturas />}
      {tab === 'ocr' && <TabOCR />}
      {tab === 'proveedores' && <TabProveedores />}
    </div>
  )
}

// ─── Tab: Lista de Facturas ───────────────────────────────────────
function TabFacturas() {
  const [facturas, setFacturas] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (filtroTipo) params.tipo = filtroTipo
      if (filtroEstado) params.estado = filtroEstado
      const { data } = await facturacionApi.getFacturas(params)
      setFacturas(data.results || data || [])
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [filtroTipo, filtroEstado])

  useEffect(() => { cargar() }, [cargar])

  const confirmar = async (id) => {
    try {
      await facturacionApi.confirmarFactura(id)
      toast.success('Factura confirmada — stock actualizado')
      cargar()
    } catch (e) {
      toast.error(e.message)
    }
  }

  const anular = async (id) => {
    const motivo = prompt('Motivo de anulación:')
    if (!motivo) return
    try {
      await facturacionApi.anularFactura(id, motivo)
      toast.success('Factura anulada')
      cargar()
    } catch (e) {
      toast.error(e.message)
    }
  }

  const BADGE_COLORS = {
    BORRADOR: { bg: 'rgba(251,191,36,.15)', color: '#fbbf24' },
    CONFIRMADA: { bg: 'rgba(34,197,94,.15)', color: '#22c55e' },
    ANULADA: { bg: 'rgba(239,68,68,.15)', color: '#ef4444' },
  }

  return (
    <>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <select
          value={filtroTipo}
          onChange={e => setFiltroTipo(e.target.value)}
          style={selectStyle}
        >
          <option value="">Todos los tipos</option>
          <option value="COMPRA">Compra</option>
          <option value="VENTA">Venta</option>
        </select>
        <select
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
          style={selectStyle}
        >
          <option value="">Todos los estados</option>
          <option value="BORRADOR">Borrador</option>
          <option value="CONFIRMADA">Confirmada</option>
          <option value="ANULADA">Anulada</option>
        </select>
        <button onClick={cargar} style={btnSecondary}>🔄 Actualizar</button>
      </div>

      {/* Tabla */}
      <div style={cardStyle}>
        {loading ? (
          <p style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,.4)' }}>
            Cargando facturas...
          </p>
        ) : facturas.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,.4)' }}>
            No hay facturas registradas
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['N° Factura', 'Tipo', 'Proveedor', 'Total', 'Estado', 'Fecha', 'Acciones'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {facturas.map(f => {
                const badge = BADGE_COLORS[f.estado] || {}
                return (
                  <tr key={f.id} style={trStyle}>
                    <td style={tdStyle}>{f.numero_factura}</td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: f.tipo === 'COMPRA' ? 'rgba(59,130,246,.15)' : 'rgba(168,85,247,.15)',
                        color: f.tipo === 'COMPRA' ? '#60a5fa' : '#c084fc',
                      }}>
                        {f.tipo_display || f.tipo}
                      </span>
                    </td>
                    <td style={tdStyle}>{f.proveedor_nombre || '—'}</td>
                    <td style={{ ...tdStyle, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {fmtCLP(f.total)}
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: badge.bg, color: badge.color,
                      }}>
                        {f.estado_display || f.estado}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontSize: 12, color: 'rgba(255,255,255,.5)' }}>
                      {new Date(f.fecha).toLocaleDateString('es-CL')}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {f.estado === 'BORRADOR' && (
                          <button onClick={() => confirmar(f.id)} style={btnMini}>
                            ✅ Confirmar
                          </button>
                        )}
                        {f.estado !== 'ANULADA' && (
                          <button onClick={() => anular(f.id)} style={{ ...btnMini, color: '#f87171' }}>
                            ❌ Anular
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

// ─── Tab: OCR Upload ──────────────────────────────────────────────
function TabOCR() {
  const navigate = useNavigate()
  const fileRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [historial, setHistorial] = useState([])
  const [showQR, setShowQR] = useState(false)

  // Importar QRCodeSVG dinámicamente
  const [QRCodeSVG, setQRCodeSVG] = useState(null)
  useEffect(() => {
    import('qrcode.react').then(mod => {
      setQRCodeSVG(() => mod.QRCodeSVG)
    }).catch(() => {})
  }, [])

  // URL para QR: incluye token de auth para que el celular no necesite login
  const token = localStorage.getItem('pos_token') || ''
  const qrUrl = `${window.location.origin}/ocr-movil?token=${encodeURIComponent(token)}`

  // Polling para recargar historial cuando llegan fotos del celular
  useEffect(() => {
    const cargarHistorial = () => {
      facturacionApi.getOCRHistorial()
        .then(({ data }) => setHistorial(data.results || []))
        .catch(() => {})
    }
    cargarHistorial()
    // Polling cada 5s cuando QR está visible (esperando fotos del celular)
    const timer = setInterval(cargarHistorial, showQR ? 5000 : 30000)
    return () => clearInterval(timer)
  }, [showQR])

  const handleUpload = async (file) => {
    if (!file) return
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
    if (!allowed.includes(file.type) && !file.name.match(/\.(pdf|jpg|jpeg|png)$/i)) {
      toast.error('Formato no soportado. Use PDF, JPG o PNG.')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error('Archivo demasiado grande. Máximo 20MB.')
      return
    }

    setUploading(true)
    const formData = new FormData()
    formData.append('archivo', file)
    try {
      const { data } = await facturacionApi.subirDocumento(formData)
      toast.success('Documento subido. Procesando OCR...')
      navigate(`/facturacion/ocr/${data.id}`)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setUploading(false)
    }
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer?.files?.[0]
    handleUpload(file)
  }

  const ESTADO_ICONS = {
    PENDIENTE: '⏳',
    PROCESANDO: '⚙️',
    PROCESADO: '✅',
    CONFIRMADO: '📋',
    ERROR: '❌',
  }

  return (
    <>
      {/* Upload + QR side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, marginBottom: 28 }}>
        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? '#818cf8' : 'rgba(255,255,255,.12)'}`,
            borderRadius: 16,
            padding: '48px 24px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragging ? 'rgba(99,102,241,.08)' : 'rgba(255,255,255,.02)',
            transition: 'all .2s',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            style={{ display: 'none' }}
            onChange={e => handleUpload(e.target.files[0])}
          />
          {uploading ? (
            <>
              <div style={{ fontSize: 36, marginBottom: 12 }}>⚙️</div>
              <p style={{ color: '#a5b4fc', fontWeight: 600 }}>Subiendo y procesando...</p>
            </>
          ) : (
            <>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📄</div>
              <p style={{ color: 'rgba(255,255,255,.7)', fontSize: 15, fontWeight: 500 }}>
                Arrastra una factura aquí o haz clic
              </p>
              <p style={{ color: 'rgba(255,255,255,.35)', fontSize: 12, marginTop: 8 }}>
                PDF, JPG o PNG — Máximo 20MB
              </p>
            </>
          )}
        </div>

        {/* QR para celular */}
        <div style={{
          background: 'rgba(255,255,255,.03)',
          border: '1px solid rgba(255,255,255,.08)',
          borderRadius: 16,
          padding: '24px 20px',
          textAlign: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 12,
        }}>
          <div style={{ fontSize: 28 }}>📱</div>
          <p style={{ fontWeight: 600, fontSize: 14, color: 'rgba(255,255,255,.85)' }}>
            Capturar desde celular
          </p>

          {showQR ? (
            <>
              <div style={{
                background: '#fff',
                borderRadius: 12,
                padding: 12,
                display: 'inline-block',
              }}>
                {QRCodeSVG ? (
                  <QRCodeSVG
                    value={qrUrl}
                    size={160}
                    level="M"
                    bgColor="#ffffff"
                    fgColor="#1a1d27"
                  />
                ) : (
                  <div style={{ width: 160, height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: 12 }}>
                    Cargando QR...
                  </div>
                )}
              </div>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', lineHeight: 1.5 }}>
                Escanea este QR con tu celular.<br />
                Se abrirá la cámara para tomar foto de la factura.
              </p>
              <div style={{
                width: '100%', padding: '6px 10px',
                background: 'rgba(34,197,94,.08)',
                border: '1px solid rgba(34,197,94,.15)',
                borderRadius: 8,
                fontSize: 11, color: '#22c55e',
                animation: 'pulse 2s infinite',
              }}>
                🟢 Esperando foto del celular...
              </div>
              <button
                onClick={() => setShowQR(false)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(255,255,255,.4)', fontSize: 11, textDecoration: 'underline',
                }}
              >
                Ocultar QR
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', lineHeight: 1.5 }}>
                Genera un código QR para abrir la cámara de tu celular y capturar facturas
              </p>
              <button
                onClick={() => setShowQR(true)}
                style={{
                  padding: '10px 22px',
                  background: 'linear-gradient(135deg, #6366f1, #818cf8)',
                  border: 'none',
                  borderRadius: 10,
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                📲 Mostrar código QR
              </button>
            </>
          )}
        </div>
      </div>

      {/* Historial OCR */}
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: 'rgba(255,255,255,.7)' }}>
        Historial de procesamiento
      </h3>
      <div style={cardStyle}>
        {historial.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 32, color: 'rgba(255,255,255,.4)' }}>
            No hay documentos procesados
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Archivo', 'Tipo', 'Estado', 'Confianza', 'Fecha', ''].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {historial.map(h => (
                <tr key={h.id} style={trStyle}>
                  <td style={tdStyle}>{h.nombre_archivo}</td>
                  <td style={tdStyle}>{h.tipo_archivo}</td>
                  <td style={tdStyle}>
                    {ESTADO_ICONS[h.estado] || '❓'} {h.estado_display || h.estado}
                  </td>
                  <td style={tdStyle}>
                    <div style={{
                      width: 60, height: 6, background: 'rgba(255,255,255,.08)',
                      borderRadius: 3, overflow: 'hidden', display: 'inline-block',
                      verticalAlign: 'middle', marginRight: 8,
                    }}>
                      <div style={{
                        width: `${h.confianza_global}%`, height: '100%',
                        background: h.confianza_global > 70 ? '#22c55e' : h.confianza_global > 40 ? '#fbbf24' : '#ef4444',
                        borderRadius: 3,
                      }} />
                    </div>
                    <span style={{ fontSize: 12 }}>{h.confianza_global}%</span>
                  </td>
                  <td style={{ ...tdStyle, fontSize: 12, color: 'rgba(255,255,255,.5)' }}>
                    {new Date(h.creado_en).toLocaleDateString('es-CL')}
                  </td>
                  <td style={tdStyle}>
                    {h.estado === 'PROCESADO' && (
                      <button
                        onClick={() => navigate(`/facturacion/ocr/${h.id}`)}
                        style={btnMini}
                      >
                        👁 Revisar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

// ─── Tab: Proveedores ─────────────────────────────────────────────
function TabProveedores() {
  const [proveedores, setProveedores] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nombre: '', rut: '', telefono: '', email: '' })

  const cargar = async () => {
    setLoading(true)
    try {
      const { data } = await facturacionApi.getProveedores()
      setProveedores(data.results || data || [])
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [])

  const guardar = async () => {
    if (!form.nombre.trim()) return toast.error('Ingrese el nombre del proveedor')
    try {
      await facturacionApi.crearProveedor(form)
      toast.success('Proveedor creado')
      setForm({ nombre: '', rut: '', telefono: '', email: '' })
      setShowForm(false)
      cargar()
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ color: 'rgba(255,255,255,.5)', fontSize: 13 }}>
          {proveedores.length} proveedores registrados
        </span>
        <button onClick={() => setShowForm(!showForm)} style={btnPrimary}>
          ➕ Nuevo proveedor
        </button>
      </div>

      {showForm && (
        <div style={{ ...cardStyle, marginBottom: 16, padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <input
              placeholder="Nombre / Razón Social *"
              value={form.nombre}
              onChange={e => setForm({ ...form, nombre: e.target.value })}
              style={inputStyle}
            />
            <input
              placeholder="RUT (ej: 76.123.456-7)"
              value={form.rut}
              onChange={e => setForm({ ...form, rut: e.target.value })}
              style={inputStyle}
            />
            <input
              placeholder="Teléfono"
              value={form.telefono}
              onChange={e => setForm({ ...form, telefono: e.target.value })}
              style={inputStyle}
            />
            <input
              placeholder="Email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowForm(false)} style={btnSecondary}>Cancelar</button>
            <button onClick={guardar} style={btnPrimary}>Guardar</button>
          </div>
        </div>
      )}

      <div style={cardStyle}>
        {loading ? (
          <p style={{ textAlign: 'center', padding: 32, color: 'rgba(255,255,255,.4)' }}>Cargando...</p>
        ) : proveedores.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 32, color: 'rgba(255,255,255,.4)' }}>
            No hay proveedores registrados
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Nombre', 'RUT', 'Teléfono', 'Email', 'Activo'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {proveedores.map(p => (
                <tr key={p.id} style={trStyle}>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{p.nombre}</td>
                  <td style={tdStyle}>{p.rut || '—'}</td>
                  <td style={tdStyle}>{p.telefono || '—'}</td>
                  <td style={tdStyle}>{p.email || '—'}</td>
                  <td style={tdStyle}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 6, fontSize: 11,
                      background: p.activo ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)',
                      color: p.activo ? '#22c55e' : '#ef4444',
                    }}>
                      {p.activo ? 'Sí' : 'No'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

// ─── Estilos compartidos ──────────────────────────────────────────
const cardStyle = {
  background: 'rgba(255,255,255,.03)',
  border: '1px solid rgba(255,255,255,.06)',
  borderRadius: 12,
  overflow: 'hidden',
}

const thStyle = {
  textAlign: 'left',
  padding: '10px 14px',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '.5px',
  color: 'rgba(255,255,255,.4)',
  borderBottom: '1px solid rgba(255,255,255,.06)',
}

const tdStyle = {
  padding: '10px 14px',
  fontSize: 13,
  color: 'rgba(255,255,255,.8)',
}

const trStyle = {
  borderBottom: '1px solid rgba(255,255,255,.04)',
  transition: 'background .1s',
}

const selectStyle = {
  padding: '8px 12px',
  background: 'rgba(255,255,255,.05)',
  border: '1px solid rgba(255,255,255,.1)',
  borderRadius: 8,
  color: '#fff',
  fontSize: 13,
  outline: 'none',
}

const inputStyle = {
  padding: '10px 14px',
  background: 'rgba(255,255,255,.05)',
  border: '1px solid rgba(255,255,255,.1)',
  borderRadius: 8,
  color: '#fff',
  fontSize: 13,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

const btnPrimary = {
  padding: '8px 18px',
  background: 'linear-gradient(135deg, #6366f1, #818cf8)',
  border: 'none',
  borderRadius: 8,
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}

const btnSecondary = {
  padding: '8px 16px',
  background: 'rgba(255,255,255,.06)',
  border: '1px solid rgba(255,255,255,.1)',
  borderRadius: 8,
  color: 'rgba(255,255,255,.7)',
  fontSize: 13,
  cursor: 'pointer',
}

const btnMini = {
  padding: '4px 10px',
  background: 'rgba(99,102,241,.12)',
  border: '1px solid rgba(99,102,241,.2)',
  borderRadius: 6,
  color: '#a5b4fc',
  fontSize: 11,
  fontWeight: 500,
  cursor: 'pointer',
}
