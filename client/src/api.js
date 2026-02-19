const BASE = '/api'

export async function fetchPedidos() {
    const r = await fetch(`${BASE}/pedidos`)
    if (!r.ok) throw new Error('Error cargando pedidos')
    return r.json()
}

export async function fetchPedido(id) {
    const r = await fetch(`${BASE}/pedidos/${id}`)
    if (!r.ok) throw new Error('Error cargando pedido')
    return r.json()
}

export async function createPedido(data) {
    const r = await fetch(`${BASE}/pedidos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    })
    if (!r.ok) throw new Error('Error creando pedido')
    return r.json()
}

export async function updatePedido(id, data) {
    const r = await fetch(`${BASE}/pedidos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    })
    if (!r.ok) throw new Error('Error actualizando pedido')
    return r.json()
}

export async function deletePedido(id) {
    const r = await fetch(`${BASE}/pedidos/${id}`, { method: 'DELETE' })
    if (!r.ok) throw new Error('Error eliminando pedido')
    return r.json()
}

export async function fetchCatalogo(tipo, q = '') {
    const url = q
        ? `${BASE}/catalogos/${tipo}?q=${encodeURIComponent(q)}`
        : `${BASE}/catalogos/${tipo}`
    const r = await fetch(url)
    return r.json()
}

export async function searchArticles(q) {
    if (!q || q.length < 3) return []
    const r = await fetch(`${BASE}/articulos/buscar?q=${encodeURIComponent(q)}`)
    if (!r.ok) return []
    return r.json()
}

export async function lookupArticleByCode(code) {
    if (!code) return null
    const r = await fetch(`${BASE}/articulos/lookup/${encodeURIComponent(code)}`)
    if (!r.ok) return null
    return r.json()
}

export async function downloadExcel(id) {
    try {
        const r = await fetch(`${BASE}/pedidos/${id}/export`)
        if (!r.ok) {
            const text = await r.text()
            throw new Error(`Error exportando: ${text}`)
        }
        const blob = await r.blob()
        if (blob.size === 0) throw new Error('Archivo vacío')
        const cd = r.headers.get('Content-Disposition') || ''
        const match = cd.match(/filename="?([^"]+)"?/)
        const filename = match ? match[1] : `INTEGRADOR_${id}.xlsx`
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
        return { success: true, filename }
    } catch (err) {
        console.error('Download error:', err)
        throw err
    }
}

export function emptyItem() {
    return {
        _id: crypto.randomUUID(),
        codigo: '', descripcion: '',
        nota_h: '', nota_l: '', nota_prof: '', nota_adicional: '',
        cantidad_unitaria: '', cantidad_tipologia: '', cantidad_total: '',
        pintura: '', acabados_adicional: '', formica: '',
        supercor: '', canto: '', madecanto: '',
        vidrio: '', tela: '', render: '',
    }
}

export function emptyPuesto(num) {
    return {
        _id: crypto.randomUUID(),
        nombre: `Puesto de trabajo ${num}`,
        items: [emptyItem()],
    }
}
