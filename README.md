# Sistema Integrador de Pedidos

Plataforma unificada para la configuración de mobiliario corporativo, listas de materiales y generación rápida de pedidos comerciales exportables.

## Estructura de Documentación

Esta aplicación cuenta con dos documentos clave orientados a solventar dudas técnicas y operacionales del negocio:

- 📘 **[Manual de Usuario](docs/MANUAL_DE_USUARIO.md)**: Explicación de flujos de trabajo, alcance de roles (Diseñador vs. Administrador) y recetario sobre cómo transcribir pedidos hasta su versión Excel.
- 🛠️ **[Manual Técnico y de Despliegue](docs/MANUAL_TECNICO.md)**: Arquitectura, instrucciones paso a paso para pases a entorno de producción mediante PM2, Nginx y Scripts de Backup SQLite.
- ⚙️ **[Mantenimiento de Datos Primitivos](docs/CARGA_DE_DATOS.md)**: Lógica sobre cómo se consolidaron los catálogos en texto plano (.TXT, .CSV) históricamente.

---

## Características Principales
- Interfaz gráfica fluida e interactiva en entorno Web de Página Única (SPA) mediante **React + TailwindCSS**.
- Procesamiento en segundo plano y extracción pesada a cargo de rutinas puente entre **Node.js** y **Python (Pandas)**.
- Base de datos portable, rápida y auto-contenida con **SQLite**.
- Autenticación segura mediante JSON Web Tokens (JWT).
- Módulos administrativos para actualización de diccionarios, catálogos e ingestas masivas desde la interfaz sin intervención sobre la consola de administración del servidor.
