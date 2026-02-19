import { useState, useEffect, useCallback } from 'react'
import {
  fetchPedidos, fetchPedido, createPedido, updatePedido, deletePedido,
  downloadExcel, emptyItem, emptyPuesto
} from './api'
import ItemsTable from './components/ItemsTable'
import Toast, { useToast } from './components/Toast'

const today = new Date().toISOString().slice(0, 10)
function newForm() {
  return { numero_pedido: '', fecha: today, cliente: '', proyecto: '', disenador: '', asesor: '' }
}

function normalizePuestoName(name, index) {
  const value = String(name || '').trim().toUpperCase()
  return value || `PUESTO ${index + 1}`
}

export default function App() {
  const [pedidos, setPedidos] = useState([])
  const [currentId, setCurrentId] = useState(null)
  const [form, setForm] = useState(newForm())
  const [puestos, setPuestos] = useState([{ ...emptyPuesto(1), nombre: 'PUESTO 1' }])
  const [search, setSearch] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleteModal, setDeleteModal] = useState(false)
  const { toasts, show } = useToast()

  const loadList = useCallback(async () => {
    try { setPedidos(await fetchPedidos()) } catch { show('Error al cargar pedidos', 'error') }
  }, [])
  useEffect(() => { loadList() }, [loadList])

  useEffect(() => {
    const handler = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save() } }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  const openPedido = async (id) => {
    try {
      const data = await fetchPedido(id)
      setCurrentId(id)
      setForm({
        numero_pedido: data.numero_pedido || '', fecha: data.fecha || today,
        cliente: data.cliente || '', proyecto: data.proyecto || '', disenador: data.disenador || '', asesor: data.asesor || ''
      })
      if (data.puestos && data.puestos.length > 0) {
        setPuestos(data.puestos.map(p => ({
          ...p,
          nombre: normalizePuestoName(p.nombre, p.orden || 0),
          _id: p.id || crypto.randomUUID(),
          items: p.items.length ? p.items.map(it => ({ ...it, _id: crypto.randomUUID() })) : [emptyItem()]
        })))
      } else {
        setPuestos([{ ...emptyPuesto(1), nombre: 'PUESTO 1' }])
      }
    } catch { show('Error al cargar pedido', 'error') }
  }

  const newPedido = () => {
    setCurrentId(null)
    setForm(newForm())
    setPuestos([{ ...emptyPuesto(1), nombre: 'PUESTO 1' }])
  }

  const save = async () => {
    setSaving(true)
    const payload = {
      ...form,
      puestos: puestos.map(p => ({
        nombre: p.nombre,
        items: p.items.map(it => ({
          codigo: it.codigo, descripcion: it.descripcion,
          nota_h: it.nota_h, nota_l: it.nota_l, nota_prof: it.nota_prof, nota_adicional: it.nota_adicional,
          cantidad_unitaria: parseFloat(it.cantidad_unitaria) || null,
          cantidad_tipologia: parseFloat(it.cantidad_tipologia) || null,
          cantidad_total: parseFloat(it.cantidad_total) || null,
          pintura: it.pintura, acabados_adicional: it.acabados_adicional,
          formica: it.formica, supercor: it.supercor, canto: it.canto,
          madecanto: it.madecanto, vidrio: it.vidrio, tela: it.tela, render: it.render,
        }))
      }))
    }
    try {
      if (currentId) {
        await updatePedido(currentId, payload)
        show('Pedido actualizado ✓', 'success')
      } else {
        const res = await createPedido(payload)
        setCurrentId(res.id)
        show('Pedido guardado ✓', 'success')
      }
      await loadList()
    } catch { show('Error al guardar', 'error') }
    finally { setSaving(false) }
  }

  const confirmDelete = async () => {
    try {
      await deletePedido(currentId)
      show('Pedido eliminado', 'info')
      setDeleteModal(false)
      newPedido()
      await loadList()
    } catch { show('Error al eliminar', 'error') }
  }

  const handleExport = async () => {
    if (!currentId) { show('Guarda el pedido primero', 'error'); return }
    try {
      await downloadExcel(currentId)
      show('Excel descargado correctamente', 'success')
    } catch (err) {
      show(`Error: ${err.message}`, 'error')
    }
  }

  // ─── Puestos management ───
  const addPuesto = () => {
    setPuestos(prev => [...prev, { ...emptyPuesto(prev.length + 1), nombre: `PUESTO ${prev.length + 1}` }])
  }

  const removePuesto = (idx) => {
    if (puestos.length <= 1) return
    setPuestos(prev => prev.filter((_, i) => i !== idx))
  }

  const duplicatePuesto = (idx) => {
    const source = puestos[idx]
    const dup = {
      _id: crypto.randomUUID(),
      nombre: `${String(source.nombre || '').toUpperCase()} (COPIA)`,
      items: source.items.map(it => ({ ...it, _id: crypto.randomUUID() }))
    }
    setPuestos(prev => [...prev.slice(0, idx + 1), dup, ...prev.slice(idx + 1)])
    show('Puesto duplicado', 'info')
  }

  const renamePuesto = (idx, name) => {
    setPuestos(prev => prev.map((p, i) => i === idx ? { ...p, nombre: String(name || '').toUpperCase() } : p))
  }

  const updatePuestoItems = (idx, items) => {
    setPuestos(prev => prev.map((p, i) => i === idx ? { ...p, items } : p))
  }

  const filtered = pedidos.filter(p =>
    !search ||
    (p.numero_pedido || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.cliente || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.proyecto || '').toLowerCase().includes(search.toLowerCase())
  )

  const totalItems = puestos.reduce((sum, p) => sum + p.items.length, 0)
  const pageTitle = currentId ? `Pedido #${form.numero_pedido || currentId}` : 'Nuevo Pedido'

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#f0f4f8' }}>

      {/* ─── SIDEBAR ─── */}
      <aside className={`flex-shrink-0 flex flex-col bg-white border-r border-slate-200 shadow-sm transition-all duration-200
                         ${sidebarOpen ? 'w-72' : 'w-0 overflow-hidden'}`}>
        <div className="px-5 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-md shadow-blue-200">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1.5" fill="white" /><rect x="14" y="3" width="7" height="7" rx="1.5" fill="white" opacity=".6" /><rect x="3" y="14" width="7" height="7" rx="1.5" fill="white" opacity=".6" /><rect x="14" y="14" width="7" height="7" rx="1.5" fill="white" opacity=".35" /></svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-800">Integrador</h1>
              <p className="text-[10px] text-slate-400">Gestión de Pedidos</p>
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-b border-slate-100 space-y-2">
          <button onClick={newPedido}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-200 transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" d="M12 5v14M5 12h14" strokeWidth="2.5" /></svg>
            Nuevo Pedido
          </button>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="11" cy="11" r="8" strokeWidth="2" /><path strokeLinecap="round" d="m21 21-4.35-4.35" strokeWidth="2" /></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar pedido…"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {filtered.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-xs text-slate-400">No hay pedidos guardados</p>
            </div>
          ) : filtered.map(p => (
            <button key={p.id} onClick={() => openPedido(p.id)}
              className={`w-full text-left px-3.5 py-3 rounded-xl mb-1.5 border transition-all relative
                ${p.id === currentId ? 'bg-blue-50 border-blue-200 shadow-sm sidebar-active' : 'border-transparent hover:bg-slate-50 hover:border-slate-200'}`}>
              <div className={`text-xs font-bold mb-0.5 ${p.id === currentId ? 'text-blue-600' : 'text-slate-500'}`}>
                #{p.numero_pedido || p.id}
              </div>
              <div className="text-sm font-medium text-slate-700 truncate">{p.proyecto || p.cliente || 'Sin proyecto'}</div>
              <div className="flex justify-between items-center mt-1">
                <span className="text-[10px] text-slate-400">{p.fecha}</span>
                <div className="flex gap-1.5">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-500 font-medium">{p.total_puestos} PT</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">{p.total_items} ítems</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* ─── MAIN CONTENT ─── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Toolbar */}
        <header className="flex-shrink-0 flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(o => !o)}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" d="M3 6h18M3 12h18M3 18h18" strokeWidth="2" /></svg>
            </button>
            <h2 className="font-bold text-base text-slate-800">{pageTitle}</h2>
            <span className="text-xs text-slate-400">{puestos.length} puesto{puestos.length !== 1 ? 's' : ''} · {totalItems} ítem{totalItems !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-2">
            {currentId && (
              <button onClick={() => setDeleteModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 border border-red-200 transition-all">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" strokeWidth="2" /></svg>
                Eliminar
              </button>
            )}
            <button onClick={save} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-sm transition-all disabled:opacity-50">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2zM17 21v-8H7v8M7 3v5h8" strokeWidth="2" /></svg>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button onClick={handleExport}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-200 transition-all">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeWidth="2" /></svg>
              Descargar Excel
            </button>
          </div>
        </header>

        {/* Scrollable Content — puestos stacked vertically */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">

          {/* Header Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" strokeWidth="2" /></svg>
              </div>
              <h3 className="text-sm font-semibold text-slate-700">Información del Pedido</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                { id: 'numero_pedido', label: 'N° Pedido', placeholder: 'Ej: 24219599' },
                { id: 'fecha', label: 'Fecha', type: 'date' },
                { id: 'cliente', label: 'Cliente', placeholder: 'Nombre del cliente' },
                { id: 'proyecto', label: 'Proyecto', placeholder: 'Nombre del proyecto' },
                { id: 'disenador', label: 'Diseñador', placeholder: 'Nombre del diseñador' },
                { id: 'asesor', label: 'Asesor Comercial', placeholder: 'Nombre del asesor' },
              ].map(f => (
                <div key={f.id} className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500">{f.label}</label>
                  <input type={f.type || 'text'} value={form[f.id]}
                    onChange={e => setForm(fm => ({ ...fm, [f.id]: e.target.value }))} placeholder={f.placeholder || ''}
                    className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
                </div>
              ))}
            </div>
          </div>

          {/* ── ALL PUESTOS STACKED VERTICALLY ── */}
          {puestos.map((puesto, idx) => (
            <div key={puesto._id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-visible">

              {/* Puesto Header — always visible */}
              <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200">
                <div className="flex items-center gap-3">
                  {/* Number badge */}
                  <span className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600">
                    {idx + 1}
                  </span>

                  {/* Editable name */}
                  <input
                    value={puesto.nombre}
                    onChange={e => renamePuesto(idx, e.target.value)}
                    className="bg-transparent border-0 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-0 placeholder:text-slate-400 w-64"
                    placeholder="Nombre del puesto de trabajo…"
                  />

                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-500 font-medium">
                    {puesto.items.length} ítem{puesto.items.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  {/* Duplicate */}
                  <button onClick={() => duplicatePuesto(idx)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-slate-500 hover:bg-slate-200 transition-colors"
                    title="Duplicar este puesto">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="8" y="8" width="12" height="12" rx="2" strokeWidth="2" /><path d="M4 16V6a2 2 0 012-2h10" strokeWidth="2" /></svg>
                    Duplicar
                  </button>

                  {/* Delete puesto */}
                  {puestos.length > 1 && (
                    <button onClick={() => removePuesto(idx)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Eliminar puesto">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" strokeWidth="2" /></svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Puesto Table */}
              <div className="p-5">
                <ItemsTable
                  items={puesto.items}
                  onChange={(items) => updatePuestoItems(idx, items)}
                />
              </div>
            </div>
          ))}

          {/* Add puesto button */}
          <button onClick={addPuesto}
            className="w-full py-4 rounded-2xl border-2 border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50/50 
                       text-sm font-semibold text-slate-400 hover:text-blue-600 transition-all flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" d="M12 5v14M5 12h14" strokeWidth="2.5" /></svg>
            Agregar puesto de trabajo
          </button>

        </div>
      </div>

      {/* ── Delete Modal ── */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white border border-slate-200 rounded-2xl p-7 max-w-sm w-full shadow-2xl">
            <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" strokeWidth="2" /></svg>
            </div>
            <h3 className="font-bold text-slate-800 text-lg mb-2">¿Eliminar pedido?</h3>
            <p className="text-sm text-slate-500 mb-6">
              Se eliminará <span className="text-slate-700 font-semibold">#{form.numero_pedido || currentId}</span> con {puestos.length} puesto(s) de trabajo. No se puede deshacer.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteModal(false)} className="px-4 py-2 rounded-lg text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">Cancelar</button>
              <button onClick={confirmDelete} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-500 transition-colors">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      <Toast toasts={toasts} />
    </div>
  )
}
