const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

const dbPath = path.join(__dirname, 'backend', 'data', 'integrador.db');
const db = new Database(dbPath);

console.log('✨ Iniciando preparación de base de datos para PRESENTACIÓN OFICIAL...');

// 1. Revertir y Limpiar Todo el Entorno (Excepto Administradores)
db.exec(`
  DELETE FROM puesto_items;
  DELETE FROM puestos_trabajo;
  DELETE FROM pedidos;
`);
console.log('🧹 Pedidos e ítems eliminados (Entorno limpio).');

db.prepare("DELETE FROM usuarios WHERE rol = 'disenador'").run();
console.log('🧹 Diseñadores de prueba anteriores eliminados.');

// 2. Preparar el Hash de Contraseña
const hashDisenador = bcrypt.hashSync('disenador123', 10);

// 3. Obtener el Administrador real
const admin = db.prepare("SELECT id, email FROM usuarios WHERE rol = 'admin' ORDER BY id ASC LIMIT 1").get();
if (!admin) {
    console.error('❌ CRÍTICO: No se encontró el usuario administrador.');
    process.exit(1);
}

// 4. Crear Diseñadores Oficiales Carvajal / Mepal
const insertarUsuario = db.prepare("INSERT INTO usuarios (email, password, nombre, rol) VALUES (?, ?, ?, 'disenador')");

const resDisenador1 = insertarUsuario.run('andrea.valencia@mepal.com.co', hashDisenador, 'Andrea Valencia (Diseño Corporativo)');
const resDisenador2 = insertarUsuario.run('david.castano@mepal.com.co', hashDisenador, 'David Castaño (Diseño Educativo)');

const idAndrea = resDisenador1.lastInsertRowid;
const idDavid = resDisenador2.lastInsertRowid;

console.log('👥 Roles de la Presentación Configurados:');
console.log(`   👑 Administrador  : ${admin.email}`);
console.log(`   🎨 Diseñadora 1   : andrea.valencia@mepal.com.co (Contraseña: disenador123)`);
console.log(`   🎨 Diseñador 2    : david.castano@mepal.com.co (Contraseña: disenador123)`);

// 5. Crear Pedidos Profesionales para la Presentación
const insertPedido = db.prepare(`
    INSERT INTO pedidos (usuario_id, numero_pedido, fecha, cliente, proyecto, disenador, asesor) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const insertPuesto = db.prepare(`
    INSERT INTO puestos_trabajo (pedido_id, nombre, orden)
    VALUES (?, ?, ?)
`);

const insertItem = db.prepare(`
    INSERT INTO puesto_items (puesto_id, orden, codigo, descripcion, cantidad_unitaria, cantidad_tipologia, cantidad_total)
    VALUES (?, ?, ?, ?, ?, ?, ?)
`);

function crearPedidoMepal(usuario_id, num_pedido, cliente, proyecto, disenador_nombre, asesor, puestosMock) {
    const pInfo = insertPedido.run(usuario_id, num_pedido, new Date().toISOString().split('T')[0], cliente, proyecto, disenador_nombre, asesor);

    puestosMock.forEach((puesto, pIdx) => {
        const ptInfo = insertPuesto.run(pInfo.lastInsertRowid, puesto.nombre, pIdx);

        puesto.items.forEach((item, iIdx) => {
            insertItem.run(
                ptInfo.lastInsertRowid, iIdx,
                item.codigo, item.descripcion,
                item.cantU, item.cantT, item.cantU * item.cantT
            );
        });
    });
}

console.log('📦 Generando pedidos impecables para demostración...');

// Pedidos de Andrea (Enfocada en Corporativo/Bancos)
crearPedidoMepal(idAndrea, 'CE-2026-9001', 'Grupo Bancolombia', 'Central Operaciones Medellín', 'Andrea Valencia', 'Carolina Ruiz', [
    {
        nombre: 'ISLA OPERATIVA 4 PUESTOS', items: [
            { codigo: 'CE-OP-100', descripcion: 'Superficie de Trabajo Recta 120x60 Mepal', cantU: 1, cantT: 8 },
            { codigo: 'CE-SI-001', descripcion: 'Silla Ergonomica Dot', cantU: 1, cantT: 8 },
            { codigo: 'CE-AC-050', descripcion: 'Pantalla Divisoria Vidrio Templado', cantU: 2, cantT: 8 }
        ]
    },
    {
        nombre: 'OFICINA GERENTE B', items: [
            { codigo: 'CE-GE-200', descripcion: 'Escritorio Gerencial L 180x180 Supercor', cantU: 1, cantT: 2 },
            { codigo: 'CE-SI-010', descripcion: 'Silla Gerencial Cuero Natural', cantU: 1, cantT: 2 },
            { codigo: 'CE-SI-020', descripcion: 'Silla Interlocutora Visitante', cantU: 2, cantT: 2 }
        ]
    }
]);

crearPedidoMepal(idAndrea, 'CE-2026-9002', 'Nutresa S.A.', 'Acondicionamiento Oficinas Administrativas', 'Andrea Valencia', 'Juan Perez', [
    {
        nombre: 'PUESTO RECEPCIÓN', items: [
            { codigo: 'CE-RE-100', descripcion: 'Módulo Recepción Integrado 2m', cantU: 1, cantT: 1 },
            { codigo: 'CE-SI-001', descripcion: 'Silla Ergonomica Dot', cantU: 1, cantT: 1 },
            { codigo: 'CE-AL-300', descripcion: 'Archivador Metálico 2 Gavetas', cantU: 1, cantT: 1 }
        ]
    }
]);

// Pedidos de David (Enfocado en Campus/Educación)
crearPedidoMepal(idDavid, 'CE-2026-9003', 'Universidad EAFIT', 'Dotación Nuevo Edificio de Ciencias', 'David Castaño', 'Laura Jaramillo', [
    {
        nombre: 'MESA LABORATORIO TIPO 1', items: [
            { codigo: 'CE-ED-500', descripcion: 'Mesa Trabajo Pesado Resina Epóxica 150x70', cantU: 1, cantT: 15 },
            { codigo: 'CE-SI-100', descripcion: 'Butaco Neumático Poliuretano', cantU: 3, cantT: 15 }
        ]
    }
]);

crearPedidoMepal(idDavid, 'CE-2026-9004', 'Colegio Columbus School', 'Aulas de Computo Modernas', 'David Castaño', 'Laura Jaramillo', [
    {
        nombre: 'PUESTO ESTUDIANTE INDIVIDUAL', items: [
            { codigo: 'CE-ED-200', descripcion: 'Escritorio Estudiante Módular', cantU: 1, cantT: 30 },
            { codigo: 'CE-SI-030', descripcion: 'Silla Estudiante Carcasa Plástica', cantU: 1, cantT: 30 }
        ]
    }
]);

console.log('✅ Base de datos alineada. Lista para la Presentación Oficial.');
db.close();
