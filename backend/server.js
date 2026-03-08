require('dotenv').config();
const express = require('express');
const Database = require('better-sqlite3');
const ExcelJS = require('exceljs');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const JWT_SECRET = process.env.JWT_SECRET || 'integrador_super_secret_key_123';
if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'integrador_super_secret_key_123') {
    console.error('❌ JWT_SECRET no está definido en producción. Configura la variable de entorno JWT_SECRET.');
    process.exit(1);
}

const app = express();
const PORT = 3000;

// Middleware
app.use(helmet({
    contentSecurityPolicy: false // Disabled for simplicity with some local React builds
}));
app.use(compression()); // Gzip compression
app.use(morgan('combined')); // HTTP standard logging
app.use(cors());
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));
app.use(express.static(path.join(__dirname, '..', 'frontend', 'public')));

// ─── DATABASE SETUP ──────────────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'data', 'integrador.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER REFERENCES usuarios(id),
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

  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    nombre TEXT NOT NULL,
    rol TEXT NOT NULL DEFAULT 'disenador'
  );
`);

// Crear tabla de materiales BOM
db.exec(`
  CREATE TABLE IF NOT EXISTS bom_materiales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_producto TEXT NOT NULL,
    tipo_material TEXT NOT NULL,
    UNIQUE(codigo_producto, tipo_material)
  );
`);

// Crear índices para búsquedas rápidas
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_catalogos_tipo_desc ON catalogos(tipo, descripcion);
  CREATE INDEX IF NOT EXISTS idx_articulos_codigo ON articulos(codigo);
  CREATE INDEX IF NOT EXISTS idx_articulos_desc ON articulos(descripcion);
  CREATE INDEX IF NOT EXISTS idx_articulos_pt_codigo ON articulos_pt(codigo);
  CREATE INDEX IF NOT EXISTS idx_bom_mat_codigo ON bom_materiales(codigo_producto);
`);

// ─── SEED CATALOGUES (DINÁMICO) ────────────────────────────────────────────────
// El sistema ahora utiliza la tabla 'catalogos' persistida en DB. 
// La actualización se realiza mediante el script de ingesta (scripts/ingest_data.js)
// desde el panel de mantenimiento, eliminando la dependencia de catalogos.json.

// ─── AUTHENTICATION SETUP ───────────────────────────────────────────────────────
// Create default admin user if no users exist
const adminCount = db.prepare('SELECT COUNT(*) as c FROM usuarios').get().c;
if (adminCount === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    // use a generic email for admin
    db.prepare('INSERT INTO usuarios (email, password, nombre, rol) VALUES (?, ?, ?, ?)').run('admin@omega.com', hash, 'Administrador del Sistema', 'admin');
    console.log('✅ Default admin user created (admin@omega.com / admin123)');
}

// migrate old table if still using username column
{
    const cols = db.prepare("PRAGMA table_info(usuarios)").all().map(r => r.name);
    if (cols.includes('username') && !cols.includes('email')) {
        console.log('⚠️ migrating usuarios table: username → email');
        db.transaction(() => {
            db.exec('ALTER TABLE usuarios RENAME TO _tmp_usuarios;');
            db.exec(`
              CREATE TABLE usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                nombre TEXT NOT NULL,
                rol TEXT NOT NULL DEFAULT 'disenador'
              );
            `);
            db.exec(`INSERT INTO usuarios (id,email,password,nombre,rol)
                     SELECT id,username,password,nombre,rol FROM _tmp_usuarios;`);
            db.exec('DROP TABLE _tmp_usuarios;');
        })();
        console.log('✅ migration complete');
    }
}

// migrate pedidos table to include usuario_id
{
    const cols = db.prepare("PRAGMA table_info(pedidos)").all().map(r => r.name);
    if (!cols.includes('usuario_id')) {
        console.log('⚠️ agregando columna usuario_id a la tabla pedidos');
        try {
            db.exec('ALTER TABLE pedidos ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id);');
            // Reasignar los pedidos huérfanos al administrador principal por defecto
            const adminUser = db.prepare("SELECT id FROM usuarios WHERE rol = 'admin' ORDER BY id ASC LIMIT 1").get();
            if (adminUser) {
                db.prepare('UPDATE pedidos SET usuario_id = ? WHERE usuario_id IS NULL').run(adminUser.id);
                console.log(`✅ Pedidos antiguos reasignados al usuario admin (ID: ${adminUser.id})`);
            }
        } catch (err) {
            console.error('❌ Error agregando columna usuario_id:', err.message);
        }
    }
}

// Auth Middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Acceso no autorizado. Se requiere token.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token inválido o expirado.' });
        req.user = user;
        next();
    });
}

function requireAdmin(req, res, next) {
    if (req.user.rol !== 'admin') return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador.' });
    next();
}

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 15, // máximo 15 intentos por IP
    message: { error: 'Demasiados intentos de inicio de sesión. Espere 15 minutos.' }
});

app.post('/api/login', loginLimiter, (req, res) => {
    const { email, password } = req.body;
    try {
        const user = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
        if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });

        const validPassword = bcrypt.compareSync(password, user.password);
        if (!validPassword) return res.status(401).json({ error: 'Contraseña incorrecta' });

        const tokenPayload = { id: user.id, email: user.email, nombre: user.nombre, rol: user.rol };
        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '12h' });

        res.json({ token, user: tokenPayload });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/me', authenticateToken, (req, res) => {
    res.json(req.user);
});

// ─── USER MANAGEMENT (ADMIN ONLY) ─────────────────────────────────────────────
app.get('/api/usuarios', authenticateToken, requireAdmin, (req, res) => {
    const usuarios = db.prepare('SELECT id, email, nombre, rol FROM usuarios').all();
    res.json(usuarios);
});

app.post('/api/usuarios', authenticateToken, requireAdmin, (req, res) => {
    const { email, password, nombre, rol } = req.body;

    // Validaciones mejoradas
    const errors = [];

    if (!email || !email.trim()) {
        errors.push('El email es requerido');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        errors.push('El email no tiene un formato válido');
    } else if (email.trim().length > 255) {
        errors.push('El email no puede exceder 255 caracteres');
    }

    if (!password || password.trim().length === 0) {
        errors.push('La contraseña es requerida');
    } else if (password.length < 6) {
        errors.push('La contraseña debe tener al menos 6 caracteres');
    } else if (password.length > 100) {
        errors.push('La contraseña no puede exceder 100 caracteres');
    }

    if (!nombre || !nombre.trim()) {
        errors.push('El nombre es requerido');
    } else if (nombre.trim().length > 100) {
        errors.push('El nombre no puede exceder 100 caracteres');
    }

    if (!rol || !['admin', 'disenador'].includes(rol)) {
        errors.push('El rol debe ser admin o diseñador');
    }

    if (errors.length > 0) {
        return res.status(400).json({ error: 'Datos inválidos', details: errors });
    }

    try {
        const hash = bcrypt.hashSync(password, 10);
        const info = db.prepare('INSERT INTO usuarios (email, password, nombre, rol) VALUES (?, ?, ?, ?)').run(email.trim(), hash, nombre.trim(), rol);
        res.json({ id: info.lastInsertRowid, email: email.trim(), nombre: nombre.trim(), rol });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: 'El correo ya existe' });
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/usuarios/:id', authenticateToken, requireAdmin, (req, res) => {
    const { id } = req.params;
    try {
        db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── DATA MAINTENANCE / ADMIN SCRIPTS ─────────────────────────────────────────
const multer = require('multer');
const { spawn } = require('child_process');

// Configure multer to write to a temporary uploads folder first.
// This prevents truncation of source files if the user uploads from the same project folder.
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOADS_DIR);
    },
    filename: function (req, file, cb) {
        const expected = req.body.expectedName;
        cb(null, (expected || file.originalname) + '.tmp_' + Date.now());
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit max
});

// load script metadata from the same file the React app imports so
// frontend and backend remain in sync.  the config file also includes
// Frontend and backend config keep in sync. Command configs included too.
// Trigger nodemon restart buffer
const DATA_MAINT_SCRIPTS = require(path.join(__dirname, '..', 'frontend', 'src', 'config', 'dataMaintenance.json'));

// build a quick-access map for file existence checks
const FILES_REQUIRED = {};
DATA_MAINT_SCRIPTS.forEach(s => {
    FILES_REQUIRED[s.id] = s.files;
});

// Status endpoint returns an object listing whether each input file is present
app.get('/api/admin/data/status', authenticateToken, requireAdmin, (req, res) => {
    const files = {};
    const allFiles = new Set(Object.values(FILES_REQUIRED).flat());

    // Also include potential output files from scripts config
    DATA_MAINT_SCRIPTS.forEach(s => {
        if (s.outputFile) allFiles.add(s.outputFile);
    });

    allFiles.forEach(f => {
        files[f] = fs.existsSync(path.join(__dirname, 'data', f));
    });
    res.json({ files });
});

// Download endpoint for script results
app.get('/api/admin/data/download/:filename', authenticateToken, requireAdmin, (req, res) => {
    const { filename } = req.params;
    // Basic security: only allow specific results
    const allowed = ['BOMS_indentados.csv', 'BOMS_indentados.txt'];
    if (!allowed.includes(filename)) {
        return res.status(403).json({ error: 'Archivo no permitido' });
    }

    const filePath = path.join(__dirname, 'data', filename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Archivo no encontrado' });
    }

    res.download(filePath, filename);
});

// upload handler saves uploaded file to a temporary location and then moves it to root
app.post('/api/admin/data/upload', authenticateToken, requireAdmin, (req, res) => {
    upload.single('file')(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            console.error('Multer error:', err);
            return res.status(400).json({ error: `Error subiendo archivo (Límite 500MB): ${err.message}` });
        } else if (err) {
            console.error('Unknown upload error:', err);
            return res.status(500).json({ error: `Error del servidor durante la carga: ${err.message}` });
        }

        if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });

        try {
            // Move file from uploads/ to root with target name
            const sourcePath = req.file.path;
            const expectedName = req.body.expectedName || req.file.originalname;
            const targetPath = path.join(__dirname, 'data', expectedName);

            // Using copy + unlink instead of rename to handle potential cross-device issues
            fs.copyFileSync(sourcePath, targetPath);
            fs.unlinkSync(sourcePath);

            console.log(`✅ Archivo ${expectedName} actualizado exitosamente desde subida temporal.`);
            res.json({ message: `Archivo ${expectedName} subido correctamente` });
        } catch (moveErr) {
            console.error('Error moving uploaded file:', moveErr);
            res.status(500).json({ error: `Error procesando el archivo subido: ${moveErr.message}` });
        }
    });
});

// execute one of the defined scripts, streaming its stdout/stderr back to the client
app.post('/api/admin/data/execute/:scriptId', authenticateToken, requireAdmin, (req, res) => {
    const { scriptId } = req.params;
    const script = DATA_MAINT_SCRIPTS.find(s => s.id === scriptId);
    if (!script) return res.status(404).json({ error: 'Proceso desconocido' });

    if (app.locals.runningScript) {
        return res.status(409).json({ error: 'Otro proceso ya se está ejecutando' });
    }
    app.locals.runningScript = scriptId;

    const proc = spawn(script.command, script.args, { cwd: path.join(__dirname, '..'), env: process.env });
    let output = '';

    proc.stdout.on('data', d => { output += d.toString(); });
    proc.stderr.on('data', d => { output += d.toString(); });

    proc.on('close', code => {
        app.locals.runningScript = null;
        if (code === 0) {
            res.json({ message: 'Proceso completado con éxito', output });
        } else {
            res.status(500).json({ error: `El proceso terminó con código ${code}`, output });
        }
    });
});

app.put('/api/usuarios/:id', authenticateToken, requireAdmin, (req, res) => {
    const { id } = req.params;
    const { email, password, nombre, rol } = req.body;

    // Validaciones mejoradas
    const errors = [];

    if (!email || !email.trim()) {
        errors.push('El email es requerido');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        errors.push('El email no tiene un formato válido');
    } else if (email.trim().length > 255) {
        errors.push('El email no puede exceder 255 caracteres');
    }

    if (password && password.length > 0) {
        if (password.length < 6) {
            errors.push('La contraseña debe tener al menos 6 caracteres');
        } else if (password.length > 100) {
            errors.push('La contraseña no puede exceder 100 caracteres');
        }
    }

    if (!nombre || !nombre.trim()) {
        errors.push('El nombre es requerido');
    } else if (nombre.trim().length > 100) {
        errors.push('El nombre no puede exceder 100 caracteres');
    }

    if (!rol || !['admin', 'disenador'].includes(rol)) {
        errors.push('El rol debe ser admin o diseñador');
    }

    if (errors.length > 0) {
        return res.status(400).json({ error: 'Datos inválidos', details: errors });
    }

    try {
        if (password && password.length > 0) {
            const hash = bcrypt.hashSync(password, 10);
            db.prepare('UPDATE usuarios SET email=?, password=?, nombre=?, rol=? WHERE id=?').run(email.trim(), hash, nombre.trim(), rol, id);
        } else {
            db.prepare('UPDATE usuarios SET email=?, nombre=?, rol=? WHERE id=?').run(email.trim(), nombre.trim(), rol, id);
        }
        res.json({ success: true });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: 'El correo ya existe' });
        res.status(500).json({ error: err.message });
    }
});

// ─── API: CATÁLOGOS ───────────────────────────────────────────────────────────
app.get('/api/catalogos/:tipo', authenticateToken, (req, res) => {
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
app.get('/api/articulos/buscar', authenticateToken, (req, res) => {
    const { q } = req.query;
    if (!q || q.length < 3) return res.json([]);
    try {
        const results = db.prepare(`
            SELECT codigo, descripcion FROM articulos_pt 
            WHERE codigo LIKE ? OR descripcion LIKE ?
            UNION ALL
            SELECT codigo, descripcion FROM articulos 
            WHERE codigo LIKE ? OR descripcion LIKE ?
            ORDER BY codigo
            LIMIT 15
        `).all(`${q}%`, `%${q}%`, `${q}%`, `%${q}%`);
        res.json(results);
    } catch (err) {
        console.error('Search error:', err);
        res.json([]);
    }
});

app.get('/api/articulos/lookup/:codigo', authenticateToken, (req, res) => {
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

// ─── API: MATERIALES BOM ──────────────────────────────────────────────────────
app.get('/api/articulos/:codigo/materiales', (req, res) => {
    const { codigo } = req.params;
    try {
        const rows = db.prepare(
            'SELECT tipo_material FROM bom_materiales WHERE codigo_producto = ?'
        ).all(codigo);
        res.json(rows.map(r => r.tipo_material));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── API: PEDIDOS ─────────────────────────────────────────────────────────────

// List all pedidos
app.get('/api/pedidos', authenticateToken, (req, res) => {
    let query = `
        SELECT p.*,
               (SELECT COUNT(*) FROM puestos_trabajo WHERE pedido_id = p.id) as total_puestos,
               (SELECT COUNT(*) FROM puesto_items pi JOIN puestos_trabajo pt ON pi.puesto_id = pt.id WHERE pt.pedido_id = p.id) as total_items
        FROM pedidos p
    `;
    const params = [];

    // Data Segregation: Si es diseñador, solo ve sus pedidos
    if (req.user.rol !== 'admin') {
        query += ` WHERE p.usuario_id = ?`;
        params.push(req.user.id);
    }

    query += ` ORDER BY p.updated_at DESC`;

    const pedidos = db.prepare(query).all(...params);
    res.json(pedidos);
});

// Get one pedido with puestos and items
app.get('/api/pedidos/:id', authenticateToken, (req, res) => {
    let pedido;
    if (req.user.rol === 'admin') {
        pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
    } else {
        pedido = db.prepare('SELECT * FROM pedidos WHERE id = ? AND usuario_id = ?').get(req.params.id, req.user.id);
    }

    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado o no tienes permiso para verlo' });

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
app.post('/api/pedidos', authenticateToken, (req, res) => {
    const { numero_pedido, fecha, cliente, proyecto, disenador, asesor, puestos = [] } = req.body;

    // Validaciones básicas
    const errors = [];

    if (!numero_pedido || !numero_pedido.trim()) {
        errors.push('El número de pedido es requerido');
    } else if (numero_pedido.trim().length > 50) {
        errors.push('El número de pedido no puede exceder 50 caracteres');
    }

    if (!cliente || !cliente.trim()) {
        errors.push('El cliente es requerido');
    } else if (cliente.trim().length > 200) {
        errors.push('El cliente no puede exceder 200 caracteres');
    }

    if (proyecto && proyecto.trim().length > 200) {
        errors.push('El proyecto no puede exceder 200 caracteres');
    }

    if (disenador && disenador.trim().length > 100) {
        errors.push('El diseñador no puede exceder 100 caracteres');
    }

    if (asesor && asesor.trim().length > 100) {
        errors.push('El asesor no puede exceder 100 caracteres');
    }

    // Validar formato de fecha (YYYY-MM-DD)
    if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        errors.push('La fecha debe tener el formato YYYY-MM-DD');
    }

    // Validar estructura de puestos
    if (!Array.isArray(puestos)) {
        errors.push('Los puestos deben ser un arreglo');
    } else if (puestos.length === 0) {
        errors.push('Debe haber al menos un puesto de trabajo');
    } else {
        puestos.forEach((puesto, idx) => {
            if (!puesto.nombre || !puesto.nombre.trim()) {
                errors.push(`El puesto ${idx + 1} debe tener un nombre`);
            }
            if (!Array.isArray(puesto.items)) {
                errors.push(`Los items del puesto ${idx + 1} deben ser un arreglo`);
            }
        });
    }

    if (errors.length > 0) {
        return res.status(400).json({ error: 'Datos inválidos', details: errors });
    }

    // Check for duplicate numero_pedido
    if (numero_pedido && numero_pedido.trim()) {
        const existing = db.prepare('SELECT id FROM pedidos WHERE numero_pedido = ?').get(numero_pedido.trim());
        if (existing) {
            return res.status(409).json({ error: `Ya existe un pedido con el número ${numero_pedido}` });
        }
    }

    const createPedido = db.transaction(() => {
        const result = db.prepare(
            `INSERT INTO pedidos (usuario_id, numero_pedido, fecha, cliente, proyecto, disenador, asesor) VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(req.user.id, numero_pedido, fecha, cliente, proyecto, disenador, asesor);
        const pedidoId = result.lastInsertRowid;

        savePuestos(pedidoId, puestos);
        return pedidoId;
    });

    const pedidoId = createPedido();
    res.status(201).json({ id: pedidoId, message: 'Pedido creado' });
});

// Update pedido
app.put('/api/pedidos/:id', authenticateToken, (req, res) => {
    const { numero_pedido, fecha, cliente, proyecto, disenador, asesor, puestos = [] } = req.body;

    let pedido;
    if (req.user.rol === 'admin') {
        pedido = db.prepare('SELECT id FROM pedidos WHERE id = ?').get(req.params.id);
    } else {
        pedido = db.prepare('SELECT id FROM pedidos WHERE id = ? AND usuario_id = ?').get(req.params.id, req.user.id);
    }

    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado o no tienes permisos para editarlo' });

    // Validaciones básicas
    const errors = [];

    if (!numero_pedido || !numero_pedido.trim()) {
        errors.push('El número de pedido es requerido');
    } else if (numero_pedido.trim().length > 50) {
        errors.push('El número de pedido no puede exceder 50 caracteres');
    }

    if (!cliente || !cliente.trim()) {
        errors.push('El cliente es requerido');
    } else if (cliente.trim().length > 200) {
        errors.push('El cliente no puede exceder 200 caracteres');
    }

    if (proyecto && proyecto.trim().length > 200) {
        errors.push('El proyecto no puede exceder 200 caracteres');
    }

    if (disenador && disenador.trim().length > 100) {
        errors.push('El diseñador no puede exceder 100 caracteres');
    }

    if (asesor && asesor.trim().length > 100) {
        errors.push('El asesor no puede exceder 100 caracteres');
    }

    // Validar formato de fecha (YYYY-MM-DD)
    if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        errors.push('La fecha debe tener el formato YYYY-MM-DD');
    }

    // Validar estructura de puestos
    if (!Array.isArray(puestos)) {
        errors.push('Los puestos deben ser un arreglo');
    } else if (puestos.length === 0) {
        errors.push('Debe haber al menos un puesto de trabajo');
    } else {
        puestos.forEach((puesto, idx) => {
            if (!puesto.nombre || !puesto.nombre.trim()) {
                errors.push(`El puesto ${idx + 1} debe tener un nombre`);
            }
            if (!Array.isArray(puesto.items)) {
                errors.push(`Los items del puesto ${idx + 1} deben ser un arreglo`);
            }
        });
    }

    if (errors.length > 0) {
        return res.status(400).json({ error: 'Datos inválidos', details: errors });
    }

    // Check for duplicate numero_pedido (excluding current)
    if (numero_pedido && numero_pedido.trim()) {
        const existing = db.prepare('SELECT id FROM pedidos WHERE numero_pedido = ? AND id != ?').get(numero_pedido.trim(), req.params.id);
        if (existing) {
            return res.status(409).json({ error: `Ya existe otro pedido con el número ${numero_pedido}` });
        }
    }

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
app.delete('/api/pedidos/:id', authenticateToken, (req, res) => {
    const id = req.params.id;
    let info;
    if (req.user.rol === 'admin') {
        info = db.prepare('DELETE FROM pedidos WHERE id = ?').run(id);
    } else {
        info = db.prepare('DELETE FROM pedidos WHERE id = ? AND usuario_id = ?').run(id, req.user.id);
    }

    if (info.changes === 0) {
        return res.status(404).json({ error: 'Pedido no encontrado o no autorizado para eliminarlo' });
    }

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
app.get('/api/pedidos/:id/export', authenticateToken, async (req, res) => {
    const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

    const puestos = db.prepare('SELECT * FROM puestos_trabajo WHERE pedido_id = ? ORDER BY orden ASC').all(req.params.id);
    const getItems = db.prepare('SELECT * FROM puesto_items WHERE puesto_id = ? ORDER BY orden ASC');

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Integrador App';
    workbook.created = new Date();
    const ws = workbook.addWorksheet('INTEGRADOR');
    ws.views = [{ showGridLines: false }];
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.5, header: 0.2, footer: 0.2 } };
    ws.headerFooter = { oddFooter: '&L&8&K777777Generado: &D &T&R&8&K777777Página &P de &N' };

    const logoCandidates = [
        path.join(__dirname, '..', 'frontend', 'public', 'logo-carvajal.png'),
        path.join(__dirname, '..', 'frontend', 'public', 'logo.png'),
        path.join(__dirname, '..', 'frontend', 'public', 'logo.jpg'),
        path.join(__dirname, '..', 'frontend', 'public', 'logo.jpeg'),
        path.join(__dirname, 'public', 'logo.jpeg'),
        path.join(__dirname, 'logo.png'),
        path.join(__dirname, 'logo.jpg'),
        path.join(__dirname, 'logo.jpeg'),
    ];
    const logoPath = logoCandidates.find(p => fs.existsSync(p));

    // ── Color Palette (aligned with site CSS) ──
    const NAVY = 'FF3A5A8A';  // table headers, puesto banners
    const DARK_NAVY = 'FF1A3A5C';  // header band (matches .ebs-header)
    const ACCENT = 'FF4A7CC9';  // buttons, focus indicator
    const ACCENT_LT = 'FF7A9CC6';  // scrollbar, lighter accent
    const ACCENT_BG = 'FFE8EEF4';  // light blue bg (scrollbar track)
    const GOLD = 'FFC9930A';  // header gold border
    const SLATE_700 = 'FF334155';
    const SLATE_500 = 'FF64748B';
    const SLATE_200 = 'FFE2E8F0';
    const SLATE_100 = 'FFF1F5F9';
    const SLATE_50 = 'FFF8FAFC';
    const WHITE = 'FFFFFFFF';
    const GREEN_700 = 'FF15803D';
    const GREEN_50 = 'FFF0FDF4';
    const AMBER_700 = 'FFB45309';
    const AMBER_50 = 'FFFFFBEB';

    // ── Reusable Fills ──
    const navyFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    const dkNavyFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK_NAVY } };
    const accentFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT } };
    const accentBgFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT_BG } };
    const slateFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_100 } };
    const slate50Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_50 } };
    const whiteFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };
    const greenFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_50 } };
    const amberFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMBER_50 } };

    // ── Borders ──
    const softBorder = {
        top: { style: 'thin', color: { argb: SLATE_200 } },
        left: { style: 'thin', color: { argb: SLATE_200 } },
        bottom: { style: 'thin', color: { argb: SLATE_200 } },
        right: { style: 'thin', color: { argb: SLATE_200 } },
    };
    const accentBottom = {
        bottom: { style: 'medium', color: { argb: ACCENT } },
    };
    const headerBorder = {
        top: { style: 'thin', color: { argb: ACCENT_LT } },
        left: { style: 'hair', color: { argb: ACCENT_LT } },
        bottom: { style: 'thin', color: { argb: ACCENT_LT } },
        right: { style: 'hair', color: { argb: ACCENT_LT } },
    };
    const totalsBorder = {
        top: { style: 'medium', color: { argb: SLATE_700 } },
        bottom: { style: 'double', color: { argb: SLATE_700 } },
    };

    // ── Fonts ──
    const F = (overrides) => ({ name: 'Calibri', size: 10, color: { argb: SLATE_700 }, ...overrides });
    const titleFont = F({ bold: true, color: { argb: WHITE }, size: 18 });
    const subtitleFont = F({ color: { argb: SLATE_200 }, size: 11 });
    const metaLabel = F({ bold: true, color: { argb: SLATE_500 }, size: 9 });
    const metaValue = F({ bold: false, color: { argb: NAVY }, size: 10 });
    const colHeaderFont = F({ bold: true, color: { argb: WHITE }, size: 9 });
    const puestoFont = F({ bold: true, color: { argb: WHITE }, size: 11 });
    const puestoNumFont = F({ bold: false, color: { argb: SLATE_200 }, size: 9 });
    const codeFont = F({ bold: true, color: { argb: NAVY } });
    const descFont = F({ color: { argb: SLATE_700 } });
    const qtyFont = F({ bold: true, color: { argb: ACCENT } });
    const normalFont = F({});
    const totalLblFont = F({ bold: true, color: { argb: SLATE_700 }, size: 10 });
    const totalValFont = F({ bold: true, color: { argb: ACCENT }, size: 10 });
    const materialFont = F({ color: { argb: SLATE_500 }, size: 9 });

    // ── Table Layout ──
    const HEADERS = [
        'CÓD.', 'DESCRIPCIÓN',
        'H', 'L', 'PROF', 'NOTAS',
        'UNI.', 'TIP.', 'TOTAL',
        'ACAB. ADIC.', 'PINTURA', 'FÓRMICA',
        'SUPERCOR', 'CANTO', 'MADECANTO',
        'VIDRIO', 'TELA / FIBER'
    ];
    const colWidths = [14, 42, 8, 8, 8, 16, 8, 8, 9, 20, 36, 28, 24, 28, 24, 18, 34];
    colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    // ═══════════════════════════════════════════════════════════════════
    // ██  HEADER BAND  (rows 1-4)
    // ═══════════════════════════════════════════════════════════════════
    const goldFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } };

    // Row 1: Gold accent line
    for (let c = 1; c <= 17; c++) {
        ws.getCell(1, c).fill = goldFill;
    }
    ws.getRow(1).height = 5;

    // Rows 2-4: Dark header band
    for (let r = 2; r <= 4; r++) {
        for (let c = 1; c <= 17; c++) {
            ws.getCell(r, c).fill = dkNavyFill;
        }
    }

    // Title (A2:Q3)
    ws.mergeCells('A2:Q3');
    const titleCell = ws.getCell('A2');
    titleCell.value = {
        richText: [
            { text: '  INTEGRADOR DE PEDIDOS', font: { name: 'Calibri', bold: true, color: { argb: WHITE }, size: 20 } },
            { text: '   |   ', font: { name: 'Calibri', color: { argb: ACCENT_LT }, size: 12 } },
            { text: `${pedido.proyecto || pedido.cliente || '-'}`, font: { name: 'Calibri', color: { argb: 'FFFFD700' }, size: 14, bold: true } },
        ]
    };
    titleCell.fill = dkNavyFill;
    titleCell.alignment = { horizontal: 'left', vertical: 'middle' };

    // Subtitle (A4:Q4)
    ws.mergeCells('A4:Q4');
    const subtitleCell = ws.getCell('A4');
    const numLabel = pedido.numero_pedido || pedido.id;
    subtitleCell.value = {
        richText: [
            { text: '  PEDIDO #', font: { name: 'Calibri', bold: true, color: { argb: ACCENT_LT }, size: 10 } },
            { text: `${numLabel}`, font: { name: 'Calibri', bold: true, color: { argb: WHITE }, size: 10 } },
            { text: '    ·    ', font: { name: 'Calibri', color: { argb: SLATE_500 }, size: 10 } },
            { text: 'FECHA: ', font: { name: 'Calibri', bold: true, color: { argb: ACCENT_LT }, size: 10 } },
            { text: `${pedido.fecha || '—'}`, font: { name: 'Calibri', color: { argb: WHITE }, size: 10 } },
        ]
    };
    subtitleCell.fill = dkNavyFill;
    subtitleCell.alignment = { horizontal: 'left', vertical: 'middle' };

    // Row 5: Gold accent line bottom
    for (let c = 1; c <= 17; c++) {
        ws.getCell(5, c).fill = goldFill;
    }
    ws.getRow(5).height = 3;

    ws.getRow(2).height = 32;
    ws.getRow(3).height = 32;
    ws.getRow(4).height = 22;
    ws.getRow(5).height = 4;

    // ═══════════════════════════════════════════════════════════════════
    // ██  META CARDS  (rows 6-7)
    // ═══════════════════════════════════════════════════════════════════
    const metaCard = (cell, label, value, icon) => {
        cell.value = {
            richText: [
                { text: `${icon || ''}${label}\n`, font: metaLabel },
                { text: `${value || '—'}`, font: metaValue }
            ]
        };
        cell.fill = slate50Fill;
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        cell.border = softBorder;
    };

    ws.mergeCells('A6:D7'); metaCard(ws.getCell('A6'), 'N° PEDIDO', pedido.numero_pedido, '# ');
    ws.mergeCells('E6:H7'); metaCard(ws.getCell('E6'), 'FECHA', pedido.fecha, '');
    ws.mergeCells('I6:N7'); metaCard(ws.getCell('I6'), 'CLIENTE', pedido.cliente, '');
    ws.mergeCells('O6:Q7'); metaCard(ws.getCell('O6'), 'ASESOR', pedido.asesor, '');
    ws.mergeCells('A8:I9'); metaCard(ws.getCell('A8'), 'PROYECTO', pedido.proyecto || pedido.cliente || '-', '');
    ws.mergeCells('J8:Q9'); metaCard(ws.getCell('J8'), 'DISEÑADOR', pedido.disenador, '');

    ws.getRow(6).height = 18;
    ws.getRow(7).height = 24;
    ws.getRow(8).height = 18;
    ws.getRow(9).height = 24;

    // ── Row grouping: rows 1-9 collapsible ──
    for (let r = 1; r <= 9; r++) {
        ws.getRow(r).outlineLevel = 1;
    }

    let currentRow = 10;
    let firstHeaderRow = null;

    // ═══════════════════════════════════════════════════════════════════
    // ██  PER PUESTO DE TRABAJO
    // ═══════════════════════════════════════════════════════════════════
    puestos.forEach((puesto, pIdx) => {
        const items = getItems.all(puesto.id);

        // ── Puesto banner ──
        ws.mergeCells(`A${currentRow}:Q${currentRow}`);
        const pCell = ws.getCell(`A${currentRow}`);
        pCell.value = {
            richText: [
                { text: `  ${puesto.nombre}`, font: puestoFont },
                { text: `     ${items.length} artículo${items.length !== 1 ? 's' : ''}`, font: puestoNumFont },
            ]
        };
        pCell.fill = navyFill;
        pCell.alignment = { vertical: 'middle' };
        // Make puesto banner more prominent to match UI spacing
        ws.getRow(currentRow).height = 45;
        const puestoStartRow = currentRow;
        currentRow++;

        // ── Column headers ──
        // Ensure header row is tall enough for readability and wrapped labels
        ws.getRow(currentRow).height = 45;
        HEADERS.forEach((h, i) => {
            const cell = ws.getCell(currentRow, i + 1);
            cell.value = h;
            cell.fill = accentFill;
            cell.font = colHeaderFont;
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = headerBorder;
        });
        const headerRow = currentRow;
        if (!firstHeaderRow) firstHeaderRow = headerRow;
        currentRow++;

        // ── Data rows ──
        let totalUnits = 0, totalTip = 0, totalTotal = 0;
        items.forEach((item, idx) => {
            const row = ws.getRow(currentRow);
            // Data rows: at least 45px height for visual parity with app
            row.height = Math.max(45, row.height || 45);
            const isEven = idx % 2 === 0;
            const baseFill = isEven ? whiteFill : slate50Fill;

            const values = [
                item.codigo, item.descripcion,
                item.nota_h, item.nota_l, item.nota_prof, item.nota_adicional,
                item.cantidad_unitaria, item.cantidad_tipologia, item.cantidad_total,
                item.acabados_adicional, item.pintura, item.formica,
                item.supercor, item.canto, item.madecanto,
                item.vidrio, item.tela
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
            });
            currentRow++;
        });

        // Group rows under this puesto (header + data) for collapsing
        for (let r = puestoStartRow + 1; r < currentRow; r++) {
            ws.getRow(r).outlineLevel = 2;
        }
    });

    // Auto-filter across ALL data (from first header row to last data row)
    if (firstHeaderRow) {
        ws.autoFilter = {
            from: { row: firstHeaderRow, column: 1 },
            to: { row: currentRow - 1, column: 17 }
        };
    }

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
app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist')));
app.use((req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
});

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Integrador App corriendo en http://localhost:${PORT}\n`);
});

// Aumentar timeouts (10 minutos) para subidas masivas y procesamiento pesado de BD/scripts
server.keepAliveTimeout = 600000;
server.headersTimeout = 601000;
server.timeout = 600000;
