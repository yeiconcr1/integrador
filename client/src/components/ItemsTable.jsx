import { useState, useCallback, useEffect, useRef } from 'react'
import AutocompleteInput from './AutocompleteInput'
import { emptyItem, lookupArticleByCode, fetchMateriales } from '../api'

const COLUMNS = [
    { key: 'codigo', label: 'Código', w: 'w-[100px] min-w-[100px]', isCode: true, group: 'id' },
    { key: 'descripcion', label: 'Descripción', w: 'w-[200px] min-w-[200px]', search: true, group: 'id' },
    { key: 'nota_h', label: 'H', w: 'w-[48px]  min-w-[48px]', group: 'dims' },
    { key: 'nota_l', label: 'L', w: 'w-[48px]  min-w-[48px]', group: 'dims' },
    { key: 'nota_prof', label: 'Prof', w: 'w-[48px]  min-w-[48px]', group: 'dims' },
    { key: 'nota_adicional', label: 'Notas', w: 'w-[70px]  min-w-[70px]', group: 'dims' },
    { key: 'cantidad_unitaria', label: 'Unit.', w: 'w-[55px]  min-w-[55px]', qty: true, group: 'qty' },
    { key: 'cantidad_tipologia', label: 'Tipo.', w: 'w-[55px]  min-w-[55px]', qty: true, group: 'qty' },
    { key: 'cantidad_total', label: 'Total', w: 'w-[55px]  min-w-[55px]', qty: true, total: true, group: 'qty' },
    { key: 'pintura', label: 'Pintura', w: 'w-[180px] min-w-[180px]', tipo: 'pintura', accent: 'emerald', group: 'mat' },
    { key: 'acabados_adicional', label: 'Acab. Adic.', w: 'w-[180px] min-w-[180px]', wrap: true, group: 'mat' },
    { key: 'formica', label: 'Fórmica', w: 'w-[160px] min-w-[160px]', tipo: 'formica', accent: 'amber', group: 'mat' },
    { key: 'supercor', label: 'Supercor', w: 'w-[160px] min-w-[160px]', tipo: 'supercor', accent: 'cyan', group: 'mat' },
    { key: 'canto', label: 'Canto', w: 'w-[160px] min-w-[160px]', tipo: 'canto', accent: 'purple', group: 'mat' },
    { key: 'madecanto', label: 'Madecanto', w: 'w-[150px] min-w-[150px]', tipo: 'madecanto', accent: 'pink', group: 'mat' },
    { key: 'vidrio', label: 'Vidrio', w: 'w-[130px] min-w-[130px]', tipo: 'vidrio', accent: 'sky', group: 'mat' },
    { key: 'tela', label: 'Tela / Fiber', w: 'w-[180px] min-w-[180px]', tipo: 'tela', accent: 'rose', group: 'mat' },
]

// Colores suaves para indicador de material requerido (borde izquierdo + fondo tenue)
const MATERIAL_REQUIRED = {
    pintura: 'border-l-[3px] border-l-emerald-400 bg-emerald-50/40',
    formica: 'border-l-[3px] border-l-amber-400 bg-amber-50/40',
    supercor: 'border-l-[3px] border-l-cyan-400 bg-cyan-50/40',
    canto: 'border-l-[3px] border-l-purple-400 bg-purple-50/40',
    madecanto: 'border-l-[3px] border-l-pink-400 bg-pink-50/40',
    vidrio: 'border-l-[3px] border-l-sky-400 bg-sky-50/40',
    tela: 'border-l-[3px] border-l-rose-400 bg-rose-50/40',
}

// Header colors for material columns
const HEADER_ACCENT = {
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    cyan: 'bg-cyan-50 text-cyan-700',
    purple: 'bg-purple-50 text-purple-700',
    pink: 'bg-pink-50 text-pink-700',
    sky: 'bg-sky-50 text-sky-700',
    rose: 'bg-rose-50 text-rose-700',
}

// Tipos de material que pueden ser bloqueados
const MATERIAL_KEYS = COLUMNS.filter(c => c.tipo).map(c => c.key)

export default function ItemsTable({ items, onChange, onMaterialesChange, invalidCells = new Set(), puestoIdx = 0 }) {
    // Map: item _id → Set of material types from BOM
    const [materialesMap, setMaterialesMap] = useState({})
    const [scrollbarMeta, setScrollbarMeta] = useState({ show: false, thumbWidth: 0, thumbLeft: 0, canLeft: false, canRight: false })
    const [deleteConfirm, setDeleteConfirm] = useState(null) // { idx, codigo }
    // Track which codes we've already loaded to avoid re-fetching
    const loadedCodesRef = useRef(new Set())
    const tableScrollRef = useRef(null)
    const scrollTrackRef = useRef(null)
    const draggingRef = useRef({ active: false, startX: 0, startLeft: 0 })

    // Notify parent whenever materialesMap changes (for validation)
    useEffect(() => {
        if (onMaterialesChange) onMaterialesChange(materialesMap)
    }, [materialesMap])  // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-load materiales for all items that already have a code (e.g. when opening a saved pedido)
    useEffect(() => {
        const toLoad = items.filter(it => it.codigo?.trim() && !loadedCodesRef.current.has(it._id + ':' + it.codigo))
        if (toLoad.length === 0) return

        toLoad.forEach(it => loadedCodesRef.current.add(it._id + ':' + it.codigo))

        // Fetch all in parallel without cleaning existing material values
        Promise.all(
            toLoad.map(async (it) => {
                const mats = await fetchMateriales(it.codigo)
                return { itemId: it._id, mats: new Set(mats) }
            })
        ).then(results => {
            setMaterialesMap(prev => {
                const next = { ...prev }
                for (const { itemId, mats } of results) {
                    if (mats.size > 0) next[itemId] = mats
                }
                return next
            })
        })
    }, [items])

    const updateScrollbarMeta = useCallback(() => {
        const container = tableScrollRef.current
        if (!container) return

        const visible = container.clientWidth
        const total = container.scrollWidth
        const maxScroll = Math.max(total - visible, 0)
        const trackWidth = scrollTrackRef.current?.clientWidth || Math.max(visible - 36, 1)

        if (maxScroll <= 0) {
            setScrollbarMeta({ show: false, thumbWidth: 0, thumbLeft: 0, canLeft: false, canRight: false })
            return
        }

        const minThumb = 44
        const thumbWidth = Math.min(Math.max((visible / total) * trackWidth, minThumb), trackWidth)
        const trackRange = Math.max(trackWidth - thumbWidth, 1)
        const thumbLeft = (container.scrollLeft / maxScroll) * trackRange

        setScrollbarMeta({
            show: true,
            thumbWidth,
            thumbLeft,
            canLeft: container.scrollLeft > 0,
            canRight: container.scrollLeft < maxScroll - 1,
        })
    }, [])

    useEffect(() => {
        updateScrollbarMeta()
        window.addEventListener('resize', updateScrollbarMeta)
        return () => window.removeEventListener('resize', updateScrollbarMeta)
    }, [updateScrollbarMeta, items.length])

    useEffect(() => {
        const onMove = (e) => {
            if (!draggingRef.current.active) return
            const container = tableScrollRef.current
            const track = scrollTrackRef.current
            if (!container || !track) return

            const visible = container.clientWidth
            const total = container.scrollWidth
            const maxScroll = Math.max(total - visible, 0)
            if (maxScroll <= 0) return

            const trackWidth = track.clientWidth
            const trackRange = Math.max(trackWidth - scrollbarMeta.thumbWidth, 1)
            const deltaX = e.clientX - draggingRef.current.startX
            const nextThumb = Math.min(Math.max(draggingRef.current.startLeft + deltaX, 0), trackRange)
            container.scrollLeft = (nextThumb / trackRange) * maxScroll
            updateScrollbarMeta()
        }

        const onUp = () => { draggingRef.current.active = false }

        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
        return () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
        }
    }, [scrollbarMeta.thumbWidth, scrollbarMeta.thumbLeft, updateScrollbarMeta])

    const syncFromTable = () => updateScrollbarMeta()

    const onTrackMouseDown = (e) => {
        const container = tableScrollRef.current
        const track = scrollTrackRef.current
        if (!container || !track) return
        const rect = track.getBoundingClientRect()
        const clickX = e.clientX - rect.left
        const thumbCenter = scrollbarMeta.thumbWidth / 2
        const visible = container.clientWidth
        const total = container.scrollWidth
        const maxScroll = Math.max(total - visible, 0)
        const trackRange = Math.max(track.clientWidth - scrollbarMeta.thumbWidth, 1)
        const nextThumb = Math.min(Math.max(clickX - thumbCenter, 0), trackRange)
        container.scrollLeft = (nextThumb / trackRange) * maxScroll
        updateScrollbarMeta()
    }

    const onThumbMouseDown = (e) => {
        e.stopPropagation()
        draggingRef.current = {
            active: true,
            startX: e.clientX,
            startLeft: scrollbarMeta.thumbLeft,
        }
    }

    const scrollByStep = (direction) => {
        const container = tableScrollRef.current
        if (!container) return
        container.scrollLeft += direction * 120
        updateScrollbarMeta()
    }

    const updateItem = (idx, key, val) => {
        const updated = items.map((it, i) => {
            if (i !== idx) return it
            const next = { ...it, [key]: val }
            if (key === 'cantidad_unitaria' || key === 'cantidad_tipologia') {
                const u = parseFloat(key === 'cantidad_unitaria' ? val : it.cantidad_unitaria) || 0
                const t = parseFloat(key === 'cantidad_tipologia' ? val : it.cantidad_tipologia) || 0
                next.cantidad_total = t > 0 ? String(u * t) : u ? String(u) : ''
            }
            // Limpieza inmediata de descripción al borrar código
            if (key === 'codigo' && !val) {
                next.descripcion = ''
            }
            return next
        })
        onChange(updated)
    }

    const loadMateriales = useCallback(async (itemId, code, idx, currentItems) => {
        if (!code) {
            setMaterialesMap(prev => { const n = { ...prev }; delete n[itemId]; return n })
            return
        }
        // Mark as loaded to avoid duplicate auto-load
        loadedCodesRef.current.add(itemId + ':' + code)

        const mats = await fetchMateriales(code)
        const matsSet = new Set(mats)
        setMaterialesMap(prev => ({ ...prev, [itemId]: matsSet }))

        // Limpiar valores en campos de material que no aplican
        if (mats.length > 0) {
            const itemsToUse = currentItems || items
            const item = itemsToUse[idx]
            if (!item) return
            const cleanups = {}
            for (const col of COLUMNS) {
                if (col.tipo && !matsSet.has(col.tipo) && item[col.key]) {
                    cleanups[col.key] = ''
                }
            }
            if (Object.keys(cleanups).length > 0) {
                onChange(itemsToUse.map((it, i) => i === idx ? { ...it, ...cleanups } : it))
            }
        }
    }, [items, onChange])

    const handleCodeLookup = async (idx, code) => {
        const item = items[idx]
        const itemId = item._id || idx

        if (!code) {
            const updatedItems = items.map((it, i) => {
                if (i !== idx) return it
                return { ...it, descripcion: '' }
            })
            onChange(updatedItems)
            loadMateriales(itemId, "", idx, updatedItems)
            return
        }

        const article = await lookupArticleByCode(code)
        let updatedItems = items
        if (article) {
            updatedItems = items.map((it, i) => {
                if (i !== idx) return it
                return { ...it, codigo: article.codigo, descripcion: article.descripcion }
            })
            onChange(updatedItems)
        } else {
            updatedItems = items.map((it, i) => {
                if (i !== idx) return it
                return { ...it, descripcion: '' }
            })
            onChange(updatedItems)
        }
        // Cargar materiales del BOM para este código
        loadMateriales(itemId, code, idx, updatedItems)
    }

    const addRow = () => onChange([...items, emptyItem()])
    const removeRow = (idx) => {
        if (items.length <= 1) return
        const item = items[idx]
        setDeleteConfirm({ idx, codigo: item.codigo, descripcion: item.descripcion })
    }
    const confirmDelete = () => {
        if (!deleteConfirm) return
        onChange(items.filter((_, i) => i !== deleteConfirm.idx))
        setDeleteConfirm(null)
    }

    return (
        <div>
            {/* Table header bar */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-gray-600">Artículos</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#3a5a8a]/10 text-[#3a5a8a] font-bold">
                        {items.length}
                    </span>
                </div>
                <button onClick={addRow} className="ebs-btn flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" d="M12 5v14M5 12h14" strokeWidth="2.5" /></svg>
                    Agregar fila
                </button>
            </div>

            {/* Scrollable Table */}
            <div className="border border-gray-300 bg-white" style={{ borderRadius: '2px' }}>
                <div ref={tableScrollRef} onScroll={syncFromTable} className="overflow-x-auto hide-horizontal-scrollbar">
                    <table className="border-collapse" style={{ width: 'max-content', minWidth: '100%' }}>
                        <thead>
                            <tr className="bg-gradient-to-b from-[#e8ecf1] to-[#d8dde5] sticky top-0 z-20">
                                <th className="w-10 min-w-[40px] px-1 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-gray-500 border-b border-gray-400">
                                    #
                                </th>
                                {COLUMNS.map((col, ci) => {
                                    return (
                                        <th
                                            key={col.key}
                                            className={`${col.w} px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider whitespace-nowrap
                                      border-b border-gray-400
                                      border-l border-l-gray-400
                                      ${col.total ? 'bg-[#3a5a8a]/5 text-[#3a5a8a]' : ''}
                                      ${col.accent && HEADER_ACCENT[col.accent] ? HEADER_ACCENT[col.accent] : 'text-gray-500'}
                                    `}
                                        >
                                            {col.label}
                                        </th>
                                    )
                                })}
                                <th className="w-8 min-w-[32px] border-b border-gray-400 border-l border-l-gray-400 text-center" title="Eliminar fila">
                                    <svg className="w-3.5 h-3.5 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="2" /></svg>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, idx) => {
                                const itemId = item._id || idx
                                const mats = materialesMap[itemId]
                                const hasBomData = !!mats
                                const isInvalid = invalidCells.has(`${puestoIdx}-${idx}`)

                                return (
                                    <tr
                                        key={itemId}
                                        className={`group transition-colors duration-75 hover:bg-[#dbe4f0]/40 even:bg-gray-50/50 ${isInvalid ? '!bg-red-50' : ''}`}
                                    >
                                        <td className="px-1 h-[34px] text-center text-[10px] text-gray-400 font-medium border-b border-gray-400">
                                            {idx + 1}
                                        </td>
                                        {COLUMNS.map((col, ci) => {
                                            const isRequired = col.tipo && hasBomData && mats.has(col.tipo)
                                            const isBlocked = col.tipo && hasBomData && !mats.has(col.tipo)
                                            const requiredClass = isRequired ? (MATERIAL_REQUIRED[col.tipo] || '') : ''

                                            return (
                                                <td
                                                    key={col.key}
                                                    className={`${(col.search || col.tipo || col.wrap) ? 'min-h-[34px] align-middle' : 'h-[34px]'} border-b border-gray-400 border-l border-l-gray-400 relative p-0
                                          ${col.total ? 'bg-[#3a5a8a]/5' : ''}
                                                                                    ${requiredClass}
                                                                                    ${isBlocked ? 'bg-[repeating-linear-gradient(135deg,transparent,transparent_4px,rgba(148,163,184,0.08)_4px,rgba(148,163,184,0.08)_5px)]' : ''}
                                        `}
                                                    title={isRequired ? `Este artículo requiere ${col.label}` : isBlocked ? `No aplica ${col.label}` : undefined}
                                                >
                                                    {isRequired && !item[col.key] && (
                                                        <span className="absolute top-1 right-1 flex h-1.5 w-1.5 z-10">
                                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-50" />
                                                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current opacity-70" />
                                                        </span>
                                                    )}
                                                    {col.tipo ? (
                                                        <AutocompleteInput
                                                            value={isBlocked ? '' : (item[col.key] || '')}
                                                            onChange={val => updateItem(idx, col.key, val)}
                                                            tipo={col.tipo}
                                                            multiline
                                                            growCell
                                                            placeholder={isRequired ? '⬅ Requerido' : ''}
                                                            disabled={isBlocked}
                                                        />
                                                    ) : col.isCode ? (
                                                        <input
                                                            value={item[col.key] || ''}
                                                            onChange={e => updateItem(idx, col.key, e.target.value)}
                                                            onBlur={e => handleCodeLookup(idx, e.target.value)}
                                                            onKeyDown={e => { if (e.key === 'Enter') handleCodeLookup(idx, e.target.value) }}
                                                            placeholder="Código…"
                                                            className="cell-input w-full h-full bg-transparent border-0 px-2 text-[11px] text-gray-800 placeholder:text-gray-300 focus:outline-none"
                                                        />
                                                    ) : col.search ? (
                                                        <div
                                                            className="w-full min-h-[34px] px-2 py-1 text-[11px] text-gray-800 leading-4 whitespace-normal break-words"
                                                            title={item[col.key] || 'Sin descripción'}
                                                        >
                                                            {item[col.key] || ''}
                                                        </div>
                                                    ) : col.key === 'nota_adicional' ? (
                                                        <input
                                                            value={item[col.key] || ''}
                                                            onChange={e => updateItem(idx, col.key, e.target.value)}
                                                            className="cell-input w-full h-full bg-transparent border-0 px-2 py-1 text-[11px] leading-4 text-gray-800 focus:outline-none"
                                                            style={{ minHeight: '34px' }}
                                                        />
                                                    ) : col.wrap ? (
                                                        <textarea
                                                            value={item[col.key] || ''}
                                                            onChange={e => updateItem(idx, col.key, e.target.value)}
                                                            rows={1}
                                                            className="cell-input w-full min-h-[34px] overflow-hidden bg-transparent border-0 px-2 py-1 text-[11px] leading-4 text-gray-800 focus:outline-none resize-none"
                                                        />
                                                    ) : (
                                                        <input
                                                            value={item[col.key] || ''}
                                                            onChange={e => updateItem(idx, col.key, e.target.value)}
                                                            placeholder={col.qty ? '0' : ''}
                                                            className={`cell-input w-full h-full bg-transparent border-0 px-2 py-1 text-[11px] leading-4 placeholder:text-gray-300 focus:outline-none
                                                  ${col.qty ? 'text-right tabular-nums font-medium text-gray-600' : 'text-gray-800'}
                                                  ${col.total ? 'text-[#3a5a8a] font-bold' : ''}
                                                  ${['nota_h', 'nota_l', 'nota_prof'].includes(col.key) ? 'text-red-600 font-medium' : ''}
                                                `}
                                                        />
                                                    )}
                                                </td>
                                            )
                                        })}
                                        <td className="w-8 min-w-[32px] h-[34px] border-b border-gray-400 border-l border-l-gray-300 text-center">
                                            <button
                                                onClick={() => removeRow(idx)}
                                                className="p-0.5 text-gray-400 hover:text-red-500 transition-colors"
                                                title="Eliminar fila"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" strokeWidth="2" /></svg>
                                            </button>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
                <div className="h-[18px] border-t border-gray-300 bg-[#dce4ef] flex items-center px-[1px] gap-[1px]">
                    <button
                        type="button"
                        onClick={() => scrollByStep(-1)}
                        disabled={!scrollbarMeta.canLeft}
                        className="w-[16px] h-[16px] border border-[#7a9cc6] bg-[#dce4ef] text-[10px] leading-none flex items-center justify-center disabled:opacity-50 text-[#3a5a8a]"
                        title="Mover a la izquierda"
                    >
                        ◀
                    </button>
                    {scrollbarMeta.show && (
                        <div
                            ref={scrollTrackRef}
                            onMouseDown={onTrackMouseDown}
                            className="relative h-[16px] flex-1 border border-[#7a9cc6] bg-[repeating-linear-gradient(135deg,#e8eef4,#e8eef4_2px,#dce4ef_2px,#dce4ef_4px)] cursor-pointer"
                        >
                            <div
                                onMouseDown={onThumbMouseDown}
                                className="absolute top-0 h-[14px] mt-[1px] border border-[#4a7cc9] bg-[#7a9cc6] cursor-grab active:cursor-grabbing rounded-sm"
                                style={{ width: scrollbarMeta.thumbWidth, left: scrollbarMeta.thumbLeft }}
                            />
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={() => scrollByStep(1)}
                        disabled={!scrollbarMeta.canRight}
                        className="w-[16px] h-[16px] border border-[#7a9cc6] bg-[#dce4ef] text-[10px] leading-none flex items-center justify-center disabled:opacity-50 text-[#3a5a8a]"
                        title="Mover a la derecha"
                    >
                        ▶
                    </button>
                </div>
            </div>

            {/* Delete confirmation modal - Oracle EBS style */}
            {deleteConfirm && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)' }}>
                    <div style={{
                        width: 360,
                        border: '2px solid #4a7cc9',
                        borderRadius: 2,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                        overflow: 'hidden',
                    }}>
                        {/* EBS Header bar */}
                        <div style={{
                            background: 'linear-gradient(180deg, #1a3a5c, #0f2b47)',
                            borderBottom: '2px solid #c9930a',
                            padding: '8px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                        }}>
                            <span style={{ color: '#c9930a', fontSize: 14 }}>⚠</span>
                            <span style={{ color: '#fff', fontSize: 12, fontWeight: 600, letterSpacing: 0.3 }}>Confirmar eliminación</span>
                        </div>
                        {/* Body */}
                        <div style={{ background: '#f7f8fa', padding: '16px 16px 12px' }}>
                            <p style={{ fontSize: 12, color: '#334155', margin: 0 }}>
                                ¿Está seguro de eliminar la <strong>fila {deleteConfirm.idx + 1}</strong>
                                {deleteConfirm.codigo ? <> (Cód: <strong>{deleteConfirm.codigo}</strong>)</> : ''}?
                            </p>
                            {deleteConfirm.descripcion && (
                                <p style={{ fontSize: 11, color: '#64748b', margin: '6px 0 0' }}>
                                    {deleteConfirm.descripcion}
                                </p>
                            )}
                        </div>
                        {/* Footer buttons */}
                        <div style={{
                            background: 'linear-gradient(180deg, #dfe6ed, #c8d1db)',
                            borderTop: '1px solid #a0aec0',
                            padding: '8px 12px',
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: 6,
                        }}>
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="ebs-btn"
                                style={{ fontSize: 11, padding: '4px 14px' }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmDelete}
                                style={{
                                    background: 'linear-gradient(180deg, #d94f4f, #b33)',
                                    border: '1px solid #922',
                                    color: '#fff',
                                    fontSize: 11,
                                    padding: '4px 14px',
                                    borderRadius: 2,
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                }}
                            >
                                Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
