#!/usr/bin/env node
/**
 * ingest_bom_materiales.js
 * 
 * Lee LISTAS_TOT.csv y extrae, para cada código ÚNICO en la jerarquía,
 * qué tipos de material genérico lleva (formica, canto, tela, vidrio, etc.).
 * 
 * Algoritmo:
 *   Pasada 1: Construir el grafo hijo→padres y padre→ancestros completo
 *   Pasada 2: Para cada GENERICO, propagar el tipo de material a TODOS
 *             los ancestros (PADRE directo + abuelos + ... + PRINCIPAL)
 *
 * Uso:  node scripts/ingest_bom_materiales.js
 * Alias: npm run ingest:bom
 */

const fs = require('fs');
const readline = require('readline');
const Database = require('better-sqlite3');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const DB_PATH  = path.join(__dirname, '..', 'data', 'integrador.db');
const CSV_PATH = path.join(__dirname, '..', 'data', 'LISTAS_TOT.csv');
const ZIP_PATH = CSV_PATH + '.zip';

// Auto-descomprimir el zip si el CSV no existe todavía
if (!fs.existsSync(CSV_PATH)) {
    if (!fs.existsSync(ZIP_PATH)) {
        console.error('❌ No se encontró LISTAS_TOT.csv ni LISTAS_TOT.csv.zip en backend/data/');
        process.exit(1);
    }
    console.log('📦 Descomprimiendo LISTAS_TOT.csv.zip...');
    try {
        if (os.platform() === 'win32') {
            execSync(`powershell -command "Expand-Archive -Path '${ZIP_PATH}' -DestinationPath '${path.dirname(ZIP_PATH)}' -Force"`, { stdio: 'inherit' });
        } else {
            execSync(`unzip -o "${ZIP_PATH}" -d "${path.dirname(ZIP_PATH)}"`, { stdio: 'inherit' });
        }
        console.log('✅ Descompresión completada.');
    } catch (err) {
        console.error('❌ Error al descomprimir:', err.message);
        process.exit(1);
    }
}

// ── Mapeo: prefijo de descripción genérica → tipo de material del integrador ──
const MATERIAL_MAP = [
    { prefix: 'GENERICO FORMICA', tipo: 'formica' },
    { prefix: 'GENERICO ACRILPRESS', tipo: 'formica' },
    { prefix: 'GENERICO CANTO', tipo: 'canto' },
    { prefix: 'GENERICO CINTA', tipo: 'canto' },
    { prefix: 'GENERICO TELA', tipo: 'tela' },
    { prefix: 'GENERICO POLYESTER', tipo: 'tela' },
    { prefix: 'GENERICO ALFOMBRA', tipo: 'tela' },
    { prefix: 'GENERICO VIDRIO', tipo: 'vidrio' },
    { prefix: 'GENERICO SUPERCOR', tipo: 'supercor' },
    { prefix: 'GENERICO SUPERKRAFT', tipo: 'supercor' },
    { prefix: 'GENERICO DURALAM', tipo: 'supercor' },
    { prefix: 'GENERICO SUPERFONDO', tipo: 'supercor' },
    { prefix: 'GENERICO MADECANTO', tipo: 'madecanto' },
    { prefix: 'GENERICO MADEFILM', tipo: 'madecanto' },
    { prefix: 'GENERICO PINTURA', tipo: 'pintura' },
    { prefix: 'GENERICO PELICULA', tipo: 'pintura' },
];

function detectMaterialType(descripcion) {
    const upper = descripcion.toUpperCase().trim();
    for (const { prefix, tipo } of MATERIAL_MAP) {
        if (upper.startsWith(prefix)) return tipo;
    }
    return null;
}

/**
 * Recorre la cadena de ancestros de un código hacia arriba
 * y devuelve todos los códigos ancestro (padre, abuelo, etc.)
 */
function getAncestors(code, childToParents, visited = new Set()) {
    const ancestors = new Set();
    if (visited.has(code)) return ancestors; // evitar ciclos
    visited.add(code);

    const parents = childToParents.get(code);
    if (!parents) return ancestors;

    for (const parent of parents) {
        ancestors.add(parent);
        // Recursión: buscar los ancestros del padre
        for (const grandparent of getAncestors(parent, childToParents, visited)) {
            ancestors.add(grandparent);
        }
    }
    return ancestors;
}

async function run() {
    if (!fs.existsSync(CSV_PATH)) {
        console.error(`❌ No se encontró ${CSV_PATH}`);
        process.exit(1);
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log('  INGESTA DE MATERIALES BOM (LISTAS_TOT.csv)');
    console.log(`${'═'.repeat(60)}\n`);

    // ═══════════════════════════════════════════════════════════
    // PASADA 1: Construir grafo hijo→padres y detectar genéricos
    // ═══════════════════════════════════════════════════════════
    console.log('Pasada 1: Construyendo grafo de jerarquía...');

    const childToParents = new Map(); // componente → Set de padres
    const genericEntries = [];        // [{padre, tipo}] materiales genéricos encontrados

    const stream1 = fs.createReadStream(CSV_PATH, { encoding: 'latin1' });
    const rl1 = readline.createInterface({ input: stream1, crlfDelay: Infinity });

    let lineNum = 0;
    for await (const line of rl1) {
        lineNum++;
        if (lineNum === 1) continue;

        const parts = line.split(';');
        if (parts.length < 5) continue;

        const componente = parts[2].trim();
        const padre = parts[3].trim();
        const descripcionHijo = parts[4].trim();

        if (!componente || !padre) continue;

        // Construir grafo: componente es hijo de padre
        if (componente !== padre) {
            if (!childToParents.has(componente)) {
                childToParents.set(componente, new Set());
            }
            childToParents.get(componente).add(padre);
        }

        // Detectar materiales genéricos
        const tipo = detectMaterialType(descripcionHijo);
        if (tipo) {
            genericEntries.push({ padre, tipo });
        }
    }

    console.log(`  Líneas leídas:      ${lineNum.toLocaleString()}`);
    console.log(`  Nodos en el grafo:  ${childToParents.size.toLocaleString()}`);
    console.log(`  Genéricos hallados: ${genericEntries.length.toLocaleString()}`);

    // ═══════════════════════════════════════════════════════════
    // PASADA 2: Propagar materiales a todos los ancestros
    // ═══════════════════════════════════════════════════════════
    console.log('\nPasada 2: Propagando materiales a todos los ancestros...');

    // Resultado: codigo → Set de tipos de material
    const productMaterials = new Map();

    for (const { padre, tipo } of genericEntries) {
        // 1. El padre directo lleva este material
        if (!productMaterials.has(padre)) productMaterials.set(padre, new Set());
        productMaterials.get(padre).add(tipo);

        // 2. Todos los ancestros del padre también lo llevan
        const ancestors = getAncestors(padre, childToParents);
        for (const ancestor of ancestors) {
            if (!productMaterials.has(ancestor)) productMaterials.set(ancestor, new Set());
            productMaterials.get(ancestor).add(tipo);
        }
    }

    console.log(`  Productos con materiales: ${productMaterials.size.toLocaleString()}`);

    // ═══════════════════════════════════════════════════════════
    // INSERTAR EN SQLite
    // ═══════════════════════════════════════════════════════════
    console.log('\nInsertando en base de datos...');

    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    db.exec(`
        CREATE TABLE IF NOT EXISTS bom_materiales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo_producto TEXT NOT NULL,
            tipo_material TEXT NOT NULL,
            UNIQUE(codigo_producto, tipo_material)
        );
        CREATE INDEX IF NOT EXISTS idx_bom_mat_codigo ON bom_materiales(codigo_producto);
    `);

    db.prepare('DELETE FROM bom_materiales').run();

    const insert = db.prepare(
        'INSERT OR IGNORE INTO bom_materiales (codigo_producto, tipo_material) VALUES (?, ?)'
    );

    let inserted = 0;
    const batch = [];

    for (const [codigo, tipos] of productMaterials) {
        for (const tipo of tipos) {
            batch.push([codigo, tipo]);
            if (batch.length >= 5000) {
                db.transaction((rows) => {
                    for (const [c, t] of rows) {
                        if (insert.run(c, t).changes > 0) inserted++;
                    }
                })(batch.splice(0));
            }
        }
    }

    if (batch.length > 0) {
        db.transaction((rows) => {
            for (const [c, t] of rows) {
                if (insert.run(c, t).changes > 0) inserted++;
            }
        })(batch);
    }

    // Stats
    const tipoStats = db.prepare(
        'SELECT tipo_material, COUNT(DISTINCT codigo_producto) as cnt FROM bom_materiales GROUP BY tipo_material ORDER BY cnt DESC'
    ).all();

    console.log(`\n${'─'.repeat(40)}`);
    console.log(`Registros únicos insertados: ${inserted.toLocaleString()}`);
    console.log(`Productos únicos con BOM:    ${productMaterials.size.toLocaleString()}`);
    console.log(`\nDesglose por tipo de material:`);
    for (const { tipo_material, cnt } of tipoStats) {
        console.log(`  ${tipo_material.padEnd(12)} → ${cnt.toLocaleString()} productos`);
    }
    console.log(`\n✅ Tabla bom_materiales actualizada exitosamente.\n`);

    db.close();
}

run().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
