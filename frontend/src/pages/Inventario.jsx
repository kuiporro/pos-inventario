import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { inventarioApi } from '../api'
import { formatCLP } from '../utils/formatCLP'
import ModalProducto from '../components/ModalProducto'
import ModalVariante from '../components/ModalVariante'
import ModalAjusteStock from '../components/ModalAjusteStock'

export default function Inventario() {
  const [productos,    setProductos]    = useState([])
  const [cargando,     setCargando]     = useState(true)
  const [busqueda,     setBusqueda]     = useState('')
  const [soloActivos,  setSoloActivos]  = useState(true)
  const [expandido,    setExpandido]    = useState(null)

  // Modales
  const [modalProducto,  setModalProducto]  = useState(null) // null | 'crear' | objeto
  const [modalVariante,  setModalVariante]  = useState(null)
  const [modalAjuste,    setModalAjuste]    = useState(null)

  const cargarProductos = async () => {
    setCargando(true)
    try {
      const params = { search: busqueda }
      if (soloActivos) params.activo = 'true'
      const { data } = await inventarioApi.getProductos(params)
      setProductos(data.results ?? data)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargarProductos() }, [busqueda, soloActivos])

  const handleEliminarProducto = async (producto) => {
    if (!confirm(`¿Desactivar "${producto.nombre}"?`)) return
    try {
      await inventarioApi.eliminarProducto(producto.id)
      toast.success('Producto desactivado')
      cargarProductos()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleEliminarVariante = async (variante) => {
    if (!confirm(`¿Desactivar variante "${variante.nombre}"?`)) return
    try {
      await inventarioApi.eliminarVariante(variante.id)
      toast.success('Variante desactivada')
      cargarProductos()
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventario</h1>
          <p className="page-subtitle">{productos.length} productos</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModalProducto('crear')}>
          ＋ Nuevo producto
        </button>
      </div>

      {/* Filtros */}
      <div className="card" style={{ padding: '14px 20px' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            id="inventario-busqueda"
            className="input"
            style={{ maxWidth: 320 }}
            placeholder="🔍 Buscar producto, SKU..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={soloActivos}
              onChange={(e) => setSoloActivos(e.target.checked)}
            />
            Solo activos
          </label>
        </div>
      </div>

      {/* Lista de productos */}
      {cargando ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <span className="spinner" style={{ width: 32, height: 32 }} />
        </div>
      ) : productos.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-dim)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
          <p>No hay productos. ¡Agrega el primero!</p>
        </div>
      ) : (
        productos.map((prod) => (
          <div key={prod.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Fila del producto */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
                cursor: 'pointer',
              }}
              onClick={() => setExpandido(expandido === prod.id ? null : prod.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: 24 }}>📦</span>
                <div>
                  <div style={{ fontWeight: 600 }}>{prod.nombre}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                    {prod.categoria || 'Sin categoría'} · {prod.cantidad_variantes} variante(s)
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className={`badge ${prod.activo ? 'badge-success' : 'badge-muted'}`}>
                  {prod.activo ? 'Activo' : 'Inactivo'}
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={(e) => { e.stopPropagation(); setModalProducto(prod) }}
                >✏️</button>
                <button
                  className="btn btn-sm"
                  style={{ background: 'transparent', color: 'var(--color-danger)' }}
                  onClick={(e) => { e.stopPropagation(); handleEliminarProducto(prod) }}
                >🗑</button>
                <span style={{ color: 'var(--color-text-dim)', fontSize: 12 }}>
                  {expandido === prod.id ? '▲' : '▼'}
                </span>
              </div>
            </div>

            {/* Variantes expandidas */}
            {expandido === prod.id && (
              <div style={{ borderTop: '1px solid var(--color-border)' }}>
                <div style={{ padding: '10px 20px', background: 'var(--color-surface-2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-muted)' }}>
                      VARIANTES
                    </span>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setModalVariante({ productoId: prod.id, productoNombre: prod.nombre })}
                    >
                      ＋ Agregar variante
                    </button>
                  </div>
                </div>
                <VariantesTabla
                  productoId={prod.id}
                  onAjuste={(v) => setModalAjuste(v)}
                  onEditar={(v) => setModalVariante({ ...v, productoId: prod.id })}
                  onEliminar={handleEliminarVariante}
                />
              </div>
            )}
          </div>
        ))
      )}

      {/* Modales */}
      {modalProducto && (
        <ModalProducto
          producto={modalProducto === 'crear' ? null : modalProducto}
          onGuardar={() => { setModalProducto(null); cargarProductos() }}
          onCerrar={() => setModalProducto(null)}
        />
      )}
      {modalVariante && (
        <ModalVariante
          datos={modalVariante}
          onGuardar={() => { setModalVariante(null); cargarProductos() }}
          onCerrar={() => setModalVariante(null)}
        />
      )}
      {modalAjuste && (
        <ModalAjusteStock
          variante={modalAjuste}
          onGuardar={() => { setModalAjuste(null); cargarProductos() }}
          onCerrar={() => setModalAjuste(null)}
        />
      )}
    </div>
  )
}

/* Sub-componente: tabla de variantes */
function VariantesTabla({ productoId, onAjuste, onEditar, onEliminar }) {
  const [variantes, setVariantes] = useState([])
  const [cargando, setCargando]   = useState(true)

  useEffect(() => {
    inventarioApi.getVariantes({ producto: productoId })
      .then(({ data }) => setVariantes(data.results ?? data))
      .catch((err) => toast.error(err.message))
      .finally(() => setCargando(false))
  }, [productoId])

  if (cargando) return (
    <div style={{ padding: 20, textAlign: 'center' }}>
      <span className="spinner" />
    </div>
  )

  if (variantes.length === 0) return (
    <div style={{ padding: 20, color: 'var(--color-text-dim)', fontSize: 13, textAlign: 'center' }}>
      Sin variantes. Agrega una para registrar stock.
    </div>
  )

  return (
    <div className="table-wrap" style={{ padding: '0 8px 8px' }}>
      <table className="table">
        <thead>
          <tr>
            <th>Variante</th>
            <th>SKU</th>
            <th>Códigos</th>
            <th>Precio</th>
            <th>Stock</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {variantes.map((v) => (
            <tr key={v.id}>
              <td style={{ fontWeight: 500 }}>{v.nombre}</td>
              <td>
                <code style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>{v.sku}</code>
              </td>
              <td>
                {v.codigos_barra?.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {v.codigos_barra.map((cb) => (
                      <code key={cb.id} style={{ fontSize: 11 }}>
                        {cb.codigo} {cb.principal && <span style={{ color: 'var(--color-primary-h)' }}>★</span>}
                      </code>
                    ))}
                  </div>
                ) : (
                  <span style={{ color: 'var(--color-text-dim)', fontSize: 12 }}>Sin códigos</span>
                )}
              </td>
              <td style={{ fontWeight: 600 }}>{formatCLP(v.precio_venta)}</td>
              <td>
                <span className={`badge ${
                  !v.stock
                    ? 'badge-muted'
                    : v.stock.bajo_stock
                    ? 'badge-warning'
                    : 'badge-success'
                }`}>
                  {v.stock?.cantidad ?? '—'}
                </span>
              </td>
              <td>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => onAjuste(v)}>📥 Stock</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => onEditar(v)}>✏️</button>
                  <button
                    className="btn btn-sm"
                    style={{ background: 'transparent', color: 'var(--color-danger)' }}
                    onClick={() => onEliminar(v)}
                  >🗑</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
