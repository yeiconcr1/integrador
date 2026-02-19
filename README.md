# Integrador App

Aplicación full-stack para gestionar **pedidos de integración** de mobiliario/diseño de interiores. Permite crear, editar y exportar pedidos con múltiples puestos de trabajo, cada uno con artículos detallados y especificaciones de materiales.

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| **Backend** | Express.js (Node.js) |
| **Base de datos** | SQLite vía better-sqlite3 |
| **Frontend** | React 19 + Vite 7 |
| **Estilos** | Tailwind CSS 4 |
| **Export Excel** | ExcelJS |
| **Lectura .xlsb** | SheetJS (xlsx) |

## Requisitos

- **Node.js** >= 18
- **npm** >= 9

## Instalación

```bash
# 1. Clonar el repositorio
git clone https://github.com/yeiconcr1/integrador.git
cd integrador

# 2. Instalar dependencias del backend
npm install

# 3. Instalar dependencias del frontend
cd client && npm install && cd ..

# 4. Ingestar datos maestros (crea integrador.db con catálogos y artículos)
npm run ingest

# 5. (Opcional) Importar pedidos desde archivos .xlsb
npm run import:xlsb
```

## Ejecución

```bash
# Desarrollo (backend + frontend simultáneamente)
npm run dev
# → Backend: http://localhost:3000
# → Frontend: http://localhost:5175

# Solo backend
npm start
```

## Scripts disponibles

| Script | Comando | Descripción |
|--------|---------|-------------|
| `dev` | `npm run dev` | Inicia backend (Express) + frontend (Vite) con concurrently |
| `start` | `npm start` | Solo backend en puerto 3000 |
| `build` | `npm run build` | Build de producción del frontend |
| `ingest` | `npm run ingest` | Ingesta `MP.txt` y `PT.txt` → crea tablas de catálogos y artículos en SQLite |
| `import:xlsb` | `npm run import:xlsb` | Importa pedidos desde archivos `.xlsb` en la raíz del proyecto |

## Estructura del proyecto

```
integrador/
├── server.js                   # Backend Express (API REST + Excel export)
├── package.json                # Dependencias backend + scripts
├── catalogos.json              # Catálogos de materiales (JSON)
├── MP.txt                      # Datos maestros de artículos
├── PT.txt                      # Datos maestros de puestos de trabajo
├── *.xlsb                      # Archivos fuente de integradores
├── scripts/
│   ├── ingest_data.js          # Ingesta MP.txt/PT.txt → SQLite
│   ├── import_pedidos_from_xlsb.js  # Importa pedidos de .xlsb
│   └── update_supercor.js      # Actualización catálogo supercor
├── client/                     # Frontend React + Vite
│   ├── src/
│   │   ├── App.jsx             # Componente principal (sidebar + formulario)
│   │   ├── api.js              # Funciones de fetch al backend
│   │   └── components/
│   │       ├── ItemsTable.jsx       # Tabla editable de artículos
│   │       ├── AutocompleteInput.jsx # Input con autocompletado de catálogos
│   │       └── Toast.jsx            # Notificaciones
│   └── index.html
└── public/                     # Assets estáticos (logo, etc.)
```

## Base de datos (SQLite)

La base de datos `integrador.db` se genera automáticamente con `npm run ingest`. Tablas principales:

| Tabla | Descripción |
|-------|-------------|
| `pedidos` | Información del pedido (número, fecha, cliente, proyecto, diseñador, asesor) |
| `puestos_trabajo` | Puestos de trabajo por pedido (nombre, orden) |
| `puesto_items` | Artículos por puesto (código, descripción, dimensiones, cantidades, materiales) |
| `catalogos` | Catálogos de materiales: formica, canto, vidrio, tela, supercor, madecanto, pintura |
| `articulos` | Maestro de artículos (código + descripción) desde MP.txt |
| `articulos_pt` | Maestro de artículos PT (código + descripción) desde PT.txt |

## API REST

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/pedidos` | Listar todos los pedidos |
| GET | `/api/pedidos/:id` | Obtener pedido con puestos e items |
| POST | `/api/pedidos` | Crear pedido (con puestos e items) |
| PUT | `/api/pedidos/:id` | Actualizar pedido completo |
| DELETE | `/api/pedidos/:id` | Eliminar pedido |
| GET | `/api/pedidos/:id/export` | Exportar pedido a Excel (.xlsx) |
| GET | `/api/catalogos/:tipo` | Buscar en catálogo por tipo |
| GET | `/api/articulos/buscar` | Buscar artículos por código o descripción |
| GET | `/api/articulos/lookup/:codigo` | Buscar descripción por código exacto |

## Tipos de catálogos

Los campos de materiales en cada artículo tienen autocompletado desde estos catálogos:

- **pintura** — Colores y tipos de pintura
- **formica** — Laminados decorativos
- **supercor** — Tableros y superficies
- **canto** — Cantos para tableros
- **madecanto** — Cantos de madera
- **vidrio** — Tipos de vidrio
- **tela** — Telas y fibras

## Export Excel

El botón "Exportar Excel" genera un archivo `.xlsx` profesional con:
- Header con logo (si existe `public/logo.png`) o texto "OMEGA ARQUINT"
- Datos del pedido (número, fecha, cliente, proyecto, diseñador, asesor)
- Una sección por cada puesto de trabajo con tabla de artículos
- Subtotales de cantidades por puesto
- Formato de impresión landscape optimizado

Para incluir el logo de la empresa, colocar `logo.png` en la carpeta `public/`.

## Notas

- Los nombres de puestos de trabajo se normalizan a **MAYÚSCULAS** automáticamente
- Al guardar, si un artículo tiene código pero no descripción, se busca automáticamente en las tablas de artículos
- La base de datos usa **WAL mode** para mejor rendimiento con escrituras concurrentes
