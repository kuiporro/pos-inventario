import { useState, useRef, useCallback, useEffect } from 'react'
import toast from 'react-hot-toast'
import Modal from './Modal'
import { inventarioApi } from '../api'
import { formatCLP } from '../utils/formatCLP'

/* ════════════════════════════════════════════════════════════════
   MiniScanner — 2 modos: Cámara (BarcodeDetector / ZXing) y Celular
   ════════════════════════════════════════════════════════════════ */
const MOTORES = {
  NATIVO:  { icon: '⚡', label: 'Chrome/Vivaldi', desc: 'BarcodeDetector nativo — detecta en tiempo real' },
  CELULAR: { icon: '📱', label: 'Celular',         desc: 'Escanear con el celular vía red local' },
}

function MiniScanner({ onDetect, onCerrar }) {
  const videoRef       = useRef(null)
  const canvasRef      = useRef(null)
  const animRef        = useRef(null)
  const streamRef      = useRef(null)
  const detectRef      = useRef(false)
  const bridgePollRef  = useRef(null)

  const [motor,   setMotor]   = useState('NATIVO')
  const [activo,  setActivo]  = useState(false)
  const [estado,  setEstado]  = useState('idle')   // idle | iniciando | escaneando | esperando
  const [error,   setError]   = useState(null)
  const [bridgeId, setBridgeId] = useState(0)

  const nativeOk = 'BarcodeDetector' in window

  useEffect(() => {
    if (!nativeOk) setMotor('CELULAR')
  }, [nativeOk])

  // Cleanup al desmontar
  useEffect(() => () => detener(), [])

  const detener = useCallback(() => {
    if (animRef.current)       cancelAnimationFrame(animRef.current)
    if (bridgePollRef.current) clearInterval(bridgePollRef.current)
    if (streamRef.current)     streamRef.current.getTracks().forEach(t => t.stop())
    if (videoRef.current)      videoRef.current.srcObject = null
    animRef.current      = null
    bridgePollRef.current = null
    streamRef.current    = null
    setActivo(false)
    setEstado('idle')
  }, [])

  const despacharCodigo = useCallback((codigo, tipo = '') => {
    if (detectRef.current) return
    detectRef.current = true
    detener()
    onDetect(codigo, tipo)
    setTimeout(() => { detectRef.current = false }, 2000)
  }, [detener, onDetect])

  // ── Motor: BarcodeDetector nativo ─────────────────────────────
  const iniciarNativo = useCallback(async () => {
    setError(null); setEstado('iniciando')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      streamRef.current = stream
      videoRef.current.srcObject = stream
      await videoRef.current.play()

      const formats  = await BarcodeDetector.getSupportedFormats()
      const detector = new BarcodeDetector({ formats })
      const canvas   = canvasRef.current
      const ctx      = canvas.getContext('2d')
      setActivo(true); setEstado('escaneando')

      const tick = async () => {
        const v = videoRef.current
        if (v?.readyState >= 2 && !detectRef.current) {
          canvas.width = v.videoWidth; canvas.height = v.videoHeight
          ctx.drawImage(v, 0, 0)
          try {
            const barcodes = await detector.detect(canvas)
            if (barcodes.length > 0) {
              despacharCodigo(barcodes[0].rawValue, barcodes[0].format?.replace('_', '-'))
            }
          } catch (_) {}
        }
        animRef.current = requestAnimationFrame(tick)
      }
      animRef.current = requestAnimationFrame(tick)
    } catch (err) {
      setError(String(err).includes('NotAllowed')
        ? 'Permiso denegado — asegúrate de usar https://'
        : err?.message ?? String(err))
      setEstado('idle')
    }
  }, [despacharCodigo])

  // ── Motor: Celular bridge ──────────────────────────────────────
  const iniciarCelular = useCallback(() => {
    setError(null); setActivo(true); setEstado('esperando')
    let ultimoId = bridgeId

    bridgePollRef.current = setInterval(async () => {
      try {
        const { data } = await (await import('../api')).default.get(
          '/inventario/scan-bridge/', { params: { desde_id: ultimoId } }
        )
        if (data.scans?.length > 0) {
          const scan = data.scans[0]
          ultimoId = data.ultimo_id
          setBridgeId(data.ultimo_id)
          despacharCodigo(scan.codigo, scan.tipo ?? '')
        }
      } catch (_) {}
    }, 600)
  }, [bridgeId, despacharCodigo])

  const iniciar = () => {
    if (motor === 'NATIVO') iniciarNativo()
    else                    iniciarCelular()
  }

  const colorEstado = { idle: 'var(--color-text-dim)', iniciando: 'var(--color-warning)', escaneando: 'var(--color-success)', esperando: '#f59e0b' }[estado]

  return (
    <div style={{
      marginTop: 10,
      background: 'var(--color-surface-2)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius)',
      padding: 14,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>📷 Escáner de código</span>
        <button className="btn btn-ghost btn-sm" onClick={() => { detener(); onCerrar() }}>✕</button>
      </div>

      {/* Selector de motor */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {Object.entries(MOTORES).map(([key, m]) => {
          const disabled = key === 'NATIVO' && !nativeOk
          return (
            <button key={key} disabled={activo || disabled}
              className={`btn btn-sm ${motor === key ? 'btn-primary' : 'btn-ghost'}`}
              style={{ opacity: disabled ? 0.4 : 1 }}
              title={disabled ? 'Requiere Chrome o Vivaldi' : m.desc}
              onClick={() => setMotor(key)}>
              {m.icon} {m.label}
            </button>
          )
        })}
      </div>

      {/* Descripción */}
      <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', padding: '5px 10px',
        background: 'rgba(255,255,255,.03)', borderRadius: 'var(--radius-sm)', marginBottom: 12 }}>
        {MOTORES[motor].desc}
        {motor === 'CELULAR' && ' · Abre scanner-movil en el celular conectado a la misma red'}
      </div>

      {/* Error */}
      {error && (
        <div style={{ fontSize: 12, color: 'var(--color-danger)', padding: '8px 12px', marginBottom: 10,
          background: 'color-mix(in srgb, var(--color-danger) 10%, transparent)',
          borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-danger)' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Video (modo cámara) */}
      {motor === 'NATIVO' && (
        <div style={{ position: 'relative', borderRadius: 'var(--radius-sm)',
          overflow: 'hidden', background: '#000', minHeight: activo ? 180 : 0, transition: 'min-height .3s' }}>
          <video ref={videoRef} autoPlay playsInline muted
            style={{ width: '100%', maxHeight: 200, display: 'block', objectFit: 'cover' }} />
          {activo && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div style={{ width: '70%', height: '38%',
                border: '2px solid rgba(99,102,241,.9)', borderRadius: 6,
                boxShadow: '0 0 0 9999px rgba(0,0,0,.4)' }} />
            </div>
          )}
        </div>
      )}

      {/* Panel celular */}
      {motor === 'CELULAR' && activo && (
        <div style={{ textAlign: 'center', padding: '20px 10px',
          background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', marginBottom: 10 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📱</div>
          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Esperando escaneo del celular...</p>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Abre en el celular:</p>
          <code style={{ fontSize: 12, background: 'rgba(255,255,255,.06)',
            padding: '4px 10px', borderRadius: 6, display: 'block', marginTop: 6 }}>
            https://{window.location.hostname}:{window.location.port}/scanner-movil
          </code>
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b',
              animation: 'pulse 1.5s infinite', display: 'inline-block' }} />
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Escuchando cada 600ms...</span>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Controles */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
        <button className={`btn ${activo ? 'btn-danger' : 'btn-primary'} btn-sm`}
          style={{ flex: 1, justifyContent: 'center' }}
          onClick={() => activo ? detener() : iniciar()}>
          {activo ? '⏹ Detener' : `▶ Iniciar ${MOTORES[motor].icon}`}
        </button>
        {activo && (
          <span style={{ fontSize: 11, color: colorEstado, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: colorEstado,
              animation: 'pulse 1.5s infinite', display: 'inline-block' }} />
            {{ idle: 'Inactivo', iniciando: 'Iniciando...', escaneando: 'Escaneando...', esperando: 'Esperando celular...' }[estado]}
          </span>
        )}
      </div>

      {activo && motor === 'NATIVO' && (
        <p style={{ fontSize: 11, color: 'var(--color-text-dim)', marginTop: 8, textAlign: 'center' }}>
          Apunta al código → se detecta automáticamente
        </p>
      )}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }`}</style>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════
   ModalVariante
   ════════════════════════════════════════════════════════════════ */
export default function ModalVariante({ datos, onGuardar, onCerrar }) {
  const esEdicion = Boolean(datos?.id)
  const [varianteGuardadaId, setVarianteGuardadaId] = useState(datos?.id ?? null)
  const [codigos, setCodigos] = useState(datos?.codigos_barra ?? [])

  const [form, setForm] = useState({
    producto:     datos.productoId ?? datos.producto ?? '',
    nombre:       datos?.nombre       ?? '',
    precio_venta: datos?.precio_venta ?? '',
    precio_costo: datos?.precio_costo ?? '',
    activo:       datos?.activo       ?? true,
  })

  const [nuevoCodigo,    setNuevoCodigo]    = useState('')
  const [tipoCodigo,     setTipoCodigo]     = useState('EAN-13')
  const [cargando,       setCargando]       = useState(false)
  const [cargandoCod,    setCargandoCod]    = useState(false)
  const [guardada,       setGuardada]       = useState(esEdicion)
  const [mostrarScanner, setMostrarScanner] = useState(false)
  // Foto
  const [fotoPreview,    setFotoPreview]    = useState(datos?.foto_url ?? null)
  const [fotoFile,       setFotoFile]       = useState(null)
  const [subiendoFoto,   setSubiendoFoto]   = useState(false)
  const [fotobridge,     setFotobridge]     = useState(false)
  const fotoBridgePollRef = useRef(null)
  const fotoInputRef = useRef(null)

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.nombre.trim())   { toast.error('El nombre de variante es obligatorio'); return }
    if (!form.precio_venta)    { toast.error('El precio de venta es obligatorio'); return }
    if (isNaN(Number(form.precio_venta))) { toast.error('El precio debe ser un número'); return }

    setCargando(true)
    try {
      let id = varianteGuardadaId
      if (esEdicion || id) {
        await inventarioApi.actualizarVariante(id, form)
        toast.success('Variante actualizada')
      } else {
        const { data } = await inventarioApi.crearVariante(form)
        id = data.id
        setVarianteGuardadaId(id)
        setGuardada(true)
        toast.success('Variante creada ✅ — ahora puedes agregar códigos de barras')
      }
      // Subir foto si se seleccionó una
      if (fotoFile && id) {
        const fd = new FormData()
        fd.append('foto', fotoFile)
        await inventarioApi.actualizarVariante(id, fd)
        toast.success('📸 Foto guardada')
      }
    } catch (err) {
      toast.error(err.message)
    } finally {
      setCargando(false)
    }
  }

  /* ── Manejar selección de foto (file input) ── */
  const handleFotoChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 8 * 1024 * 1024) { toast.error('La foto no debe superar 8 MB'); return }
    setFotoFile(file)
    setFotoPreview(URL.createObjectURL(file))
  }

  /* ── Bridge foto: celular envía foto → PC la recibe ── */
  const iniciarFotoBridge = () => {
    setFotobridge(true)
    let checando = true
    const poll = async () => {
      try {
        const { data } = await (await import('../api')).default.get('/inventario/foto-bridge/')
        if (data.pendientes?.length > 0) {
          const fid = data.pendientes[0]
          const { data: fotoData } = await (await import('../api')).default.get(`/inventario/foto-bridge/${fid}/`)
          // Convertir base64 a File
          const res = await fetch(fotoData.imagen)
          const blob = await res.blob()
          const file = new File([blob], `foto-bridge-${fid}.jpg`, { type: blob.type })
          setFotoFile(file)
          setFotoPreview(fotoData.imagen)
          setFotobridge(false)
          clearInterval(fotoBridgePollRef.current)
          toast.success('📸 Foto recibida del celular')
        }
      } catch (_) {}
    }
    fotoBridgePollRef.current = setInterval(poll, 800)
  }

  const detenerFotoBridge = () => {
    setFotobridge(false)
    clearInterval(fotoBridgePollRef.current)
  }

  const handleCodigoEscaneado = (codigo, tipo = '') => {
    setNuevoCodigo(codigo)
    setMostrarScanner(false)
    toast.success(`📷 Detectado: ${codigo}`, { duration: 2000 })
    // Auto-detectar tipo
    const tipoNorm = tipo?.replace('_', '-').toUpperCase()
    if (['EAN-13','EAN-8','UPC-A','QR','CODE-128','CODE-39'].includes(tipoNorm)) {
      setTipoCodigo(tipoNorm); return
    }
    if (/^\d{13}$/.test(codigo))      setTipoCodigo('EAN-13')
    else if (/^\d{8}$/.test(codigo))  setTipoCodigo('EAN-8')
    else if (/^\d{12}$/.test(codigo)) setTipoCodigo('UPC-A')
    else                               setTipoCodigo('OTRO')
  }

  const agregarCodigo = async () => {
    if (!nuevoCodigo.trim()) { toast.error('Ingresa el código de barras'); return }
    if (!varianteGuardadaId) { toast.error('Primero guarda la variante'); return }
    setCargandoCod(true)
    try {
      const { data } = await inventarioApi.crearCodigo({
        variante:  varianteGuardadaId,
        codigo:    nuevoCodigo.trim(),
        tipo:      tipoCodigo,
        principal: codigos.length === 0,
      })
      setCodigos((prev) => [...prev, data])
      setNuevoCodigo('')
      toast.success(`Código ${data.codigo} agregado`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setCargandoCod(false)
    }
  }

  const eliminarCodigo = async (id) => {
    if (!confirm('¿Eliminar este código de barras?')) return
    try {
      await inventarioApi.eliminarCodigo(id)
      setCodigos((prev) => prev.filter((c) => c.id !== id))
      toast.success('Código eliminado')
    } catch (err) {
      toast.error(err.message)
    }
  }

  const titulo = esEdicion
    ? `Editar: ${datos.nombre}`
    : `Nueva variante — ${datos.productoNombre ?? ''}`

  return (
    <Modal titulo={titulo} onCerrar={() => { onGuardar(); onCerrar() }} ancho={560}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="input-group">
          <label className="input-label">Nombre de variante *</label>
          <input id="var-nombre" name="nombre" className="input" value={form.nombre}
            onChange={handleChange} placeholder="Ej: Rojo, Grande, Vainilla" required />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="input-group">
            <label className="input-label">Precio de venta (CLP) *</label>
            <input id="var-precio-venta" name="precio_venta" type="number" step="1" min="0"
              className="input" value={form.precio_venta} onChange={handleChange}
              placeholder="Ej: 5990" required />
            {form.precio_venta && (
              <span style={{ fontSize: 11, color: 'var(--color-success)', marginTop: 2 }}>
                {formatCLP(form.precio_venta)}
              </span>
            )}
          </div>
          <div className="input-group">
            <label className="input-label">Precio de costo (CLP)</label>
            <input id="var-precio-costo" name="precio_costo" type="number" step="1" min="0"
              className="input" value={form.precio_costo} onChange={handleChange}
              placeholder="Ej: 3000" />
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" name="activo" checked={form.activo} onChange={handleChange} />
          Variante activa
        </label>

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={onCerrar}>
            Cancelar
          </button>
          <button id="var-guardar-btn" type="submit" className="btn btn-primary"
            style={{ flex: 2, justifyContent: 'center' }} disabled={cargando}>
            {cargando ? <span className="spinner" /> : (esEdicion ? 'Guardar cambios' : 'Crear variante')}
          </button>
        </div>
      </form>

      {/* ── Sección códigos de barras ── */}
      <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--color-border)' }}>
        <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>🔖 Códigos de barras</p>

        {!guardada && (
          <div style={{
            background: 'color-mix(in srgb, var(--color-warning) 10%, transparent)',
            border: '1px solid var(--color-warning)', borderRadius: 'var(--radius-sm)',
            padding: '10px 14px', fontSize: 12.5, color: 'var(--color-warning)', marginBottom: 12,
          }}>
            ⚠️ Primero guarda la variante y luego podrás agregar códigos de barras.
          </div>
        )}

        {codigos.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {codigos.map((cb) => (
              <div key={cb.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '7px 0', borderBottom: '1px solid var(--color-border)', fontSize: 13,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <code style={{ fontSize: 13 }}>{cb.codigo}</code>
                  <span className="badge badge-muted">{cb.tipo}</span>
                  {cb.principal && <span className="badge badge-primary">Principal</span>}
                </div>
                <button className="btn btn-sm"
                  style={{ background: 'transparent', color: 'var(--color-danger)', padding: '2px 6px' }}
                  onClick={() => eliminarCodigo(cb.id)}>✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Input + botones */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input id="var-nuevo-codigo" className="input" style={{ flex: 1 }}
            placeholder={guardada ? 'Escanear o escribir código...' : 'Guarda primero la variante'}
            value={nuevoCodigo} disabled={!guardada}
            onChange={(e) => setNuevoCodigo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarCodigo() } }}
            autoComplete="off" />

          <button type="button" title="Escanear con cámara o celular"
            className={`btn btn-sm ${mostrarScanner ? 'btn-primary' : 'btn-ghost'}`}
            disabled={!guardada} onClick={() => setMostrarScanner(v => !v)}
            style={{ flexShrink: 0, padding: '0 12px' }}>
            📷
          </button>

          <select className="input" style={{ width: 110, flexShrink: 0 }}
            value={tipoCodigo} disabled={!guardada}
            onChange={(e) => setTipoCodigo(e.target.value)}>
            {['EAN-13','EAN-8','UPC-A','QR','INTERNO','OTRO'].map(t => <option key={t}>{t}</option>)}
          </select>

          <button id="var-agregar-codigo-btn" className="btn btn-ghost" style={{ flexShrink: 0 }}
            onClick={agregarCodigo} disabled={!guardada || cargandoCod}>
            {cargandoCod ? <span className="spinner" /> : '＋ Agregar'}
          </button>
        </div>

        {/* Mini-escáner */}
        {mostrarScanner && guardada && (
          <MiniScanner
            onDetect={handleCodigoEscaneado}
            onCerrar={() => setMostrarScanner(false)}
          />
        )}
      </div>

      {/* ── Sección de foto ── */}
      <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--color-border)' }}>
        <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>📸 Foto del producto</p>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Preview */}
          <div style={{
            width: 120, height: 120, borderRadius: 'var(--radius-sm)',
            border: '2px dashed var(--color-border)',
            background: 'var(--color-surface-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', flexShrink: 0,
          }}>
            {fotoPreview
              ? <img src={fotoPreview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 32 }}>🖼️</span>
            }
          </div>

          {/* Botones */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
            {/* Subir desde PC */}
            <input ref={fotoInputRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={handleFotoChange} />
            <button type="button" className="btn btn-ghost btn-sm"
              onClick={() => fotoInputRef.current.click()}>
              📁 Subir desde PC
            </button>

            {/* Capturar con cámara (funciona en celular) */}
            <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
              id="foto-capture-input" onChange={handleFotoChange} />
            <button type="button" className="btn btn-ghost btn-sm"
              onClick={() => document.getElementById('foto-capture-input').click()}>
              📷 Tomar foto (cámara)
            </button>

            {/* Bridge foto: celular → PC */}
            <button type="button"
              className={`btn btn-sm ${fotobridge ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => fotobridge ? detenerFotoBridge() : iniciarFotoBridge()}>
              {fotobridge ? '⏳ Esperando foto del celular...' : '📱 Enviar desde celular'}
            </button>

            {fotobridge && (
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                Abre en el celular: <strong>https://{window.location.hostname}:{window.location.port}/scanner-movil</strong>
                → modo Foto
              </p>
            )}

            {fotoPreview && (
              <button type="button" className="btn btn-ghost btn-sm"
                style={{ color: 'var(--color-danger)' }}
                onClick={() => { setFotoPreview(null); setFotoFile(null) }}>
                🗑 Quitar foto
              </button>
            )}

            <p style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>
              La foto se guarda al hacer click en "Guardar cambios"
            </p>
          </div>
        </div>
      </div>
    </Modal>
  )
}
