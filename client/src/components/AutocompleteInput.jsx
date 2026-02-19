import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { fetchCatalogo } from '../api'

// props:
// - tipo: 'pintura' (string) -> uses fetchCatalogo, returns strings
// - searchFn: async (q) => result[] -> uses custom search function (returns objects or strings)
// - onSelect: (opt) => void -> custom select handler (if returns object)
// - labelKey: string -> key to display in list if option is object
export default function AutocompleteInput({ value, onChange, tipo, searchFn, onSelect, placeholder, labelKey }) {
    const [open, setOpen] = useState(false)
    const [options, setOptions] = useState([])
    const [sel, setSel] = useState(-1)
    const inputRef = useRef(null)
    const timerRef = useRef(null)
    const [pos, setPos] = useState({ top: 0, left: 0 })

    const load = useCallback(async (q) => {
        if (!q && !tipo) return
        try {
            let data = []
            if (tipo) {
                data = await fetchCatalogo(tipo, q)
            } else if (searchFn) {
                if (q.length >= 3) {
                    data = await searchFn(q)
                }
            }
            setOptions(data || [])
            setSel(-1)
        } catch { setOptions([]) }
    }, [tipo, searchFn])

    const updatePosition = () => {
        if (!inputRef.current) return
        const rect = inputRef.current.getBoundingClientRect()
        setPos({ top: rect.bottom + 2, left: rect.left })
    }

    const handleChange = (e) => {
        onChange(e.target.value)
        clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => load(e.target.value), 150)
    }

    const handleFocus = () => {
        updatePosition()
        setOpen(true)
        // Para catálogos (tipo), cargar lista sin necesidad de value previo
        if (tipo) {
            load(value || '')
        } else if (value && value.length > 0 && searchFn) {
            load(value)
        }
    }

    const handleBlur = () => setTimeout(() => setOpen(false), 200)

    const select = (opt) => {
        if (onSelect) {
            onSelect(opt)
        } else {
            onChange(opt)
        }
        setOpen(false)
    }

    const handleKeyDown = (e) => {
        if (!open || !options.length) return
        if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, options.length - 1)) }
        if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, -1)) }
        if (e.key === 'Enter' && sel >= 0) { e.preventDefault(); select(options[sel]) }
        if (e.key === 'Escape') setOpen(false)
    }

    useEffect(() => {
        if (open) updatePosition()
    }, [open])

    // Highlight helper
    const hl = (text) => {
        if (!value || typeof text !== 'string') return text
        const idx = text.toLowerCase().indexOf(value.toLowerCase())
        if (idx < 0) return text
        return (
            <>
                {text.slice(0, idx)}
                <span className="font-semibold text-blue-600">{text.slice(idx, idx + value.length)}</span>
                {text.slice(idx + value.length)}
            </>
        )
    }

    // Render option content
    const renderOption = (opt) => {
        if (typeof opt === 'string') return hl(opt)
        // Check if article object
        if (opt.codigo && opt.descripcion) {
            return (
                <div className="flex flex-col">
                    <span className="font-bold text-[11px] text-slate-800">{hl(opt.codigo)}</span>
                    <span className="text-[10px] text-slate-500 truncate">{hl(opt.descripcion)}</span>
                </div>
            )
        }
        return JSON.stringify(opt)
    }

    return (
        <div className="relative w-full h-full">
            <input
                ref={inputRef}
                value={value || ''}
                onChange={handleChange}
                onFocus={handleFocus}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                autoComplete="off"
                className="cell-input w-full h-full bg-transparent border-0 px-2.5 text-[12px] text-slate-700 placeholder:text-slate-300 focus:outline-none"
            />
            {open && options.length > 0 && createPortal(
                <div
                    className="fixed z-[9999] min-w-[300px] max-w-[500px] max-h-64 overflow-y-auto
                               bg-white border border-slate-200 rounded-xl shadow-2xl"
                    style={{ top: pos.top, left: pos.left }}
                >
                    {options.slice(0, 25).map((opt, i) => (
                        <div
                            key={i}
                            onMouseDown={() => select(opt)}
                            className={`px-3 py-2 text-[12px] cursor-pointer border-b border-slate-50 last:border-0 transition-colors
                              ${i === sel ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                        >
                            {renderOption(opt)}
                        </div>
                    ))}
                    {options.length > 25 && (
                        <div className="px-3 py-1.5 text-[11px] text-slate-400 text-center bg-slate-50 italic">
                            +{options.length - 25} más...
                        </div>
                    )}
                </div>,
                document.body
            )}
        </div>
    )
}
