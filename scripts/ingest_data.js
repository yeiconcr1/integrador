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
    if (!fs.existsSync(FILE_PRODUCTS)) {
        console.error('❌ Products file missing:', FILE_PRODUCTS);
        throw new Error(`Products file not found: ${FILE_PRODUCTS}`);
    }

    try {
        const fileStream = fs.createReadStream(FILE_PRODUCTS, { encoding: 'latin1' });
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
                // Algunos archivos PT reportaron la descripción en 2 o al final (por ej. pos 27)
                // Vamos a usar la descripción en la posición 27 si existe y es lo bastante larga, si no, la 2
                let desc = parts[2].trim();
                if (parts.length > 27 && parts[27].trim().length > desc.length) {
                    desc = parts[27].trim();
                }

                // Ingesta mejorada: Permitir todos los códigos >4 dígitos numéricos en lugar de solo '22'
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
                console.error(`❌ Error processing line ${lineNum}:`, lineErr.message);
                continue;
            }
        }

        if (batch.length > 0) {
            try {
                db.transaction((rows) => {
                    for (const r of rows) insertArticuloPT.run(r[0], r[1]);
                })(batch);
            } catch (batchErr) {
                console.error('❌ Error inserting final batch:', batchErr.message);
                throw batchErr;
            }
        }
        console.log(`✅ Loaded ${count} PT product codes for lookup only.`);
    } catch (err) {
        console.error('❌ Fatal error in processProducts:', err.message);
        throw err;
    }
}

async function processMP() {
    console.log('--- Processing MP Products + Materials ---');
    if (!fs.existsSync(FILE_MP)) {
        console.error('❌ MP file missing:', FILE_MP);
        throw new Error(`MP file not found: ${FILE_MP}`);
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

                // Determinar tipo de material (formica, tela, pintura, etc...) para clasificarlo
                // Algunos export de oracle traen esto en parts[23], adaptaremos por index relativo
                let loc = '0';
                if (parts.length >= 24) {
                    loc = parts[23].trim().toUpperCase();
                } else if (parts.length >= 20) {
                    loc = parts[19].trim().toUpperCase();
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

                // Insert materials/finishes based on location
                if (loc && loc !== '0' && loc !== '0000') {
                    const catalogTypes = {
                        '1': 'pintura',
                        '2': 'formica',
                        '3': 'supercor',
                        '4': 'canto',
                        '5': 'madecanto',
                        '6': 'vidrio',
                        '7': 'tela'
                    };

                    const type = catalogTypes[loc];
                    if (type) {
                        try {
                            insertCatalogo.run(type, desc);
                            countMats++;
                        } catch (insertErr) {
                            console.warn(`⚠️  Line ${lineNum}: Failed to insert catalog item ${type}: ${desc} - ${insertErr.message}`);
                        }
                    } else {
                        console.warn(`⚠️  Line ${lineNum}: Unknown location code '${loc}' for code ${code}`);
                    }
                }
            } catch (lineErr) {
                console.error(`❌ Error processing MP line ${lineNum}:`, lineErr.message);
                continue;
            }
        }

        if (artBatch.length > 0) {
            try {
                db.transaction((rows) => {
                    for (const r of rows) insertArticulo.run(r[0], r[1]);
                })(artBatch);
            } catch (batchErr) {
                console.error('❌ Error inserting final article batch:', batchErr.message);
                throw batchErr;
            }
        }
        console.log(`✅ Loaded ${countArts} articles and ${countMats} material/finish entries.`);
    } catch (err) {
        console.error('❌ Fatal error in processMP:', err.message);
        throw err;
    }
}

async function run() {
    const startTime = Date.now();
    console.log('🚀 Starting data ingestion process...');

    try {
        // Check if files exist before starting
        const missingFiles = [];
        if (!fs.existsSync(FILE_PRODUCTS)) missingFiles.push(FILE_PRODUCTS);
        if (!fs.existsSync(FILE_MP)) missingFiles.push(FILE_MP);

        if (missingFiles.length > 0) {
            console.error('❌ Missing required files:');
            missingFiles.forEach(file => console.error(`   - ${file}`));
            console.error('\nPlease ensure all required data files are present before running this script.');
            process.exit(1);
        }

        console.log('📁 All required files found, starting processing...');

        await processProducts();
        await processMP();

        // Sync catalogos.json for any legacy parts of the app
        console.log('📝 Syncing catalogos.json...');
        try {
            const all = {};
            db.prepare('SELECT tipo, descripcion FROM catalogos ORDER BY tipo, descripcion').all().forEach(r => {
                if (!all[r.tipo]) all[r.tipo] = [];
                all[r.tipo].push(r.descripcion);
            });
            fs.writeFileSync(path.join(__dirname, '..', 'catalogos.json'), JSON.stringify(all, null, 2));
            console.log('✅ catalogos.json updated successfully.');
        } catch (syncErr) {
            console.warn('⚠️  Warning: Failed to sync catalogos.json:', syncErr.message);
            // Don't fail the entire process for this
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`🚀 SUCCESS: Everything updated in ${duration}s.`);

    } catch (err) {
        console.error('\n❌ FATAL ERROR: Data ingestion failed');
        console.error('Error details:', err.message);
        if (err.stack) {
            console.error('\nStack trace:');
            console.error(err.stack);
        }
        console.error('\nPlease check the error above and try again.');
        process.exit(1);
    } finally {
        try {
            db.close();
            console.log('🔒 Database connection closed.');
        } catch (closeErr) {
            console.warn('⚠️  Warning: Error closing database:', closeErr.message);
        }
    }
}

run();
