# Guía de Mantenimiento de Datos

Esta guía detalla el proceso para mantener actualizados los maestros de artículos y las jerarquías de productos (BOM) en el Integrador de Pedidos.

## Archivos Fuente Requeridos
Para realizar una actualización completa, asegúrese de tener los siguientes archivos en la carpeta raíz del proyecto:
- `PT.txt`: Maestro de productos terminados (Puestos de trabajo).
- `MP.txt`: Maestro de artículos y materias primas (Artículos).
- `LISTAS_TOT.csv`: Jerarquías completas de productos.
- `planoind.csv`: (Opcional) Filtro de códigos específicos para transformar.

## Módulo de Administración (UI)
El sistema cuenta ahora con una interfaz gráfica para realizar estas tareas sin usar la terminal:
1. Inicie sesión como **Administrador**.
2. Haga clic en el ícono de **Usuario** en el encabezado.
3. Seleccione la pestaña **"MANTENIMIENTO DE DATOS"**.
4. Siga los 3 pasos en orden:

### Paso 1: Ingesta Maestra
**Acción:** `npm run ingest` (vía UI)
- **Qué hace:** Procesa `PT.txt` y `MP.txt`.
- **Resultado:** Actualiza las tablas de búsqueda rápida para que el autocompletado del formulario sugiera los códigos y descripciones correctos.

### Paso 2: Ingesta de Materiales BOM
**Acción:** `npm run ingest:bom` (vía UI)
- **Qué hace:** Analiza `LISTAS_TOT.csv` para identificar qué artículos requieren pintura, fórmica, tela, etc.
- **Resultado:** Llena la tabla `bom_materiales`, permitiendo que el sistema sepa qué pestaña de materiales abrir automáticamente al ingresar un código.

### Paso 3: Transformación Técnica
**Acción:** `npm run bom:transform` (vía UI / Python)
- **Qué hace:** Ejecuta el script de Python `transformar_bom.py`.
- **Resultado:** Genera el archivo `BOMS_indentados.txt` en la raíz, que contiene la estructura jerárquica tipo Oracle.

## Consideraciones de Seguridad
- Solo los usuarios con rol **admin** pueden acceder a este módulo.
- La cuenta **admin@omega.com** está protegida contra borrado o cambios de rol por seguridad del sistema.
