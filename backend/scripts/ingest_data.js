const fs = require('fs');
const readline = require('readline');
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'integrador.db');
const FILE_PT = path.join(__dirname, '..', 'data', 'PT.txt');
const FILE_MP = path.join(__dirname, '..', 'data', 'MP.txt');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Crear tablas
db.exec(`
  DROP TABLE IF EXISTS catalogos;
  DROP TABLE IF EXISTS articulos;
  DROP TABLE IF EXISTS articulos_pt;

  CREATE TABLE IF NOT EXISTS catalogos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,
    descripcion TEXT NOT NULL,
    UNIQUE(tipo, descripcion)
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
    if (!fs.existsSync(FILE_PT)) {
        console.error('❌ Products file missing:', FILE_PT);
        return;
    }

    try {
        const fileStream = fs.createReadStream(FILE_PT, { encoding: 'latin1' });
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

        let count = 0;
        const batch = [];
        let lineNum = 0;

        for await (const line of rl) {
            lineNum++;
            try {
                const parts = line.split('|');
                if (parts.length < 3) continue;

                const code = parts[1].trim();
                let desc = parts[2].trim();
                if (parts.length > 27 && parts[27].trim().length > desc.length) {
                    desc = parts[27].trim();
                }

                if (code.length >= 4 && /^\d+$/.test(code)) {
                    batch.push([code, desc]);
                    if (batch.length >= 2000) {
                        const tx = db.transaction((rows) => {
                            for (const r of rows) insertArticuloPT.run(r[0], r[1]);
                        });
                        tx(batch.splice(0));
                    }
                    count++;
                }
            } catch (lineErr) {
                continue;
            }
        }

        if (batch.length > 0) {
            db.transaction((rows) => {
                for (const r of rows) insertArticuloPT.run(r[0], r[1]);
            })(batch);
        }
        console.log(`✅ Loaded ${count} PT product codes for lookup only.`);
    } catch (err) {
        console.error('❌ Error in processProducts:', err.message);
    }
}

async function processMP() {
    console.log('--- Processing MP Products + Materials ---');
    if (!fs.existsSync(FILE_MP)) {
        console.error('❌ MP file missing:', FILE_MP);
        return;
    }

    try {
        const fileStream = fs.createReadStream(FILE_MP, { encoding: 'latin1' });
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

        let countMats = 0;
        let countArts = 0;
        const artBatch = [];
        let lineNum = 0;

        for await (const line of rl) {
            lineNum++;
            try {
                let parts = line.split('\t');
                if (parts.length < 5) {
                    parts = line.split('|');
                }

                if (parts.length < 3) continue;

                const code = parts[1].trim();
                let desc = parts[2].trim();
                if (parts.length > 27 && parts[27].trim().length > desc.length) {
                    desc = parts[27].trim();
                }

                // Clasificación dinámica basada en Categoría, Descripción y Localizador
                const catPath = parts.length > 19 ? parts[19].toUpperCase() : '';
                const rawDesc = desc.toUpperCase();
                const locator = parts.length > 45 ? parts[45].toUpperCase().trim() : '';

                // Filtros de exclusión globales (Fase 2: Purga masiva de accesorios y consumibles)
                const EXCLUDED_KEYWORDS = [
                    'PERFIL', 'PLATINA', 'ANGULO', 'CANTONERA', 'SUPERFICIE', 'APROVECHAMIENTO',
                    'DEPURACION', 'DEP ', 'REGRUESE', 'AJUSTADOR', 'CATALIZADOR', 'THINER',
                    'REMOVEDOR', 'SILICONA', 'ETIQUETA', 'ALAMBRE', 'PRIMER', 'KIT',
                    'ESTRUCTURA', 'HERRAJE', 'PATA', 'PARALES', 'MDF', 'UNICOR', 'FIBRA',
                    'PISO', 'REATA', 'TAFETA', 'DACRON', 'PELICULA', 'BISAGRA', 'CERRADURA',
                    'CORREDERA', 'CAJA', 'BOLSA', 'EMPAQUE', 'TAPA', 'TORNILLO', 'PERFORACIONES',
                    'BOQUETES', 'PISAVIDRIO', 'ROLLO', 'VELCRO', 'KAMBRAL', 'PUERTA', 'PANTALLA',
                    'NAVE', 'MAQUILA', 'VIDRIO TEMPLADO', 'VIDRIO LAMINADO', 'VIDRIO CRUDO',
                    'ESPEJO-FONDO', 'ESPEJO 4MM', 'CENTRAL', 'PUNTERA', 'CUERPO', 'KIT VETRO',
                    'SIST. NIVELA.', 'REFERENCIA DESCONTINUADA', 'DESCONTINUADA', 'NO USAR', 'LACA', 'COUNTER'
                ];

                if (rawDesc.startsWith('HAI-') || rawDesc.startsWith('(PROVI)')) continue;
                if (EXCLUDED_KEYWORDS.some(k => rawDesc.includes(k))) continue;
                if (rawDesc.includes('GENERICO') || rawDesc.includes('CODIGO INACTIVO')) continue;
                if (rawDesc.includes('(USAR ') || rawDesc.includes('(ANTES ')) continue;

                let type = null;

                // Prioridad Pintura: Localizador PI o palabra clave
                if (locator.startsWith('PI') || catPath.includes('PINTURA') || rawDesc.includes('PINTURA')) {
                    type = 'pintura';
                } else if (catPath.includes('TELAS') || rawDesc.startsWith('TELA ')) {
                    type = 'tela';
                } else if (catPath.includes('SUPERCOR') || catPath.includes('MELAMINICOS') || rawDesc.includes('SUPERCOR')) {
                    type = 'supercor';
                } else if (catPath.includes('FORMICA') || rawDesc.includes('FORMICA')) {
                    type = 'formica';
                } else if (catPath.includes('MADECANTO')) {
                    type = 'madecanto';
                } else if (catPath.includes('CANTO')) {
                    type = 'canto';
                } else if (catPath.includes('VIDRIO') || rawDesc.includes('VIDRIO')) {
                    type = 'vidrio';
                }

                // Skip if description contains GENERICO or CODIGO INACTIVO
                if (desc.includes('GENERICO') || desc.includes('CODIGO INACTIVO')) continue;

                if (code.length < 4 || !/^\d+$/.test(code)) continue;

                // Insert article
                artBatch.push([code, desc]);
                if (artBatch.length >= 2000) {
                    const tx = db.transaction((rows) => {
                        for (const r of rows) insertArticulo.run(r[0], r[1]);
                    });
                    tx(artBatch.splice(0));
                }
                countArts++;

                // Persistir en catálogo si se identificó el tipo
                if (type) {
                    try {
                        insertCatalogo.run(type, desc);
                        countMats++;
                    } catch (insertErr) {
                        // Ignorar errores de duplicados
                    }
                }
            } catch (lineErr) {
                continue;
            }
        }

        if (artBatch.length > 0) {
            db.transaction((rows) => {
                for (const r of rows) insertArticulo.run(r[0], r[1]);
            })(artBatch);
        }
        console.log(`✅ Loaded ${countArts} articles and ${countMats} material/finish entries.`);
    } catch (err) {
        console.error('❌ Error in processMP:', err.message);
    }
}

async function run() {
    const startTime = Date.now();
    console.log('🚀 Starting data ingestion process...');

    try {
        await processProducts();
        await processMP();

        // Sync catalogos.json
        const all = {};
        db.prepare('SELECT tipo, descripcion FROM catalogos ORDER BY tipo, descripcion').all().forEach(r => {
            if (!all[r.tipo]) all[r.tipo] = [];
            all[r.tipo].push(r.descripcion);
        });
        fs.writeFileSync(path.join(__dirname, '..', 'data', 'catalogos.json'), JSON.stringify(all, null, 2));

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`🚀 SUCCESS: Everything updated in ${duration}s.`);
    } catch (err) {
        console.error('❌ Fatal Error:', err.message);
    } finally {
        db.close();
    }
}

run();
