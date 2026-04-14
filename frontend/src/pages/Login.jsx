/**
 * Login.jsx — Página de inicio de sesión
 * Diseño glassmorphism con fondo animado oscuro
 */
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const { login } = useAuth()
  const navigate  = useNavigate()

  const [form,     setForm]     = useState({ username: '', password: '' })
  const [error,    setError]    = useState('')
  const [cargando, setCargando] = useState(false)
  const [mostrarPass, setMostrarPass] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setCargando(true)
    try {
      await login(form.username, form.password)
      navigate('/pos', { replace: true })
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Error al iniciar sesión.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(ellipse at 20% 50%, #1e1b4b 0%, #0f0f1a 50%, #0a1628 100%)',
      padding: 20,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Orbes de fondo */}
      <div style={{
        position: 'absolute', width: 400, height: 400,
        borderRadius: '50%', top: -100, left: -100,
        background: 'radial-gradient(circle, rgba(99,102,241,.15) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', width: 500, height: 500,
        borderRadius: '50%', bottom: -150, right: -100,
        background: 'radial-gradient(circle, rgba(139,92,246,.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Card glassmorphism */}
      <div style={{
        background:   'rgba(255,255,255,.04)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border:       '1px solid rgba(255,255,255,.1)',
        borderRadius: 24,
        padding:      '44px 44px 40px',
        width:        '100%',
        maxWidth:     420,
        boxShadow:    '0 32px 80px rgba(0,0,0,.6)',
        position:     'relative',
        zIndex:       1,
      }}>
        {/* Logo y título */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 68, height: 68, borderRadius: 18,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, margin: '0 auto 16px',
            boxShadow: '0 8px 24px rgba(99,102,241,.4)',
          }}>
            🛒
          </div>
          <h1 style={{
            fontSize: 26, fontWeight: 700, margin: 0,
            color: '#fff',
            letterSpacing: '-0.5px',
          }}>
            POS Tienda
          </h1>
          <p style={{
            fontSize: 14, color: 'rgba(255,255,255,.45)',
            marginTop: 6, marginBottom: 0,
          }}>
            Ingresa tus credenciales para continuar
          </p>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Usuario */}
          <div>
            <label style={{
              display: 'block', fontSize: 12.5, fontWeight: 600,
              color: 'rgba(255,255,255,.6)', marginBottom: 6, letterSpacing: '.3px',
            }}>
              USUARIO
            </label>
            <input
              id="login-username"
              type="text"
              autoComplete="username"
              autoFocus
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              placeholder="admin"
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '12px 16px',
                background: 'rgba(255,255,255,.07)',
                border: `1px solid ${error ? 'rgba(239,68,68,.6)' : 'rgba(255,255,255,.12)'}`,
                borderRadius: 12, color: '#fff', fontSize: 15,
                outline: 'none', transition: 'border-color .2s',
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,.7)'}
              onBlur={e => e.target.style.borderColor = error ? 'rgba(239,68,68,.6)' : 'rgba(255,255,255,.12)'}
            />
          </div>

          {/* Contraseña */}
          <div>
            <label style={{
              display: 'block', fontSize: 12.5, fontWeight: 600,
              color: 'rgba(255,255,255,.6)', marginBottom: 6, letterSpacing: '.3px',
            }}>
              CONTRASEÑA
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="login-password"
                type={mostrarPass ? 'text' : 'password'}
                autoComplete="current-password"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="••••••••"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '12px 48px 12px 16px',
                  background: 'rgba(255,255,255,.07)',
                  border: `1px solid ${error ? 'rgba(239,68,68,.6)' : 'rgba(255,255,255,.12)'}`,
                  borderRadius: 12, color: '#fff', fontSize: 15,
                  outline: 'none', transition: 'border-color .2s',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,.7)'}
                onBlur={e => e.target.style.borderColor = error ? 'rgba(239,68,68,.6)' : 'rgba(255,255,255,.12)'}
              />
              <button
                type="button"
                onClick={() => setMostrarPass(v => !v)}
                style={{
                  position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(255,255,255,.4)', fontSize: 16, padding: 0,
                }}
              >
                {mostrarPass ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: 'rgba(239,68,68,.12)',
              border: '1px solid rgba(239,68,68,.4)',
              borderRadius: 8, padding: '10px 14px',
              fontSize: 13, color: '#fca5a5',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              ⚠️ {error}
            </div>
          )}

          {/* Botón */}
          <button
            id="login-submit-btn"
            type="submit"
            disabled={cargando || !form.username || !form.password}
            style={{
              marginTop: 4,
              padding: '14px',
              background: 'linear-gradient(135deg, #6366f1, #7c3aed)',
              border: 'none', borderRadius: 12, color: '#fff',
              fontSize: 15, fontWeight: 600, cursor: 'pointer',
              transition: 'opacity .2s, transform .1s',
              opacity: cargando || !form.username || !form.password ? 0.6 : 1,
              letterSpacing: '.2px',
            }}
            onMouseEnter={e => { if (!cargando) e.target.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { e.target.style.transform = 'translateY(0)' }}
          >
            {cargando ? '⏳ Verificando...' : '🔐 Ingresar al sistema'}
          </button>
        </form>

        {/* Footer */}
        <p style={{
          textAlign: 'center', fontSize: 12,
          color: 'rgba(255,255,255,.2)', marginTop: 28, marginBottom: 0,
        }}>
          POS Tienda · Solo para personal autorizado
        </p>
      </div>
    </div>
  )
}
