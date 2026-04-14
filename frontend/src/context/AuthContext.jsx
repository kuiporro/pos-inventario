/**
 * AuthContext.jsx — Estado global de autenticación
 *
 * Provee: { usuario, token, cargando, login, logout }
 * El token se guarda en localStorage con clave 'pos_token'.
 * Al montar, valida el token existente contra /api/auth/me/
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import axios from 'axios'

const AuthContext = createContext(null)

const TOKEN_KEY = 'pos_token'

// Instancia axios base (sin interceptores de auth circulares)
const authAxios = axios.create({ baseURL: '/api', timeout: 8000 })

export function AuthProvider({ children }) {
  const [usuario,  setUsuario]  = useState(null)
  const [token,    setToken]    = useState(() => localStorage.getItem(TOKEN_KEY))
  const [cargando, setCargando] = useState(true)   // validando token al montar

  // ── Validar token al montar ────────────────────────────────────
  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY)
    if (!savedToken) { setCargando(false); return }

    authAxios.get('/auth/me/', {
      headers: { Authorization: `Token ${savedToken}` }
    })
      .then(({ data }) => {
        setToken(savedToken)
        setUsuario(data)
      })
      .catch(() => {
        // Token inválido o expirado → limpiar
        localStorage.removeItem(TOKEN_KEY)
        setToken(null)
        setUsuario(null)
      })
      .finally(() => setCargando(false))
  }, [])

  // ── Login ──────────────────────────────────────────────────────
  const login = useCallback(async (username, password) => {
    const { data } = await authAxios.post('/auth/login/', { username, password })
    localStorage.setItem(TOKEN_KEY, data.token)
    setToken(data.token)
    setUsuario(data.usuario)
    return data
  }, [])

  // ── Logout ─────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    const t = localStorage.getItem(TOKEN_KEY)
    if (t) {
      try {
        await authAxios.post('/auth/logout/', {}, {
          headers: { Authorization: `Token ${t}` }
        })
      } catch (_) {}
    }
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUsuario(null)
  }, [])

  return (
    <AuthContext.Provider value={{ usuario, token, cargando, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
