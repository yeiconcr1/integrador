import { useState, useRef, useCallback } from 'react'
import { validateCsvCodes } from '../api'

// Material columns that must be validated against BOM
const MATERIAL_KEYS = ['pintura', 'formica', 'supercor', 'canto', 'madecanto', 'vidrio', 'tela']

// All CSV columns in expected order matching ItemsTable exactly
const CSV_COLUMNS = [
    'puesto', 'codigo', 'nota_h', 'nota_l', 'nota_prof', 'nota_adicional',
    'cantidad_unitaria', 'cantidad_tipologia',
    'acabados_adicional',
    'pintura', 'formica', 'supercor', 'canto', 'madecanto', 'vidrio', 'tela'
]

function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    if (lines.length < 2) return []

    // Parse header line to detect separator
    const firstLine = lines[0]
    const sep = firstLine.includes(';') ? ';' : ','
    const headers = firstLine.split(sep).map(h => h.trim().toLowerCase().replace(/[áéíóú]/g, m => ({ á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u' }[m])))

    // Map header names to expected column keys
    const headerMap = {}
    headers.forEach((h, i) => {
        // Try exact match first
        const match = CSV_COLUMNS.find(c => c === h)
        if (match) { headerMap[match] = i; return }
        // Fuzzy aliases
        if (['puesto', 'puesto_trabajo', 'puesto de trabajo', 'workstation'].includes(h)) headerMap['puesto'] = i
        else if (['codigo', 'code', 'cod', 'código'].includes(h)) headerMap['codigo'] = i
        else if (['h', 'alto', 'altura', 'nota_h'].includes(h)) headerMap['nota_h'] = i
        else if (['l', 'largo', 'ancho', 'nota_l'].includes(h)) headerMap['nota_l'] = i
        else if (['prof', 'profundidad', 'nota_prof'].includes(h)) headerMap['nota_prof'] = i
        else if (['notas', 'nota', 'nota_adicional', 'adicional'].includes(h)) headerMap['nota_adicional'] = i
        else if (['unitaria', 'unit', 'cantidad_unitaria', 'cant_unit'].includes(h)) headerMap['cantidad_unitaria'] = i
        else if (['tipologia', 'tipo', 'cantidad_tipologia', 'cant_tipo'].includes(h)) headerMap['cantidad_tipologia'] = i
        else if (['pintura', 'paint'].includes(h)) headerMap['pintura'] = i
        else if (['formica', 'fórmica'].includes(h)) headerMap['formica'] = i
        else if (['supercor'].includes(h)) headerMap['supercor'] = i
        else if (['canto'].includes(h)) headerMap['canto'] = i
        else if (['madecanto'].includes(h)) headerMap['madecanto'] = i
        else if (['vidrio', 'glass'].includes(h)) headerMap['vidrio'] = i
        else if (['tela', 'fiber', 'tela / fiber'].includes(h)) headerMap['tela'] = i
        else if (['acabados_adicional', 'acab_adic', 'acab. adic.', 'acabados'].includes(h)) headerMap['acabados_adicional'] = i
    })

    const rows = []
    for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(sep).map(v => v.trim())
        const row = {}
        for (const [key, idx] of Object.entries(headerMap)) {
            row[key] = vals[idx] || ''
        }
        // Skip completely empty rows
        if (!row.codigo && !row.puesto) continue
        rows.push(row)
    }
    return rows
}

export default function CsvUpload({ onImport, onClose, showToast }) {
    const [step, setStep] = useState('upload') // 'upload' | 'preview'
    const [rawRows, setRawRows] = useState([])
    const [validation, setValidation] = useState({}) // code → { found, descripcion, materiales }
    const [loading, setLoading] = useState(false)
    const [dragOver, setDragOver] = useState(false)
    const fileInputRef = useRef(null)

    const processFile = useCallback(async (file) => {
        if (!file) return
        setLoading(true)
        try {
            const text = await file.text()
            const rows = parseCSV(text)
            if (rows.length === 0) {
                showToast('El archivo CSV está vacío o no tiene el formato esperado', 'error')
                setLoading(false)
                return
            }

            // Extract unique codes and validate against DB
            const codes = [...new Set(rows.map(r => r.codigo).filter(Boolean))]
            let validationData = {}
            if (codes.length > 0) {
                validationData = await validateCsvCodes(codes)
            }

            setRawRows(rows)
            setValidation(validationData)
            setStep('preview')
        } catch (err) {
            showToast(`Error procesando CSV: ${err.message}`, 'error')
        }
        setLoading(false)
    }, [showToast])

    const handleDrop = useCallback((e) => {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer?.files?.[0]
        if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
            processFile(file)
        } else {
            showToast('Por favor sube un archivo .csv', 'error')
        }
    }, [processFile, showToast])

    const handleFileSelect = (e) => {
        processFile(e.target.files?.[0])
    }

    // Build processed data: group by puesto, filter materials by BOM
    const getProcessedData = useCallback(() => {
        const puestosMap = new Map()
        const filteredMaterials = [] // Track which materials were filtered out

        rawRows.forEach((row, rowIdx) => {
            const puestoName = (row.puesto || 'PUESTO 1').toUpperCase()
            if (!puestosMap.has(puestoName)) {
                puestosMap.set(puestoName, [])
            }

            const code = row.codigo?.trim() || ''
            const codeInfo = validation[code] || { found: false, descripcion: '', materiales: [] }
            const allowedMats = new Set(codeInfo.materiales)

            const item = {
                codigo: code,
                descripcion: codeInfo.found ? codeInfo.descripcion : '',
                nota_h: row.nota_h || '',
                nota_l: row.nota_l || '',
                nota_prof: row.nota_prof || '',
                nota_adicional: row.nota_adicional || '',
                cantidad_unitaria: row.cantidad_unitaria || '',
                cantidad_tipologia: row.cantidad_tipologia || '1',
                cantidad_total: '',
                acabados_adicional: row.acabados_adicional || '',
                pintura: '',
                formica: '',
                supercor: '',
                canto: '',
                madecanto: '',
                vidrio: '',
                tela: '',
            }

            // Calculate total
            const u = parseFloat(item.cantidad_unitaria)
            const t = parseFloat(item.cantidad_tipologia)
            if (!isNaN(u) && !isNaN(t)) item.cantidad_total = String(u * t)
            else if (!isNaN(u)) item.cantidad_total = String(u)

            // Apply materials only if BOM allows them
            for (const matKey of MATERIAL_KEYS) {
                const csvValue = (row[matKey] || '').trim()
                if (csvValue) {
                    if (allowedMats.has(matKey)) {
                        item[matKey] = csvValue
                    } else if (codeInfo.materiales.length > 0) {
                        // BOM data exists but this material not allowed → filtered
                        filteredMaterials.push({ rowIdx, code, material: matKey, value: csvValue })
                    } else {
                        // No BOM data at all → keep the value (can't validate)
                        item[matKey] = csvValue
                    }
                }
            }

            puestosMap.get(puestoName).push(item)
        })

        return { puestosMap, filteredMaterials }
    }, [rawRows, validation])

    const handleConfirm = () => {
        const { puestosMap, filteredMaterials } = getProcessedData()
        const puestos = []
        for (const [nombre, items] of puestosMap) {
            puestos.push({ nombre, items })
        }
        onImport(puestos)
        if (filteredMaterials.length > 0) {
            showToast(`${filteredMaterials.length} material(es) ignorado(s) por no aplicar según BOM`, 'info')
        }
        showToast(`Cargados ${rawRows.length} artículo(s) en ${puestos.length} puesto(s)`, 'success')
        onClose()
    }

    // Stats for preview
    const { puestosMap, filteredMaterials } = step === 'preview' ? getProcessedData() : { puestosMap: new Map(), filteredMaterials: [] }
    const foundCount = rawRows.filter(r => validation[r.codigo]?.found).length
    const notFoundCount = rawRows.filter(r => r.codigo && !validation[r.codigo]?.found).length

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}>
            <div style={{ width: step === 'preview' ? '95vw' : 520, maxWidth: '95vw', maxHeight: '90vh', border: '2px solid #4a7cc9', borderRadius: 2, boxShadow: '0 8px 40px rgba(0,0,0,0.35)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

                {/* EBS Header */}
                <div style={{ background: 'linear-gradient(180deg, #4a6fa5 0%, #3a5a8a 100%)', padding: '8px 14px', color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 8h6m-5 0a3 3 0 110 6H9l3 3m-3-6h6m6 1a9 9 0 11-18 0 9 9 0 0118 0z" strokeWidth="0" /><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" strokeWidth="2" /></svg>
                        Carga Masiva de Artículos (CSV)
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
                </div>

                {/* Body */}
                <div style={{ background: '#f7f8fa', flex: 1, overflow: 'auto', padding: step === 'preview' ? '12px' : '20px 24px' }}>

                    {step === 'upload' && (
                        <>
                            {/* Instructions */}
                            <div style={{ fontSize: 12, color: '#475569', marginBottom: 16, lineHeight: 1.6 }}>
                                <p style={{ margin: '0 0 8px', fontWeight: 600, color: '#1e293b' }}>Instrucciones:</p>
                                <ol style={{ margin: 0, paddingLeft: 18 }}>
                                    <li>Descarga la plantilla CSV con el formato correcto</li>
                                    <li>Llénala con los códigos, cantidades y acabados por puesto</li>
                                    <li>Los materiales que no apliquen según el BOM serán ignorados automáticamente</li>
                                    <li>Sube el archivo y revisa la vista previa antes de confirmar</li>
                                </ol>
                            </div>

                            {/* Template download link (backend forced download) */}
                            <a
                                href={`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/pedidos/template-csv?v=${Date.now()}`}
                                download="plantilla_pedido.csv"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ebs-btn flex items-center gap-2 mb-4 w-full justify-center"
                                style={{ padding: '8px 0', textDecoration: 'none' }}
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeWidth="2" /></svg>
                                Descargar plantilla CSV
                            </a>

                            {/* Drop zone */}
                            <div
                                onDrop={handleDrop}
                                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                                onDragLeave={() => setDragOver(false)}
                                onClick={() => fileInputRef.current?.click()}
                                style={{
                                    border: `2px dashed ${dragOver ? '#3a5a8a' : '#b0bec5'}`,
                                    borderRadius: 4,
                                    padding: '36px 20px',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    background: dragOver ? '#e8f0fe' : '#fff',
                                    transition: 'all 0.2s',
                                }}
                            >
                                <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileSelect} style={{ display: 'none' }} />
                                {loading ? (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                        <span className="animate-spin" style={{ display: 'inline-block', width: 20, height: 20, border: '3px solid #3a5a8a', borderTop: '3px solid transparent', borderRadius: '50%' }} />
                                        <span style={{ fontSize: 13, color: '#3a5a8a', fontWeight: 600 }}>Procesando…</span>
                                    </div>
                                ) : (
                                    <>
                                        <svg className="mx-auto mb-3" width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="#94a3b8"><path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" strokeWidth="1.5" /></svg>
                                        <p style={{ fontSize: 13, fontWeight: 600, color: '#334155', margin: '0 0 4px' }}>
                                            Arrastra tu archivo CSV aquí
                                        </p>
                                        <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>
                                            o haz clic para seleccionar un archivo
                                        </p>
                                    </>
                                )}
                            </div>
                        </>
                    )}

                    {step === 'preview' && (
                        <>
                            {/* Stats bar */}
                            <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 3, padding: '6px 12px', fontSize: 11 }}>
                                    <span style={{ fontWeight: 700, color: '#1e293b' }}>{rawRows.length}</span>
                                    <span style={{ color: '#64748b' }}> artículos</span>
                                </div>
                                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 3, padding: '6px 12px', fontSize: 11 }}>
                                    <span style={{ fontWeight: 700, color: '#1e293b' }}>{puestosMap.size}</span>
                                    <span style={{ color: '#64748b' }}> puestos</span>
                                </div>
                                <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 3, padding: '6px 12px', fontSize: 11 }}>
                                    <span style={{ fontWeight: 700, color: '#065f46' }}>✓ {foundCount}</span>
                                    <span style={{ color: '#065f46' }}> encontrados</span>
                                </div>
                                {notFoundCount > 0 && (
                                    <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 3, padding: '6px 12px', fontSize: 11 }}>
                                        <span style={{ fontWeight: 700, color: '#92400e' }}>⚠ {notFoundCount}</span>
                                        <span style={{ color: '#92400e' }}> no encontrados</span>
                                    </div>
                                )}
                                {filteredMaterials.length > 0 && (
                                    <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 3, padding: '6px 12px', fontSize: 11 }}>
                                        <span style={{ fontWeight: 700, color: '#991b1b' }}>🚫 {filteredMaterials.length}</span>
                                        <span style={{ color: '#991b1b' }}> materiales ignorados (BOM)</span>
                                    </div>
                                )}
                            </div>

                            {/* Preview table per puesto */}
                            {[...puestosMap.entries()].map(([puestoName, items], pIdx) => (
                                <div key={puestoName} style={{ marginBottom: 12 }}>
                                    <div style={{ background: 'linear-gradient(180deg, #4a6fa5 0%, #3a5a8a 100%)', padding: '5px 10px', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, borderRadius: '2px 2px 0 0' }}>
                                        <span style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 2, padding: '1px 5px', fontSize: 10 }}>{pIdx + 1}</span>
                                        {puestoName}
                                        <span style={{ fontWeight: 400, opacity: 0.7, marginLeft: 4 }}>{items.length} ítem(s)</span>
                                    </div>
                                    <div style={{ border: '1px solid #d1d5db', borderTop: 'none', overflow: 'auto', maxHeight: 280, borderRadius: '0 0 2px 2px' }}>
                                        <table style={{ borderCollapse: 'collapse', width: 'max-content', minWidth: '100%', fontSize: 11 }}>
                                            <thead>
                                                <tr style={{ background: '#e8ecf1' }}>
                                                    <th style={thStyle}>#</th>
                                                    <th style={thStyle}>Código</th>
                                                    <th style={{ ...thStyle, minWidth: 200 }}>Descripción</th>
                                                    <th style={thStyle}>H</th>
                                                    <th style={thStyle}>L</th>
                                                    <th style={thStyle}>Prof</th>
                                                    <th style={thStyle}>Unit.</th>
                                                    <th style={thStyle}>Tipo.</th>
                                                    <th style={thStyle}>Total</th>
                                                    <th style={{ ...thStyle, background: '#ecfdf5' }}>Pintura</th>
                                                    <th style={{ ...thStyle, background: '#fffbeb' }}>Fórmica</th>
                                                    <th style={{ ...thStyle, background: '#ecfeff' }}>Supercor</th>
                                                    <th style={{ ...thStyle, background: '#faf5ff' }}>Canto</th>
                                                    <th style={{ ...thStyle, background: '#fdf2f8' }}>Madecanto</th>
                                                    <th style={{ ...thStyle, background: '#f0f9ff' }}>Vidrio</th>
                                                    <th style={{ ...thStyle, background: '#fff1f2' }}>Tela</th>
                                                    <th style={thStyle}>Acab. Adic.</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {items.map((item, iIdx) => {
                                                    const codeInfo = validation[item.codigo]
                                                    const isFound = codeInfo?.found
                                                    const allowedMats = new Set(codeInfo?.materiales || [])
                                                    const hasBom = codeInfo?.materiales?.length > 0

                                                    // Find what was filtered for this row
                                                    const originalRow = rawRows.find((r, ri) => {
                                                        // Match by position within the puesto group
                                                        let count = 0
                                                        for (let j = 0; j <= ri; j++) {
                                                            if ((rawRows[j].puesto || 'PUESTO 1').toUpperCase() === puestoName) count++
                                                        }
                                                        return count === iIdx + 1
                                                    })

                                                    return (
                                                        <tr key={iIdx} style={{ background: iIdx % 2 === 0 ? '#fff' : '#fafafa' }}>
                                                            <td style={tdStyle}>{iIdx + 1}</td>
                                                            <td style={{ ...tdStyle, fontWeight: 600 }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                    {item.codigo ? (isFound ?
                                                                        <span style={{ color: '#059669', fontSize: 10 }}>✓</span> :
                                                                        <span style={{ color: '#d97706', fontSize: 10 }}>⚠</span>
                                                                    ) : null}
                                                                    {item.codigo || '—'}
                                                                </div>
                                                            </td>
                                                            <td style={{ ...tdStyle, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {item.descripcion || (item.codigo ? <span style={{ color: '#d97706', fontStyle: 'italic' }}>No encontrado</span> : '')}
                                                            </td>
                                                            <td style={{ ...tdStyle, color: '#dc2626', fontWeight: 500 }}>{item.nota_h}</td>
                                                            <td style={{ ...tdStyle, color: '#dc2626', fontWeight: 500 }}>{item.nota_l}</td>
                                                            <td style={{ ...tdStyle, color: '#dc2626', fontWeight: 500 }}>{item.nota_prof}</td>
                                                            <td style={{ ...tdStyle, textAlign: 'right' }}>{item.cantidad_unitaria}</td>
                                                            <td style={{ ...tdStyle, textAlign: 'right' }}>{item.cantidad_tipologia}</td>
                                                            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#3a5a8a' }}>{item.cantidad_total}</td>
                                                            {MATERIAL_KEYS.map(matKey => {
                                                                const csvHadValue = originalRow && originalRow[matKey]?.trim()
                                                                const wasFiltered = csvHadValue && !item[matKey] && hasBom && !allowedMats.has(matKey)

                                                                return (
                                                                    <td key={matKey} style={{
                                                                        ...tdStyle,
                                                                        ...(wasFiltered ? { background: '#fee2e2', textDecoration: 'line-through', color: '#ef4444', fontStyle: 'italic' } :
                                                                            (hasBom && !allowedMats.has(matKey)) ? { background: '#f8fafc', color: '#cbd5e1' } : {})
                                                                    }}>
                                                                        {wasFiltered ? (
                                                                            <span title="Ignorado: este código no lleva este material según BOM">
                                                                                🚫 {csvHadValue}
                                                                            </span>
                                                                        ) : item[matKey] || ''}
                                                                    </td>
                                                                )
                                                            })}
                                                            <td style={tdStyle}>{item.acabados_adicional}</td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div style={{ background: 'linear-gradient(180deg, #dfe6ed, #c8d1db)', borderTop: '1px solid #a0aec0', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <div>
                        {step === 'preview' && (
                            <button onClick={() => { setStep('upload'); setRawRows([]); setValidation({}) }} className="ebs-btn" style={{ fontSize: 11 }}>
                                ← Volver
                            </button>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={onClose} className="ebs-btn" style={{ fontSize: 11 }}>Cancelar</button>
                        {step === 'preview' && (
                            <button onClick={handleConfirm} className="ebs-btn ebs-btn-primary" style={{ fontSize: 11 }}>
                                ✓ Cargar {rawRows.length} artículo(s) al pedido
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

const thStyle = {
    padding: '5px 8px',
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
    borderBottom: '1px solid #d1d5db',
    borderRight: '1px solid #e5e7eb',
    textAlign: 'left',
    color: '#475569',
    position: 'sticky',
    top: 0,
    zIndex: 10,
    background: '#e8ecf1',
}

const tdStyle = {
    padding: '4px 8px',
    borderBottom: '1px solid #e5e7eb',
    borderRight: '1px solid #f1f5f9',
    whiteSpace: 'nowrap',
    fontSize: 11,
    color: '#334155',
}
