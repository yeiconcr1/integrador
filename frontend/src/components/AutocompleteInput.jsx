import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { fetchCatalogo } from '../api'

// props:
// - tipo: 'pintura' (string) -> uses fetchCatalogo, returns strings
// - searchFn: async (q) => result[] -> uses custom search function (returns objects or strings)
// - onSelect: (opt) => void -> custom select handler (if returns object)
// - labelKey: string -> key to display in list if option is object
export default function AutocompleteInput({
    value, onChange, tipo, searchFn, onSelect, placeholder, labelKey, disabled,
    multiline = false, growCell = false, collapseSpaces = false,
    'data-row': dataRow, 'data-col': dataCol
}) {
    const [open, setOpen] = useState(false)
    const [options, setOptions] = useState([])
    const [sel, setSel] = useState(-1)
    const inputRef = useRef(null)
    const timerRef = useRef(null)
    const dropdownRef = useRef(null)
    const [pos, setPos] = useState({ top: 0, left: 0 })

    const autoResize = useCallback(() => {
        if (!multiline || !inputRef.current) return
        inputRef.current.style.height = 'auto'
        const nextHeight = growCell
            ? Math.max(34, inputRef.current.scrollHeight)
            : Math.max(34, Math.min(inputRef.current.scrollHeight, 56))
        inputRef.current.style.height = `${nextHeight}px`
    }, [multiline, growCell])

    const normalizeSpaces = useCallback((text) => {
        if (typeof text !== 'string') return text
        return text.replace(/\s+/g, ' ').trim()
    }, [])

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
        const spaceBelow = window.innerHeight - rect.bottom
        const dropdownH = 260 // max-h-64 = 256px approx
        if (spaceBelow < dropdownH) {
            // Open upward
            setPos({ top: rect.top - 2, left: rect.left, direction: 'up' })
        } else {
            setPos({ top: rect.bottom + 2, left: rect.left, direction: 'down' })
        }
    }

    const handleChange = (e) => {
        onChange(e.target.value)
        autoResize()
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

    const handleBlur = () => {
        if (collapseSpaces && typeof value === 'string') {
            const normalized = normalizeSpaces(value)
            if (normalized !== value) onChange(normalized)
        }
        setTimeout(() => setOpen(false), 200)
    }

    const select = (opt) => {
        if (onSelect) {
            onSelect(opt)
        } else {
            const nextValue = (collapseSpaces && typeof opt === 'string') ? normalizeSpaces(opt) : opt
            onChange(nextValue)
        }
        setOpen(false)
    }

    const handleKeyDown = (e) => {
        if (!open || !options.length) {
            // Si el menú está cerrado, no prevenimos defecto para permitir burbujeo a ItemsTable
            return
        }
        if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, options.length - 1)) }
        if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, -1)) }
        if (e.key === 'Enter' && sel >= 0) { e.preventDefault(); select(options[sel]) }
        if (e.key === 'Escape') setOpen(false)
    }

    useEffect(() => {
        if (open) updatePosition()
    }, [open])

    // Close dropdown on scroll to prevent floating (but allow scroll inside dropdown)
    useEffect(() => {
        if (!open) return
        const handleScroll = (e) => {
            if (dropdownRef.current && dropdownRef.current.contains(e.target)) return
            setOpen(false)
        }
        window.addEventListener('scroll', handleScroll, true)
        return () => window.removeEventListener('scroll', handleScroll, true)
    }, [open])

    useEffect(() => {
        autoResize()
    }, [value, autoResize])

    // Highlight helper
    const hl = (text) => {
        if (!value || typeof text !== 'string') return text
        const idx = text.toLowerCase().indexOf(value.toLowerCase())
        if (idx < 0) return text
        return (
            <>
                {text.slice(0, idx)}
                <span className="font-semibold text-[#3a5a8a]">{text.slice(idx, idx + value.length)}</span>
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
                    <span className="font-bold text-[11px] text-gray-800">{hl(opt.codigo)}</span>
                    <span className="text-[10px] text-gray-500 truncate">{hl(opt.descripcion)}</span>
                </div>
            )
        }
        return JSON.stringify(opt)
    }

    return (
        <div className="relative w-full h-full">
            {multiline ? (
                <textarea
                    ref={inputRef}
                    value={value || ''}
                    onChange={handleChange}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    disabled={disabled}
                    tabIndex={disabled ? -1 : undefined}
                    data-row={dataRow}
                    data-col={dataCol}
                    rows={1}
                    className={`cell-input w-full min-h-[34px] ${growCell ? '' : 'max-h-[56px]'} overflow-hidden bg-transparent border-0 px-2 py-1 text-[11px] leading-4 text-gray-700 placeholder:text-gray-400/60 focus:outline-none resize-none
                        ${disabled ? 'cursor-not-allowed pointer-events-none select-none' : ''}`}
                />
            ) : (
                <input
                    ref={inputRef}
                    value={value || ''}
                    onChange={handleChange}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    autoComplete="off"
                    disabled={disabled}
                    tabIndex={disabled ? -1 : undefined}
                    data-row={dataRow}
                    data-col={dataCol}
                    className={`cell-input w-full h-full bg-transparent border-0 px-2 text-[11px] text-gray-700 placeholder:text-gray-400/60 focus:outline-none
                        ${disabled ? 'cursor-not-allowed pointer-events-none select-none' : ''}`}
                />
            )}
            {open && options.length > 0 && createPortal(
                <div
                    ref={dropdownRef}
                    className="fixed z-[9999] min-w-[300px] max-w-[500px] max-h-64 overflow-y-auto
                               bg-white border border-gray-300 rounded shadow-lg"
                    style={pos.direction === 'up'
                        ? { bottom: window.innerHeight - pos.top, left: pos.left }
                        : { top: pos.top, left: pos.left }
                    }
                >
                    {options.slice(0, 25).map((opt, i) => (
                        <div
                            key={i}
                            onMouseDown={() => select(opt)}
                            className={`px-3 py-2 text-[11px] cursor-pointer border-b border-gray-100 last:border-0 transition-colors
                              ${i === sel ? 'bg-[#dbe4f0]' : 'hover:bg-gray-50'}`}
                        >
                            {renderOption(opt)}
                        </div>
                    ))}
                    {options.length > 25 && (
                        <div className="px-3 py-1.5 text-[10px] text-gray-400 text-center bg-gray-50 italic">
                            +{options.length - 25} más...
                        </div>
                    )}
                </div>,
                document.body
            )}
        </div>
    )
}
