/**
 * ScannerMovil.jsx — Página para el celular como escáner remoto Y enviador de fotos
 */
import { useState, useEffect, useRef } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import api from '../api'

export default function ScannerMovil() {
  const videoRef      = useRef(null)
  const canvasRef     = useRef(null)
  const animRef       = useRef(null)
  const detectRef     = useRef(false)
  const streamRef     = useRef(null)

  const [modo,       setModo]       = useState('escanear') // 'escanear' | 'foto'
  const [activo,     setActivo]     = useState(false)
  const [historial,  setHistorial]  = useState([])
  const [nativeOk,   setNativeOk]   = useState(false)
  const [enviando,   setEnviando]   = useState(false)
  const [manualCod,  setManualCod]  = useState('')

  // Modo foto
  const [fotoPreview,  setFotoPreview]  = useState(null)
  const [enviandoFoto, setEnviandoFoto] = useState(false)
  const fotoInputRef = useRef(null)

  useEffect(() => { setNativeOk('BarcodeDetector' in window) }, [])

  const iniciar = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      })
      streamRef.current = stream
      videoRef.current.srcObject = stream
      await videoRef.current.play()

      const formatsDisp = await BarcodeDetector.getSupportedFormats()
      const FORMATOS = ['ean_13','ean_8','upc_a','upc_e','code_128','code_39','qr_code']
      const detector  = new BarcodeDetector({
        formats: FORMATOS.filter(f => formatsDisp.includes(f))
      })

      const canvas = canvasRef.current
      const ctx    = canvas.getContext('2d')

      const tick = async () => {
        const v = videoRef.current
        if (v?.readyState >= 2) {
          canvas.width  = v.videoWidth
          canvas.height = v.videoHeight
          ctx.drawImage(v, 0, 0)
          try {
            const barcodes = await detector.detect(canvas)
            if (barcodes.length > 0 && !detectRef.current) {
              detectRef.current = true
              await enviarCodigo(barcodes[0].rawValue, barcodes[0].format)
              setTimeout(() => { detectRef.current = false }, 2000)
            }
          } catch (_) {}
        }
        animRef.current = requestAnimationFrame(tick)
      }
      animRef.current = requestAnimationFrame(tick)
      setActivo(true)
    } catch (err) {
      toast.error('No se pudo acceder a la cámara. Asegúrate de usar https://')
    }
  }

  const detener = () => {
    if (animRef.current)   cancelAnimationFrame(animRef.current)
    if (streamRef.current)  streamRef.current.getTracks().forEach(t => t.stop())
    if (videoRef.current)   videoRef.current.srcObject = null
    animRef.current   = null
    streamRef.current = null
    setActivo(false)
  }

  useEffect(() => () => detener(), [])

  const enviarCodigo = async (codigo, tipo = 'MANUAL') => {
    if (!codigo.trim()) return
    setEnviando(true)
    try {
      await api.post('/inventario/scan-bridge/', {
        codigo: codigo.trim(),
        tipo:   String(tipo).replace('_', '-'),
      })
      setHistorial(prev => [{ codigo: codigo.trim(), tipo, ts: new Date().toLocaleTimeString('es-CL') }, ...prev].slice(0, 15))
      navigator.vibrate?.([50, 30, 50])
      toast.success(`✅ Enviado al PC: ${codigo}`, { duration: 1500 })
    } catch {
      toast.error('Error al enviar. ¿Está el PC encendido?')
    } finally {
      setEnviando(false)
      setManualCod('')
    }
  }

  // ── Modo foto ─────────────────────────────────────────────────
  const handleFotoSelect = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFotoPreview(URL.createObjectURL(f))
    enviarFoto(f)
  }

  const enviarFoto = async (file) => {
    setEnviandoFoto(true)
    try {
      const reader = new FileReader()
      reader.onload = async (ev) => {
        try {
          await api.post('/inventario/foto-bridge/', { imagen: ev.target.result })
          navigator.vibrate?.([80])
          toast.success('📸 Foto enviada al PC ✅', { duration: 2500 })
        } catch {
          toast.error('Error al enviar la foto')
        } finally {
          setEnviandoFoto(false)
        }
      }
      reader.readAsDataURL(file)
    } catch {
      toast.error('Error al leer la foto')
      setEnviandoFoto(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--color-bg)',
      display: 'flex', flexDirection: 'column',
      padding: 16, gap: 16, maxWidth: 480, margin: '0 auto',
    }}>
      <Toaster position="top-center" />

      {/* Header */}
      <div style={{ textAlign: 'center', paddingTop: 8 }}>
        <div style={{ fontSize: 36, marginBottom: 4 }}>📱</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Escáner Remoto</h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
          {modo === 'escanear' ? 'Lo que escanees aparece automáticamente en el PC' : 'Toma una foto y el PC la recibe al instante'}
        </p>
      </div>

      {/* Tabs modo */}
      <div style={{ display: 'flex', background: 'var(--color-surface-2)', borderRadius: 'var(--radius)', padding: 4, gap: 4 }}>
        {[{ k: 'escanear', label: '🔖 Escanear código' }, { k: 'foto', label: '📸 Enviar foto' }].map(t => (
          <button key={t.k}
            className={`btn btn-sm ${modo === t.k ? 'btn-primary' : 'btn-ghost'}`}
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={() => { setModo(t.k); if (activo) detener() }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Modo escanear ── */}
      {modo === 'escanear' && (
        <>
          {!nativeOk && (
            <div style={{ background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius)', padding: '12px 16px', fontSize: 13, color: 'var(--color-danger)' }}>
              ⚠️ Tu navegador no soporta BarcodeDetector. Usa <strong>Chrome para Android</strong>.
            </div>
          )}
          <div style={{ position: 'relative', borderRadius: 'var(--radius)', overflow: 'hidden', background: '#000', aspectRatio: '4/3' }}>
            <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            {activo && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ width: '75%', height: '35%', border: '3px solid rgba(99,102,241,.9)', borderRadius: 10, boxShadow: '0 0 0 9999px rgba(0,0,0,.45)' }} />
              </div>
            )}
            {enviando && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(16,185,129,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>📡</div>
            )}
            <canvas ref={canvasRef} style={{ display: 'none' }} />
          </div>

          <button className={`btn ${activo ? 'btn-danger' : 'btn-primary'} btn-lg`}
            style={{ width: '100%', justifyContent: 'center', fontSize: 16, padding: '14px' }}
            onClick={() => activo ? detener() : iniciar()} disabled={!nativeOk}>
            {activo ? '⏹ Detener cámara' : '📷 Iniciar escaneo'}
          </button>

          <div className="card" style={{ padding: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Código manual</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" placeholder="Escribe o pega un código..."
                value={manualCod} onChange={e => setManualCod(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && enviarCodigo(manualCod, 'MANUAL')} />
              <button className="btn btn-ghost" onClick={() => enviarCodigo(manualCod, 'MANUAL')}
                disabled={enviando || !manualCod.trim()}>
                {enviando ? <span className="spinner" /> : '📡 Enviar'}
              </button>
            </div>
          </div>

          {historial.length > 0 && (
            <div className="card" style={{ padding: 14 }}>
              <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Últimos enviados al PC</p>
              {historial.map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-border)', fontSize: 13 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-success)', display: 'inline-block' }} />
                    <code style={{ fontSize: 13 }}>{s.codigo}</code>
                    <span className="badge badge-muted" style={{ fontSize: 10 }}>{s.tipo}</span>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>{s.ts}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Modo foto ── */}
      {modo === 'foto' && (
        <>
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: 20, textAlign: 'center' }}>
            {fotoPreview ? (
              <img src={fotoPreview} alt="preview"
                style={{ width: '100%', maxHeight: 280, objectFit: 'contain', borderRadius: 'var(--radius-sm)', marginBottom: 12 }} />
            ) : (
              <div style={{ fontSize: 64, marginBottom: 12 }}>📷</div>
            )}

            <input ref={fotoInputRef} type="file" accept="image/*" capture="environment"
              style={{ display: 'none' }} onChange={handleFotoSelect} />
            <button className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center', marginBottom: 10 }}
              onClick={() => fotoInputRef.current.click()} disabled={enviandoFoto}>
              {enviandoFoto ? <><span className="spinner" /> Enviando...</> : '📸 Tomar foto y enviar al PC'}
            </button>

            <input type="file" accept="image/*" style={{ display: 'none' }} id="foto-galeria-movil"
              onChange={handleFotoSelect} />
            <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => document.getElementById('foto-galeria-movil').click()} disabled={enviandoFoto}>
              🖼️ Elegir de la galería
            </button>
          </div>

          <div style={{ background: 'color-mix(in srgb, var(--color-primary) 8%, transparent)', border: '1px solid var(--color-primary)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', fontSize: 13 }}>
            💡 <strong>Cómo usar:</strong> En el PC, abre Variante → clic en "📱 Enviar desde celular" → aquí toma la foto → llegará automáticamente.
          </div>
        </>
      )}

      <p style={{ fontSize: 11, color: 'var(--color-text-dim)', textAlign: 'center' }}>
        Apariencia optimizada para celular · {window.location.hostname}
      </p>
    </div>
  )
}
