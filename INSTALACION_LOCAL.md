# Instalación y despliegue local — Integrador

Guía para levantar el proyecto por primera vez en una máquina local.

---

## Requisitos previos

Instalar lo siguiente antes de comenzar:

| Herramienta | Versión mínima | Descarga |
|-------------|---------------|----------|
| Node.js     | 18 o superior | https://nodejs.org |
| Git         | cualquiera    | https://git-scm.com |

Para verificar que ya están instalados:

```bash
node --version   # debe mostrar v18.x.x o superior
npm --version    # viene incluido con Node.js
git --version
```

---

## Paso 1 — Clonar el repositorio

```bash
git clone https://github.com/yeiconcr1/integrador.git
cd integrador
```

---

## Paso 2 — Instalar dependencias

El proyecto tiene dos conjuntos de dependencias: las del backend (raíz) y
las del frontend. Hay que instalar ambas.

```bash
# Desde la raíz del proyecto
npm install

# Dependencias del frontend
cd frontend
npm install
cd ..
```

---

## Paso 3 — Configurar variables de entorno

El archivo `.env` NO está en el repositorio por seguridad. Hay que crearlo
manualmente en la raíz del proyecto (donde está el `package.json`):

**Mac / Linux:**
```bash
echo "JWT_SECRET=integrador_super_secret_key_123" > .env
```

**Windows (CMD):**
```cmd
echo JWT_SECRET=integrador_super_secret_key_123 > .env
```

O crearlo manualmente con cualquier editor de texto con este contenido:

```env
JWT_SECRET=integrador_super_secret_key_123
```

> En producción este valor debe cambiarse por una cadena larga y aleatoria.
> Para uso local el valor por defecto funciona sin problemas.

---

## Paso 4 — Levantar el proyecto en modo desarrollo

Desde la raíz del proyecto ejecutar:

```bash
npm run dev
```

Este comando levanta simultáneamente:

- **Backend** (API): `http://localhost:3000`
- **Frontend** (React/Vite): `http://localhost:5173`

El frontend redirige automáticamente las llamadas `/api` al backend,
por lo que no es necesario hacer ninguna otra configuración.

> **Nota sobre la base de datos**: NO es necesario crear ni configurar
> ninguna base de datos manualmente. Al iniciar el servidor por primera
> vez se crea automáticamente el archivo `backend/data/integrador.db`
> con todas las tablas listas.

---

## Paso 5 — Abrir la aplicación

Abrir el navegador en:

```
http://localhost:5173
```

### Credenciales por defecto

| Campo | Valor |
|-------|-------|
| Email | `admin@mepal.com.co` |
| Contraseña | `admin123` |

> Estas credenciales se crean automáticamente la primera vez que arranca
> el servidor si no existe ningún usuario en la base de datos.
> No es necesario crearlas manualmente ni tocar la base de datos.

### Crear usuarios adicionales

El usuario `admin` es el único que se crea automáticamente. Para agregar
más usuarios (diseñadores u otros administradores):

1. Iniciar sesión con `admin@mepal.com.co` / `admin123`
2. Ir al menú **Administración de usuarios** en la interfaz web
3. Crear los usuarios con su email, contraseña y rol (`admin` o `disenador`)

Los roles tienen el siguiente acceso:

| Rol | Acceso |
|-----|--------|
| `admin` | Ve y edita todos los pedidos, gestiona usuarios, accede al panel de mantenimiento de datos |
| `disenador` | Solo ve y edita sus propios pedidos |

---

## Paso 6 — Cargar los datos iniciales

La aplicación funciona desde el inicio (login, crear pedidos, etc.), pero
los campos de autocompletado estarán vacíos hasta cargar los datos.

Hay dos tipos de datos con situaciones distintas:

### Datos incluidos en el repositorio (listos para cargar)

Los archivos `MP.txt` (materias primas) y `PT.txt` (productos terminados)
ya están en el repositorio dentro de `backend/data/`. Para cargarlos:

```bash
npm run ingest
```

Esto llena las tablas de artículos y catálogos (pintura, fórmica, tela,
canto, vidrio, etc.) y los autocompletados del formulario quedarán funcionales.

### Datos que deben solicitarse al equipo

El archivo `LISTAS_TOT.csv` pesa más de 100MB y no puede incluirse en el
repositorio por limitaciones de GitHub. Este archivo es necesario para
cargar los materiales BOM (qué materiales lleva cada producto).

**Pasos:**
1. Solicitar el archivo `LISTAS_TOT.csv` al equipo y copiarlo en `backend/data/`
2. Ejecutar:

```bash
npm run ingest:bom
```

> Sin este archivo la aplicación funciona completamente. Solo la función
> que muestra automáticamente los materiales de un producto al escribir
> su código quedará sin datos.

---

## Estructura del proyecto

```
integrador/
├── backend/
│   ├── server.js              ← API REST (Node.js + Express)
│   ├── data/
│   │   ├── integrador.db      ← Base de datos SQLite (se crea sola al iniciar)
│   │   ├── MP.txt             ← Materias primas (incluido en el repo)
│   │   ├── PT.txt             ← Productos terminados (incluido en el repo)
│   │   └── LISTAS_TOT.csv     ← BOM materiales (solicitar al equipo, no está en el repo)
│   └── scripts/               ← Scripts de carga y mantenimiento de datos
├── frontend/
│   ├── src/                   ← Código React
│   └── public/                ← Archivos estáticos
├── package.json               ← Scripts principales y dependencias del backend
├── .env                       ← Variables de entorno (crear manualmente, ver Paso 3)
└── INSTALACION_LOCAL.md       ← Este archivo
```

---

## Scripts disponibles

Ejecutar todos desde la **raíz** del proyecto:

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Levanta backend y frontend juntos (modo desarrollo) |
| `npm start` | Levanta solo el backend (modo producción) |
| `npm run build` | Genera el build del frontend para producción |
| `npm run ingest` | Carga artículos y catálogos desde `MP.txt` y `PT.txt` |
| `npm run ingest:bom` | Carga materiales BOM desde `LISTAS_TOT.csv` (solicitar al equipo) |
| `npm run data:all` | Ejecuta `ingest` e `ingest:bom` en secuencia |

---

## Resumen del orden de pasos

```
1. git clone ...
2. npm install
3. cd frontend && npm install && cd ..
4. Crear el archivo .env con JWT_SECRET
5. npm run dev
6. Abrir http://localhost:5173  →  login: admin@mepal.com.co / admin123
7. npm run ingest               →  carga artículos y catálogos (listo sin archivos extra)
8. Copiar LISTAS_TOT.csv a backend/data/ y ejecutar npm run ingest:bom  (opcional)
```

---

## Solución de problemas comunes

**El puerto 3000 ya está en uso**

```bash
# Mac / Linux
lsof -i :3000
kill -9 <PID>
```

```powershell
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

**El puerto 5173 ya está en uso** — igual que arriba con el puerto 5173.

---

**Error: `better-sqlite3` no compila**

Este error ocurre cuando faltan las herramientas de compilación de C++
que necesita la librería de base de datos.

```bash
# Mac
xcode-select --install

# Linux (Debian/Ubuntu)
sudo apt-get install build-essential python3

# Windows — abrir PowerShell como administrador
npm install --global windows-build-tools
```

Luego volver a instalar desde la raíz:

```bash
npm install
```

---

**No aparece el archivo `.env` y el servidor no arranca**

El archivo `.env` no está en el repositorio. Crearlo manualmente
siguiendo el Paso 3 de esta guía.

---

**La carpeta `backend/data/` no existe**

```bash
mkdir -p backend/data
```

El archivo `integrador.db` se crea automáticamente al iniciar el servidor.
