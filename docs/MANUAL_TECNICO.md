# Manual Técnico - Sistema Integrador de Pedidos

## 1. Visión General del Sistema
El **Sistema Integrador de Pedidos** es una aplicación web transaccional diseñada para digitalizar la captura, configuración y exportación de pedidos de mobiliario corporativo. Está construida sobre una arquitectura moderna basada en **JavaScript (React/Node.js)** apoyada por procesamiento de datos offline en **Python**.

## 2. Pila Tecnológica (Tech Stack)
- **Frontend**: React 19, Tailwind CSS v4, DaisyUI, Vite. (Empaquetado estático puro).
- **Backend API**: Node.js (Express.js), JSON Web Tokens (JWT) para autenticación STATELESS.
- **Base de Datos**: SQLite3 (vía `better-sqlite3`), operada en modo WAL (Write-Ahead Logging) para alta concurrencia.
- **Procesamiento de Datos (ETL)**: Scripts híbridos en Node.js y Python 3 (Pandas) para ingestión de catálogos y listas BOM (Bill of Materials).
- **Seguridad**: `helmet` (Cabeceras HTTP seguras), `express-rate-limit` (Prevención de fuerza bruta), `bcrypt` (Hashing de contraseñas), `cors`.

## 3. Arquitectura de Directorios
El proyecto monolítico está estructurado bajo la separación de preocupaciones (Separation of Concerns):

```text
/integrador
├── backend/                  # Lógica de servidor y API
│   ├── data/                 # Base de datos SQLite y archivos maestros (txt, csv)
│   ├── logs/                 # Registro de procesos y backups automáticos
│   ├── scripts/              # Scripts ETL (Node/Python) e infraestructura (.sh)
│   ├── uploads/              # Almacenamiento temporal para cargas por interfaz
│   └── server.js             # Punto de entrada de la aplicación Express
├── frontend/                 # Interfaz de Usuario (React)
│   ├── src/                  # Componentes, vistas y lógica de cliente
│   ├── public/               # Assets estáticos (imágenes, logos)
│   └── dist/                 # (Generado) Código compilado para producción
├── tests/                    # Scripts de verificación y QA QA
├── docs/                     # Documentación técnica y funcional
├── ecosystem.config.js       # Archivo de configuración del orquestador PM2
├── package.json              # Mapeo de dependencias globales y scripts de ejecución
└── .env                      # Variables de entorno secretas (NO versionado)
```

## 4. Requisitos de Infraestructura (Despliegue)
Para desplegar la aplicación en un entorno de producción (VPS, Servidor Dedicado o Nube), se requiere:

- **Sistema Operativo**: Distribución Linux (Ubuntu 22.04 LTS o Debian 12 recomendado).
- **Entornos de Ejecución**:
  - Node.js >= 18.x
  - Python >= 3.9
  - PIP (Python Package Installer)
- **Memoria RAM**: 2 GB Mínimo (Por requerimientos de cruce de datos en memoria con Pandas).
- **Gestor de Procesos**: PM2 instalado globalmente (`npm install -g pm2`).
- **Servidor Web**: Nginx o Apache como Proxy Inverso.

## 5. Procedimiento de Escalalamiento a Producción

### 5.1. Variables de Entorno
Clonar el repositorio y crear el archivo `.env` en la raíz del proyecto. **Obligatorio** para producción:
```env
JWT_SECRET="GENERAR_CADENA_CRIPTOGRAFICA_ALEATORIA_MUY_LARGA"
NODE_ENV="production"
```

### 5.2. Instalación de Dependencias
```bash
# Dependencias principales y del servidor
npm install

# Dependencias del cliente (Frontend)
npm install --prefix frontend

# Dependencias de Python (Si hay pip/venv configurado)
pip install pandas
```

### 5.3. Construcción del Cliente (Build)
Se debe compilar el frontend, lo cual creará la carpeta `frontend/dist/` que Express interceptará y servirá estáticamente:
```bash
npm run build --prefix frontend
```

### 5.4. Arranque de Servicios (Gestión con PM2)
La aplicación cuenta con configuración para PM2 (orquestador de Node.js corporativo). Se ejecutará en el puerto local `:3000`.
```bash
# Iniciar la aplicación
npm run start:prod

# Guardar la lista de procesos para el reinicio automático tras un fallo del servidor
pm2 save
pm2 startup
```

## 6. Mantenimiento y Copias de Seguridad (Backups)
La base de datos SQLite se encuentra contenida en un único archivo (`backend/data/integrador.db`).

Para garantizar la integridad y recuperación ante desastres (Disaster Recovery), se provee el script `backend/scripts/backup.sh` el cual hace volcado de la base de datos usando comandos seguros nativos y purga archivos mayores a 7 días de antigüedad.

**Configurar Crontab en Linux (Ej. Backup diario a las 02:00 AM):**
```bash
crontab -e
# Agregar la línea:
0 2 * * * /ruta/absoluta/a/backend/scripts/backup.sh >> /ruta/absoluta/a/backend/logs/backup.log 2>&1
```

## 7. Políticas de Seguridad Implementadas
1. **Contraseñas**: Las contraseñas en base de datos nunca se guardan en texto plano; cruzan el algoritmo `Bcrypt` con Salt de 10 rondas.
2. **Autenticación**: Los identificadores de acceso (Tokens JWT) solo viven en memoria del cliente y caducan cada 12 horas.
3. **Control de Flujo (DDoS/Brute Force)**: Las peticiones al *endpoint* de `/api/login` están limitadas a 15 intentos por cada 15 minutos por IP (`express-rate-limit`).
4. **Protección de Cabeceras**: Ocultación dinámica de información de tecnología en las peticiones HTTP mediante `helmet`.
5. **Aislamiento de Errores**: Todo error de SQL está envuelto en bloques `try/catch` impidiendo filtraciones de la arquitectura de tablas hacia el usuario final.
