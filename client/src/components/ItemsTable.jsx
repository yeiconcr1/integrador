import AutocompleteInput from './AutocompleteInput'
import { emptyItem, searchArticles, lookupArticleByCode } from '../api'

const COLUMNS = [
    { key: 'codigo', label: 'Código', w: 'w-[110px] min-w-[110px]', isCode: true },
    { key: 'descripcion', label: 'Descripción', w: 'w-[220px] min-w-[220px]', search: true },
    { key: 'nota_h', label: 'H', w: 'w-[45px]  min-w-[45px]' },
    { key: 'nota_l', label: 'L', w: 'w-[45px]  min-w-[45px]' },
    { key: 'nota_prof', label: 'Prof', w: 'w-[45px]  min-w-[45px]' },
    { key: 'nota_adicional', label: 'Notas', w: 'w-[70px]  min-w-[70px]' },
    { key: 'cantidad_unitaria', label: 'Unit.', w: 'w-[55px]  min-w-[55px]', qty: true },
    { key: 'cantidad_tipologia', label: 'Tipo.', w: 'w-[55px]  min-w-[55px]', qty: true },
    { key: 'cantidad_total', label: 'Total', w: 'w-[55px]  min-w-[55px]', qty: true, total: true },
    { key: 'pintura', label: 'Pintura', w: 'w-[180px] min-w-[180px]', tipo: 'pintura', color: 'bg-emerald-50 text-emerald-700' },
    { key: 'acabados_adicional', label: 'Acab. Adic.', w: 'w-[120px] min-w-[120px]' },
    { key: 'formica', label: 'Fórmica', w: 'w-[160px] min-w-[160px]', tipo: 'formica', color: 'bg-amber-50 text-amber-700' },
    { key: 'supercor', label: 'Supercor', w: 'w-[160px] min-w-[160px]', tipo: 'supercor', color: 'bg-cyan-50 text-cyan-700' },
    { key: 'canto', label: 'Canto', w: 'w-[160px] min-w-[160px]', tipo: 'canto', color: 'bg-purple-50 text-purple-700' },
    { key: 'madecanto', label: 'Madecanto', w: 'w-[150px] min-w-[150px]', tipo: 'madecanto', color: 'bg-pink-50 text-pink-700' },
    { key: 'vidrio', label: 'Vidrio', w: 'w-[130px] min-w-[130px]', tipo: 'vidrio', color: 'bg-sky-50 text-sky-700' },
    { key: 'tela', label: 'Tela / Fiber', w: 'w-[180px] min-w-[180px]', tipo: 'tela', color: 'bg-rose-50 text-rose-700' },
    { key: 'render', label: 'Render', w: 'w-[90px] min-w-[90px]' },
]

export default function ItemsTable({ items, onChange }) {

    const updateItem = (idx, key, val) => {
        const updated = items.map((it, i) => {
            if (i !== idx) return it
            const next = { ...it, [key]: val }
            if (key === 'cantidad_unitaria' || key === 'cantidad_tipologia') {
                const u = parseFloat(key === 'cantidad_unitaria' ? val : it.cantidad_unitaria) || 0
                const t = parseFloat(key === 'cantidad_tipologia' ? val : it.cantidad_tipologia) || 0
                next.cantidad_total = t > 0 ? String(u * t) : u ? String(u) : ''
            }
            return next
        })
        onChange(updated)
    }

    const handleCodeLookup = async (idx, code) => {
        if (!code) return
        const article = await lookupArticleByCode(code)
        if (article) {
            const updated = items.map((it, i) => {
                if (i !== idx) return it
                return { ...it, codigo: article.codigo, descripcion: article.descripcion }
            })
            onChange(updated)
        }
    }

    // Fill both code and description when an article is selected
    const handleArticleSelect = (idx, opt) => {
        const updated = items.map((it, i) => {
            if (i !== idx) return it
            return { ...it, codigo: opt.codigo, descripcion: opt.descripcion }
        })
        onChange(updated)
    }

    const addRow = () => onChange([...items, emptyItem()])
    const removeRow = (idx) => {
        if (items.length <= 1) return
        onChange(items.filter((_, i) => i !== idx))
    }

    return (
        <div>
            {/* Table header bar */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                        <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="2" /><path d="M3 9h18M9 9v12" strokeWidth="2" /></svg>
                    </div>
                    <h3 className="text-sm font-semibold text-slate-700">Productos del pedido</h3>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-600">
                        {items.length}
                    </span>
                </div>
                <button
                    onClick={addRow}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors"
                >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" d="M12 5v14M5 12h14" strokeWidth="2.5" /></svg>
                    Agregar fila
                </button>
            </div>

            {/* Scrollable Table */}
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-visible">
                <div className="overflow-x-auto overflow-y-visible">
                    <table className="border-collapse" style={{ width: 'max-content', minWidth: '100%' }}>
                    <thead>
                        <tr className="bg-slate-50 sticky top-0 z-10">
                            <th className="w-10 min-w-[40px] px-2 py-3 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-200 border-r border-slate-100">
                                #
                            </th>
                            {COLUMNS.map(col => (
                                <th
                                    key={col.key}
                                    className={`${col.w} px-2 py-3 text-left text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap
                              border-b border-slate-200 border-r border-slate-100
                              ${col.total ? 'bg-blue-50 text-blue-600' : 'text-slate-500'}
                              ${col.color ? col.color : ''}
                  `}
                                >
                                    {col.label}
                                </th>
                            ))}
                            <th className="w-10 min-w-[40px] border-b border-slate-200 bg-slate-50 sticky right-0" />
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item, idx) => (
                            <tr
                                key={item._id || idx}
                                className={`group transition-colors hover:bg-blue-50/30 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                            >
                                <td className="px-2 h-10 text-center text-xs text-slate-400 font-medium border-r border-slate-100 border-b border-slate-100">
                                    {idx + 1}
                                </td>
                                {COLUMNS.map(col => (
                                    <td
                                        key={col.key}
                                        className={`h-10 border-r border-slate-100 border-b border-slate-100 relative p-0
                                ${col.total ? 'bg-blue-50/40' : ''}
                    `}
                                    >
                                        {col.tipo ? (
                                            <AutocompleteInput
                                                value={item[col.key]}
                                                onChange={val => updateItem(idx, col.key, val)}
                                                tipo={col.tipo}
                                                placeholder={`Buscar…`}
                                            />
                                        ) : col.isCode ? (
                                            <input
                                                value={item[col.key]}
                                                onChange={e => updateItem(idx, col.key, e.target.value)}
                                                onBlur={e => handleCodeLookup(idx, e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') handleCodeLookup(idx, e.target.value) }}
                                                placeholder="Código…"
                                                className="cell-input w-full h-full bg-transparent border-0 px-2.5 text-[12px] text-slate-700 placeholder:text-slate-300 focus:outline-none"
                                            />
                                        ) : col.search ? (
                                            <AutocompleteInput
                                                value={item[col.key]}
                                                onChange={val => updateItem(idx, col.key, val)}
                                                searchFn={searchArticles}
                                                onSelect={opt => handleArticleSelect(idx, opt)}
                                                placeholder="Descripción…"
                                            />
                                        ) : (
                                            <input
                                                value={item[col.key]}
                                                onChange={e => updateItem(idx, col.key, e.target.value)}
                                                placeholder={col.qty ? '0' : ''}
                                                className={`cell-input w-full h-full bg-transparent border-0 px-2.5 text-[12px] placeholder:text-slate-300 focus:outline-none
                          ${col.qty ? 'text-right font-medium text-slate-600' : 'text-slate-700'}
                          ${col.total ? 'text-blue-600 font-bold' : ''}
                        `}
                                            />
                                        )}
                                    </td>
                                ))}
                                <td className="h-10 border-b border-slate-100 text-center sticky right-0 bg-white">
                                    <button
                                        onClick={() => removeRow(idx)}
                                        className="p-1 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                        title="Eliminar fila"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" strokeWidth="2" /></svg>
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
