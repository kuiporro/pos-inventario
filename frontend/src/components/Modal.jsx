/**
 * Modal.jsx — Modal genérico reutilizable
 */
import { useEffect } from 'react'

export default function Modal({ titulo, onCerrar, children, ancho = 500 }) {
  // Cerrar con Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCerrar])

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onCerrar() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
        animation: 'fadeIn .15s ease',
      }}
    >
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        width: '100%', maxWidth: ancho,
        maxHeight: '90vh',
        overflow: 'auto',
        padding: 28,
        boxShadow: 'var(--shadow-xl)',
        animation: 'slideUp .2s ease',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 20,
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{titulo}</h2>
          <button
            onClick={onCerrar}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-dim)', fontSize: 18, padding: '2px 6px',
              borderRadius: 6,
            }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>

      <style>{`
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>
    </div>
  )
}
