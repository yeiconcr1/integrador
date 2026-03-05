import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  fetchPedidos, fetchPedido, createPedido, updatePedido, deletePedido,
  downloadExcel, emptyItem, emptyPuesto, getUser, logout
} from './api'
import ItemsTable from './components/ItemsTable'
import Toast, { useToast } from './components/Toast'
import Login from './components/Login'
import UserAdmin from './components/UserAdmin'
import DataMaintenance from './components/DataMaintenance'

const today = new Date().toISOString().slice(0, 10)
function newForm(disenador = '') {
  return { numero_pedido: '', fecha: today, cliente: '', proyecto: '', disenador, asesor: '' }
}

function normalizePuestoName(name, index) {
  const value = String(name || '').trim().toUpperCase()
  return value || `PUESTO ${index + 1}`
}

export default function App() {
  const [user, setUser] = useState(getUser())
  const [pedidos, setPedidos] = useState([])
  const [currentId, setCurrentId] = useState(null)
  const [form, setForm] = useState(newForm(user?.nombre || ''))
  const [puestos, setPuestos] = useState([{ ...emptyPuesto(1), nombre: 'PUESTO 1' }])
  const [search, setSearch] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [currentView, setCurrentView] = useState('pedidos') // 'pedidos' | 'usuarios' | 'mantenimiento'
  const [saving, setSaving] = useState(false)
  const [deleteModal, setDeleteModal] = useState(false)
  const [deletePuestoModal, setDeletePuestoModal] = useState(null) // { idx, nombre, itemCount }
  const [warningModal, setWarningModal] = useState(null) // { warnings: [...], payload: {...} }
  const [puestosMateriales, setPuestosMateriales] = useState({}) // puestoIdx → materialesMap
  const [headerErrors, setHeaderErrors] = useState({}) // field → error message
  const [savedSnapshot, setSavedSnapshot] = useState(null) // snapshot after save/load
  const [invalidCells, setInvalidCells] = useState(new Set()) // set of 'puestoIdx-itemIdx' keys
  const { toasts, show, remove } = useToast()
  const deletePedidoRef = useRef(null)
  const deletePuestoRef = useRef(null)
  const warningRef = useRef(null)

  // Check if form has unsaved changes
  const isDirty = useMemo(() => {
    if (!savedSnapshot) return false
    const current = JSON.stringify({ form, puestos: puestos.map(p => ({ nombre: p.nombre, items: p.items.map(it => ({ codigo: it.codigo, descripcion: it.descripcion, nota_h: it.nota_h, nota_l: it.nota_l, nota_prof: it.nota_prof, nota_adicional: it.nota_adicional, cantidad_unitaria: it.cantidad_unitaria, cantidad_tipologia: it.cantidad_tipologia, cantidad_total: it.cantidad_total, pintura: it.pintura, acabados_adicional: it.acabados_adicional, formica: it.formica, supercor: it.supercor, canto: it.canto, madecanto: it.madecanto, vidrio: it.vidrio, tela: it.tela, render: it.render })) })) })
    return current !== savedSnapshot
  }, [form, puestos, savedSnapshot])

  // ─── DATA LOADERS ────────────────────────────────────────────────────────
  const loadList = useCallback(async () => {
    try {
      const list = await fetchPedidos()
      setPedidos(list)
    } catch (err) {
      show('Error cargando lista de pedidos', 'error')
    }
  }, []) // Eliminamos 'show' de las dependencias

  const loadPedido = useCallback(async (id) => {
    try {
      const data = await fetchPedido(id)
      setForm({
        numero_pedido: data.numero_pedido || '',
        fecha: data.fecha || today,
        cliente: data.cliente || '',
        proyecto: data.proyecto || '',
        disenador: data.disenador || '',
        asesor: data.asesor || ''
      })
      setPuestos(data.puestos || [{ ...emptyPuesto(1), nombre: 'PUESTO 1' }])
      setCurrentId(id)
      setHeaderErrors({})
      setInvalidCells(new Set())
      // Save snapshot after load
      const cleanPuestos = (data.puestos || []).map(p => ({ nombre: p.nombre, items: p.items.map(it => ({ codigo: it.codigo, descripcion: it.descripcion, nota_h: it.nota_h, nota_l: it.nota_l, nota_prof: it.nota_prof, nota_adicional: it.nota_adicional, cantidad_unitaria: it.cantidad_unitaria, cantidad_tipologia: it.cantidad_tipologia, cantidad_total: it.cantidad_total, pintura: it.pintura, acabados_adicional: it.acabados_adicional, formica: it.formica, supercor: it.supercor, canto: it.canto, madecanto: it.madecanto, vidrio: it.vidrio, tela: it.tela, render: it.render })) }))
      setSavedSnapshot(JSON.stringify({ form: { numero_pedido: data.numero_pedido || '', fecha: data.fecha || today, cliente: data.cliente || '', proyecto: data.proyecto || '', disenador: data.disenador || '', asesor: data.asesor || '' }, puestos: cleanPuestos }))
    } catch (err) {
      show('Error cargando pedido', 'error')
    }
  }, []) // Eliminamos 'show' de las dependencias

  useEffect(() => {
    // Solo cargar pedidos si el usuario está autenticado
    if (user) {
      loadList()
    }
  }, [user]) // Dependemos de 'user' para cargar cuando se autentique

  useEffect(() => {
    const handleUnauthorized = () => {
      logout()
      setUser(null)
      // Usar setTimeout para evitar conflictos si show intenta actualizar el estado al mismo tiempo
      setTimeout(() => show('Tu sesión expiró. Por favor, inicia sesión de nuevo.', 'error'), 50)
    }
    window.addEventListener('unauthorized', handleUnauthorized)
    return () => window.removeEventListener('unauthorized', handleUnauthorized)
  }, [show])

  // ─── ACTIONS ──────────────────────────────────────────────────────────────
  const newPedido = () => {
    setCurrentId(null)
    setForm(newForm(user?.nombre || ''))
    setPuestos([{ ...emptyPuesto(1), nombre: 'PUESTO 1' }])
    setHeaderErrors({})
    setInvalidCells(new Set())
    setSavedSnapshot(null)
  }

  const openPedido = async (id) => {
    await loadPedido(id)
  }

  const save = async (forceSkipWarnings = false) => {
    // Header validations
    const newErrors = {}
    if (!form.numero_pedido?.trim()) newErrors.numero_pedido = 'Requerido'
    if (!form.cliente?.trim()) newErrors.cliente = 'Requerido'
    if (Object.keys(newErrors).length > 0) {
      setHeaderErrors(newErrors)
      show('Corrige los campos requeridos', 'error')
      return
    }

    // Build payload
    const payload = { form, puestos: puestos.map(p => ({ nombre: p.nombre, items: p.items })) }

    // Remove empty items
    let emptyRowsRemoved = 0
    payload.puestos = payload.puestos.map(p => {
      const filtered = p.items.filter(it => !isEmptyItem(it))
      emptyRowsRemoved += p.items.length - filtered.length
      return { ...p, items: filtered.length > 0 ? filtered : [emptyItem()] }
    })

    if (emptyRowsRemoved > 0) {
      show(`${emptyRowsRemoved} fila${emptyRowsRemoved > 1 ? 's' : ''} vacía${emptyRowsRemoved > 1 ? 's' : ''} eliminada${emptyRowsRemoved > 1 ? 's' : ''}`, 'info')
    }

    // ── SOFT validations (warnings — show modal, user decides) ──
    if (!forceSkipWarnings) {
      const warnings = []

      // Check items without code
      puestos.forEach((puesto, pIdx) => {
        const emptyCodeItems = puesto.items.filter(it => !it.codigo?.trim() && (it.descripcion?.trim() || it.nota_h || it.nota_l || it.nota_prof))
        if (emptyCodeItems.length > 0) {
          warnings.push({
            type: 'empty-code',
            icon: '📋',
            message: `${puesto.nombre}: ${emptyCodeItems.length} ítem(s) sin código`
          })
        }
      })

      // Check items with code but without cantidad_unitaria
      puestos.forEach((puesto) => {
        const noQtyItems = puesto.items.filter(it => it.codigo?.trim() && (!it.cantidad_unitaria || parseFloat(it.cantidad_unitaria) <= 0))
        if (noQtyItems.length > 0) {
          warnings.push({
            type: 'missing-qty',
            icon: '🔢',
            message: `${puesto.nombre}: ${noQtyItems.length} ítem(s) sin cantidad unitaria`
          })
        }
      })

      // Check required materials not filled
      const materialLabels = { pintura: 'Pintura', formica: 'Fórmica', supercor: 'Supercor', canto: 'Canto', madecanto: 'Madecanto', vidrio: 'Vidrio', tela: 'Tela' }
      puestos.forEach((puesto, pIdx) => {
        const matsMap = puestosMateriales[pIdx]
        if (!matsMap) return
        puesto.items.forEach((item) => {
          const itemId = item._id
          const mats = matsMap[itemId]
          if (!mats) return
          const missing = []
          mats.forEach(tipo => {
            if (!item[tipo]?.trim()) missing.push(materialLabels[tipo] || tipo)
          })
          if (missing.length > 0) {
            warnings.push({
              type: 'missing-material',
              icon: '🎨',
              message: `${puesto.nombre} → ${item.codigo || 'Sin código'}: falta ${missing.join(', ')}`
            })
          }
        })
      })

      if (warnings.length > 0) {
        setWarningModal({ warnings, payload })
        warningRef.current?.showModal()
        return
      }
    }

    // ── Actually save ──
    setSaving(true)
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
      // Remove empty rows from local state so they disappear
      if (emptyRowsRemoved > 0) {
        setPuestos(prev => prev.map(p => {
          const kept = p.items.filter(it => !isEmptyItem(it))
          return { ...p, items: kept.length > 0 ? kept : [emptyItem()] }
        }))
      }
      // Update snapshot after successful save
      const cleanPuestos = puestos.map(p => ({ nombre: p.nombre, items: p.items.filter(it => !isEmptyItem(it)).map(it => ({ codigo: it.codigo, descripcion: it.descripcion, nota_h: it.nota_h, nota_l: it.nota_l, nota_prof: it.nota_prof, nota_adicional: it.nota_adicional, cantidad_unitaria: it.cantidad_unitaria, cantidad_tipologia: it.cantidad_tipologia, cantidad_total: it.cantidad_total, pintura: it.pintura, acabados_adicional: it.acabados_adicional, formica: it.formica, supercor: it.supercor, canto: it.canto, madecanto: it.madecanto, vidrio: it.vidrio, tela: it.tela, render: it.render })) }))
      setSavedSnapshot(JSON.stringify({ form, puestos: cleanPuestos }))
    } catch (err) {
      const msg = err?.message || 'Error al guardar'
      show(msg, 'error')
    }
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
    const p = puestos[idx]
    setDeletePuestoModal({ idx, nombre: p.nombre || `Puesto ${idx + 1}`, itemCount: (p.items || []).length })
    deletePuestoRef.current?.showModal()
  }

  const confirmRemovePuesto = () => {
    if (!deletePuestoModal) return
    setPuestos(prev => prev.filter((_, i) => i !== deletePuestoModal.idx))
    show(`Puesto "${deletePuestoModal.nombre}" eliminado`, 'info')
    setDeletePuestoModal(null)
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
  const pageTitle = currentId ? `Pedido ${form.numero_pedido || currentId}` : 'Nuevo Pedido'

  if (!user) {
    return <Login onLogin={setUser} />
  }

  const handleLogout = () => {
    logout()
    setUser(null)
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: '#e8ecf1' }}>
      <Toast toasts={toasts} onRemove={remove} />

      {/* ═══ ORACLE EBS GLOBAL HEADER ═══ */}
      <header className="ebs-header flex items-center justify-between px-4 py-1.5 flex-shrink-0">
        <div className="flex items-center gap-4">
          <img src="/logo-carvajal.png" alt="Carvajal Espacios" className="h-8 brightness-0 invert opacity-90" />
          <div className="h-5 w-px bg-white/20" />
          <span className="text-[11px] font-semibold text-white/80 tracking-wide">INTEGRADOR DE PEDIDOS</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-white/60">
          <span className="font-semibold text-white/90">{user.nombre}</span>
          <span>·</span>
          <span className="text-emerald-300">{user.rol === 'admin' ? 'Administrador' : 'Diseñador'}</span>
          <span>·</span>
          <button onClick={handleLogout} className="hover:text-white transition-colors underline decoration-white/30 underline-offset-2">Salir</button>
        </div>
      </header>

      {currentView === 'usuarios' && (
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* ═══ ORACLE EBS TOOLBAR ═══ */}
          <div className="ebs-toolbar flex items-center justify-between px-4 py-1 flex-shrink-0">
            <div className="flex items-center gap-2">
              <button onClick={() => setCurrentView('pedidos')} className="ebs-btn flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" strokeWidth="2" /></svg>
                Volver a Pedidos
              </button>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
              <span className="font-semibold text-[#1a3a5c]">Módulo de Administración</span>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            <UserAdmin />
          </div>
        </div>
      )}

      {currentView === 'mantenimiento' && (
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* ═══ ORACLE EBS TOOLBAR ═══ */}
          <div className="ebs-toolbar flex items-center justify-between px-4 py-1 flex-shrink-0">
            <div className="flex items-center gap-2">
              <button onClick={() => setCurrentView('pedidos')} className="ebs-btn flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" strokeWidth="2" /></svg>
                Volver a Pedidos
              </button>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
              <span className="font-semibold text-[#1a3a5c]">Mantenimiento de Datos BOM</span>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            <DataMaintenance showToast={show} />
          </div>
        </div>
      )}

      {currentView === 'pedidos' && (
        <>
          {/* ═══ ORACLE EBS TOOLBAR ═══ */}
          <div className="ebs-toolbar flex items-center justify-between px-4 py-1 flex-shrink-0">
            <div className="flex items-center gap-2">
              <button onClick={() => setSidebarOpen(o => !o)}
                className="ebs-btn flex items-center gap-1" title="Navegador">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" d="M3 6h18M3 12h18M3 18h18" strokeWidth="2" /></svg>
                Navegador
              </button>
              <div className="h-4 w-px bg-gray-400" />
              <button onClick={newPedido} className="ebs-btn flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" d="M12 5v14M5 12h14" strokeWidth="2.5" /></svg>
                Nuevo
              </button>
              {user.rol === 'admin' && (
                <>
                  <button onClick={() => setCurrentView('usuarios')} className="ebs-btn flex items-center gap-1 text-[#3a5a8a] py-0.5 px-2 hover:bg-[#d5def0]">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" strokeWidth="2" /></svg>
                    Usuarios
                  </button>
                  <button onClick={() => setCurrentView('mantenimiento')} className="ebs-btn flex items-center gap-1 text-[#3a5a8a] py-0.5 px-2 hover:bg-[#d5def0]">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" strokeWidth="2" /></svg>
                    Datos BOM
                  </button>
                </>
              )}
              <button onClick={save} disabled={saving} className="ebs-btn ebs-btn-primary flex items-center gap-1 relative">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" strokeWidth="2" /></svg>
                {saving ? 'Guardando…' : 'Guardar'}
                {isDirty && !saving && (
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: '#c9930a',
                    position: 'absolute', top: 2, right: 2,
                    animation: 'pulse 1.5s infinite',
                    boxShadow: '0 0 4px #c9930a',
                  }} />
                )}
              </button>
              {currentId && (
                <button onClick={() => { setDeleteModal(true); deletePedidoRef.current?.showModal() }}
                  className="ebs-btn ebs-btn-danger flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" strokeWidth="2" /></svg>
                  Eliminar
                </button>
              )}
              <div className="h-4 w-px bg-gray-400" />
              <button onClick={handleExport} className="ebs-btn ebs-btn-success flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeWidth="2" /></svg>
                Excel
              </button>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
              <span className="font-semibold">{pageTitle}</span>
              <span className="text-gray-400">|</span>
              <span>{puestos.length} puesto{puestos.length !== 1 ? 's' : ''} · {totalItems} ítem{totalItems !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {/* ═══ MAIN LAYOUT: SIDEBAR + CONTENT ═══ */}
          <div className="flex flex-1 overflow-hidden">
            {/* ─── SIDEBAR (Navigator) ─── */}
            <aside className={`flex-shrink-0 flex flex-col ebs-nav transition-all duration-200
                         ${sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'}`}>
              <div className="px-3 py-2 border-b border-gray-300">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-[#3a5a8a]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" strokeWidth="2" /></svg>
                  <span className="text-[11px] font-bold text-[#333] tracking-wide uppercase">Navegador</span>
                </div>
              </div>

              <div className="px-3 py-2 border-b border-gray-300">
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="N° pedido, cliente o proyecto…"
                  className="ebs-input w-full px-2 py-1.5 text-[11px]" />
              </div>

              <div className="flex-1 overflow-y-auto">
                {filtered.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-[11px] text-gray-400">Sin resultados</p>
                    {/* Depuración: mostrar si hay pedidos pero el filtro los oculta */}
                    {pedidos.length > 0 && (
                      <p className="text-[11px] text-red-500 mt-2 font-bold">Pedidos cargados: {pedidos.length} (el filtro de búsqueda los está ocultando)</p>
                    )}
                  </div>
                ) : filtered.map(p => (
                  <button key={p.id} onClick={() => openPedido(p.id)}
                    className={`w-full text-left px-3 py-2 border-b border-gray-200 transition-colors text-[11px]
                ${p.id === currentId ? 'sidebar-active' : 'hover:bg-[#e4e9f0]'}`}>
                    <div className="flex items-center justify-between">
                      <span className={`font-bold ${p.id === currentId ? 'text-[#1a3a5c]' : 'text-gray-600'}`}>
                        {p.numero_pedido || p.id}
                      </span>
                      <span className="text-[10px] text-gray-400">{p.fecha}</span>
                    </div>
                    <div className="text-[11px] text-gray-700 truncate mt-0.5">{p.proyecto || p.cliente || 'Sin proyecto'}</div>
                    <div className="flex gap-2 mt-0.5">
                      <span className="text-[10px] text-[#3a5a8a] font-medium">{p.total_puestos} PT</span>
                      <span className="text-[10px] text-gray-400">{p.total_items} ítems</span>
                    </div>
                  </button>
                ))}
              </div>
            </aside>

            {/* ─── MAIN CONTENT ─── */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

              {/* Scrollable Content — puestos stacked vertically */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">

                {/* Header Card — Oracle EBS Form Region */}
                <div className="ebs-form-region">
                  <div className="ebs-form-region-header flex items-center gap-2">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" strokeWidth="2" /></svg>
                    Información del Pedido
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                      {[
                        { id: 'numero_pedido', label: 'N° Pedido', placeholder: 'Ej: 24219599', required: true },
                        { id: 'fecha', label: 'Fecha', type: 'date' },
                        { id: 'cliente', label: 'Cliente', placeholder: 'Nombre del cliente', required: true },
                        { id: 'proyecto', label: 'Proyecto', placeholder: 'Nombre del proyecto' },
                        { id: 'disenador', label: 'Diseñador', placeholder: 'Nombre del diseñador' },
                        { id: 'asesor', label: 'Asesor Comercial', placeholder: 'Nombre del asesor' },
                      ].map(f => (
                        <div key={f.id} className="flex flex-col gap-1">
                          <label className="ebs-label">
                            {f.label}
                            {f.required && <span className="text-red-500 ml-0.5">*</span>}
                          </label>
                          <input type={f.type || 'text'} value={form[f.id]}
                            onChange={e => {
                              setForm(fm => ({ ...fm, [f.id]: e.target.value }))
                              if (headerErrors[f.id]) setHeaderErrors(prev => { const n = { ...prev }; delete n[f.id]; return n })
                              if ((f.id === 'cliente' || f.id === 'proyecto') && headerErrors.cliente) {
                                setHeaderErrors(prev => { const n = { ...prev }; delete n.cliente; return n })
                              }
                            }}
                            placeholder={f.placeholder || ''}
                            className={`ebs-input ${headerErrors[f.id] ? 'ebs-input-error' : ''}`} />
                          {headerErrors[f.id] && (
                            <span className="text-[10px] text-red-600 font-medium">{headerErrors[f.id]}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── ALL PUESTOS STACKED VERTICALLY ── */}
                {puestos.map((puesto, idx) => (
                  <div key={puesto._id} className="ebs-form-region">

                    {/* Puesto Header — Oracle EBS region header */}
                    <div className="ebs-form-region-header flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="bg-white/20 rounded px-1.5 py-0.5 text-[10px] font-bold">{idx + 1}</span>
                        <input
                          value={puesto.nombre}
                          onChange={e => renamePuesto(idx, e.target.value)}
                          className="bg-transparent border-0 text-[12px] font-semibold text-white focus:outline-none placeholder:text-white/50 w-52"
                          placeholder="Nombre del puesto…"
                        />
                        <span className="text-[10px] text-white/60">
                          {puesto.items.length} ítem{puesto.items.length !== 1 ? 's' : ''}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button onClick={() => duplicatePuesto(idx)}
                          className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                          title="Duplicar este puesto">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="8" y="8" width="12" height="12" rx="2" strokeWidth="2" /><path d="M4 16V6a2 2 0 012-2h10" strokeWidth="2" /></svg>
                          Duplicar
                        </button>
                        {puestos.length > 1 && (
                          <button onClick={() => removePuesto(idx)}
                            className="p-1 rounded text-white/50 hover:text-red-300 hover:bg-white/10 transition-colors"
                            title="Eliminar puesto">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" strokeWidth="2" /></svg>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Puesto Table */}
                    <div className="p-3">
                      <ItemsTable
                        items={puesto.items}
                        onChange={(items) => updatePuestoItems(idx, items)}
                        onMaterialesChange={(matsMap) => setPuestosMateriales(prev => ({ ...prev, [idx]: matsMap }))}
                        invalidCells={invalidCells}
                        puestoIdx={idx}
                      />
                    </div>
                  </div>
                ))}

                {/* Add puesto button */}
                <button onClick={addPuesto}
                  className="ebs-btn w-full py-2.5 flex items-center justify-center gap-2 text-[11px]">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" d="M12 5v14M5 12h14" strokeWidth="2.5" /></svg>
                  Agregar puesto de trabajo
                </button>

              </div>
            </div>
          </div>

          {/* ── Warning Modal (soft validations) ── */}
          <dialog ref={warningRef} className="modal modal-bottom sm:modal-middle">
            <div className="modal-box">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-warning/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" strokeWidth="2" /></svg>
                </div>
                <div>
                  <h3 className="font-bold text-lg">Advertencias al guardar</h3>
                  {warningModal && <p className="text-sm text-base-content/60">Se encontraron {warningModal.warnings.length} advertencia{warningModal.warnings.length !== 1 ? 's' : ''}</p>}
                </div>
              </div>
              {warningModal && (
                <div className="max-h-60 overflow-y-auto space-y-1.5 my-4">
                  {warningModal.warnings.map((w, i) => (
                    <div key={i} className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-sm
                  ${w.type === 'missing-material' ? 'bg-warning/10 text-warning-content' : 'bg-base-200 text-base-content/80'}`}>
                      <span className="flex-shrink-0 text-base">{w.icon}</span>
                      <span>{w.message}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="modal-action">
                <button onClick={() => { warningRef.current?.close(); setWarningModal(null) }} className="btn btn-ghost">Corregir</button>
                <button onClick={() => { warningRef.current?.close(); setWarningModal(null); save(true) }} className="btn btn-warning">Guardar de todos modos</button>
              </div>
            </div>
            <form method="dialog" className="modal-backdrop"><button onClick={() => setWarningModal(null)}>close</button></form>
          </dialog>

          {/* ── Delete Puesto Modal ── */}
          <dialog ref={deletePuestoRef} className="modal modal-bottom sm:modal-middle">
            <div className="modal-box">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-error/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" strokeWidth="2" /></svg>
                </div>
                <h3 className="font-bold text-lg">¿Eliminar puesto de trabajo?</h3>
              </div>
              {deletePuestoModal && (
                <p className="text-sm text-base-content/60 mb-1">
                  Se eliminará <span className="font-semibold text-base-content">{deletePuestoModal.nombre}</span> con {deletePuestoModal.itemCount} artículo{deletePuestoModal.itemCount !== 1 ? 's' : ''}. Esta acción no se puede deshacer.
                </p>
              )}
              <div className="modal-action">
                <button onClick={() => { deletePuestoRef.current?.close(); setDeletePuestoModal(null) }} className="btn btn-ghost">Cancelar</button>
                <button onClick={() => { confirmRemovePuesto(); deletePuestoRef.current?.close() }} className="btn btn-error">Eliminar</button>
              </div>
            </div>
            <form method="dialog" className="modal-backdrop"><button onClick={() => setDeletePuestoModal(null)}>close</button></form>
          </dialog>

          {/* ── Delete Pedido Modal ── */}
          <dialog ref={deletePedidoRef} className="modal modal-bottom sm:modal-middle">
            <div className="modal-box">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-error/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" strokeWidth="2" /></svg>
                </div>
                <h3 className="font-bold text-lg">¿Eliminar pedido?</h3>
              </div>
              <p className="text-sm text-base-content/60 mb-1">
                Se eliminará <span className="font-semibold text-base-content">{form.numero_pedido || currentId}</span> con {puestos.length} puesto(s) de trabajo. Esta acción no se puede deshacer.
              </p>
              <div className="modal-action">
                <button onClick={() => { deletePedidoRef.current?.close(); setDeleteModal(false) }} className="btn btn-ghost">Cancelar</button>
                <button onClick={() => { confirmDelete(); deletePedidoRef.current?.close() }} className="btn btn-error">Eliminar</button>
              </div>
            </div>
            <form method="dialog" className="modal-backdrop"><button onClick={() => setDeleteModal(false)}>close</button></form>
          </dialog>
        </>
      )}
    </div>
  )
}
