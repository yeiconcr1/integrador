# Integrador App — Instrucciones para IA

## Contexto del proyecto

Aplicación de gestión de **pedidos de integración** para la empresa **OMEGA ARQUINT** (mobiliario y diseño de interiores). Cada pedido contiene múltiples **puestos de trabajo**, y cada puesto tiene una lista de **artículos** con especificaciones de materiales.

El usuario principal habla **español (Costa Rica)**. Responde siempre en español.

## Arquitectura

```
Backend:  Express.js (server.js) → Puerto 3000
Frontend: React 19 + Vite 7 (client/) → Puerto 5175 (dev)
DB:       SQLite (integrador.db) vía better-sqlite3
Estilos:  Tailwind CSS 4
```

## Archivos clave

| Archivo | Responsabilidad |
|---------|----------------|
| `server.js` | API REST completa, exportación Excel, setup DB |
| `client/src/App.jsx` | Componente principal: sidebar, formulario, gestión de puestos |
| `client/src/api.js` | Funciones fetch al backend (fetchPedidos, createPedido, etc.) |
| `client/src/components/ItemsTable.jsx` | Tabla editable de artículos por puesto |
| `client/src/components/AutocompleteInput.jsx` | Input con dropdown de autocompletado para catálogos |
| `client/src/components/Toast.jsx` | Sistema de notificaciones |
| `scripts/ingest_data.js` | Lee MP.txt y PT.txt → inserta en SQLite (catálogos + artículos) |
| `scripts/import_pedidos_from_xlsb.js` | Importa pedidos desde archivos .xlsb (SheetJS) |
| `catalogos.json` | Catálogos de materiales en JSON (se cargan al iniciar server) |

## Base de datos — Tablas

### pedidos
- `id`, `numero_pedido`, `fecha`, `cliente`, `proyecto`, `disenador`, `asesor`
- Relación: un pedido → muchos puestos_trabajo

### puestos_trabajo
- `id`, `pedido_id` (FK), `nombre` (siempre MAYÚSCULAS), `orden`
- Relación: un puesto → muchos puesto_items

### puesto_items
- `id`, `puesto_id` (FK), `orden`
- Datos: `codigo`, `descripcion`, `nota_h`, `nota_l`, `nota_prof`, `nota_adicional`
- Cantidades: `cantidad_unitaria`, `cantidad_tipologia`, `cantidad_total`
- Materiales: `pintura`, `acabados_adicional`, `formica`, `supercor`, `canto`, `madecanto`, `vidrio`, `tela`, `render`

### catalogos
- `tipo` ∈ {formica, canto, vidrio, tela, supercor, madecanto, pintura}
- `descripcion` — nombre del material
- Se usan para autocompletado en los campos de materiales

### articulos / articulos_pt
- `codigo` (UNIQUE), `descripcion`
- Se usan para lookup automático cuando se ingresa un código en un item

## API REST — Rutas

```
GET    /api/pedidos                  → Lista de pedidos
GET    /api/pedidos/:id              → Pedido completo (con puestos e items)
POST   /api/pedidos                  → Crear pedido (body: {form + puestos[]})
PUT    /api/pedidos/:id              → Actualizar pedido completo (reemplaza puestos/items)
DELETE /api/pedidos/:id              → Eliminar pedido (cascade)
GET    /api/pedidos/:id/export       → Descargar Excel profesional (.xlsx)
GET    /api/catalogos/:tipo?q=texto  → Buscar en catálogo por tipo
GET    /api/articulos/buscar?q=texto → Buscar artículos por código o descripción
GET    /api/articulos/lookup/:codigo → Descripción exacta por código
```

## Comportamientos importantes

1. **Nombres de puestos** → siempre se normalizan a MAYÚSCULAS (función `normalizePuestoName()` en App.jsx y en `savePuestos()` del backend)
2. **Auto-fill de descripción** → al guardar, si un item tiene código pero no descripción, el backend busca en `articulos_pt` y `articulos` automáticamente
3. **Cantidad total** → se calcula automáticamente: `cantidad_unitaria × cantidad_tipologia` en el frontend (ItemsTable.jsx)
4. **Catálogos ordenados** → `catalogos.json` está ordenado alfabéticamente por tipo
5. **Excel export** → diseño profesional con header navy, logo auto-detect en `public/logo.{png,jpg,jpeg}`, subtotales por puesto, formato landscape

## Comandos de desarrollo

```bash
npm run dev          # Backend + Frontend (concurrently)
npm start            # Solo backend
npm run ingest       # Recrear DB desde MP.txt/PT.txt + catalogos.json
npm run import:xlsb  # Importar pedidos de archivos .xlsb en raíz
npm run build        # Build producción del frontend
```

## Convenciones de código

- Backend: CommonJS (`require`), Express.js
- Frontend: ES Modules (`import`), React functional components con hooks
- Estilos: Tailwind CSS utility classes (no CSS custom salvo App.css/index.css mínimos)
- DB: todas las operaciones son síncronas (better-sqlite3) excepto Excel export (async por ExcelJS)
- IDs temporales en frontend: `crypto.randomUUID()` para `_id` de puestos e items antes de guardar

## Notas para la IA

- No crear archivos de documentación (.md) de cambios a menos que el usuario lo pida
- Antes de editar, leer el archivo para entender el contexto actual
- El servidor se reinicia manualmente; si se edita `server.js`, hay que reiniciar con `pkill -9 node; npm run dev`
- La DB se regenera con `npm run ingest` — los pedidos importados con `import:xlsb` se pierden si se borra la DB
- El frontend usa proxy de Vite para `/api` → las peticiones fetch usan rutas relativas (`/api/...`)
- Los archivos `.xlsb` y datos `.txt` están en el repo (no son gitignore'd)
