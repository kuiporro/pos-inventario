/**
 * OCRMovil.jsx — Página móvil para capturar facturas con la cámara
 *
 * Flujo:
 * 1. Usuario escanea QR en el PC → abre esta página en el celular
 * 2. Toma foto con la cámara trasera
 * 3. Preview + botón enviar
 * 4. Se sube al OCR backend automáticamente
 * 5. El PC ve el resultado en el historial OCR
 *
 * No requiere autenticación (acepta token via query param del QR)
 */
import { useState, useRef, useEffect } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import api from '../api'

export default function OCRMovil() {
  const [paso, setPaso] = useState('inicio') // inicio | preview | enviando | exito | error
  const [fotoPreview, setFotoPreview] = useState(null)
  const [fotoFile, setFotoFile] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const fotoInputRef = useRef(null)
  const galeriaRef = useRef(null)

  // Extraer token del query string si viene en el QR
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    if (token) {
      localStorage.setItem('pos_token', token)
    }
  }, [])

  const abrirCamara = () => {
    fotoInputRef.current?.click()
  }

  const abrirGaleria = () => {
    galeriaRef.current?.click()
  }

  const handleFotoSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validar
    if (!file.type.match(/^image\/(jpeg|jpg|png)$/)) {
      toast.error('Solo se aceptan imágenes JPG o PNG')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error('La imagen es demasiado grande (máx 20MB)')
      return
    }

    setFotoFile(file)
    setFotoPreview(URL.createObjectURL(file))
    setPaso('preview')
  }

  const enviarFoto = async () => {
    if (!fotoFile) return
    setPaso('enviando')

    try {
      const formData = new FormData()
      formData.append('archivo', fotoFile)

      const { data } = await api.post('/facturacion/ocr/subir/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      })

      setResultado(data)
      setPaso('exito')
      navigator.vibrate?.([100, 50, 100])
    } catch (e) {
      setErrorMsg(e.message || 'Error al enviar la foto')
      setPaso('error')
      navigator.vibrate?.([300])
    }
  }

  const reiniciar = () => {
    setPaso('inicio')
    setFotoPreview(null)
    setFotoFile(null)
    setResultado(null)
    setErrorMsg('')
  }

  return (
    <div style={containerStyle}>
      <Toaster position="top-center" />

      {/* Header */}
      <div style={headerStyle}>
        <div style={{ fontSize: 40, marginBottom: 4 }}>🧾</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Captura de Factura</h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
          Toma una foto de la factura de compra
        </p>
      </div>

      {/* Inputs ocultos */}
      <input
        ref={fotoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleFotoSelect}
      />
      <input
        ref={galeriaRef}
        type="file"
        accept="image/jpeg,image/png"
        style={{ display: 'none' }}
        onChange={handleFotoSelect}
      />

      {/* ── Paso: Inicio ── */}
      {paso === 'inicio' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Instrucciones */}
          <div style={cardMobileStyle}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 28 }}>📸</span>
              <div>
                <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Instrucciones</p>
                <ol style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
                  <li>Coloca la factura sobre una superficie plana</li>
                  <li>Asegúrate de buena iluminación</li>
                  <li>Captura toda la factura sin cortar bordes</li>
                  <li>Revisa la foto antes de enviar</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Botón principal: Cámara */}
          <button onClick={abrirCamara} style={btnCameraStyle}>
            <span style={{ fontSize: 24 }}>📷</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Tomar foto</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Abre la cámara trasera</div>
            </div>
          </button>

          {/* Botón secundario: Galería */}
          <button onClick={abrirGaleria} style={btnGaleriaStyle}>
            <span style={{ fontSize: 20 }}>🖼️</span>
            <span>Elegir de la galería</span>
          </button>
        </div>
      )}

      {/* ── Paso: Preview ── */}
      {paso === 'preview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{
            borderRadius: 16, overflow: 'hidden',
            border: '2px solid rgba(99,102,241,.3)',
            background: '#000',
          }}>
            <img
              src={fotoPreview}
              alt="preview"
              style={{
                width: '100%', maxHeight: '50vh', objectFit: 'contain',
                display: 'block',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={reiniciar} style={btnOutlineStyle}>
              🔄 Otra foto
            </button>
            <button onClick={enviarFoto} style={btnEnviarStyle}>
              📤 Enviar al sistema
            </button>
          </div>

          <p style={{
            fontSize: 12, color: 'var(--color-text-dim)', textAlign: 'center',
          }}>
            La imagen se procesará con OCR para extraer los productos automáticamente
          </p>
        </div>
      )}

      {/* ── Paso: Enviando ── */}
      {paso === 'enviando' && (
        <div style={centeredCardStyle}>
          <div style={spinnerLargeStyle} />
          <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 20 }}>Enviando factura...</h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 6 }}>
            Procesamiento OCR en curso, no cierres esta página
          </p>
        </div>
      )}

      {/* ── Paso: Éxito ── */}
      {paso === 'exito' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{
            ...centeredCardStyle,
            background: 'rgba(34,197,94,.06)',
            border: '1px solid rgba(34,197,94,.2)',
          }}>
            <div style={{ fontSize: 56, marginBottom: 8 }}>✅</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#22c55e' }}>
              ¡Factura enviada!
            </h2>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 6 }}>
              El OCR está procesando la imagen. Revisa los resultados en el PC.
            </p>
            {resultado && (
              <div style={{
                marginTop: 14, padding: '10px 16px',
                background: 'rgba(255,255,255,.04)', borderRadius: 10,
                fontSize: 13,
              }}>
                <p>ID Documento: <strong>#{resultado.id}</strong></p>
                <p>Estado: <strong>{resultado.estado}</strong></p>
              </div>
            )}
          </div>

          <button onClick={reiniciar} style={btnCameraStyle}>
            <span style={{ fontSize: 20 }}>📷</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Capturar otra factura</div>
            </div>
          </button>
        </div>
      )}

      {/* ── Paso: Error ── */}
      {paso === 'error' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{
            ...centeredCardStyle,
            background: 'rgba(239,68,68,.06)',
            border: '1px solid rgba(239,68,68,.2)',
          }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>❌</div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#f87171' }}>
              Error al enviar
            </h2>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 6 }}>
              {errorMsg}
            </p>
          </div>

          <button onClick={reiniciar} style={btnOutlineStyle}>
            🔄 Intentar de nuevo
          </button>
        </div>
      )}

      {/* Footer */}
      <p style={{
        fontSize: 11, color: 'var(--color-text-dim)', textAlign: 'center',
        marginTop: 'auto', paddingTop: 20,
      }}>
        📱 POS Tienda — Captura OCR · {window.location.hostname}
      </p>
    </div>
  )
}

// ─── Estilos móvil ────────────────────────────────────────────────
const containerStyle = {
  minHeight: '100vh',
  background: 'var(--color-bg)',
  display: 'flex',
  flexDirection: 'column',
  padding: 20,
  gap: 16,
  maxWidth: 480,
  margin: '0 auto',
}

const headerStyle = {
  textAlign: 'center',
  paddingTop: 8,
  paddingBottom: 8,
}

const cardMobileStyle = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 16,
  padding: '18px 20px',
}

const btnCameraStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '18px 22px',
  background: 'linear-gradient(135deg, #6366f1, #818cf8)',
  border: 'none',
  borderRadius: 16,
  color: '#fff',
  fontSize: 14,
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'transform .15s, box-shadow .15s',
}

const btnGaleriaStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  padding: '14px 20px',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 14,
  color: 'var(--color-text-muted)',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
}

const btnEnviarStyle = {
  flex: 1,
  padding: '14px 20px',
  background: 'linear-gradient(135deg, #22c55e, #16a34a)',
  border: 'none',
  borderRadius: 12,
  color: '#fff',
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
}

const btnOutlineStyle = {
  flex: 1,
  padding: '14px 20px',
  background: 'var(--color-surface-2)',
  border: '1px solid var(--color-border)',
  borderRadius: 12,
  color: 'var(--color-text)',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
}

const centeredCardStyle = {
  ...cardMobileStyle,
  textAlign: 'center',
  padding: '32px 24px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
}

const spinnerLargeStyle = {
  width: 48,
  height: 48,
  border: '4px solid var(--color-border)',
  borderTopColor: 'var(--color-primary)',
  borderRadius: '50%',
  animation: 'spin .8s linear infinite',
}
