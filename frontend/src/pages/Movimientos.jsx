import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { inventarioApi } from '../api'

const TIPO_LABELS = {
  INGRESO:              { label: 'Ingreso',              badge: 'badge-success'  },
  VENTA:                { label: 'Venta',                badge: 'badge-primary'  },
  DEVOLUCION_CLIENTE:   { label: 'Dev. cliente',         badge: 'badge-warning'  },
  DEVOLUCION_PROVEEDOR: { label: 'Dev. proveedor',       badge: 'badge-muted'    },
  AJUSTE_POSITIVO:      { label: 'Ajuste +',             badge: 'badge-success'  },
  AJUSTE_NEGATIVO:      { label: 'Ajuste −',             badge: 'badge-danger'   },
  INICIAL:              { label: 'Inicial',              badge: 'badge-muted'    },
}

export default function Movimientos() {
  const [movimientos, setMovimientos] = useState([])
  const [cargando,    setCargando]    = useState(true)
  const [filtroTipo,  setFiltroTipo]  = useState('')
  const [pagina,      setPagina]      = useState(1)
  const [total,       setTotal]       = useState(0)

  const cargar = async () => {
    setCargando(true)
    try {
      const params = { page: pagina }
      if (filtroTipo) params.tipo = filtroTipo
      const { data } = await inventarioApi.getMovimientos(params)
      setMovimientos(data.results ?? data)
      setTotal(data.count ?? (data.results ?? data).length)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargar() }, [filtroTipo, pagina])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Movimientos de Stock</h1>
          <p className="page-subtitle">Kardex completo — {total} registros</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="card" style={{ padding: '14px 20px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className={`btn btn-sm ${!filtroTipo ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => { setFiltroTipo(''); setPagina(1) }}
          >Todos</button>
          {Object.entries(TIPO_LABELS).map(([key, { label }]) => (
            <button
              key={key}
              className={`btn btn-sm ${filtroTipo === key ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => { setFiltroTipo(key); setPagina(1) }}
            >{label}</button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {cargando ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <span className="spinner" style={{ width: 28, height: 28 }} />
          </div>
        ) : movimientos.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-dim)' }}>
            Sin movimientos registrados
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Producto · Variante</th>
                  <th>Cantidad</th>
                  <th>Stock ant.</th>
                  <th>Stock post.</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m) => {
                  const meta = TIPO_LABELS[m.tipo] || { label: m.tipo, badge: 'badge-muted' }
                  return (
                    <tr key={m.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                        {new Date(m.creado_en).toLocaleString('es-AR', {
                          day: '2-digit', month: '2-digit', year: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td>
                        <span className={`badge ${meta.badge}`}>{meta.label}</span>
                      </td>
                      <td style={{ fontWeight: 500, fontSize: 13 }}>{m.variante_nombre}</td>
                      <td>
                        <span style={{
                          fontWeight: 700,
                          color: m.cantidad > 0 ? 'var(--color-success)' : 'var(--color-danger)',
                        }}>
                          {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
                        </span>
                      </td>
                      <td style={{ color: 'var(--color-text-muted)' }}>{m.stock_anterior}</td>
                      <td style={{ fontWeight: 600 }}>{m.stock_posterior}</td>
                      <td style={{ fontSize: 12, color: 'var(--color-text-muted)', maxWidth: 200 }}>
                        {m.motivo || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {!cargando && total > 50 && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--color-border)', display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button className="btn btn-ghost btn-sm" disabled={pagina === 1} onClick={() => setPagina(p => p - 1)}>← Anterior</button>
            <span style={{ padding: '6px 12px', fontSize: 13, color: 'var(--color-text-muted)' }}>Pág. {pagina}</span>
            <button className="btn btn-ghost btn-sm" disabled={movimientos.length < 50} onClick={() => setPagina(p => p + 1)}>Siguiente →</button>
          </div>
        )}
      </div>
    </div>
  )
}
