#!/bin/bash
# Script para hacer backup diario de la base de datos SQLite

BACKUP_DIR="backend/logs/backups"
DB_FILE="backend/data/integrador.db"
DATE=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILE="$BACKUP_DIR/integrador_backup_$DATE.db"

# Crear directorio si no existe
mkdir -p "$BACKUP_DIR"

# Hacer copia de seguridad
if [ -f "$DB_FILE" ]; then
    echo "Creando backup de base de datos..."
    # Se usa .backup de sqlite3 para hacerlo de forma segura sin bloquear (requiere tener sqlite3 instalado en Linux/Mac)
    if command -v sqlite3 &> /dev/null; then
        sqlite3 "$DB_FILE" ".backup '$BACKUP_FILE'"
    else
        # Fallback a copia simple si sqlite3 CLI no está disponible
        cp "$DB_FILE" "$BACKUP_FILE"
    fi
    echo "Backup creado: $BACKUP_FILE"
    
    # Mantener solo los últimos 7 días de backups
    echo "Limpiando backups antiguos (> 7 días)..."
    find "$BACKUP_DIR" -name "*.db" -type f -mtime +7 -exec rm {} \;
else
    echo "No se encontró la base de datos en $DB_FILE"
fi
