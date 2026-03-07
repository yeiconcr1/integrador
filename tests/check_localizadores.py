#!/usr/bin/env python3
import sys

with open('MP.txt', 'r', encoding='latin1') as f:
    header = f.readline().rstrip('\n').split('\t')
    print(f"Column 23 header: {header[23]}")
    print(f"Column 24 header: {header[24]}")
    print()
    
    # Search for PI, FOR, VID, etc.
    loc_types = {'PI': [], 'FOR': [], 'CTA': [], 'TEL': [], 'VID': [], 'AGL': [], 'OTHER': []}
    
    for line_num, line in enumerate(f, start=2):
        parts = line.rstrip('\n').split('\t')
        if len(parts) <= 23:
            continue
        loc = parts[23].strip() if parts[23] else ''
        
        if not loc:
            continue
            
        # Classify
        found = False
        for prefix in ['PI', 'FOR', 'CTA', 'TEL', 'VID', 'AGL']:
            if loc.startswith(prefix + '.'):
                loc_types[prefix].append({
                    'loc': loc[:30],
                    'codigo': parts[1],
                    'desc': parts[2][:50]
                })
                found = True
                break
        
        if not found and loc:
            loc_types['OTHER'].append({
                'loc': loc[:30],
                'codigo': parts[1],
                'desc': parts[2][:50]
            })
    
    # Print results
    for prefix, items in loc_types.items():
        if items:
            print(f"\n{prefix}. entries: {len(items)}")
            for item in items[:2]:
                print(f"  Loc: [{item['loc']}]")
                print(f"  Código: {item['codigo']}")
                print(f"  Desc: {item['desc']}")
