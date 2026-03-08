const BASE = '/api'

export function getToken() {
    return localStorage.getItem('token')
}

export function getUser() {
    const u = localStorage.getItem('user')
    return u ? JSON.parse(u) : null
}

export async function login(email, password) {
    const r = await fetch(`${BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    })
    const data = await r.json()
    if (!r.ok) throw new Error(data.error || 'Error de inicio de sesión')
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify(data.user))
    return data.user
}

export function logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
}

function authHeaders() {
    const token = getToken()
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    return headers
}

async function authFetch(url, options = {}) {
    const token = getToken()
    const headers = { ...options.headers }
    if (token) headers['Authorization'] = `Bearer ${token}`
    const r = await fetch(url, { ...options, headers })
    if (r.status === 401 || r.status === 403) {
        logout()
        window.dispatchEvent(new Event('unauthorized'))
    }
    return r
}

export async function apiFetch(url, options = {}) {
    const r = await authFetch(`${BASE}${url}`, options)
    const data = await r.json()
    if (!r.ok) throw new Error(data.error || 'Error en la petición')
    return data
}

export async function fetchPedidos() {
    const r = await authFetch(`${BASE}/pedidos`)
    if (!r.ok) throw new Error('Error cargando pedidos')
    return r.json()
}

export async function fetchPedido(id) {
    const r = await authFetch(`${BASE}/pedidos/${id}`)
    if (!r.ok) throw new Error('Error cargando pedido')
    return r.json()
}

export async function createPedido(data) {
    const r = await authFetch(`${BASE}/pedidos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    })
    if (!r.ok) {
        const body = await r.json().catch(() => null)
        throw new Error(body?.error || 'Error creando pedido')
    }
    return r.json()
}

export async function updatePedido(id, data) {
    const r = await authFetch(`${BASE}/pedidos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    })
    if (!r.ok) {
        const body = await r.json().catch(() => null)
        throw new Error(body?.error || 'Error actualizando pedido')
    }
    return r.json()
}

export async function deletePedido(id) {
    const r = await authFetch(`${BASE}/pedidos/${id}`, { method: 'DELETE' })
    if (!r.ok) throw new Error('Error eliminando pedido')
    return r.json()
}

export async function fetchCatalogo(tipo, q = '') {
    const url = q
        ? `${BASE}/catalogos/${tipo}?q=${encodeURIComponent(q)}`
        : `${BASE}/catalogos/${tipo}`
    const r = await authFetch(url)
    return r.json()
}

export async function searchArticles(q) {
    if (!q || q.length < 3) return []
    const r = await authFetch(`${BASE}/articulos/buscar?q=${encodeURIComponent(q)}`)
    if (!r.ok) return []
    return r.json()
}

export async function lookupArticleByCode(code) {
    if (!code) return null
    const r = await authFetch(`${BASE}/articulos/lookup/${encodeURIComponent(code)}`)
    if (!r.ok) return null
    return r.json()
}

export async function fetchMateriales(code) {
    if (!code) return []
    try {
        const r = await authFetch(`${BASE}/articulos/${encodeURIComponent(code)}/materiales`)
        if (!r.ok) return []
        return r.json()
    } catch { return [] }
}

// ─── DATA MAINTENANCE HELPERS ───────────────────────────────────────────
export async function fetchDataStatus() {
    return apiFetch('/admin/data/status');
}

export async function downloadResultFile(filename) {
    const token = getToken();
    const r = await fetch(`${BASE}/admin/data/download/${filename}`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (!r.ok) {
        const err = await r.json().catch(() => ({ error: 'Error al descargar' }));
        throw new Error(err.error || 'No se pudo descargar el archivo');
    }

    const blob = await r.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
}

export function uploadDataFile(file, expectedName) {
    return new Promise((resolve, reject) => {
        const form = new FormData();
        form.append('expectedName', expectedName);
        form.append('file', file);

        const token = getToken();
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${BASE}/admin/data/upload`, true);

        if (token) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }

        // Timeout 0 (infinito) para permitir subidas tan largas como sean necesarias
        xhr.timeout = 0;

        xhr.onload = function () {
            try {
                const data = JSON.parse(xhr.responseText);
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(data);
                } else {
                    reject(new Error(data.error || 'Error subiendo archivo (Server responded ' + xhr.status + ')'));
                }
            } catch (err) {
                reject(new Error('Error procesando respuesta del servidor. ' + err.message));
            }
        };

        xhr.onerror = function () {
            reject(new Error('Failed to fetch/upload: Conexión interrumpida o rechazada por el navegador/servidor.'));
        };

        xhr.ontimeout = function () {
            reject(new Error('Failed to fetch/upload: Tiempo de subida excedido.'));
        };

        xhr.send(form);
    });
}

export async function executeDataScript(scriptId) {
    const r = await authFetch(`${BASE}/admin/data/execute/${scriptId}`, { method: 'POST' });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Error ejecutando script');
    return data;
}

export async function downloadExcel(id) {
    try {
        const r = await authFetch(`${BASE}/pedidos/${id}/export`)
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
        a.download = filename
        document.body.appendChild(a)
        a.click()
        a.remove()
        window.URL.revokeObjectURL(url)
    } catch (err) {
        throw err
    }
}

// ─── USER ADMIN API ─────────────────────────────────────────────────────────

export async function fetchUsuarios() {
    const r = await authFetch(`${BASE}/usuarios`)
    if (!r.ok) throw new Error('Error cargando usuarios')
    return r.json()
}

export async function createUsuario(data) {
    const r = await authFetch(`${BASE}/usuarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    const resValue = await r.json()
    if (!r.ok) throw new Error(resValue.error || 'Error creando usuario')
    return resValue
}

export async function updateUsuario(id, data) {
    const r = await authFetch(`${BASE}/usuarios/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    const resValue = await r.json()
    if (!r.ok) throw new Error(resValue.error || 'Error actualizando usuario')
    return resValue
}

export async function deleteUsuario(id) {
    const r = await authFetch(`${BASE}/usuarios/${id}`, { method: 'DELETE' })
    const resValue = await r.json()
    if (!r.ok) throw new Error(resValue.error || 'Error eliminando usuario')
    return resValue
}


export function isEmptyItem(it) {
    if (!it) return true
    // Consideramos vacío si no tiene código Y no tiene descripción Y no tiene notas
    const hasCode = !!it.codigo?.trim()
    const hasDesc = !!it.descripcion?.trim()
    const hasNotes = !!(it.nota_h?.trim() || it.nota_l?.trim() || it.nota_prof?.trim() || it.nota_adicional?.trim())
    return !hasCode && !hasDesc && !hasNotes
}

export function emptyItem() {
    return {
        _id: crypto.randomUUID(),
        codigo: '', descripcion: '',
        nota_h: '', nota_l: '', nota_prof: '', nota_adicional: '',
        cantidad_unitaria: '', cantidad_tipologia: 1, cantidad_total: '',
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
