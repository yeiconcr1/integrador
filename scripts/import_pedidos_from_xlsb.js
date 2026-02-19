const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const Database = require('better-sqlite3');

const ROOT = path.join(__dirname, '..');
const db = new Database(path.join(ROOT, 'integrador.db'));
db.pragma('foreign_keys = ON');

const FILES = fs.readdirSync(ROOT)
  .filter((name) => name.toLowerCase().endsWith('.xlsb') && name.toUpperCase().includes('INTEGRADOR'))
  .sort();

function toIsoDate(dateStr) {
  const match = String(dateStr || '').match(/(\d{2})-(\d{2})-(\d{4})/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

function parseFilenameMeta(filename) {
  const numeroMatch = filename.match(/INTEGRADOR\s+(\d+)/i);
  const dateMatch = filename.match(/\((\d{2}-\d{2}-\d{4})\)/);

  let clienteFromName = null;
  let proyectoFromName = null;
  const middle = filename
    .replace(/\.xlsb$/i, '')
    .replace(/^\d+\.\s*/i, '')
    .replace(/^INTEGRADOR\s+\d+\s*/i, '')
    .replace(/\s*\(\d{2}-\d{2}-\d{4}\)\s*$/i, '');

  if (middle.includes('_')) {
    const [left, right] = middle.split('_').map((v) => v.trim());
    proyectoFromName = left || null;
    clienteFromName = right || null;
  }

  return {
    numero_pedido: numeroMatch ? numeroMatch[1] : null,
    fecha: dateMatch ? toIsoDate(dateMatch[1]) : null,
    clienteFromName,
    proyectoFromName,
  };
}

function parseIntegradorFile(fileName) {
  const fullPath = path.join(ROOT, fileName);
  const wb = XLSX.readFile(fullPath, { cellDates: false });
  const ws = wb.Sheets['INTEGRADOR'];
  if (!ws) throw new Error(`No se encontró hoja INTEGRADOR en ${fileName}`);

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });

  const byLabel = (label) => {
    const row = rows.find((r) => String(r[0] || '').trim().toLowerCase() === label.toLowerCase());
    return row ? String(row[1] || '').trim() : '';
  };

  const headerIdx = rows.findIndex((r) => String(r[0] || '').trim().toUpperCase() === 'CODIGO');
  if (headerIdx < 0) throw new Error(`No se encontró encabezado de items en ${fileName}`);

  const itemRows = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i].map((v) => String(v || '').trim());
    const codigo = r[0] || '';
    if (!codigo) continue;
    if (!/^\d{8,}$/.test(codigo)) continue;

    const num = (value) => {
      if (value === null || value === undefined || value === '') return null;
      const parsed = Number(String(value).replace(',', '.'));
      return Number.isFinite(parsed) ? parsed : null;
    };

    itemRows.push({
      codigo,
      descripcion: r[1] || null,
      nota_h: r[2] || null,
      nota_l: r[3] || null,
      nota_prof: r[4] || null,
      nota_adicional: r[5] || null,
      cantidad_unitaria: num(r[6]),
      cantidad_tipologia: num(r[7]),
      cantidad_total: num(r[8]),
      pintura: r[9] || null,
      acabados_adicional: r[10] || null,
      formica: r[11] || null,
      supercor: r[12] || null,
      canto: r[13] || null,
      madecanto: r[14] || null,
      vidrio: r[15] || null,
      tela: r[16] || null,
      render: r[17] || null,
    });
  }

  const metaName = parseFilenameMeta(fileName);
  const clienteRaw = byLabel('Cliente:');

  let cliente = metaName.clienteFromName || clienteRaw || null;
  let proyecto = metaName.proyectoFromName || null;

  if (clienteRaw && clienteRaw.includes(' - ')) {
    const [left, right] = clienteRaw.split(' - ').map((v) => v.trim());
    cliente = left || cliente;
    proyecto = right || proyecto;
  }

  return {
    numero_pedido: metaName.numero_pedido,
    fecha: metaName.fecha,
    cliente,
    proyecto,
    disenador: byLabel('Diseñador:') || null,
    asesor: byLabel('Asesor Comercial:') || null,
    puestos: [
      {
        nombre: 'PUESTO 1',
        items: itemRows,
      },
    ],
    source: fileName,
  };
}

function savePedido(pedido) {
  const insertPedido = db.prepare(`
    INSERT INTO pedidos (numero_pedido, fecha, cliente, proyecto, disenador, asesor)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertPuesto = db.prepare(`
    INSERT INTO puestos_trabajo (pedido_id, nombre, orden)
    VALUES (?, ?, ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO puesto_items (
      puesto_id, orden, codigo, descripcion, nota_h, nota_l, nota_prof, nota_adicional,
      cantidad_unitaria, cantidad_tipologia, cantidad_total,
      pintura, acabados_adicional, formica, supercor, canto, madecanto, vidrio, tela, render
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    const p = insertPedido.run(
      pedido.numero_pedido,
      pedido.fecha,
      pedido.cliente,
      pedido.proyecto,
      pedido.disenador,
      pedido.asesor
    );

    const pedidoId = p.lastInsertRowid;
    pedido.puestos.forEach((puesto, pIdx) => {
      const pt = insertPuesto.run(pedidoId, String(puesto.nombre || `PUESTO ${pIdx + 1}`).toUpperCase(), pIdx);
      const puestoId = pt.lastInsertRowid;
      puesto.items.forEach((item, iIdx) => {
        insertItem.run(
          puestoId,
          iIdx,
          item.codigo || null,
          item.descripcion || null,
          item.nota_h || null,
          item.nota_l || null,
          item.nota_prof || null,
          item.nota_adicional || null,
          item.cantidad_unitaria,
          item.cantidad_tipologia,
          item.cantidad_total,
          item.pintura || null,
          item.acabados_adicional || null,
          item.formica || null,
          item.supercor || null,
          item.canto || null,
          item.madecanto || null,
          item.vidrio || null,
          item.tela || null,
          item.render || null
        );
      });
    });

    return pedidoId;
  });

  return tx();
}

const run = db.transaction(() => {
  db.prepare('DELETE FROM pedidos').run();

  const loaded = [];
  for (const file of FILES) {
    const pedido = parseIntegradorFile(file);
    const id = savePedido(pedido);
    loaded.push({ id, numero: pedido.numero_pedido, cliente: pedido.cliente, proyecto: pedido.proyecto, items: pedido.puestos[0].items.length, source: file });
  }

  return loaded;
});

try {
  const result = run();
  console.log('✅ Pedidos recreados desde .xlsb');
  result.forEach((r) => {
    console.log(`- ID ${r.id} | Pedido ${r.numero} | Cliente: ${r.cliente} | Proyecto: ${r.proyecto} | Items: ${r.items}`);
    console.log(`  Fuente: ${r.source}`);
  });
} catch (err) {
  console.error('❌ Error importando pedidos desde .xlsb:', err.message);
  process.exit(1);
} finally {
  db.close();
}
