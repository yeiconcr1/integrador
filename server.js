const express = require('express');
const Database = require('better-sqlite3');
const ExcelJS = require('exceljs');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── DATABASE SETUP ──────────────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'integrador.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_pedido TEXT,
    fecha TEXT,
    cliente TEXT,
    proyecto TEXT,
    disenador TEXT,
    asesor TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS puestos_trabajo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL DEFAULT 'Puesto de trabajo',
    orden INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS puesto_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    puesto_id INTEGER NOT NULL REFERENCES puestos_trabajo(id) ON DELETE CASCADE,
    orden INTEGER DEFAULT 0,
    codigo TEXT,
    descripcion TEXT,
    nota_h TEXT,
    nota_l TEXT,
    nota_prof TEXT,
    nota_adicional TEXT,
    cantidad_unitaria REAL,
    cantidad_tipologia REAL,
    cantidad_total REAL,
    pintura TEXT,
    acabados_adicional TEXT,
    formica TEXT,
    supercor TEXT,
    canto TEXT,
    madecanto TEXT,
    vidrio TEXT,
    tela TEXT,
    render TEXT
  );

  CREATE TABLE IF NOT EXISTS catalogos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,
    descripcion TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS articulos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL UNIQUE,
    descripcion TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS articulos_pt (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL UNIQUE,
    descripcion TEXT NOT NULL
  );
`);

// Crear índices para búsquedas rápidas
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_catalogos_tipo_desc ON catalogos(tipo, descripcion);
  CREATE INDEX IF NOT EXISTS idx_articulos_codigo ON articulos(codigo);
  CREATE INDEX IF NOT EXISTS idx_articulos_desc ON articulos(descripcion);
  CREATE INDEX IF NOT EXISTS idx_articulos_pt_codigo ON articulos_pt(codigo);
`);

// ─── SEED CATALOGUES FROM JSON ────────────────────────────────────────────────
// ─── SEED CATALOGUES FROM JSON ────────────────────────────────────────────────
const catalogosJson = path.join(__dirname, 'catalogos.json');
if (fs.existsSync(catalogosJson)) {
    const data = JSON.parse(fs.readFileSync(catalogosJson, 'utf-8'));

    // Always re-seed on startup to ensure DB is in sync with JSON
    const reseed = db.transaction(() => {
        db.prepare('DELETE FROM catalogos').run();
        db.prepare("DELETE FROM sqlite_sequence WHERE name='catalogos'").run();

        const insert = db.prepare('INSERT INTO catalogos (tipo, descripcion) VALUES (?, ?)');
        for (const [tipo, values] of Object.entries(data)) {
            for (const v of values) {
                insert.run(tipo, v);
            }
        }
    });

    try {
        reseed();
        const count = db.prepare('SELECT COUNT(*) as c FROM catalogos').get().c;
        console.log(`✅ Catálogos recargados en la BD (Total: ${count})`);
    } catch (error) {
        console.error('❌ Error recargando catálogos:', error.message);
    }
}

// ─── API: CATÁLOGOS ───────────────────────────────────────────────────────────
app.get('/api/catalogos/:tipo', (req, res) => {
    const { tipo } = req.params;
    const { q } = req.query;
    let rows;
    if (q && q.trim()) {
        rows = db.prepare(
            `SELECT descripcion FROM catalogos WHERE tipo = ? AND descripcion LIKE ? LIMIT 25`
        ).all(tipo, `%${q}%`);
    } else {
        // Sin query, devolver primeros 25 items ordenados alfabéticamente
        rows = db.prepare(
            `SELECT descripcion FROM catalogos WHERE tipo = ? ORDER BY descripcion LIMIT 25`
        ).all(tipo);
    }
    res.json(rows.map(r => r.descripcion));
});

// ─── API: ARTÍCULOS (BUSCADOR) ────────────────────────────────────────────────
app.get('/api/articulos/buscar', (req, res) => {
    const { q } = req.query;
    if (!q || q.length < 3) return res.json([]);
    try {
        const results = db.prepare(`
            SELECT codigo, descripcion 
            FROM articulos 
            WHERE codigo LIKE ? OR descripcion LIKE ? 
            LIMIT 15
        `).all(`${q}%`, `%${q}%`);
        res.json(results);
    } catch (err) {
        console.error('Search error:', err);
        res.json([]);
    }
});

app.get('/api/articulos/lookup/:codigo', (req, res) => {
    const { codigo } = req.params;
    try {
        // Primero busca en PT (para códigos de producto)
        let row = db.prepare('SELECT codigo, descripcion FROM articulos_pt WHERE codigo = ?').get(codigo);
        // Si no encuentra, busca en MP
        if (!row) {
            row = db.prepare('SELECT codigo, descripcion FROM articulos WHERE codigo = ?').get(codigo);
        }
        if (row) {
            res.json(row);
        } else {
            res.status(404).json({ error: 'No encontrado' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── API: PEDIDOS ─────────────────────────────────────────────────────────────

// List all pedidos
app.get('/api/pedidos', (req, res) => {
    const pedidos = db.prepare(`
        SELECT p.*,
               (SELECT COUNT(*) FROM puestos_trabajo WHERE pedido_id = p.id) as total_puestos,
               (SELECT COUNT(*) FROM puesto_items pi JOIN puestos_trabajo pt ON pi.puesto_id = pt.id WHERE pt.pedido_id = p.id) as total_items
        FROM pedidos p
        ORDER BY p.updated_at DESC
    `).all();
    res.json(pedidos);
});

// Get one pedido with puestos and items
app.get('/api/pedidos/:id', (req, res) => {
    const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

    const puestos = db.prepare(
        'SELECT * FROM puestos_trabajo WHERE pedido_id = ? ORDER BY orden ASC'
    ).all(req.params.id);

    const getItems = db.prepare('SELECT * FROM puesto_items WHERE puesto_id = ? ORDER BY orden ASC');

    const result = {
        ...pedido,
        puestos: puestos.map(p => ({
            ...p,
            items: getItems.all(p.id)
        }))
    };

    res.json(result);
});

// Create pedido
app.post('/api/pedidos', (req, res) => {
    const { numero_pedido, fecha, cliente, proyecto, disenador, asesor, puestos = [] } = req.body;

    const createPedido = db.transaction(() => {
        const result = db.prepare(
            `INSERT INTO pedidos (numero_pedido, fecha, cliente, proyecto, disenador, asesor) VALUES (?, ?, ?, ?, ?, ?)`
        ).run(numero_pedido, fecha, cliente, proyecto, disenador, asesor);
        const pedidoId = result.lastInsertRowid;

        savePuestos(pedidoId, puestos);
        return pedidoId;
    });

    const pedidoId = createPedido();
    res.status(201).json({ id: pedidoId, message: 'Pedido creado' });
});

// Update pedido
app.put('/api/pedidos/:id', (req, res) => {
    const { numero_pedido, fecha, cliente, proyecto, disenador, asesor, puestos = [] } = req.body;
    const pedido = db.prepare('SELECT id FROM pedidos WHERE id = ?').get(req.params.id);
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

    const updatePedido = db.transaction(() => {
        db.prepare(
            `UPDATE pedidos SET numero_pedido=?, fecha=?, cliente=?, proyecto=?, disenador=?, asesor=?,
             updated_at=CURRENT_TIMESTAMP WHERE id=?`
        ).run(numero_pedido, fecha, cliente, proyecto, disenador, asesor, req.params.id);

        // Delete old puestos (cascade deletes items)
        db.prepare('DELETE FROM puestos_trabajo WHERE pedido_id = ?').run(req.params.id);
        savePuestos(req.params.id, puestos);
    });

    updatePedido();
    res.json({ message: 'Pedido actualizado' });
});

// Delete
app.delete('/api/pedidos/:id', (req, res) => {
    db.prepare('DELETE FROM pedidos WHERE id = ?').run(req.params.id);
    res.json({ message: 'Pedido eliminado' });
});

// ─── HELPER: SAVE PUESTOS WITH ITEMS ─────────────────────────────────────────
function savePuestos(pedidoId, puestos) {
    const insertPuesto = db.prepare(
        'INSERT INTO puestos_trabajo (pedido_id, nombre, orden) VALUES (?, ?, ?)'
    );
    const findDescripcionByCodigo = db.prepare(
        `SELECT descripcion FROM articulos_pt WHERE codigo = ?
         UNION ALL
         SELECT descripcion FROM articulos WHERE codigo = ?
         LIMIT 1`
    );
    const insertItem = db.prepare(`
        INSERT INTO puesto_items
        (puesto_id, orden, codigo, descripcion, nota_h, nota_l, nota_prof, nota_adicional,
         cantidad_unitaria, cantidad_tipologia, cantidad_total,
         pintura, acabados_adicional, formica, supercor, canto, madecanto, vidrio, tela, render)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const normalizePuestoName = (name, index) => {
        const value = String(name || '').trim().toUpperCase();
        return value || `PUESTO ${index + 1}`;
    };

    puestos.forEach((puesto, pIdx) => {
        const pResult = insertPuesto.run(pedidoId, normalizePuestoName(puesto.nombre, pIdx), pIdx);
        const puestoId = pResult.lastInsertRowid;

        (puesto.items || []).forEach((item, iIdx) => {
            const codigo = item.codigo || null;
            const descripcionDirecta = item.descripcion ? String(item.descripcion).trim() : '';
            const descripcionLookup = codigo
                ? findDescripcionByCodigo.get(codigo, codigo)?.descripcion
                : null;
            const descripcionFinal = descripcionDirecta || descripcionLookup || null;

            insertItem.run(
                puestoId, iIdx,
                codigo, descripcionFinal,
                item.nota_h || null, item.nota_l || null, item.nota_prof || null, item.nota_adicional || null,
                item.cantidad_unitaria || null, item.cantidad_tipologia || null, item.cantidad_total || null,
                item.pintura || null, item.acabados_adicional || null,
                item.formica || null, item.supercor || null, item.canto || null,
                item.madecanto || null, item.vidrio || null, item.tela || null, item.render || null
            );
        });
    });
}

// ─── API: EXPORT EXCEL ───────────────────────────────────────────────────────
app.get('/api/pedidos/:id/export', async (req, res) => {
    const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

    const puestos = db.prepare('SELECT * FROM puestos_trabajo WHERE pedido_id = ? ORDER BY orden ASC').all(req.params.id);
    const getItems = db.prepare('SELECT * FROM puesto_items WHERE puesto_id = ? ORDER BY orden ASC');

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Integrador App';
    workbook.created = new Date();
    const ws = workbook.addWorksheet('INTEGRADOR');
    ws.views = [{ showGridLines: false, state: 'frozen', ySplit: 0, xSplit: 2 }];
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.5, header: 0.2, footer: 0.2 } };
    ws.headerFooter = { oddFooter: '&L&8&K777777Generado: &D &T&R&8&K777777Página &P de &N' };

    const logoCandidates = [
        path.join(__dirname, 'public', 'logo.png'),
        path.join(__dirname, 'public', 'logo.jpg'),
        path.join(__dirname, 'public', 'logo.jpeg'),
        path.join(__dirname, 'logo.png'),
        path.join(__dirname, 'logo.jpg'),
        path.join(__dirname, 'logo.jpeg'),
    ];
    const logoPath = logoCandidates.find(p => fs.existsSync(p));

    // ── Color Palette ──
    const NAVY      = 'FF101828';
    const DARK_NAVY = 'FF0C111D';
    const ACCENT    = 'FF2563EB';
    const ACCENT_LT = 'FF3B82F6';
    const ACCENT_BG = 'FFEFF6FF';
    const SLATE_700 = 'FF334155';
    const SLATE_500 = 'FF64748B';
    const SLATE_200 = 'FFE2E8F0';
    const SLATE_100 = 'FFF1F5F9';
    const SLATE_50  = 'FFF8FAFC';
    const WHITE     = 'FFFFFFFF';
    const GREEN_700 = 'FF15803D';
    const GREEN_50  = 'FFF0FDF4';
    const AMBER_700 = 'FFB45309';
    const AMBER_50  = 'FFFFFBEB';

    // ── Reusable Fills ──
    const navyFill    = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    const dkNavyFill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK_NAVY } };
    const accentFill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT } };
    const accentBgFill= { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT_BG } };
    const slateFill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_100 } };
    const slate50Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_50 } };
    const whiteFill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };
    const greenFill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_50 } };
    const amberFill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMBER_50 } };

    // ── Borders ──
    const softBorder = {
        top:    { style: 'thin', color: { argb: SLATE_200 } },
        left:   { style: 'thin', color: { argb: SLATE_200 } },
        bottom: { style: 'thin', color: { argb: SLATE_200 } },
        right:  { style: 'thin', color: { argb: SLATE_200 } },
    };
    const accentBottom = {
        bottom: { style: 'medium', color: { argb: ACCENT } },
    };
    const headerBorder = {
        top:    { style: 'thin', color: { argb: ACCENT_LT } },
        left:   { style: 'hair', color: { argb: ACCENT_LT } },
        bottom: { style: 'thin', color: { argb: ACCENT_LT } },
        right:  { style: 'hair', color: { argb: ACCENT_LT } },
    };
    const totalsBorder = {
        top:    { style: 'medium', color: { argb: SLATE_700 } },
        bottom: { style: 'double', color: { argb: SLATE_700 } },
    };

    // ── Fonts ──
    const F = (overrides) => ({ name: 'Calibri', size: 10, color: { argb: SLATE_700 }, ...overrides });
    const titleFont    = F({ bold: true, color: { argb: WHITE }, size: 18 });
    const subtitleFont = F({ color: { argb: SLATE_200 }, size: 11 });
    const metaLabel    = F({ bold: true, color: { argb: SLATE_500 }, size: 9 });
    const metaValue    = F({ bold: false, color: { argb: NAVY }, size: 10 });
    const colHeaderFont= F({ bold: true, color: { argb: WHITE }, size: 9 });
    const puestoFont   = F({ bold: true, color: { argb: WHITE }, size: 11 });
    const puestoNumFont= F({ bold: false, color: { argb: SLATE_200 }, size: 9 });
    const codeFont     = F({ bold: true, color: { argb: NAVY } });
    const descFont     = F({ color: { argb: SLATE_700 } });
    const qtyFont      = F({ bold: true, color: { argb: ACCENT } });
    const normalFont   = F({});
    const totalLblFont = F({ bold: true, color: { argb: SLATE_700 }, size: 10 });
    const totalValFont = F({ bold: true, color: { argb: ACCENT }, size: 10 });
    const materialFont = F({ color: { argb: SLATE_500 }, size: 9 });

    // ── Table Layout ──
    const HEADERS = [
        'CÓD.', 'DESCRIPCIÓN',
        'H', 'L', 'PROF', 'NOTAS',
        'UNI.', 'TIP.', 'TOTAL',
        'PINTURA', 'ACAB. ADIC.', 'FÓRMICA',
        'SUPERCOR', 'CANTO', 'MADECANTO',
        'VIDRIO', 'TELA / FIBER', 'RENDER'
    ];
    const colWidths = [14, 42, 8, 8, 8, 16, 8, 8, 9, 36, 20, 28, 24, 28, 24, 18, 34, 12];
    colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    // ═══════════════════════════════════════════════════════════════════
    // ██  HEADER BAND  (rows 1-4)
    // ═══════════════════════════════════════════════════════════════════
    for (let r = 1; r <= 4; r++) {
        for (let c = 1; c <= 18; c++) {
            const cell = ws.getCell(r, c);
            cell.fill = dkNavyFill;
        }
    }

    // Logo area (A1:C4)
    ws.mergeCells('A1:C4');
    const logoArea = ws.getCell('A1');
    logoArea.fill = dkNavyFill;

    if (logoPath) {
        const ext = path.extname(logoPath).replace('.', '').toLowerCase();
        const extension = ext === 'jpg' ? 'jpeg' : ext;
        const logoId = workbook.addImage({ filename: logoPath, extension });
        ws.addImage(logoId, {
            tl: { col: 0.3, row: 0.3 },
            br: { col: 2.7, row: 3.7 },
            editAs: 'oneCell'
        });
    } else {
        logoArea.value = { richText: [
            { text: 'OMEGA', font: { name: 'Calibri', bold: true, color: { argb: WHITE }, size: 16 } },
            { text: '\n', font: { size: 4 } },
            { text: 'ARQUINT', font: { name: 'Calibri', bold: false, color: { argb: SLATE_200 }, size: 10 } }
        ]};
        logoArea.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    }

    // Title (D1:R2)
    ws.mergeCells('D1:R2');
    const titleCell = ws.getCell('D1');
    titleCell.value = 'INTEGRADOR DE PEDIDO';
    titleCell.fill = dkNavyFill;
    titleCell.font = titleFont;
    titleCell.alignment = { horizontal: 'left', vertical: 'bottom' };

    // Subtitle (D3:R4)
    ws.mergeCells('D3:R4');
    const subtitleCell = ws.getCell('D3');
    const projLabel = pedido.proyecto || pedido.cliente || '-';
    const numLabel = pedido.numero_pedido || pedido.id;
    subtitleCell.value = { richText: [
        { text: 'PROYECTO  ', font: { ...subtitleFont, bold: true, color: { argb: SLATE_500 }, size: 9 } },
        { text: `${projLabel}`, font: { ...subtitleFont, color: { argb: WHITE } } },
        { text: '    ·    ', font: { ...subtitleFont, color: { argb: SLATE_500 } } },
        { text: 'PEDIDO  ', font: { ...subtitleFont, bold: true, color: { argb: SLATE_500 }, size: 9 } },
        { text: `${numLabel}`, font: { ...subtitleFont, color: { argb: WHITE } } },
    ]};
    subtitleCell.fill = dkNavyFill;
    subtitleCell.alignment = { horizontal: 'left', vertical: 'top' };

    ws.getRow(1).height = 20;
    ws.getRow(2).height = 20;
    ws.getRow(3).height = 16;
    ws.getRow(4).height = 16;

    // ── Accent stripe (row 5) ──
    for (let c = 1; c <= 18; c++) {
        const cell = ws.getCell(5, c);
        cell.fill = accentFill;
        cell.value = null;
    }
    ws.getRow(5).height = 4;

    // ═══════════════════════════════════════════════════════════════════
    // ██  META CARDS  (rows 6-7)
    // ═══════════════════════════════════════════════════════════════════
    const metaCard = (cell, label, value, icon) => {
        cell.value = { richText: [
            { text: `${icon || ''}${label}\n`, font: metaLabel },
            { text: `${value || '—'}`, font: metaValue }
        ]};
        cell.fill = slate50Fill;
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        cell.border = softBorder;
    };

    ws.mergeCells('A6:D7'); metaCard(ws.getCell('A6'), 'N° PEDIDO', pedido.numero_pedido, '# ');
    ws.mergeCells('E6:H7'); metaCard(ws.getCell('E6'), 'FECHA', pedido.fecha, '');
    ws.mergeCells('I6:N7'); metaCard(ws.getCell('I6'), 'CLIENTE', pedido.cliente, '');
    ws.mergeCells('O6:R7'); metaCard(ws.getCell('O6'), 'ASESOR', pedido.asesor, '');
    ws.mergeCells('A8:I9'); metaCard(ws.getCell('A8'), 'PROYECTO', pedido.proyecto || pedido.cliente || '-', '');
    ws.mergeCells('J8:R9'); metaCard(ws.getCell('J8'), 'DISEÑADOR', pedido.disenador, '');

    ws.getRow(6).height = 16;
    ws.getRow(7).height = 20;
    ws.getRow(8).height = 16;
    ws.getRow(9).height = 20;

    let currentRow = 11;

    // ═══════════════════════════════════════════════════════════════════
    // ██  PER PUESTO DE TRABAJO
    // ═══════════════════════════════════════════════════════════════════
    puestos.forEach((puesto, pIdx) => {
        const items = getItems.all(puesto.id);

        // ── Puesto banner ──
        ws.mergeCells(`A${currentRow}:R${currentRow}`);
        const pCell = ws.getCell(`A${currentRow}`);
        pCell.value = { richText: [
            { text: `  ${puesto.nombre}`, font: puestoFont },
            { text: `     ${items.length} artículo${items.length !== 1 ? 's' : ''}`, font: puestoNumFont },
        ]};
        pCell.fill = navyFill;
        pCell.alignment = { vertical: 'middle' };
        ws.getRow(currentRow).height = 30;
        currentRow++;

        // ── Column headers ──
        ws.getRow(currentRow).height = 28;
        HEADERS.forEach((h, i) => {
            const cell = ws.getCell(currentRow, i + 1);
            cell.value = h;
            cell.fill = accentFill;
            cell.font = colHeaderFont;
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = headerBorder;
        });
        const headerRow = currentRow;
        currentRow++;

        // ── Data rows ──
        let totalUnits = 0, totalTip = 0, totalTotal = 0;
        items.forEach((item, idx) => {
            const row = ws.getRow(currentRow);
            row.height = 22;
            const isEven = idx % 2 === 0;
            const baseFill = isEven ? whiteFill : slate50Fill;

            const values = [
                item.codigo, item.descripcion,
                item.nota_h, item.nota_l, item.nota_prof, item.nota_adicional,
                item.cantidad_unitaria, item.cantidad_tipologia, item.cantidad_total,
                item.pintura, item.acabados_adicional, item.formica,
                item.supercor, item.canto, item.madecanto,
                item.vidrio, item.tela, item.render
            ];

            // Accumulate totals
            if (item.cantidad_unitaria) totalUnits += Number(item.cantidad_unitaria) || 0;
            if (item.cantidad_tipologia) totalTip += Number(item.cantidad_tipologia) || 0;
            if (item.cantidad_total) totalTotal += Number(item.cantidad_total) || 0;

            values.forEach((v, i) => {
                const cell = row.getCell(i + 1);
                // Parse numeric columns to actual numbers (including codigo col 0)
                const isNumCol = i === 0 || (i >= 2 && i <= 4) || (i >= 6 && i <= 8);
                if (isNumCol && v != null && v !== '' && !isNaN(v)) {
                    cell.value = Number(v);
                } else {
                    cell.value = v || null;
                }
                cell.font = normalFont;
                cell.fill = baseFill;
                cell.border = softBorder;
                cell.alignment = { vertical: 'middle', horizontal: 'left' };

                // Code column – bold, no decimals
                if (i === 0) {
                    cell.font = codeFont;
                    cell.alignment = { vertical: 'middle', horizontal: 'left' };
                    cell.numFmt = '0';
                }
                // Description – wrap
                if (i === 1) {
                    cell.font = descFont;
                    cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
                }
                // Dimension notes (H, L, PROF) – center
                if (i >= 2 && i <= 4) {
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    cell.numFmt = '#,##0';
                }
                // Notes – wrap
                if (i === 5) {
                    cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
                }
                // Quantities – accent colour, centered
                if (i >= 6 && i <= 8) {
                    cell.font = qtyFont;
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    cell.numFmt = '#,##0';
                    // Highlight total column with subtle green
                    if (i === 8 && v) {
                        cell.fill = isEven
                            ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F9FF' } }
                            : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };
                    }
                }
                // Material columns – smaller font, wrap
                if (i >= 9 && i <= 16) {
                    cell.font = materialFont;
                    cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
                }
                // Render column – center
                if (i === 17) {
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    cell.font = F({ color: { argb: SLATE_500 }, size: 9 });
                }
            });
            currentRow++;
        });

        // ── Totals row ──
        if (items.length > 0) {
            const totRow = ws.getRow(currentRow);
            totRow.height = 24;
            for (let c = 1; c <= 18; c++) {
                const cell = totRow.getCell(c);
                cell.fill = slateFill;
                cell.border = { ...softBorder, top: { style: 'medium', color: { argb: SLATE_200 } } };
            }
            ws.mergeCells(`A${currentRow}:F${currentRow}`);
            const totLabel = ws.getCell(`A${currentRow}`);
            totLabel.value = { richText: [
                { text: '  SUBTOTAL  ', font: totalLblFont },
                { text: `${items.length} artículo${items.length !== 1 ? 's' : ''}`, font: { ...metaLabel, size: 9 } },
            ]};
            totLabel.alignment = { vertical: 'middle', horizontal: 'left' };

            const setTotal = (col, val) => {
                const cell = totRow.getCell(col);
                cell.value = (val != null && val !== 0) ? Number(val) : null;
                cell.font = totalValFont;
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.numFmt = '#,##0';
            };
            setTotal(7, totalUnits || null);
            setTotal(8, totalTip || null);
            setTotal(9, totalTotal || null);

            currentRow++;
        }

        // Auto-filter on column headers
        if (pIdx === 0 && items.length > 0) {
            ws.autoFilter = {
                from: { row: headerRow, column: 1 },
                to: { row: headerRow, column: 18 }
            };
        }

        // Spacer between puestos
        ws.getRow(currentRow).height = 10;
        currentRow++;
    });

    // ── Send file ──
    const safeProj = (pedido.proyecto || pedido.cliente || 'PEDIDO').replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_');
    const safeNum = (pedido.numero_pedido || pedido.id).toString().replace(/[^a-zA-Z0-9]/g, '');
    const filename = `INTEGRADOR_${safeNum}_${safeProj}_${pedido.fecha || 'SIN_FECHA'}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
});

// ─── SERVE SPA ────────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n🚀 Integrador App corriendo en http://localhost:${PORT}\n`);
});
