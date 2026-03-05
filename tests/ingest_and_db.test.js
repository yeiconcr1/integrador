// Test de integración: ingesta de archivo y verificación en la base de datos
// Ejecutar con: npx jest tests/ingest_and_db.test.js

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const Database = require('better-sqlite3');
const app = require('../server');

const TEST_TOKEN = 'REEMPLAZAR_POR_TOKEN_VALIDO'; // Debe ser un JWT admin válido
const PT_PATH = path.join(__dirname, '../PT.txt');
const DB_PATH = path.join(__dirname, '../integrador.db');

describe('Ingesta y verificación en DB', () => {
    it('Sube PT.txt y ejecuta ingesta, luego verifica en la DB', async () => {
        // 1. Subir archivo
        const uploadRes = await request(app)
            .post('/api/admin/data/upload')
            .set('Authorization', `Bearer ${TEST_TOKEN}`)
            .attach('file', PT_PATH)
            .field('expectedName', 'PT.txt');
        expect(uploadRes.statusCode).toBe(200);
        expect(uploadRes.body.message).toMatch(/subido correctamente/);

        // 2. Ejecutar proceso de ingesta (ajusta el ID según tu config)
        const execRes = await request(app)
            .post('/api/admin/data/execute/pt')
            .set('Authorization', `Bearer ${TEST_TOKEN}`);
        expect(execRes.statusCode).toBe(200);
        expect(execRes.body.message).toMatch(/completado|éxito|ok/i);

        // 3. Verificar que la tabla relevante tenga datos (ajusta tabla/campo)
        const db = new Database(DB_PATH);
        const row = db.prepare('SELECT COUNT(*) as total FROM puestos_trabajo').get();
        expect(row.total).toBeGreaterThan(0);
        db.close();
    });
});
