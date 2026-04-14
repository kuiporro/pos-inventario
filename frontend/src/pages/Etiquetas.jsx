/**
 * Etiquetas.jsx — Generador e impresión de etiquetas de código de barras
 * Selecciona variantes, configura cantidad de etiquetas, previsualiza e imprime
 */
import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import api from '../api'
import { formatCLP } from '../utils/formatCLP'

/* ── Dibuja un código de barras EAN-13 básico (o muestra texto) con canvas ── */
function BarcodeCanvas({ codigo, width = 200, height = 80 }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)

    // Simple representation: barras alternadas para visualización
    const barras = codigo.split('').flatMap((c, i) => {
      const n = parseInt(c) || 0
      return [n % 2 === 0 ? 1 : 0, n % 3 === 0 ? 1 : 0, 1]
    })

    const totalBarras = barras.length + 10
    const barWidth = width / totalBarras
    let x = barWidth * 2

    ctx.fillStyle = '#000'
    for (const b of barras) {
      if (b) ctx.fillRect(x, 5, barWidth * 0.8, height - 18)
      x += barWidth
    }

    // Texto del código
    ctx.fillStyle = '#000'
    ctx.font = `${Math.max(8, height * 0.15)}px monospace`
    ctx.textAlign = 'center'
    ctx.fillText(codigo, width / 2, height - 2)
  }, [codigo, width, height])

  return <canvas ref={canvasRef} width={width} height={height} />
}

/* ── Etiqueta individual ── */
function Etiqueta({ variante, cantidad }) {
  const codigo = variante.codigos_barra?.[0]?.codigo ?? variante.sku ?? ''
  return (
    <>
      {Array.from({ length: cantidad }, (_, i) => (
        <div key={i} className="etiqueta-print" style={{
          width: 200, height: 100,
          border: '1px dashed #ccc',
          borderRadius: 6,
          padding: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          background: '#fff',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, textAlign: 'center', color: '#111', maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {variante.producto_nombre}
          </div>
          <div style={{ fontSize: 9, color: '#666' }}>{variante.nombre}</div>
          {codigo ? (
            <BarcodeCanvas codigo={codigo} width={160} height={50} />
          ) : (
            <div style={{ fontSize: 11, color: '#999' }}>Sin código</div>
          )}
          <div style={{ fontSize: 12, fontWeight: 800, color: '#111' }}>
            {formatCLP(variante.precio_venta)}
          </div>
        </div>
      ))}
    </>
  )
}

export default function Etiquetas() {
  const [variantes,   setVariantes]   = useState([])
  const [busqueda,    setBusqueda]    = useState('')
  const [seleccionadas, setSeleccionadas] = useState([]) // { variante, cantidad }
  const [cargando,    setCargando]    = useState(false)

  useEffect(() => { cargarVariantes() }, [])

  const cargarVariantes = async () => {
    setCargando(true)
    try {
      const { data } = await api.get('/inventario/variantes/', { params: { limit: 200 } })
      setVariantes(data.results ?? data)
    } catch (_) {}
    finally { setCargando(false) }
  }

  const variantesFiltradas = variantes.filter(v =>
    !busqueda ||
    v.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
    v.producto_nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
    v.sku?.toLowerCase().includes(busqueda.toLowerCase())
  )

  const estaSeleccionada = (id) => seleccionadas.some(s => s.variante.id === id)

  const toggleVariante = (v) => {
    if (estaSeleccionada(v.id)) {
      setSeleccionadas(prev => prev.filter(s => s.variante.id !== v.id))
    } else {
      setSeleccionadas(prev => [...prev, { variante: v, cantidad: 1 }])
    }
  }

  const setCantidad = (id, val) => {
    const num = Math.max(1, Math.min(Number(val), 50))
    setSeleccionadas(prev => prev.map(s =>
      s.variante.id === id ? { ...s, cantidad: num } : s
    ))
  }

  const imprimir = () => {
    if (seleccionadas.length === 0) { toast.error('Selecciona al menos una variante'); return }
    window.print()
  }

  const totalEtiquetas = seleccionadas.reduce((sum, s) => sum + s.cantidad, 0)

  return (
    <div>
      <style>{`
        @media print {
          body > * { display: none !important; }
          #etiquetas-print-area { display: flex !important; flex-wrap: wrap; gap: 4mm; padding: 4mm; }
          .etiqueta-print { page-break-inside: avoid; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>🏷️ Generador de Etiquetas</h1>
          <p style={{ fontSize: 14, color: 'var(--color-text-muted)', marginTop: 4 }}>
            Selecciona variantes, configura cantidad e imprime etiquetas
          </p>
        </div>
        <button className="btn btn-primary" onClick={imprimir} disabled={seleccionadas.length === 0}>
          🖨️ Imprimir {totalEtiquetas > 0 ? `(${totalEtiquetas})` : ''}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
        {/* Panel izquierdo: lista de variantes */}
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)',
          padding: 20,
        }}>
          <input
            className="input" placeholder="🔍 Buscar producto o variante..."
            value={busqueda} onChange={e => setBusqueda(e.target.value)}
            style={{ marginBottom: 14 }}
          />

          {cargando ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <span className="spinner" style={{ width: 28, height: 28 }} />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 500, overflowY: 'auto' }}>
              {variantesFiltradas.map(v => {
                const sel = estaSeleccionada(v.id)
                const selInfo = seleccionadas.find(s => s.variante.id === v.id)
                return (
                  <div key={v.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px',
                    background: sel ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'var(--color-surface-2)',
                    border: `1px solid ${sel ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    transition: 'all .15s',
                  }}
                  onClick={() => toggleVariante(v)}>
                    <input type="checkbox" checked={sel} onChange={() => toggleVariante(v)} onClick={e => e.stopPropagation()} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {v.producto_nombre}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                        {v.nombre} · {v.sku}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-primary)', flexShrink: 0 }}>
                      {formatCLP(v.precio_venta)}
                    </div>
                    {sel && (
                      <input
                        type="number" min="1" max="50"
                        value={selInfo.cantidad}
                        onChange={e => setCantidad(v.id, e.target.value)}
                        onClick={e => e.stopPropagation()}
                        style={{
                          width: 52, textAlign: 'center',
                          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                          borderRadius: 6, padding: '3px 6px', color: 'var(--color-text)',
                          fontSize: 13,
                        }}
                      />
                    )}
                  </div>
                )
              })}
              {variantesFiltradas.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 30 }}>
                  Sin resultados
                </div>
              )}
            </div>
          )}
        </div>

        {/* Panel derecho: preview */}
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)',
          padding: 20,
        }}>
          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
            Preview {totalEtiquetas > 0 ? `· ${totalEtiquetas} etiquetas` : ''}
          </p>
          {seleccionadas.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '40px 20px' }}>
              <div style={{ fontSize: 40 }}>🏷️</div>
              <p style={{ marginTop: 8 }}>Selecciona productos de la lista</p>
            </div>
          ) : (
            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              {seleccionadas.map(s => (
                <div key={s.variante.id} style={{ marginBottom: 12 }}>
                  <div style={{
                    fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 6,
                    display: 'flex', justifyContent: 'space-between',
                  }}>
                    <span>{s.variante.producto_nombre} — {s.variante.nombre}</span>
                    <span>×{s.cantidad}</span>
                  </div>
                  <Etiqueta variante={s.variante} cantidad={1} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Área de impresión (oculta en pantalla, visible al imprimir) */}
      <div id="etiquetas-print-area" style={{ display: 'none' }}>
        {seleccionadas.map(s => (
          <Etiqueta key={s.variante.id} variante={s.variante} cantidad={s.cantidad} />
        ))}
      </div>
    </div>
  )
}
