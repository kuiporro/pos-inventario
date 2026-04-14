import { useState } from 'react'
import toast from 'react-hot-toast'
import Modal from './Modal'
import { inventarioApi } from '../api'

export default function ModalProducto({ producto, onGuardar, onCerrar }) {
  const [form, setForm] = useState({
    nombre:      producto?.nombre      ?? '',
    descripcion: producto?.descripcion ?? '',
    categoria:   producto?.categoria   ?? '',
    activo:      producto?.activo      ?? true,
  })
  const [cargando, setCargando] = useState(false)

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.nombre.trim()) { toast.error('El nombre es obligatorio'); return }
    setCargando(true)
    try {
      if (producto?.id) {
        await inventarioApi.actualizarProducto(producto.id, form)
        toast.success('Producto actualizado')
      } else {
        await inventarioApi.crearProducto(form)
        toast.success('Producto creado')
      }
      onGuardar()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setCargando(false)
    }
  }

  return (
    <Modal titulo={producto ? 'Editar producto' : 'Nuevo producto'} onCerrar={onCerrar}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="input-group">
          <label className="input-label">Nombre *</label>
          <input id="prod-nombre" name="nombre" className="input" value={form.nombre} onChange={handleChange} placeholder="Ej: Vela aromática" required />
        </div>
        <div className="input-group">
          <label className="input-label">Categoría</label>
          <input id="prod-categoria" name="categoria" className="input" value={form.categoria} onChange={handleChange} placeholder="Ej: Velas, Cuadros, Jarrones" />
        </div>
        <div className="input-group">
          <label className="input-label">Descripción</label>
          <textarea id="prod-descripcion" name="descripcion" className="input" rows={3} value={form.descripcion} onChange={handleChange} placeholder="Descripción opcional..." />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" name="activo" checked={form.activo} onChange={handleChange} />
          Producto activo
        </label>
        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          <button type="button" className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={onCerrar}>Cancelar</button>
          <button id="prod-guardar-btn" type="submit" className="btn btn-primary" style={{ flex: 2, justifyContent: 'center' }} disabled={cargando}>
            {cargando ? <span className="spinner" /> : (producto ? 'Guardar cambios' : 'Crear producto')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
