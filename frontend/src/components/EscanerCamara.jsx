/**
 * EscanerCamara.jsx — Motor triple:
 *
 * 1. BarcodeDetector  → API nativa de Chrome/Edge (hardware acelerada, la más rápida)
 * 2. ZXing            → librería JS (@zxing/browser), mejor fallback para Firefox/Safari
 * 3. Backend pyzbar   → Django endpoint, más lento pero 100% confiable en cualquier cámara
 *
 * El componente detecta automáticamente qué está disponible y muestra
 * un selector para forzar un motor específico.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import api from '../api'

const ENGINE = {
  NATIVE:  'native',   // BarcodeDetector API
  ZXING:   'zxing',    // @zxing/browser
  BACKEND: 'backend',  // pyzbar vía Django
}

const ENGINE_LABELS = {
  [ENGINE.NATIVE]:  '⚡ Chrome nativo',
  [ENGINE.ZXING]:   '📦 ZXing JS',
  [ENGINE.BACKEND]: '🐍 Python (pyzbar)',
}

// Formatos soportados por BarcodeDetector
const BARCODE_FORMATS = [
  'ean_13','ean_8','upc_a','upc_e',
  'code_128','code_39','code_93',
  'qr_code','data_matrix','itf',
]

export default function EscanerCamara({ onDetect }) {
  const videoRef     = useRef(null)
  const canvasRef    = useRef(null)
  const streamRef    = useRef(null)      // MediaStream activo
  const animFrameRef = useRef(null)      // requestAnimationFrame handle
  const zxingRef     = useRef(null)      // referencia al lector ZXing
  const detectRef    = useRef(false)     // debounce: evita detecciones dobles
  const backendRef   = useRef(null)      // interval del modo backend

  const [activo,       setActivo]       = useState(false)
  const [motor,        setMotor]        = useState(ENGINE.NATIVE)
  const [motorUsado,   setMotorUsado]   = useState(null)
  const [camaras,      setCamaras]      = useState([])
  const [camaraId,     setCamaraId]     = useState(null)
  const [estado,       setEstado]       = useState('inactivo') // inactivo | iniciando | escaneando | error
  const [errorMsg,     setErrorMsg]     = useState(null)
  const [ultimoCodigo, setUltimoCodigo] = useState(null)
  const [nativeOk,     setNativeOk]     = useState(false)
  const [fps,          setFps]          = useState(0)
  const fpsCounterRef = useRef(0)

  // ── Verificar soporte nativo al montar ──────────────────────────
  useEffect(() => {
    const ok = 'BarcodeDetector' in window
    setNativeOk(ok)
    setMotor(ok ? ENGINE.NATIVE : ENGINE.ZXING)
  }, [])

  // ── Listar cámaras ──────────────────────────────────────────────
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices()
      .then((devices) => {
        const cams = devices.filter((d) => d.kind === 'videoinput')
        setCamaras(cams)
        if (cams.length > 0) {
          const trasera = cams.find((d) => /back|rear|trasera|environment/i.test(d.label))
          setCamaraId(trasera?.deviceId ?? cams[0].deviceId)
        }
      })
      .catch(() => {})
  }, [])

  // ── Obtener stream de cámara ────────────────────────────────────
  const getStream = useCallback(async (devId) => {
    const constraints = {
      video: {
        deviceId: devId ? { exact: devId } : undefined,
        facingMode: devId ? undefined : 'environment',
        width:  { ideal: 1280 },
        height: { ideal: 720 },
      }
    }
    return navigator.mediaDevices.getUserMedia(constraints)
  }, [])

  // ── Detener todo ─────────────────────────────────────────────────
  const detener = useCallback(async () => {
    // Cancel animation loop (native/backend)
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    // Stop backend polling
    if (backendRef.current) {
      clearInterval(backendRef.current)
      backendRef.current = null
    }
    // Stop ZXing
    if (zxingRef.current) {
      try { zxingRef.current.reset() } catch (_) {}
      zxingRef.current = null
    }
    // Stop camera stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setActivo(false)
    setEstado('inactivo')
    setMotorUsado(null)
    setFps(0)
  }, [])

  // ── Disparar detección (con debounce 1.5s) ──────────────────────
  const disparar = useCallback((codigo, motorNombre) => {
    if (detectRef.current) return
    detectRef.current = true
    setUltimoCodigo(codigo)
    onDetect(codigo)
    setTimeout(() => { detectRef.current = false }, 1500)
  }, [onDetect])

  // ════════════════════════════════════════════════════════════════
  // MOTOR 1: BarcodeDetector nativo
  // ════════════════════════════════════════════════════════════════
  const iniciarNativo = useCallback(async (stream) => {
    let detector
    try {
      const formatsDisp = await BarcodeDetector.getSupportedFormats()
      const formato     = BARCODE_FORMATS.filter((f) => formatsDisp.includes(f))
      detector          = new BarcodeDetector({ formats: formato.length ? formato : ['ean_13'] })
    } catch {
      detector = new BarcodeDetector()
    }

    const video  = videoRef.current
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d', { willReadFrequently: true })
    let lastFpsTime = Date.now()

    const tick = async () => {
      if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
        canvas.width  = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0)

        try {
          const barcodes = await detector.detect(canvas)
          if (barcodes.length > 0) {
            disparar(barcodes[0].rawValue, ENGINE.NATIVE)
          }
        } catch (_) {}

        // FPS counter
        fpsCounterRef.current++
        const now = Date.now()
        if (now - lastFpsTime >= 1000) {
          setFps(fpsCounterRef.current)
          fpsCounterRef.current = 0
          lastFpsTime = now
        }
      }
      animFrameRef.current = requestAnimationFrame(tick)
    }

    setMotorUsado(ENGINE.NATIVE)
    setEstado('escaneando')
    animFrameRef.current = requestAnimationFrame(tick)
  }, [disparar])

  // ════════════════════════════════════════════════════════════════
  // MOTOR 2: ZXing Browser
  // ════════════════════════════════════════════════════════════════
  const iniciarZXing = useCallback(async (devId) => {
    const { BrowserMultiFormatReader } = await import('@zxing/browser')
    const reader = new BrowserMultiFormatReader()
    zxingRef.current = reader

    await reader.decodeFromVideoDevice(
      devId || undefined,
      videoRef.current,
      (result, err) => {
        if (result) disparar(result.getText(), ENGINE.ZXING)
      }
    )
    setMotorUsado(ENGINE.ZXING)
    setEstado('escaneando')
  }, [disparar])

  // ════════════════════════════════════════════════════════════════
  // MOTOR 3: Backend pyzbar (captura frame → POST → Django)
  // ════════════════════════════════════════════════════════════════
  const iniciarBackend = useCallback((stream) => {
    const video  = videoRef.current
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    let corriendo = true
    let enProceso = false

    const capturar = async () => {
      if (enProceso || !corriendo || video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) return
      enProceso = true

      canvas.width  = video.videoWidth
      canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0)
      const imageData = canvas.toDataURL('image/jpeg', 0.75)

      try {
        const { data } = await api.post('/inventario/decodificar-imagen/', { imagen: imageData })
        if (data.codigo) disparar(data.codigo, ENGINE.BACKEND)
      } catch (_) {
        // 404 = no detectó nada (normal), ignorar. Otro error = problema real.
      } finally {
        enProceso = false
      }
    }

    // Cada 500ms captura y envía un frame al backend
    backendRef.current = setInterval(capturar, 500)

    // Cleanup al destruir
    return () => { corriendo = false }
  }, [disparar])

  // ════════════════════════════════════════════════════════════════
  // INICIAR escáner con el motor seleccionado
  // ════════════════════════════════════════════════════════════════
  const iniciar = useCallback(async (motorSeleccionado, devId) => {
    setEstado('iniciando')
    setErrorMsg(null)

    // ZXing maneja su propio stream; native y backend necesitan uno
    const necesitaStream = motorSeleccionado !== ENGINE.ZXING

    try {
      if (necesitaStream) {
        const stream = await getStream(devId)
        streamRef.current = stream
        videoRef.current.srcObject = stream
        await videoRef.current.play()

        if (motorSeleccionado === ENGINE.NATIVE) {
          await iniciarNativo(stream)
        } else {
          iniciarBackend(stream)
          setMotorUsado(ENGINE.BACKEND)
          setEstado('escaneando')
        }
      } else {
        await iniciarZXing(devId)
      }

      setActivo(true)
    } catch (err) {
      const msg = String(err)
      if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
        setErrorMsg('Permiso de cámara denegado. Accede desde https:// o acepta el permiso en el navegador.')
      } else {
        setErrorMsg(`Error al iniciar: ${err?.message ?? err}`)
      }
      setEstado('error')
      await detener()
    }
  }, [getStream, iniciarNativo, iniciarZXing, iniciarBackend, detener])

  // Cleanup al desmontar
  useEffect(() => () => { detener() }, [detener])

  // ── UI ──────────────────────────────────────────────────────────
  const colorEstado = {
    inactivo:   'var(--color-text-dim)',
    iniciando:  'var(--color-warning)',
    escaneando: 'var(--color-success)',
    error:      'var(--color-danger)',
  }[estado] || 'var(--color-text-dim)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Selector de motor ── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)', marginRight: 2 }}>Motor:</span>
        {Object.entries(ENGINE_LABELS).map(([key, label]) => {
          const deshabilitado = key === ENGINE.NATIVE && !nativeOk
          return (
            <button
              key={key}
              className={`btn btn-sm ${motor === key && !deshabilitado ? 'btn-primary' : 'btn-ghost'}`}
              style={{ opacity: deshabilitado ? 0.4 : 1 }}
              disabled={deshabilitado || activo}
              title={deshabilitado ? 'No disponible en este navegador' : ''}
              onClick={() => setMotor(key)}
            >
              {label}
              {deshabilitado && ' ✗'}
            </button>
          )
        })}
      </div>

      {/* ── Info del motor ── */}
      {motor === ENGINE.NATIVE && (
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', padding: '6px 10px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-sm)' }}>
          ⚡ <strong>BarcodeDetector nativo</strong> — Acelerado por hardware. Detecta EAN-13, Code128, QR en tiempo real.
        </div>
      )}
      {motor === ENGINE.ZXING && (
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', padding: '6px 10px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-sm)' }}>
          📦 <strong>ZXing JS</strong> — Librería JavaScript pura. Compatible con Firefox, Safari y Vivaldi.
        </div>
      )}
      {motor === ENGINE.BACKEND && (
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', padding: '6px 10px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-sm)' }}>
          🐍 <strong>Python/pyzbar</strong> — Captura frames y los envía al servidor. ~500ms de latencia. Más confiable en cámaras de baja calidad.
        </div>
      )}

      {/* ── Controles ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Selector de cámara */}
        {camaras.length > 1 && !activo && (
          <select
            className="input"
            style={{ flex: 1, maxWidth: 220, fontSize: 12.5 }}
            value={camaraId ?? ''}
            onChange={(e) => setCamaraId(e.target.value)}
          >
            {camaras.map((c) => (
              <option key={c.deviceId} value={c.deviceId}>
                {c.label || `Cámara ${c.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
        )}

        <button
          id="scanner-toggle-btn"
          className={`btn ${activo ? 'btn-danger' : 'btn-primary'}`}
          onClick={() => activo ? detener() : iniciar(motor, camaraId)}
        >
          {activo ? '⏹ Detener' : `▶ Iniciar ${ENGINE_LABELS[motor]}`}
        </button>

        {/* Estado */}
        <span style={{ fontSize: 12, color: colorEstado, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: colorEstado, display: 'inline-block',
            animation: estado === 'escaneando' ? 'pulse 1.5s infinite' : 'none',
          }} />
          {estado.charAt(0).toUpperCase() + estado.slice(1)}
          {motorUsado && estado === 'escaneando' && (
            <span style={{ color: 'var(--color-text-dim)' }}>· {ENGINE_LABELS[motorUsado]}</span>
          )}
          {fps > 0 && <span style={{ color: 'var(--color-text-dim)' }}>· {fps} fps</span>}
        </span>
      </div>

      {/* ── Error ── */}
      {errorMsg && (
        <div style={{
          background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)',
          border: '1px solid var(--color-danger)',
          borderRadius: 'var(--radius-sm)',
          padding: '10px 14px',
          fontSize: 13, color: 'var(--color-danger)',
        }}>
          ⚠️ {errorMsg}
        </div>
      )}

      {/* ── Video ── */}
      <div style={{
        position: 'relative',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        background: '#000',
        minHeight: activo ? 260 : 0,
        transition: 'min-height .3s ease',
      }}>
        <video
          ref={videoRef}
          id="scanner-video"
          autoPlay
          playsInline
          muted
          style={{ width: '100%', display: 'block', maxHeight: 360 }}
        />
        {/* Guía visual de encuadre */}
        {activo && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <div style={{
              width: 260, height: 120,
              border: '2px solid rgba(99,102,241,.8)',
              borderRadius: 8,
              boxShadow: '0 0 0 9999px rgba(0,0,0,.35)',
            }} />
          </div>
        )}
      </div>

      {/* Canvas oculto para captura de frame */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* ── Último código detectado ── */}
      {ultimoCodigo && (
        <div style={{
          background: 'color-mix(in srgb, var(--color-success) 12%, transparent)',
          border: '1px solid var(--color-success)',
          borderRadius: 'var(--radius-sm)',
          padding: '10px 14px',
          fontSize: 13,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>✅ Detectado: <strong>{ultimoCodigo}</strong></span>
          <button
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 11 }}
            onClick={() => setUltimoCodigo(null)}
          >✕</button>
        </div>
      )}

      {activo && (
        <p style={{ fontSize: 11.5, color: 'var(--color-text-dim)', textAlign: 'center' }}>
          Encuadra el código de barras dentro del recuadro morado
        </p>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1 }
          50%       { opacity: .4 }
        }
      `}</style>
    </div>
  )
}
