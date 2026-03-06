#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para transformar la lista BOM del CSV al formato de indentada de Oracle
"""

import csv
import sys
from collections import defaultdict

def cargar_csv(archivo_csv):
    """
    Carga todos los registros del CSV
    """
    registros = []
    print(f"Leyendo archivo {archivo_csv}...")
    
    with open(archivo_csv, 'r', encoding='iso-8859-1') as f:
        lector = csv.DictReader(f, delimiter=';')
        for linea in lector:
            registros.append(linea)
    
    print(f"Total de registros en CSV: {len(registros)}")
    return registros

def construir_jerarquia(registros, bom_codigo):
    """
    Construye la jerarquía recursiva del BOM
    """
    # Crear índices para búsqueda rápida
    por_padre = defaultdict(lambda: defaultdict(list))
    info_componente = {}
    
    for reg in registros:
        padre = reg.get('PADRE', '').strip()
        componente = reg.get('COMPONENTE', '').strip()
        secuencia = reg.get('SECUENCIA_HIJO', '').strip()
        
        # Indexar por padre, usando secuencia como clave para evitar duplicados
        if padre and componente and secuencia:
            # Crear clave única: componente + secuencia
            clave = f"{componente}_{secuencia}"
            # Solo agregar si no existe ya
            if clave not in por_padre[padre]:
                por_padre[padre][clave] = reg
        
        # Guardar información del componente
        if componente and componente not in info_componente:
            info_componente[componente] = {
                'descripcion': reg.get('DESCRIPCION_HIJO', '').strip(),
                'tipo': reg.get('TIPO_ARTICULO_HIJO', '').strip(),
                'unidad': reg.get('UNIDAD_HIJO', '').strip()
            }
    
    return por_padre, info_componente

def escribir_componentes_recursivo(salida, por_padre, bom_principal, bom_codigo, nivel_actual=1):
    """
    Escribe los componentes de forma recursiva
    bom_principal: el código del BOM principal (siempre se mantiene en columna Principal)
    bom_codigo: el código del padre actual para buscar hijos
    """
    if bom_codigo not in por_padre:
        return
    
    # Obtener componentes hijos (ahora es un diccionario)
    hijos_dict = por_padre[bom_codigo]
    
    # Convertir a lista y ordenar por secuencia
    hijos = list(hijos_dict.values())
    hijos_ordenados = sorted(hijos, key=lambda x: int(x.get('SECUENCIA_HIJO', '0')))
    
    for reg in hijos_ordenados:
        componente_hijo = reg.get('COMPONENTE', '').strip()
        desc = reg.get('DESCRIPCION_HIJO', '').strip()
        tipo = reg.get('TIPO_ARTICULO_HIJO', '').strip()
        unidad = reg.get('UNIDAD_HIJO', '').strip()
        cantidad = reg.get('CANTIDAD_HIJO', '').strip()
        rendimiento = reg.get('RENDIMIENTO', '').strip()
        subinventario = reg.get('SUBINVENTARIO', '').strip()
        localizador = reg.get('LOCALIZADOR', '').strip()
        sec_articulo = reg.get('SECUENCIA_HIJO', '').strip()
        sec_op = reg.get('OPERACION_HIJO', '').strip()
        wip_type = reg.get('WIP_SUPPLY_TYPE', '').strip()
        
        # Determinar tipo de suministro
        tipo_sum = ""
        if wip_type == "3":
            tipo_sum = "Proceso Tirar Operación"
        
        # Construir la línea - SIEMPRE usar bom_principal en la columna Principal
        linea = f"{bom_principal}|{nivel_actual}|{componente_hijo}|{desc}|{tipo}|Active||{sec_articulo}|{sec_op}|{unidad}|{cantidad}|{cantidad}|{tipo_sum}|{subinventario}|{localizador}|CSTLPRECIO|0|0|0|0|0||||{rendimiento}|"
        salida.write(linea + "\n")
        
        # Recursivamente escribir los hijos de este componente
        escribir_componentes_recursivo(salida, por_padre, bom_principal, componente_hijo, nivel_actual + 1)

def escribir_bom_a_archivo(salida, por_padre, info_componente, bom_codigo, verbose=False):
    """
    Escribe un BOM específico al archivo de salida
    """
    # Verificar que el BOM existe
    if bom_codigo not in por_padre and bom_codigo not in info_componente:
        if verbose:
            print(f"ERROR: No se encontró el BOM {bom_codigo}")
        return False
    
    # Obtener información del BOM principal
    info_bom = info_componente.get(bom_codigo, {
        'descripcion': f'BOM {bom_codigo}',
        'tipo': 'AI',
        'unidad': 'und'
    })
    
    # Contar componentes
    total_componentes = len(por_padre.get(bom_codigo, {}))
    if verbose:
        print(f"Se encontraron {total_componentes} componentes únicos para el BOM {bom_codigo}")
    
    # Escribir nivel 0 (el producto principal)
    linea_nivel0 = f"{bom_codigo}|0|{bom_codigo}|{info_bom['descripcion']}|{info_bom['tipo']}|Active|||{info_bom['unidad']}|1|1|||...|CSTLPRECIO|0|0|0|0|0|||||"
    salida.write(linea_nivel0 + "\n")
    
    # Escribir componentes recursivamente
    escribir_componentes_recursivo(salida, por_padre, bom_codigo, bom_codigo)
    
    return True

def leer_codigos_planoind(archivo_planoind):
    """
    Lee los códigos BOM desde el archivo planoind.csv
    Formato: CODIGO_BOM;* (sin encabezado)
    """
    codigos = []
    print(f"Leyendo códigos desde {archivo_planoind}...")
    
    with open(archivo_planoind, 'r', encoding='utf-8') as f:
        for linea in f:
            # Separar por punto y coma y tomar la primera columna
            partes = linea.strip().split(';')
            if partes and partes[0]:
                codigo = partes[0].strip()
                # Ignorar líneas que sean encabezados o estén vacías
                if codigo and not codigo.upper().startswith('CODIGO'):
                    codigos.append(codigo)
    
    print(f"Se encontraron {len(codigos)} códigos BOM para procesar")
    return codigos

def extraer_boms_principales(registros):
    """
    Extrae todos los códigos BOM únicos del CSV
    Incluye tanto PRINCIPAL como COMPONENTE que funcionan como productos/sub-productos
    """
    print("Extrayendo códigos BOM únicos del archivo...")
    boms_unicos = set()
    
    for reg in registros:
        # Agregar PRINCIPAL
        principal = reg.get('PRINCIPAL', '').strip()
        if principal:
            boms_unicos.add(principal)
        
        # Agregar COMPONENTE (que puede ser un producto en sí mismo)
        componente = reg.get('COMPONENTE', '').strip()
        if componente:
            boms_unicos.add(componente)
    
    codigos = sorted(list(boms_unicos))
    print(f"Se encontraron {len(codigos)} códigos BOM únicos (incluyendo componentes reutilizables)")
    return codigos

if __name__ == "__main__":
    archivo_csv = "LISTAS_TOT.csv"
    archivo_planoind = "planoind.csv"
    archivo_salida = "BOMS_indentados.csv"
    
    # Verificar si existe planoind.csv para usar solo esos códigos
    import os
    usar_planoind = os.path.exists(archivo_planoind)
    
    # Cargar todos los registros del CSV una sola vez
    print(f"\n{'='*60}")
    print("CARGANDO DATOS")
    print(f"{'='*60}")
    registros = cargar_csv(archivo_csv)
    
    # Decidir qué códigos procesar
    if usar_planoind:
        print(f"\nUsando códigos desde {archivo_planoind}")
        codigos_bom = leer_codigos_planoind(archivo_planoind)
    else:
        print("\nNo se encontró planoind.csv, procesando TODOS los BOMs del archivo")
        codigos_bom = extraer_boms_principales(registros)
    
    # Construir jerarquía completa
    print("\nConstruyendo jerarquía de todos los BOMs...")
    por_padre, info_componente = construir_jerarquia(registros, None)
    print("Jerarquía construida exitosamente")
    
    # Abrir archivo de salida único
    print(f"\n{'='*60}")
    print(f"GENERANDO ARCHIVO: {archivo_salida}")
    print(f"{'='*60}")
    
    boms_procesados = 0
    boms_no_encontrados = []
    
    with open(archivo_salida, 'w', encoding='utf-8') as salida:
        # Escribir encabezado una sola vez
        encabezados = "Principal|Nivel|Artículo|Descripción|Tipo|Estado|Planeador|Sec Artículo|Sec Op|UDM|Cantidad Unitaria|Cantidad Extendida|Tipo Suministro|Subinventario|Localizador|Tipo Costo|Costo Materiales|Costo Recurso|Gsto Grl|Costo Unitario|Costo Extendido|Accesorio S/N|Fecha inactivo|Alterno|Component_Yiel|Categoria Producto"
        salida.write(encabezados + "\n")
        
        # Procesar cada código BOM
        total = len(codigos_bom)
        for i, bom_codigo in enumerate(codigos_bom, 1):
            # Mostrar progreso cada 100 BOMs o en múltiplos de 10%
            if i % 100 == 0 or i % (total // 10) == 0 or i == total:
                porcentaje = (i * 100) // total
                print(f"[{i}/{total}] {porcentaje}% - Procesando BOM: {bom_codigo}")
            
            resultado = escribir_bom_a_archivo(salida, por_padre, info_componente, bom_codigo)
            
            if resultado:
                boms_procesados += 1
            else:
                boms_no_encontrados.append(bom_codigo)
    
    # Resumen final
    print(f"\n{'='*60}")
    print(f"RESUMEN FINAL")
    print(f"{'='*60}")
    print(f"Archivo generado: {archivo_salida}")
    print(f"Total de BOMs procesados exitosamente: {boms_procesados}/{len(codigos_bom)}")
    
    if boms_no_encontrados:
        print(f"\nBOMs no encontrados ({len(boms_no_encontrados)}):")
        for codigo in boms_no_encontrados[:10]:  # Mostrar solo los primeros 10
            print(f"  - {codigo}")
        if len(boms_no_encontrados) > 10:
            print(f"  ... y {len(boms_no_encontrados) - 10} más")
