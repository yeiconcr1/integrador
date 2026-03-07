# Manual de Usuario - Sistema Integrador de Pedidos

Bienvenido al sistema **Integrador**, la plataforma corporativa centralizada para la cotización, configuración de puestos de trabajo y exportación de requerimientos de mobiliario.

Este manual guiará a los usuarios finales sobre el correcto manejo de la operabilidad del software.

---

## 1. Perfiles de Usuario
El sistema restringe la visibilidad y operación basado en dos niveles de autorización (Roles):

### 1.1. Diseñador (Usuario Estándar)
Permisos orientados exclusivamente a la producción, creación y manejo del cliente:
- Búsqueda en el buscador avanzado de artículos y referencias maestras.
- Creación, edición, eliminación y copiado de Pedidos Comerciales.
- Adición libre de "Puestos de Trabajo" dentro de los pedidos y asociación de líneas de ítems.
- Exportación en formato oficial del *Libro de Pedidos* a Microsoft Excel (.xlsx).

### 1.2. Administrador (Superusuario)
Posee los permisos del Diseñador y adicionalmente gobierna la herramienta:
- Ingreso al **Módulo de Mantenimiento de Usuarios**: Creación, reseteo de contraseñas y eliminación de accesos al sistema.
- Ingreso al **Módulo de Mantenimiento de Datos (BOM)**: Capacidad para ejecutar los algoritmos del servidor para ingestar el *Catálogo Maestro*, el *Listado BOM de Materiales* y gatillar los reprocesamientos lógicos desde la interfaz.

---

## 2. Flujo Básico de Generación de un Pedido

El proceso central de la aplicación desde que se abre hasta lograr el documento final transcurre en 4 simples etapas:

### Fase 1: Ingreso al Sistema
1. Navegue a la dirección web proporcionada por el equipo de TI.
2. Inicie sesión utilizando su correo corporativo y contraseña.
   - *Nota: Si luego de cierto tiempo el sistema lo desconecta volviendo a pedir credenciales, es una medida automática por caducidad de seguridad. Reinicie sesión normalmente.*

### Fase 2: Creación de la Cabecera del Pedido
1. Haga clic en el botón superior derecho **"Nuevo Pedido"**.
2. Rellene los datos comerciales:
   - Número de Pedido.
   - Fecha de emisión.
   - Cliente y Proyecto.
   - Asesor a cargo.
3. Podrá guardar el pedido y ver cómo se registra en la tabla principal.

### Fase 3: Tipificación de Puestos
Dentro de un pedido, puede crear múltiples áreas o ambientes.
1. Ingrese a **"Editar"** en el pedido deseado.
2. Pulse el botón **"+ Agregar Puesto"**.
3. Cambie el título genérico (por ejemplo: *"Gerencia Administrativa"* o *"Recepción"*).
4. Emplee el botón **"+ Agregar Item"** por cada mueble que compondrá el puesto.
   - **Autocompletado Rápido:** Digite el código en la primera casilla; el sistema buscará en vivo el catálogo maestro rellenando la "Descripción" automáticamente y sugiriendo cruces de piezas.
   - **Aplicación de Materiales:** Dependiendo del ítem, seleccione colores de Fórmica, Cantos, Telas o Pinturas requeridas para personalización.

### Fase 4: Exportación
Una vez digitados los productos y sus cantidades métricas:
1. Diríjase al menú principal (Listado de Pedidos).
2. Presione el botón verde de **"Exportar a Excel"** relativo al pedido.
3. El sistema confeccionará la planilla, diagramará los puestos verticalmente y agregará el membrete para poder adjuntarlo y enviarlo al sistema contable/planta de ensamble.

---

## 3. Guía de Operación Administrativa (Sólo Administradores)

La responsabilidad de conservar la vigencia de los datos del sistema (precios, materiales, códigos de producto vigentes) recae sobre el administrador a través del engranaje en la esquina superior derecha: **"Mantenimiento"**.

### Cargar un Nuevo Catálogo u Hoja de Datos
1. Las bases de ingeniería como `PT.txt`, `MP.txt` o listados de la planta `LISTAS_TOT.csv`, al ser actualizados por la empresa, deben insertarse al sistema.
2. Presione **"Subir archivo"**. Esto transmitirá momentáneamente el archivo al servidor. Al notar un indicador verde `(Cargado)`, el sistema estará listo.
3. Realice **siempre** el desencadenamiento manual presionando los botones naranjas numerados en orden secuencial:
   - **Paso 1**: Refresca la lista de descripciones (Buscador).
   - **Paso 2**: Relaciona matemáticamente los insumos y materiales BOM (Es un cruce extenso asíncrono, aguarde al indicador final).

*Aviso legal y de Auditoría: Toda intervención mediante estos módulos sobrescribe catálogos inmediatamente y es reflejada a nivel global.*
