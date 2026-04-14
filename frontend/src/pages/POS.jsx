import { useState, useRef, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { inventarioApi, ventasApi } from '../api'
import api from '../api'
import { formatCLP } from '../utils/formatCLP'
import EscanerCamara from '../components/EscanerCamara'
import ModalConfirmarVenta from '../components/ModalConfirmarVenta'

const METODOS_PAGO = [
  { value: 'EFECTIVO',         label: '💵 Efectivo'     },
  { value: 'TARJETA_DEBITO',   label: '💳 Débito'       },
  { value: 'TARJETA_CREDITO',  label: '💳 Crédito'      },
  { value: 'TRANSFERENCIA',    label: '🏦 Transferencia' },
]

export default function POS() {
  const [carrito,       setCarrito]       = useState([])
  const [codigoInput,   setCodigoInput]   = useState('')
  const [productoFlash, setProductoFlash] = useState(null)
  const [metodoPago,    setMetodoPago]    = useState('EFECTIVO')
  const [cargando,      setCargando]      = useState(false)
  const [mostrarCamara, setMostrarCamara] = useState(false)
  const [mostrarModal,  setMostrarModal]  = useState(false)

  // ── Búsqueda por nombre ──────────────────────────────────
  const [modoNombre,    setModoNombre]    = useState(false)
  const [textoBusqueda, setTextoBusqueda] = useState('')
  const [resultados,    setResultados]    = useState([])
  const [buscandoNombre, setBuscandoNombre] = useState(false)
  const debounceRef = useRef(null)

  // ── Bridge celular → PC ──────────────────────────────────────
  const [bridgeActivo,  setBridgeActivo]  = useState(false)
  const [bridgeUltimoId, setBridgeUltimoId] = useState(0)
  const bridgeIntervalRef = useRef(null)

  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [modoNombre])

  // ── Polling del bridge celular ───────────────────────────────
  useEffect(() => {
    if (!bridgeActivo) {
      if (bridgeIntervalRef.current) {
        clearInterval(bridgeIntervalRef.current)
        bridgeIntervalRef.current = null
      }
      return
    }
    let ultimoId = bridgeUltimoId
    const poll = async () => {
      try {
        const { data } = await api.get('/inventario/scan-bridge/', {
          params: { desde_id: ultimoId }
        })
        if (data.scans?.length > 0) {
          for (const scan of data.scans) {
            await buscarPorCodigo(scan.codigo)
          }
          ultimoId = data.ultimo_id
          setBridgeUltimoId(data.ultimo_id)
        }
      } catch (_) {}
    }
    bridgeIntervalRef.current = setInterval(poll, 600)
    return () => clearInterval(bridgeIntervalRef.current)
  }, [bridgeActivo])

  const total = carrito.reduce((acc, item) => acc + item.precio * item.cantidad, 0)

  /* ── Buscar por código de barras ── */
  const buscarPorCodigo = useCallback(async (codigo) => {
    if (!codigo.trim()) return
    setCargando(true)
    try {
      const { data } = await inventarioApi.buscarPorCodigo(codigo.trim())
      if (data.stock_actual <= 0) {
        toast.error(`Sin stock: ${data.producto_nombre} — ${data.variante_nombre}`)
        return
      }
      agregarAlCarrito({
        variante_id:  data.variante_id,
        nombre:       data.producto_nombre,
        variante:     data.variante_nombre,
        precio:       parseInt(data.precio_venta),
        stock_maximo: data.stock_actual,
      })
      setProductoFlash(data)
      setTimeout(() => setProductoFlash(null), 2000)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setCargando(false)
      setCodigoInput('')
      inputRef.current?.focus()
    }
  }, [])

  /* ── Buscar por nombre (con debounce 400ms) ── */
  const buscarPorNombre = useCallback((texto) => {
    setTextoBusqueda(texto)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!texto.trim() || texto.length < 2) { setResultados([]); return }

    debounceRef.current = setTimeout(async () => {
      setBuscandoNombre(true)
      try {
        const { data } = await inventarioApi.getVariantes({
          search:  texto.trim(),
          activo:  'true',
          page_size: 12,
        })
        setResultados(data.results ?? data)
      } catch (err) {
        toast.error(err.message)
      } finally {
        setBuscandoNombre(false)
      }
    }, 400)
  }, [])

  /* ── Seleccionar variante desde búsqueda nombre ── */
  const seleccionarVariante = (v) => {
    const stockActual = v.stock?.cantidad ?? 0
    if (stockActual <= 0) {
      toast.error(`Sin stock: ${v.nombre}`)
      return
    }
    agregarAlCarrito({
      variante_id:  v.id,
      nombre:       v.producto_nombre ?? v.nombre,
      variante:     v.nombre,
      precio:       parseInt(v.precio_venta),
      stock_maximo: stockActual,
    })
    setTextoBusqueda('')
    setResultados([])
    inputRef.current?.focus()
  }

  /* ── Agregar al carrito ── */
  const agregarAlCarrito = (producto) => {
    setCarrito((prev) => {
      const idx = prev.findIndex((i) => i.variante_id === producto.variante_id)
      if (idx >= 0) {
        const copia = [...prev]
        const item  = copia[idx]
        if (item.cantidad >= item.stock_maximo) {
          toast.error(`Máximo stock disponible: ${item.stock_maximo}`)
          return prev
        }
        copia[idx] = { ...item, cantidad: item.cantidad + 1 }
        return copia
      }
      return [...prev, { ...producto, cantidad: 1 }]
    })
    toast.success(`✓ ${producto.nombre} — ${producto.variante}`, { duration: 1200 })
  }

  /* ── Cambiar cantidad ── */
  const cambiarCantidad = (idx, delta) => {
    setCarrito((prev) => {
      const copia = [...prev]
      const item  = copia[idx]
      const nueva = item.cantidad + delta
      if (nueva <= 0) { copia.splice(idx, 1); return copia }
      if (nueva > item.stock_maximo) {
        toast.error(`Máximo disponible: ${item.stock_maximo}`)
        return prev
      }
      copia[idx] = { ...item, cantidad: nueva }
      return copia
    })
  }

  /* ── Confirmar venta ── */
  const confirmarVenta = async (descuento = 0, observaciones = '', pagos = [], metodoPrincipal = null) => {
    if (carrito.length === 0) { toast.error('El carrito está vacío'); return }
    setCargando(true)
    try {
      const payload = {
        items: carrito.map((i) => ({ variante_id: i.variante_id, cantidad: i.cantidad })),
        metodo_pago:      metodoPrincipal || metodoPago,
        descuento_global: String(descuento),
        observaciones,
        pagos,
      }
      const { data } = await ventasApi.crearVenta(payload)
      toast.success(`✅ Venta #${data.numero_comprobante} — ${formatCLP(data.total)}`)
      setCarrito([])
      setMostrarModal(false)
      inputRef.current?.focus()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setCargando(false)
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Punto de Venta</h1>
          <p className="page-subtitle">Escaneá un código o buscá por nombre</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Bridge celular */}
          <button
            className={`btn btn-sm ${bridgeActivo ? 'btn-success' : 'btn-ghost'}`}
            title={bridgeActivo ? 'Escuchando al celular...' : 'Conectar celular como escáner'}
            onClick={() => {
              setBridgeActivo(v => !v)
              if (!bridgeActivo) toast.success('📱 Escuchando al celular...')
              else toast('📴 Bridge desconectado', { icon: '📴' })
            }}
          >
            {bridgeActivo ? '📱 Celular conectado' : '📱 Conectar celular'}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setMostrarCamara(!mostrarCamara)}
          >
            📷 {mostrarCamara ? 'Cerrar cámara' : 'Usar cámara'}
          </button>
        </div>
      </div>

      {/* ── Layout POS ── */}
      <div className="pos-layout" style={{ flex: 1 }}>

        {/* ── Panel izquierdo ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, overflow: 'auto' }}>

          {/* Tabs: Código / Nombre */}
          <div className="card" style={{ padding: '14px 20px' }}>
            {/* Toggle modo */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              <button
                className={`btn btn-sm ${!modoNombre ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => { setModoNombre(false); setResultados([]); setTextoBusqueda('') }}
              >
                🔖 Código de barras
              </button>
              <button
                className={`btn btn-sm ${modoNombre ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setModoNombre(true)}
              >
                🔍 Buscar por nombre
              </button>
            </div>

            {/* ── Modo código de barras ── */}
            {!modoNombre && (
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  ref={inputRef}
                  id="pos-scan-input"
                  type="text"
                  className="pos-scan-input"
                  placeholder="Escanear o escribir código de barras..."
                  value={codigoInput}
                  onChange={(e) => setCodigoInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') buscarPorCodigo(codigoInput) }}
                  autoComplete="off"
                />
                <button
                  className="btn btn-primary"
                  onClick={() => buscarPorCodigo(codigoInput)}
                  disabled={cargando}
                >
                  {cargando ? <span className="spinner" /> : '🔍'}
                </button>
              </div>
            )}

            {/* ── Modo búsqueda por nombre ── */}
            {modoNombre && (
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <input
                    ref={inputRef}
                    id="pos-nombre-input"
                    type="text"
                    className="pos-scan-input"
                    placeholder="Nombre producto o variante (ej: vela roja)..."
                    value={textoBusqueda}
                    onChange={(e) => buscarPorNombre(e.target.value)}
                    autoComplete="off"
                  />
                  {buscandoNombre && (
                    <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px' }}>
                      <span className="spinner" />
                    </div>
                  )}
                </div>

                {/* Dropdown de resultados */}
                {resultados.length > 0 && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 200,
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius)',
                    boxShadow: 'var(--shadow-lg)',
                    marginTop: 4,
                    maxHeight: 320,
                    overflowY: 'auto',
                  }}>
                    {resultados.map((v) => {
                      const stockOk = (v.stock?.cantidad ?? 0) > 0
                      return (
                        <div
                          key={v.id}
                          onClick={() => stockOk && seleccionarVariante(v)}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '10px 16px',
                            borderBottom: '1px solid var(--color-border)',
                            cursor: stockOk ? 'pointer' : 'not-allowed',
                            opacity: stockOk ? 1 : 0.5,
                            transition: 'background .12s',
                          }}
                          onMouseEnter={(e) => {
                            if (stockOk) e.currentTarget.style.background = 'var(--color-surface-2)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent'
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                              {v.producto_nombre ?? v.nombre}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                              Variante: {v.nombre} · SKU: {v.sku}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                            <div style={{ fontWeight: 700, color: 'var(--color-primary-h)' }}>
                              {formatCLP(v.precio_venta)}
                            </div>
                            <div style={{ marginTop: 3 }}>
                              <span className={`badge ${!stockOk ? 'badge-danger' : 'badge-success'}`}>
                                Stock: {v.stock?.cantidad ?? 0}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Sin resultados */}
                {!buscandoNombre && textoBusqueda.length >= 2 && resultados.length === 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius)', padding: '14px 16px',
                    fontSize: 13, color: 'var(--color-text-dim)', marginTop: 4,
                    boxShadow: 'var(--shadow-lg)',
                  }}>
                    Sin resultados para "{textoBusqueda}"
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Flash producto encontrado */}
          {productoFlash && (
            <div className="product-flash">
              <div style={{ fontWeight: 600 }}>
                ✅ {productoFlash.producto_nombre} — {productoFlash.variante_nombre}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3 }}>
                Precio: {formatCLP(productoFlash.precio_venta)} · Stock: {productoFlash.stock_actual}
              </div>
            </div>
          )}

          {/* Escáner de cámara */}
          {mostrarCamara && (
            <div className="card">
              <EscanerCamara onDetect={(codigo) => buscarPorCodigo(codigo)} />
            </div>
          )}

          {/* Método de pago */}
          <div className="card" style={{ padding: '14px 20px' }}>
            <p className="input-label" style={{ marginBottom: 8 }}>Método de pago</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {METODOS_PAGO.map(({ value, label }) => (
                <button
                  key={value}
                  className={`btn btn-sm ${metodoPago === value ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setMetodoPago(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Panel carrito ── */}
        <div className="cart-panel">
          <div className="cart-header">
            🛒 Carrito
            {carrito.length > 0 && (
              <span className="badge badge-primary" style={{ marginLeft: 8 }}>
                {carrito.reduce((a, i) => a + i.cantidad, 0)} items
              </span>
            )}
          </div>

          <div className="cart-items">
            {carrito.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-dim)' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🛒</div>
                <p>El carrito está vacío</p>
                <p style={{ fontSize: 12, marginTop: 4 }}>Escanea o busca un producto</p>
              </div>
            ) : (
              carrito.map((item, idx) => (
                <div key={item.variante_id} className="cart-item">
                  <div>
                    <div className="cart-item-name">{item.nombre}</div>
                    <div className="cart-item-variant">{item.variante}</div>
                    <div className="cart-item-controls">
                      <button className="qty-btn" onClick={() => cambiarCantidad(idx, -1)}>−</button>
                      <span className="qty-display">{item.cantidad}</span>
                      <button className="qty-btn" onClick={() => cambiarCantidad(idx, +1)}>+</button>
                      <button
                        className="btn btn-sm"
                        style={{ padding: '2px 6px', fontSize: 11, background: 'transparent', color: 'var(--color-danger)' }}
                        onClick={() => setCarrito((p) => p.filter((_, i) => i !== idx))}
                      >✕</button>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="cart-item-price">{formatCLP(item.precio * item.cantidad)}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>
                      {formatCLP(item.precio)} c/u
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="cart-footer">
            <div className="cart-total-row">
              <span className="cart-total-label">Total</span>
              <span className="cart-total-value">{formatCLP(total)}</span>
            </div>
            <button
              className="btn btn-success btn-lg"
              style={{ width: '100%', justifyContent: 'center' }}
              disabled={carrito.length === 0 || cargando}
              onClick={() => setMostrarModal(true)}
            >
              {cargando ? <span className="spinner" /> : `✅ Cobrar ${formatCLP(total)}`}
            </button>
            {carrito.length > 0 && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ width: '100%', justifyContent: 'center', color: 'var(--color-danger)' }}
                onClick={() => setCarrito([])}
              >
                🗑 Vaciar carrito
              </button>
            )}
          </div>
        </div>
      </div>

      {mostrarModal && (
        <ModalConfirmarVenta
          carrito={carrito}
          total={total}
          metodoPago={metodoPago}
          onConfirmar={confirmarVenta}
          onCancelar={() => setMostrarModal(false)}
          cargando={cargando}
        />
      )}
    </div>
  )
}
