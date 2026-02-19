const fs = require('fs');
const readline = require('readline');
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'integrador.db');
const FILE_PRODUCTS = path.join(__dirname, '..', 'PT.txt');
const FILE_MP = path.join(__dirname, '..', 'MP.txt');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Crear tablas
db.exec(`
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

  CREATE INDEX IF NOT EXISTS idx_catalogos_tipo_desc ON catalogos(tipo, descripcion);
  CREATE INDEX IF NOT EXISTS idx_articulos_codigo ON articulos(codigo);
  CREATE INDEX IF NOT EXISTS idx_articulos_desc ON articulos(descripcion);
  CREATE INDEX IF NOT EXISTS idx_articulos_pt_codigo ON articulos_pt(codigo);
`);

// PT products lookup table (codigo -> descripcion)
const insertArticuloPT = db.prepare('INSERT OR REPLACE INTO articulos_pt (codigo, descripcion) VALUES (?, ?)');
// MP articles for search and materials/finishes
const insertArticulo = db.prepare('INSERT OR REPLACE INTO articulos (codigo, descripcion) VALUES (?, ?)');
const insertCatalogo = db.prepare('INSERT OR IGNORE INTO catalogos (tipo, descripcion) VALUES (?, ?)');

async function processProducts() {
    console.log('--- Processing PT Products (lookup only) ---');
    if (!fs.existsSync(FILE_PRODUCTS)) return console.error('Products file missing');

    const fileStream = fs.createReadStream(FILE_PRODUCTS, { encoding: 'latin1' });
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let count = 0;
    const batch = [];

    for await (const line of rl) {
        const parts = line.split('|');
        if (parts.length < 3) continue;
        const code = parts[1].trim();
        const desc = parts[2].trim();

        if (code.length >= 10 && code.startsWith('22')) {
            batch.push([code, desc]);
            if (batch.length >= 2000) {
                const tx = db.transaction((rows) => {
                    for (const r of rows) insertArticuloPT.run(r[0], r[1]);
                });
                tx(batch.splice(0));
            }
            count++;
        }
    }
    if (batch.length > 0) {
        db.transaction((rows) => {
            for (const r of rows) insertArticuloPT.run(r[0], r[1]);
        })(batch);
    }
    console.log(`✅ Loaded ${count} PT product codes for lookup only.`);
}

async function processMP() {
    console.log('--- Processing MP Products + Materials ---');
    if (!fs.existsSync(FILE_MP)) return console.error('MP.txt missing');

    const fileStream = fs.createReadStream(FILE_MP, { encoding: 'latin1' });
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let countMats = 0;
    let countArts = 0;
    const artBatch = [];

    for await (const line of rl) {
        const parts = line.split('\t');
        if (parts.length < 24) continue;

        const code = parts[1].trim();
        const desc = parts[2].trim();
        const loc = parts[23].trim().toUpperCase();
        
        // Skip if description contains GENERICO or CODIGO INACTIVO
        const descUpper = desc.toUpperCase();
        if (descUpper.includes('GENERICO') || descUpper.includes('CODIGO INACTIVO')) {
            continue;
        }

        // 1. Ingest into Articulos (searchable products from MP)
        if (code.length >= 8) {
            artBatch.push([code, desc]);
            if (artBatch.length >= 1000) {
                const tx = db.transaction((rows) => {
                    for (const r of rows) insertArticulo.run(r[0], r[1]);
                });
                tx(artBatch.splice(0));
            }
            countArts++;
        }

        // 2. Ingest into Catalogos (finishes) based on description START
        let type = null;
        
        // Check if description STARTS with material type names
        if (descUpper.startsWith('FORMICA')) type = 'formica';
        else if (descUpper.startsWith('CANTO')) type = 'canto';
        else if (descUpper.startsWith('VIDRIO')) type = 'vidrio';
        else if (descUpper.startsWith('TELA')) type = 'tela';
        else if (descUpper.startsWith('DURALAM')) type = 'supercor';
        else if (descUpper.startsWith('MADECANTO')) type = 'madecanto';
        else if (descUpper.startsWith('PINTURA')) type = 'pintura';

        if (type) {
            insertCatalogo.run(type, desc);
            countMats++;
        }
    }
    if (artBatch.length > 0) {
        db.transaction((rows) => {
            for (const r of rows) insertArticulo.run(r[0], r[1]);
        })(artBatch);
    }
    console.log(`✅ Loaded ${countArts} MP articles + ${countMats} material finishes (including pinturas).`);
}

async function run() {
    try {
        await processProducts();
        await processMP();

        // Sync catalogos.json for any legacy parts of the app
        const all = {};
        db.prepare('SELECT tipo, descripcion FROM catalogos ORDER BY tipo, descripcion').all().forEach(r => {
            if (!all[r.tipo]) all[r.tipo] = [];
            all[r.tipo].push(r.descripcion);
        });
        fs.writeFileSync(path.join(__dirname, '..', 'catalogos.json'), JSON.stringify(all, null, 2));

        console.log('🚀 SUCCESS: Everything updated.');
    } catch (err) {
        console.error('❌ FAILED:', err);
    } finally {
        db.close();
    }
}

run();
