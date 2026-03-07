const { spawn } = require('child_process');
const path = require('path');

async function runCommand(cmd, args) {
    return new Promise((resolve, reject) => {
        console.log(`\n\n[▶] Ejecutando: ${cmd} ${args.join(' ')}\n`);
        const proc = spawn(cmd, args, { stdio: 'inherit' });
        proc.on('close', code => {
            if (code !== 0) reject(new Error(`Proceso terminó con código ${code}`));
            else resolve();
        });
    });
}

async function main() {
    try {
        console.log("========================================");
        console.log("🛠️ INICIANDO PROCESAMIENTO INTEGRAL BOM");
        console.log("========================================");

        // 1. Ingest BOM Materiales (Node.js)
        await runCommand('node', [path.join(__dirname, 'ingest_bom_materiales.js')]);

        // 2. Transformación Técnica (Python)
        await runCommand('python3', [path.join(__dirname, 'transformar_bom.py')]);

        console.log("\n========================================");
        console.log("✅ PROCESAMIENTO DE BOM FINALIZADO EXITOSAMENTE");
        console.log("========================================\n");
    } catch (err) {
        console.error("\n❌ ERROR EN EL PROCESAMIENTO INTEGRAL:", err.message);
        process.exit(1);
    }
}

main();
