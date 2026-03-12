"""
Exporta todos los datos de integrador.db (SQLite) a MySQL.

Uso:
    pip install sqlite3-to-mysql
    python exportar_sqlite_a_mysql.py --sqlite ../data/integrador.db \
        --host localhost --db integrador --user root --password TU_PASSWORD

Requisitos:
    - La base de datos MySQL debe existir previamente (ejecutar integrador_mysql.sql primero)
    - Python >= 3.8
"""

import argparse
import sqlite3
import sys

def get_args():
    parser = argparse.ArgumentParser(description='Migra datos de SQLite a MySQL')
    parser.add_argument('--sqlite',   required=True,  help='Ruta al archivo .db de SQLite')
    parser.add_argument('--host',     default='localhost', help='Host de MySQL')
    parser.add_argument('--port',     default=3306,   type=int, help='Puerto de MySQL')
    parser.add_argument('--db',       required=True,  help='Nombre de la base de datos MySQL')
    parser.add_argument('--user',     required=True,  help='Usuario MySQL')
    parser.add_argument('--password', required=True,  help='Contraseña MySQL')
    return parser.parse_args()

def main():
    args = get_args()

    try:
        from sqlite3_to_mysql import SQLite3toMySQL
    except ImportError:
        print("ERROR: Instala la dependencia con:  pip install sqlite3-to-mysql")
        sys.exit(1)

    print(f"Conectando a SQLite: {args.sqlite}")
    print(f"Destino MySQL: {args.user}@{args.host}:{args.port}/{args.db}")
    print("Iniciando migración...\n")

    converter = SQLite3toMySQL(
        sqlite_file=args.sqlite,
        mysql_user=args.user,
        mysql_password=args.password,
        mysql_host=args.host,
        mysql_port=args.port,
        mysql_database=args.db,
        mysql_insert_method='IGNORE',   # evita duplicados si se corre dos veces
        without_foreign_keys=True,       # inserta datos sin restricciones y las reactiva al final
        log_file='migracion.log',
    )

    try:
        converter.transfer()
        print("\nMigracion completada exitosamente.")
        print("Revisa migracion.log si hubo advertencias.")
        print("\nVerifica los datos con:")
        print(f"  mysql -u {args.user} -p {args.db} -e 'SELECT COUNT(*) FROM pedidos; SELECT COUNT(*) FROM puesto_items; SELECT COUNT(*) FROM catalogos;'")
    except Exception as e:
        print(f"\nERROR durante la migracion: {e}")
        print("Revisa migracion.log para mas detalles.")
        sys.exit(1)

if __name__ == '__main__':
    main()
