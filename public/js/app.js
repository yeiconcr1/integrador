/* ─── STATE ──────────────────────────────────────────────────────────────── */
let currentPedidoId = null;
let allPedidos = [];
let currentAcInput = null; // input currently using autocomplete
let acType = null;         // finish type for current autocomplete
let acSelected = -1;       // keyboard nav index

const FINISH_COLS = {
    // key: [column index in row TD (0-based from 0), tipo API, zone class]
    pintura: [10, 'pintura', 'pintura-zone'],
    acabado: [11, null, null],
    formica: [12, 'formica', 'formica-zone'],
    supercor: [13, 'supercor', 'supercor-zone'],
    canto: [14, 'canto', 'canto-zone'],
    madecanto: [15, 'madecanto', null],
    vidrio: [16, 'vidrio', 'vidrio-zone'],
    tela: [17, 'tela', 'tela-zone'],
    render: [18, null, null],
};

/* ─── DOM REFS ───────────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const sidebar = $('sidebar');
const pedidosList = $('pedidosList');
const searchInput = $('searchPedidos');
const pageTitle = $('pageTitle');
const itemsBody = $('itemsBody');
const itemCount = $('itemCount');
const btnNuevo = $('btnNuevoPedido');
const btnGuardar = $('btnGuardar');
const btnExportar = $('btnExportar');
const btnEliminar = $('btnEliminar');
const btnAddRow = $('btnAddRow');
const btnDelLastRow = $('btnDelLastRow');
const btnToggleSidebar = $('btnToggleSidebar');
const dropdown = $('autocompleteDropdown');

// Form fields
const fNumero = $('fNumero');
const fFecha = $('fFecha');
const fCliente = $('fCliente');
const fDisenador = $('fDisenador');
const fAsesor = $('fAsesor');

/* ─── INIT ───────────────────────────────────────────────────────────────── */
async function init() {
    fFecha.value = new Date().toISOString().slice(0, 10);
    await loadPedidos();
    setupEventListeners();
    addRow(); // start with 1 empty row
}

/* ─── FETCH HELPERS ──────────────────────────────────────────────────────── */
async function api(url, opts = {}) {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
}

/* ─── LOAD PEDIDOS LIST ──────────────────────────────────────────────────── */
async function loadPedidos() {
    try {
        allPedidos = await api('/api/pedidos');
        renderPedidosList(allPedidos);
    } catch (e) { showToast('Error al cargar pedidos', 'error'); }
}

function renderPedidosList(list) {
    if (!list.length) {
        pedidosList.innerHTML = `<div class="empty-state-sidebar">No hay pedidos guardados</div>`;
        return;
    }
    pedidosList.innerHTML = list.map(p => `
    <div class="pedido-item ${p.id === currentPedidoId ? 'active' : ''}"
         data-id="${p.id}" onclick="openPedido(${p.id})">
      <div class="pedido-item-num">${p.numero_pedido || '#' + p.id}</div>
      <div class="pedido-item-cliente">${p.cliente || 'Sin cliente'}</div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:3px;">
        <span class="pedido-item-date">${p.fecha || ''}</span>
        <span class="pedido-item-badge">${p.total_items} ítem${p.total_items !== 1 ? 's' : ''}</span>
      </div>
    </div>
  `).join('');
}

/* ─── OPEN PEDIDO ────────────────────────────────────────────────────────── */
async function openPedido(id) {
    try {
        const data = await api(`/api/pedidos/${id}`);
        currentPedidoId = id;
        fNumero.value = data.numero_pedido || '';
        fFecha.value = data.fecha || '';
        fCliente.value = data.cliente || '';
        fDisenador.value = data.disenador || '';
        fAsesor.value = data.asesor || '';
        pageTitle.textContent = `Pedido: ${data.numero_pedido || '#' + id}`;
        itemsBody.innerHTML = '';
        if (data.items.length) data.items.forEach(addRow);
        else addRow();
        updateItemCount();
        btnExportar.disabled = false;
        btnEliminar.style.display = '';
        renderPedidosList(allPedidos);
    } catch (e) { showToast('Error al abrir pedido', 'error'); }
}

/* ─── NEW PEDIDO ─────────────────────────────────────────────────────────── */
function newPedido() {
    currentPedidoId = null;
    fNumero.value = '';
    fFecha.value = new Date().toISOString().slice(0, 10);
    fCliente.value = '';
    fDisenador.value = '';
    fAsesor.value = '';
    pageTitle.textContent = 'Nuevo Pedido';
    itemsBody.innerHTML = '';
    addRow();
    updateItemCount();
    btnExportar.disabled = true;
    btnEliminar.style.display = 'none';
    renderPedidosList(allPedidos);
}

/* ─── COLLECT FORM DATA ──────────────────────────────────────────────────── */
function collectData() {
    const rows = itemsBody.querySelectorAll('tr:not(.empty-table-row)');
    const items = [];
    rows.forEach(tr => {
        const inputs = tr.querySelectorAll('input.cell-input');
        if (inputs.length === 0) return;
        const g = i => inputs[i] ? inputs[i].value.trim() : '';
        const qty = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
        items.push({
            codigo: g(0), descripcion: g(1),
            nota_h: g(2), nota_l: g(3), nota_prof: g(4), nota_adicional: g(5),
            cantidad_unitaria: qty(g(6)), cantidad_tipologia: qty(g(7)), cantidad_total: qty(g(8)),
            pintura: g(9), acabados_adicional: g(10),
            formica: g(11), supercor: g(12), canto: g(13),
            madecanto: g(14), vidrio: g(15), tela: g(16), render: g(17)
        });
    });
    return {
        numero_pedido: fNumero.value.trim(),
        fecha: fFecha.value,
        cliente: fCliente.value.trim(),
        disenador: fDisenador.value.trim(),
        asesor: fAsesor.value.trim(),
        items
    };
}

/* ─── SAVE ───────────────────────────────────────────────────────────────── */
async function save() {
    const data = collectData();
    try {
        if (currentPedidoId) {
            await api(`/api/pedidos/${currentPedidoId}`, { method: 'PUT', body: JSON.stringify(data) });
            showToast('Pedido actualizado ✓', 'success');
        } else {
            const res = await api('/api/pedidos', { method: 'POST', body: JSON.stringify(data) });
            currentPedidoId = res.id;
            btnExportar.disabled = false;
            btnEliminar.style.display = '';
            pageTitle.textContent = `Pedido: ${data.numero_pedido || '#' + res.id}`;
            showToast('Pedido guardado ✓', 'success');
        }
        await loadPedidos();
        renderPedidosList(allPedidos);
    } catch (e) { showToast('Error al guardar: ' + e.message, 'error'); }
}

/* ─── DELETE ─────────────────────────────────────────────────────────────── */
function confirmDelete() {
    showModal(
        '¿Eliminar pedido?',
        `Se eliminará el pedido "${fNumero.value || '#' + currentPedidoId}" y todos sus items. Esta acción no se puede deshacer.`,
        async () => {
            try {
                await api(`/api/pedidos/${currentPedidoId}`, { method: 'DELETE' });
                showToast('Pedido eliminado', 'info');
                await loadPedidos();
                newPedido();
            } catch (e) { showToast('Error al eliminar', 'error'); }
        }
    );
}

/* ─── EXPORT EXCEL ───────────────────────────────────────────────────────── */
function exportExcel() {
    if (!currentPedidoId) return;
    window.location.href = `/api/pedidos/${currentPedidoId}/export`;
    showToast('Descargando Excel...', 'info');
}

/* ─── TABLE ROWS ─────────────────────────────────────────────────────────── */
function addRow(item = null) {
    // Remove empty state row if present
    const emp = itemsBody.querySelector('.empty-table-row');
    if (emp) emp.remove();

    const tr = document.createElement('tr');
    tr.setAttribute('data-row', '');

    // 19 columns total: #, code, desc, h, l, prof, adic, qty_u, qty_t, qty_total, pintura, aca, for, sup, can, mad, vid, tel, ren
    const colDefs = [
        // [type, fieldKey, placeholder, class, inputClass, finishType]
        ['num', null, '', '', '', null],
        ['input', 'codigo', 'Cód. producto', '', '', null],
        ['input', 'descripcion', 'Descripción', 'col-desc', '', null],
        ['input', 'nota_h', 'Ej: 72', '', '', null],
        ['input', 'nota_l', 'Ej: 120', '', '', null],
        ['input', 'nota_prof', 'Ej: 60', '', '', null],
        ['input', 'nota_adicional', 'Nota...', '', '', null],
        ['qty', 'cantidad_unitaria', '0', '', 'qty-input', null],
        ['qty', 'cantidad_tipologia', '0', '', 'qty-input', null],
        ['qty', 'cantidad_total', '0', '', 'qty-input total-input', null],
        ['finish', 'pintura', 'Buscar pintura…', 'finish-cell pintura-zone', '', 'pintura'],
        ['finish', 'acabados_adicional', 'Acabado…', 'finish-cell', '', null],
        ['finish', 'formica', 'Buscar fórmica…', 'finish-cell formica-zone', '', 'formica'],
        ['finish', 'supercor', 'Buscar supercor…', 'finish-cell supercor-zone', '', 'supercor'],
        ['finish', 'canto', 'Buscar canto…', 'finish-cell canto-zone', '', 'canto'],
        ['finish', 'madecanto', 'Buscar madecanto…', 'finish-cell', '', 'madecanto'],
        ['finish', 'vidrio', 'Buscar vidrio…', 'finish-cell vidrio-zone', '', 'vidrio'],
        ['finish', 'tela', 'Buscar tela…', 'finish-cell tela-zone', '', 'tela'],
        ['finish', 'render', 'Render…', 'finish-cell', '', null],
    ];

    const rowNum = itemsBody.querySelectorAll('tr[data-row]').length + 1;

    colDefs.forEach(([type, field, ph, tdClass, inputClass, finishType], i) => {
        const td = document.createElement('td');
        if (tdClass) td.className = tdClass;

        if (type === 'num') {
            const d = document.createElement('div');
            d.className = 'cell-num';
            d.textContent = rowNum;
            td.appendChild(d);
        } else {
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.className = `cell-input ${inputClass}`.trim();
            inp.placeholder = ph;
            inp.autocomplete = 'off';

            // Prefill from item if provided
            if (item && field && item[field] != null) {
                inp.value = item[field];
            }

            // Qty inputs recalc total
            if (type === 'qty' && (field === 'cantidad_unitaria' || field === 'cantidad_tipologia')) {
                inp.addEventListener('input', () => recalcTotal(tr));
            }
            if (field === 'cantidad_total' && item) {
                inp.readOnly = false; // allow manual override
            }

            // Finish type autocomplete
            if (finishType) {
                inp.dataset.finishType = finishType;
                inp.addEventListener('focus', e => openAutocomplete(inp, finishType));
                inp.addEventListener('input', e => {
                    acSelected = -1;
                    fetchAc(finishType, inp.value);
                });
                inp.addEventListener('keydown', handleAcKeydown);
                inp.addEventListener('blur', () => setTimeout(closeAc, 150));
            }

            td.appendChild(inp);
        }
        tr.appendChild(td);
    });

    // Prefill total if item exists
    if (item) {
        const inputs = tr.querySelectorAll('input.cell-input');
        // Recalc not needed as prefilled
    } else {
        recalcTotal(tr);
    }

    itemsBody.appendChild(tr);
    updateRowNumbers();
    updateItemCount();
}

function recalcTotal(tr) {
    const inputs = tr.querySelectorAll('input.qty-input');
    if (inputs.length < 3) return;
    const u = parseFloat(inputs[0].value) || 0;
    const t = parseFloat(inputs[1].value) || 0;
    // If tipologia is 0, total = unitaria; else total = u * t
    inputs[2].value = t > 0 ? (u * t) : u || '';
}

function updateRowNumbers() {
    const rows = itemsBody.querySelectorAll('tr[data-row]');
    rows.forEach((tr, i) => {
        const cell = tr.querySelector('.cell-num');
        if (cell) cell.textContent = i + 1;
    });
}

function removeLastRow() {
    const rows = itemsBody.querySelectorAll('tr[data-row]');
    if (rows.length > 1) {
        rows[rows.length - 1].remove();
        updateItemCount();
        updateRowNumbers();
    }
}

function updateItemCount() {
    const n = itemsBody.querySelectorAll('tr[data-row]').length;
    itemCount.textContent = n;
}

/* ─── AUTOCOMPLETE ───────────────────────────────────────────────────────── */
let acCache = {};
let acFetchTimer = null;

function openAutocomplete(inp, type) {
    currentAcInput = inp;
    acType = type;
    acSelected = -1;
    fetchAc(type, inp.value);
}

async function fetchAc(type, q) {
    clearTimeout(acFetchTimer);
    acFetchTimer = setTimeout(async () => {
        const key = `${type}:${q}`;
        if (!acCache[key]) {
            try {
                const url = `/api/catalogos/${type}${q ? '?q=' + encodeURIComponent(q) : ''}`;
                acCache[key] = await (await fetch(url)).json();
            } catch { return; }
        }
        renderAc(acCache[key], q);
    }, 120);
}

function renderAc(items, q) {
    if (!items.length || !currentAcInput) { closeAc(); return; }
    dropdown.innerHTML = items.slice(0, 30).map((item, i) => {
        const hl = q ? item.replace(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<em>$1</em>') : item;
        return `<div class="ac-item ${i === acSelected ? 'selected' : ''}" data-idx="${i}" onmousedown="selectAcItem('${item.replace(/'/g, "\\'")}')">
      ${hl}
    </div>`;
    }).join('');
    positionAc();
    dropdown.style.display = 'block';
}

function positionAc() {
    if (!currentAcInput) return;
    const r = currentAcInput.getBoundingClientRect();
    dropdown.style.left = r.left + 'px';
    dropdown.style.top = (r.bottom + 2) + 'px';
    dropdown.style.minWidth = Math.max(r.width, 260) + 'px';
    // Flip up if not enough space
    const spaceBelow = window.innerHeight - r.bottom;
    if (spaceBelow < 260 && r.top > 260) {
        dropdown.style.top = '';
        dropdown.style.bottom = (window.innerHeight - r.top + 2) + 'px';
    } else {
        dropdown.style.bottom = '';
    }
}

function selectAcItem(val) {
    if (currentAcInput) currentAcInput.value = val;
    closeAc();
}

function closeAc() {
    dropdown.style.display = 'none';
    acSelected = -1;
}

function handleAcKeydown(e) {
    if (dropdown.style.display === 'none') return;
    const items = dropdown.querySelectorAll('.ac-item');
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        acSelected = Math.min(acSelected + 1, items.length - 1);
        items.forEach((el, i) => el.classList.toggle('selected', i === acSelected));
        if (items[acSelected]) items[acSelected].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        acSelected = Math.max(acSelected - 1, -1);
        items.forEach((el, i) => el.classList.toggle('selected', i === acSelected));
        if (acSelected >= 0 && items[acSelected]) items[acSelected].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
        if (acSelected >= 0 && items[acSelected]) {
            e.preventDefault();
            selectAcItem(items[acSelected].dataset.val || items[acSelected].textContent.trim().replace(/<[^>]+>/g, ''));
        } else {
            closeAc();
        }
    } else if (e.key === 'Escape') {
        closeAc();
    }
}

// Fix: store plain value in data attr
document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('mousedown', e => {
        if (!dropdown.contains(e.target) && e.target !== currentAcInput) closeAc();
    });
});

/* ─── MODAL ──────────────────────────────────────────────────────────────── */
function showModal(title, msg, onConfirm) {
    $('modalTitle').textContent = title;
    $('modalMsg').textContent = msg;
    $('modalOverlay').style.display = 'flex';
    $('modalConfirm').onclick = () => { hideModal(); onConfirm(); };
    $('modalCancel').onclick = hideModal;
}
function hideModal() { $('modalOverlay').style.display = 'none'; }

/* ─── TOAST ──────────────────────────────────────────────────────────────── */
function showToast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    const icons = {
        success: '✓', error: '✕', info: 'ℹ'
    };
    t.innerHTML = `<span>${icons[type] || 'ℹ'}</span> <span>${msg}</span>`;
    $('toastContainer').appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

/* ─── EVENT LISTENERS ────────────────────────────────────────────────────── */
function setupEventListeners() {
    btnNuevo.addEventListener('click', newPedido);
    btnGuardar.addEventListener('click', save);
    btnExportar.addEventListener('click', exportExcel);
    btnEliminar.addEventListener('click', confirmDelete);
    btnAddRow.addEventListener('click', () => addRow());
    btnDelLastRow.addEventListener('click', removeLastRow);
    btnToggleSidebar.addEventListener('click', () => sidebar.classList.toggle('collapsed'));

    searchInput.addEventListener('input', () => {
        const q = searchInput.value.toLowerCase();
        const filtered = allPedidos.filter(p =>
            (p.numero_pedido || '').toLowerCase().includes(q) ||
            (p.cliente || '').toLowerCase().includes(q) ||
            (p.asesor || '').toLowerCase().includes(q)
        );
        renderPedidosList(filtered);
    });

    // Keyboard shortcut: Ctrl+S
    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); }
    });

    // Close AC on scroll
    document.querySelector('.table-wrapper')?.addEventListener('scroll', closeAc);
}

/* ─── EXPOSE GLOBALS ─────────────────────────────────────────────────────── */
window.openPedido = openPedido;
window.selectAcItem = selectAcItem;

/* ─── KICK OFF ───────────────────────────────────────────────────────────── */
init();
