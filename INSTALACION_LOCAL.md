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

En la raíz del proyecto existe un archivo `.env`. Si no está, créalo:

```bash
# En la raíz del proyecto (junto a package.json)
touch .env
```

Agregar el siguiente contenido:

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

---

## Paso 5 — Abrir la aplicación

Abrir el navegador en:

```
http://localhost:5173
```

### Credenciales por defecto

| Campo | Valor |
|-------|-------|
| Email | `admin@omega.com` |
| Contraseña | `admin123` |

> Estas credenciales se crean automáticamente la primera vez que arranca
> el servidor si no existe ningún usuario en la base de datos.

---

## Estructura del proyecto

```
integrador/
├── backend/
│   ├── server.js           ← API REST (Node.js + Express)
│   ├── data/
│   │   ├── integrador.db   ← Base de datos SQLite (se crea sola al iniciar)
│   │   └── *.csv / *.txt   ← Archivos de datos para ingesta
│   └── scripts/            ← Scripts de carga y mantenimiento de datos
├── frontend/
│   ├── src/                ← Código React
│   └── public/             ← Archivos estáticos
├── package.json            ← Scripts principales y dependencias del backend
├── .env                    ← Variables de entorno (NO subir al repositorio)
└── INSTALACION_LOCAL.md    ← Este archivo
```

---

## Scripts disponibles

Ejecutar todos desde la **raíz** del proyecto:

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Levanta backend y frontend juntos (modo desarrollo) |
| `npm start` | Levanta solo el backend (modo producción) |
| `npm run build` | Genera el build del frontend para producción |
| `npm run ingest` | Carga catálogos y artículos desde los archivos CSV/TXT en `backend/data/` |
| `npm run ingest:bom` | Carga los materiales BOM desde los archivos de datos |
| `npm run data:all` | Ejecuta `ingest` e `ingest:bom` en secuencia |

---

## Cargar datos iniciales (catálogos y artículos)

Si la base de datos está vacía y los autocompletados no muestran datos,
hay que ejecutar la ingesta. Para eso primero deben existir los archivos
de datos en `backend/data/`:

- `LISTAS_TOT.csv` — catálogos (pintura, fórmica, tela, etc.)
- `MP.txt` — materias primas
- `PT.txt` — productos terminados
- `BOMS_indentados.csv` — materiales BOM

Una vez que los archivos estén en esa carpeta:

```bash
npm run data:all
```

También se puede hacer desde la interfaz web iniciando sesión como
`admin` y entrando al panel de **Mantenimiento de datos**.

---

## Solución de problemas comunes

**El puerto 3000 ya está en uso**

```bash
# Mac / Linux — ver qué proceso usa el puerto
lsof -i :3000
# Terminar el proceso
kill -9 <PID>
```

```powershell
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

**El puerto 5173 ya está en uso**

Igual que arriba pero con el puerto 5173.

**Error: `better-sqlite3` no compila**

Asegurarse de que Node.js y las build tools están instaladas:

```bash
# Mac
xcode-select --install

# Windows — instalar windows-build-tools
npm install --global windows-build-tools

# Linux (Debian/Ubuntu)
sudo apt-get install build-essential python3
```

Luego volver a instalar:

```bash
npm install
```

**La base de datos aparece vacía o con error al iniciar**

Verificar que existe la carpeta `backend/data/`. Si no existe, crearla:

```bash
mkdir -p backend/data
```

El archivo `integrador.db` se crea automáticamente al iniciar el servidor
por primera vez.
