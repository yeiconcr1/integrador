-- ============================================================
-- Schema MySQL - Integrador
-- Migrado desde SQLite (better-sqlite3)
-- ============================================================

CREATE DATABASE IF NOT EXISTS integrador
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE integrador;

-- ─── USUARIOS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id       INT AUTO_INCREMENT PRIMARY KEY,
  email    VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  nombre   VARCHAR(255) NOT NULL,
  rol      VARCHAR(50)  NOT NULL DEFAULT 'disenador'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── PEDIDOS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pedidos (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id     INT,
  numero_pedido  VARCHAR(100),
  fecha          VARCHAR(50),
  cliente        VARCHAR(255),
  proyecto       VARCHAR(255),
  disenador      VARCHAR(255),
  asesor         VARCHAR(255),
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pedidos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── PUESTOS DE TRABAJO ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS puestos_trabajo (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  pedido_id INT          NOT NULL,
  nombre    VARCHAR(255) NOT NULL DEFAULT 'Puesto de trabajo',
  orden     INT          DEFAULT 0,
  CONSTRAINT fk_puestos_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── ITEMS POR PUESTO ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS puesto_items (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  puesto_id           INT NOT NULL,
  orden               INT DEFAULT 0,
  codigo              VARCHAR(100),
  descripcion         TEXT,
  nota_h              VARCHAR(255),
  nota_l              VARCHAR(255),
  nota_prof           VARCHAR(255),
  nota_adicional      TEXT,
  cantidad_unitaria   DECIMAL(10,4),
  cantidad_tipologia  DECIMAL(10,4),
  cantidad_total      DECIMAL(10,4),
  pintura             VARCHAR(255),
  acabados_adicional  VARCHAR(255),
  formica             VARCHAR(255),
  supercor            VARCHAR(255),
  canto               VARCHAR(255),
  madecanto           VARCHAR(255),
  vidrio              VARCHAR(255),
  tela                VARCHAR(255),
  render              VARCHAR(255),
  CONSTRAINT fk_items_puesto FOREIGN KEY (puesto_id) REFERENCES puestos_trabajo(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── CATALOGOS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalogos (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  tipo        VARCHAR(100) NOT NULL,
  descripcion TEXT         NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── ARTICULOS (Materias Primas - MP) ────────────────────────
CREATE TABLE IF NOT EXISTS articulos (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  codigo      VARCHAR(100) NOT NULL UNIQUE,
  descripcion TEXT         NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── ARTICULOS PT (Productos Terminados) ─────────────────────
CREATE TABLE IF NOT EXISTS articulos_pt (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  codigo      VARCHAR(100) NOT NULL UNIQUE,
  descripcion TEXT         NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── BOM MATERIALES ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bom_materiales (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  codigo_producto VARCHAR(100) NOT NULL,
  tipo_material   VARCHAR(100) NOT NULL,
  UNIQUE KEY uq_bom (codigo_producto, tipo_material)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── INDICES ─────────────────────────────────────────────────
CREATE INDEX idx_catalogos_tipo_desc ON catalogos(tipo, descripcion(100));
CREATE INDEX idx_articulos_codigo    ON articulos(codigo);
CREATE INDEX idx_articulos_desc      ON articulos(descripcion(100));
CREATE INDEX idx_articulos_pt_codigo ON articulos_pt(codigo);
CREATE INDEX idx_bom_mat_codigo      ON bom_materiales(codigo_producto);
