# Guía de Migración: Node.js + SQLite → PHP + MySQL

Este documento explica paso a paso todo lo que el desarrollador PHP debe hacer
para replicar y reemplazar el backend actual.

---

## Índice

1. [Requisitos previos](#1-requisitos-previos)
2. [Crear la base de datos MySQL](#2-crear-la-base-de-datos-mysql)
3. [Migrar los datos existentes de SQLite a MySQL](#3-migrar-los-datos-existentes-de-sqlite-a-mysql)
4. [Estructura del proyecto PHP sugerida](#4-estructura-del-proyecto-php-sugerida)
5. [Conexión PHP a MySQL](#5-conexión-php-a-mysql)
6. [Autenticación JWT en PHP](#6-autenticación-jwt-en-php)
7. [Endpoints a replicar](#7-endpoints-a-replicar)
8. [Lógica de negocio importante](#8-lógica-de-negocio-importante)
9. [Conectar el frontend React al nuevo backend](#9-conectar-el-frontend-react-al-nuevo-backend)
10. [Checklist final](#10-checklist-final)

---

## 1. Requisitos previos

Tener instalado en el servidor:

- PHP >= 8.1
- MySQL >= 8.0
- Composer (gestor de dependencias PHP)
- Python 3 (solo para la migración de datos, paso 3)

---

## 2. Crear la base de datos MySQL

El archivo con el esquema completo ya está listo en:

```
backend/data/integrador_mysql.sql
```

Ejecutarlo así:

```bash
mysql -u root -p < backend/data/integrador_mysql.sql
```

O desde el cliente MySQL:

```sql
SOURCE /ruta/completa/al/archivo/integrador_mysql.sql;
```

Esto crea la base de datos `integrador` con todas las tablas, índices y
claves foráneas correctamente definidas.

---

## 3. Migrar los datos existentes de SQLite a MySQL

El archivo SQLite con todos los datos actuales está en:

```
backend/data/integrador.db
```

### Opción A — Script Python automático (recomendado)

Ya hay un script listo en el repositorio:

```
backend/scripts/exportar_sqlite_a_mysql.py
```

Installar dependencia y ejecutar:

```bash
pip install sqlite3-to-mysql

python backend/scripts/exportar_sqlite_a_mysql.py \
  --sqlite   backend/data/integrador.db \
  --host     localhost \
  --db       integrador \
  --user     root \
  --password TU_PASSWORD
```

### Opción B — Herramienta sqlite3-to-mysql directamente

```bash
pip install sqlite3-to-mysql

sqlite3mysql \
  -f backend/data/integrador.db \
  -d integrador \
  -u root \
  --mysql-password TU_PASSWORD
```

### Verificar que los datos migraron correctamente

```sql
USE integrador;
SELECT COUNT(*) FROM usuarios;
SELECT COUNT(*) FROM pedidos;
SELECT COUNT(*) FROM puesto_items;
SELECT COUNT(*) FROM catalogos;
SELECT COUNT(*) FROM articulos;
```

---

## 4. Estructura del proyecto PHP sugerida

```
php-backend/
├── index.php              ← punto de entrada, router principal
├── .env                   ← credenciales (NO subir al repositorio)
├── .env.example           ← plantilla de variables de entorno
├── composer.json
├── vendor/
└── src/
    ├── Database.php       ← conexión PDO a MySQL
    ├── Auth.php           ← middleware JWT
    ├── routes/
    │   ├── auth.php       ← /api/login, /api/me
    │   ├── usuarios.php   ← /api/usuarios
    │   ├── pedidos.php    ← /api/pedidos
    │   ├── catalogos.php  ← /api/catalogos
    │   ├── articulos.php  ← /api/articulos
    │   └── export.php     ← /api/pedidos/:id/export
    └── helpers/
        └── response.php   ← json_response(), json_error()
```

---

## 5. Conexión PHP a MySQL

Instalar dependencias:

```bash
composer require vlucas/phpdotenv firebase/php-jwt
```

Archivo `.env`:

```env
DB_HOST=localhost
DB_NAME=integrador
DB_USER=root
DB_PASS=tu_password
JWT_SECRET=integrador_super_secret_key_123
```

> **IMPORTANTE**: El `JWT_SECRET` debe ser exactamente el mismo que está
> en el `.env` del backend Node.js actual. Si cambia, todos los usuarios
> tendrán que volver a iniciar sesión.

Archivo `src/Database.php`:

```php
<?php
class Database {
    private static ?PDO $pdo = null;

    public static function get(): PDO {
        if (self::$pdo === null) {
            $dsn = sprintf(
                'mysql:host=%s;dbname=%s;charset=utf8mb4',
                $_ENV['DB_HOST'],
                $_ENV['DB_NAME']
            );
            self::$pdo = new PDO($dsn, $_ENV['DB_USER'], $_ENV['DB_PASS'], [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]);
        }
        return self::$pdo;
    }
}
```

---

## 6. Autenticación JWT en PHP

El sistema actual usa JWT con expiración de **12 horas**.
El payload del token contiene: `id`, `email`, `nombre`, `rol`.

Archivo `src/Auth.php`:

```php
<?php
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

class Auth {
    private static string $secret;

    public static function init(): void {
        self::$secret = $_ENV['JWT_SECRET'];
    }

    /** Genera un token JWT con los datos del usuario */
    public static function generateToken(array $user): string {
        $payload = [
            'id'     => $user['id'],
            'email'  => $user['email'],
            'nombre' => $user['nombre'],
            'rol'    => $user['rol'],
            'exp'    => time() + (12 * 3600), // 12 horas
        ];
        return JWT::encode($payload, self::$secret, 'HS256');
    }

    /** Valida el token del header Authorization: Bearer <token> */
    public static function requireAuth(): array {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        $token  = str_replace('Bearer ', '', $header);

        if (!$token) {
            http_response_code(401);
            echo json_encode(['error' => 'Acceso no autorizado. Se requiere token.']);
            exit;
        }

        try {
            $decoded = JWT::decode($token, new Key(self::$secret, 'HS256'));
            return (array) $decoded;
        } catch (\Exception $e) {
            http_response_code(403);
            echo json_encode(['error' => 'Token inválido o expirado.']);
            exit;
        }
    }

    /** Verifica que el usuario autenticado sea admin */
    public static function requireAdmin(array $user): void {
        if ($user['rol'] !== 'admin') {
            http_response_code(403);
            echo json_encode(['error' => 'Acceso denegado. Se requiere rol de administrador.']);
            exit;
        }
    }
}
```

---

## 7. Endpoints a replicar

Todos los endpoints esperan y responden **JSON**.
El header `Content-Type: application/json` debe estar presente en las
respuestas. Los endpoints protegidos requieren el header:

```
Authorization: Bearer <token>
```

### 7.1 Autenticación

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/login` | No | Inicia sesión, devuelve token JWT |
| GET | `/api/me` | Sí | Devuelve datos del usuario autenticado |

**POST /api/login** — body:
```json
{ "email": "admin@omega.com", "password": "admin123" }
```
Respuesta exitosa:
```json
{
  "token": "eyJ...",
  "user": { "id": 1, "email": "...", "nombre": "...", "rol": "admin" }
}
```

### 7.2 Usuarios (solo admin)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/usuarios` | Lista todos los usuarios |
| POST | `/api/usuarios` | Crea un usuario nuevo |
| PUT | `/api/usuarios/:id` | Edita un usuario |
| DELETE | `/api/usuarios/:id` | Elimina un usuario |

Campos al crear/editar: `email`, `password`, `nombre`, `rol` (`admin` o `disenador`).
Las contraseñas se guardan con **bcrypt** (cost factor 10):

```php
$hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 10]);
// Verificar:
password_verify($password, $hash); // true/false
```

### 7.3 Pedidos

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/pedidos` | Lista pedidos (admin ve todos, diseñador solo los suyos) |
| GET | `/api/pedidos/:id` | Detalle completo con puestos e items |
| POST | `/api/pedidos` | Crea un pedido con puestos e items |
| PUT | `/api/pedidos/:id` | Actualiza pedido completo |
| DELETE | `/api/pedidos/:id` | Elimina pedido (solo admin) |
| GET | `/api/pedidos/:id/export` | Descarga el pedido como archivo Excel |

**Regla de visibilidad (importante)**:
- Si `rol = 'admin'` → puede ver y editar TODOS los pedidos.
- Si `rol = 'disenador'` → solo ve y edita sus propios pedidos (`usuario_id = su id`).

**GET /api/pedidos** — respuesta:
```json
[
  {
    "id": 1,
    "usuario_id": 2,
    "numero_pedido": "PED-001",
    "fecha": "2026-01-15",
    "cliente": "Cliente ABC",
    "proyecto": "Proyecto XYZ",
    "disenador": "Juan",
    "asesor": "María",
    "created_at": "2026-01-15 10:00:00",
    "updated_at": "2026-01-15 10:00:00",
    "total_puestos": 2,
    "total_items": 8
  }
]
```

**GET /api/pedidos/:id** — respuesta con puestos e items anidados:
```json
{
  "id": 1,
  "numero_pedido": "PED-001",
  "puestos": [
    {
      "id": 10,
      "nombre": "Puesto de trabajo",
      "orden": 0,
      "items": [
        {
          "id": 100,
          "codigo": "COD-001",
          "descripcion": "Mesa",
          "cantidad_unitaria": 2,
          "cantidad_tipologia": 1,
          "cantidad_total": 2,
          "pintura": null,
          "formica": null,
          ...
        }
      ]
    }
  ]
}
```

**POST /api/pedidos** — body completo:
```json
{
  "numero_pedido": "PED-001",
  "fecha": "2026-01-15",
  "cliente": "Cliente ABC",
  "proyecto": "Proyecto XYZ",
  "disenador": "Juan",
  "asesor": "María",
  "puestos": [
    {
      "nombre": "Puesto de trabajo",
      "orden": 0,
      "items": [
        {
          "orden": 0,
          "codigo": "COD-001",
          "descripcion": "Mesa",
          "cantidad_unitaria": 2,
          "cantidad_tipologia": 1,
          "cantidad_total": 2,
          "pintura": null,
          "formica": null,
          "supercor": null,
          "canto": null,
          "madecanto": null,
          "vidrio": null,
          "tela": null,
          "render": null,
          "nota_h": null,
          "nota_l": null,
          "nota_prof": null,
          "nota_adicional": null,
          "acabados_adicional": null
        }
      ]
    }
  ]
}
```

**PUT /api/pedidos/:id** — mismo formato que POST. El backend debe:
1. Actualizar la fila en `pedidos`.
2. Eliminar todos los `puestos_trabajo` del pedido (el `ON DELETE CASCADE` borra los items automáticamente).
3. Insertar de nuevo todos los puestos e items recibidos.

### 7.4 Catálogos

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/catalogos/:tipo` | Lista valores de un tipo de catálogo |

Parámetro query opcional `?q=texto` para filtrar (máx. 25 resultados).

Tipos de catálogo existentes: `pintura`, `formica`, `supercor`, `canto`, `madecanto`, `vidrio`, `tela`, `render`, `acabados_adicional`.

### 7.5 Artículos

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/articulos/buscar?q=texto` | Busca artículos por código o descripción (mín. 3 caracteres, máx. 15 resultados) |
| GET | `/api/articulos/lookup/:codigo` | Busca un artículo exacto por código |
| GET | `/api/articulos/:codigo/materiales` | Devuelve los tipos de material BOM de un producto |

La búsqueda combina `articulos_pt` (productos terminados) y `articulos` (materias primas).

### 7.6 Export Excel

**GET /api/pedidos/:id/export**

Devuelve un archivo `.xlsx` con el pedido formateado.
Para generarlo en PHP se recomienda la librería **PhpSpreadsheet**:

```bash
composer require phpoffice/phpspreadsheet
```

El formato de columnas del Excel actual es:
`Código | Descripción | H | L | Prof | Nota adicional | Cant. Unit. | Cant. Tipología | Cant. Total | Pintura | Acabados | Fórmica | Supercor | Canto | Madecanto | Vidrio | Tela | Render`

---

## 8. Lógica de negocio importante

### Contraseñas
- Se usa **bcrypt** con cost factor 10.
- `password_hash()` y `password_verify()` de PHP son compatibles directamente con los hashes generados por `bcrypt` de Node.js. No hay que re-hashear nada.

### Roles
Solo hay dos roles: `admin` y `disenador`.
- `admin`: acceso total.
- `disenador`: solo ve y edita sus propios pedidos.

### Cantidad total
`cantidad_total = cantidad_unitaria * cantidad_tipologia`
Este cálculo lo hace el frontend, el backend solo almacena el resultado.

### Validaciones mínimas del backend
- `numero_pedido`: requerido, máx. 50 caracteres.
- `cliente`: requerido, máx. 200 caracteres.
- `email`: formato válido, único en la tabla.
- `password`: mínimo 6 caracteres.
- `rol`: solo `admin` o `disenador`.

---

## 9. Conectar el frontend React al nuevo backend

El frontend tiene la URL base del API en:

```
frontend/src/api.js
```

Buscar la constante `API_BASE` o `baseURL` y cambiarla a la URL del nuevo
servidor PHP. No es necesario modificar ningún otro archivo del frontend
siempre que los endpoints respondan con el mismo formato JSON.

---

## 10. Checklist final

Antes de dar por terminada la migración verificar:

- [ ] Base de datos MySQL creada con el script `integrador_mysql.sql`
- [ ] Datos migrados desde `integrador.db` (verificar conteos)
- [ ] `/api/login` devuelve token JWT válido
- [ ] El token funciona para obtener `/api/pedidos`
- [ ] Un usuario `disenador` solo ve sus pedidos
- [ ] Crear, editar y eliminar un pedido funciona correctamente
- [ ] La exportación Excel descarga el archivo
- [ ] El buscador de artículos (`/api/articulos/buscar?q=...`) retorna resultados
- [ ] El frontend apunta a la URL del nuevo backend PHP
- [ ] El `JWT_SECRET` es el mismo en ambos backends durante la transición
