// Pruebas básicas para la ingesta de datos en el backend
// Ejecutar con: npx jest tests/data_ingest.test.js

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../server');

describe('Ingesta de archivos y procesos', () => {
    it('Debe subir un archivo PT.txt correctamente', async () => {
        const res = await request(app)
            .post('/api/admin/data/upload')
            .set('Authorization', 'Bearer TEST_TOKEN') // Reemplazar por un token válido
            .attach('file', path.join(__dirname, '../PT.txt'))
            .field('expectedName', 'PT.txt');
        expect(res.statusCode).toBe(200);
        expect(res.body.message).toMatch(/subido correctamente/);
        expect(fs.existsSync(path.join(__dirname, '../PT.txt'))).toBe(true);
    });

    // Puedes agregar más tests para la ejecución de scripts y validación de DB
});
