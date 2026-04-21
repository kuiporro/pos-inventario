import axios from 'axios'

const TOKEN_KEY = 'pos_token'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
})

// ── Inyectar token en cada request ──────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Token ${token}`
  }
  return config
})

// ── Interceptor de respuesta: extraer mensajes DRF correctamente ─
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Si el token expiró o es inválido → redirigir al login
    if (error?.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY)
      window.location.href = '/login'
      return Promise.reject(new Error('Sesión expirada. Ingresa nuevamente.'))
    }

    const data = error?.response?.data
    let msg = 'Error de conexión con el servidor'

    if (data) {
      if (typeof data === 'string') {
        msg = data
      } else if (data.detail) {
        msg = data.detail
      } else if (data.error) {
        msg = data.error
      } else if (data.non_field_errors) {
        msg = data.non_field_errors.join(', ')
      } else {
        const first = Object.entries(data)[0]
        if (first) {
          const [campo, errores] = first
          const texto = Array.isArray(errores) ? errores[0] : errores
          msg = `${campo}: ${texto}`
        }
      }
    } else if (error?.message) {
      msg = error.message
    }

    return Promise.reject(new Error(msg))
  }
)

// ── Inventario ──────────────────────────────────────────────────

export const inventarioApi = {
  getProductos:        (params)   => api.get('/inventario/productos/', { params }),
  getProducto:         (id)       => api.get(`/inventario/productos/${id}/`),
  crearProducto:       (data)     => api.post('/inventario/productos/', data),
  actualizarProducto:  (id, data) => api.patch(`/inventario/productos/${id}/`, data),
  eliminarProducto:    (id)       => api.delete(`/inventario/productos/${id}/`),

  getVariantes:        (params)   => api.get('/inventario/variantes/', { params }),
  getVariante:         (id)       => api.get(`/inventario/variantes/${id}/`),
  crearVariante:       (data)     => api.post('/inventario/variantes/', data),
  actualizarVariante:  (id, data) => api.patch(`/inventario/variantes/${id}/`, data),
  eliminarVariante:    (id)       => api.delete(`/inventario/variantes/${id}/`),

  buscarPorCodigo:     (codigo)   =>
    api.get('/inventario/variantes/buscar-codigo/', { params: { codigo } }),

  decodificarImagen:   (imagenBase64) =>
    api.post('/inventario/decodificar-imagen/', { imagen: imagenBase64 }),

  getCodigos:          (params)   => api.get('/inventario/codigos-barra/', { params }),
  crearCodigo:         (data)     => api.post('/inventario/codigos-barra/', data),
  eliminarCodigo:      (id)       => api.delete(`/inventario/codigos-barra/${id}/`),

  getStock:            (params)   => api.get('/inventario/stock/', { params }),
  ajustarStock:        (stockId, data) =>
    api.post(`/inventario/stock/${stockId}/ajustar/`, data),

  getMovimientos:      (params)   => api.get('/inventario/movimientos/', { params }),
}

// ── Ventas ──────────────────────────────────────────────────────

export const ventasApi = {
  getVentas:       (params) => api.get('/ventas/ventas/', { params }),
  getVenta:        (id)     => api.get(`/ventas/ventas/${id}/`),
  crearVenta:      (data)   => api.post('/ventas/ventas/', data),
  anularVenta:     (id, motivo) => api.post(`/ventas/ventas/${id}/anular/`, { motivo }),
  getVentasHoy:    ()       => api.get('/ventas/ventas/hoy/'),

  getDevoluciones: (params) => api.get('/ventas/devoluciones/', { params }),
  getDevolucion:   (id)     => api.get(`/ventas/devoluciones/${id}/`),
  crearDevolucion: (data)   => api.post('/ventas/devoluciones/', data),
}

// ── Reportes ─────────────────────────────────────────────────────

export const reportesApi = {
  getDashboard:   ()       => api.get('/reportes/dashboard/'),
  getVentas:      (params) => api.get('/reportes/ventas/', { params }),
  getStock:       (params) => api.get('/reportes/stock/', { params }),
  getMasVendidos: (params) => api.get('/reportes/mas-vendidos/', { params }),
}

// ── Facturación ──────────────────────────────────────────────────

export const facturacionApi = {
  // Proveedores
  getProveedores:      (params)   => api.get('/facturacion/proveedores/', { params }),
  getProveedor:        (id)       => api.get(`/facturacion/proveedores/${id}/`),
  crearProveedor:      (data)     => api.post('/facturacion/proveedores/', data),
  actualizarProveedor: (id, data) => api.patch(`/facturacion/proveedores/${id}/`, data),
  eliminarProveedor:   (id)       => api.delete(`/facturacion/proveedores/${id}/`),

  // Facturas
  getFacturas:       (params) => api.get('/facturacion/facturas/', { params }),
  getFactura:        (id)     => api.get(`/facturacion/facturas/${id}/`),
  crearFactura:      (data)   => api.post('/facturacion/facturas/', data),
  confirmarFactura:  (id)     => api.post(`/facturacion/facturas/${id}/confirmar/`),
  anularFactura:     (id, motivo) => api.post(`/facturacion/facturas/${id}/anular/`, { motivo }),

  // OCR
  subirDocumento:    (formData) => api.post('/facturacion/ocr/subir/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  }),
  getOCRHistorial:   (params) => api.get('/facturacion/ocr/', { params }),
  getOCRResultado:   (id)     => api.get(`/facturacion/ocr/${id}/`),
  confirmarOCR:      (id, data) => api.post(`/facturacion/ocr/${id}/confirmar/`, data),

  // Reportes financieros
  getGanancia:       (params) => api.get('/reportes/financiero/ganancia/', { params }),
  getFlujoCaja:      (params) => api.get('/reportes/financiero/flujo-caja/', { params }),
  getMargen:         (params) => api.get('/reportes/financiero/margen/', { params }),
  getTopRentables:   (params) => api.get('/reportes/financiero/top-rentables/', { params }),
}

// ── Auth ─────────────────────────────────────────────────────────

export const authApi = {
  login:  (username, password) => api.post('/auth/login/', { username, password }),
  logout: ()                   => api.post('/auth/logout/'),
  me:     ()                   => api.get('/auth/me/'),
}

export default api

