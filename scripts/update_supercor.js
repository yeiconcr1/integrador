const fs = require('fs');
const path = require('path');

const mpPath = path.join(__dirname, '../MP.txt');
const catalogosPath = path.join(__dirname, '../catalogos.json');

// Read MP.txt
const mpContent = fs.readFileSync(mpPath, 'latin1'); // Use latin1 to handle special chars if needed, or utf-8
const lines = mpContent.split('\n');

const supercorItems = new Set();

// Regex to capture the description. 
// Based on: M03 CARVAJAL ESPACIOS PLANTA PALMIRA    22014974        SUPERCOR WENGUE LISO DE 25MM 1830MM X 2440MM    12-ago-13...
// We want the text between the code (8 digits) and the date (d-mon-yy).
// Or just look for "SUPERCOR" and take the whole description field.
// The file seems to be tab or fixed width separated. Let's try splitting by multiple spaces/tabs.

lines.forEach(line => {
    if (line.includes('SUPERCOR')) {
        // Simple extraction: find the index of "SUPERCOR" and capture until the next large chunk of whitespace or date
        // Strategy: Split by tab or multiple spaces
        const parts = line.split(/\t+/); // Assuming tabs, based on "head" output looks like columns

        // In the "head" output: 
        // Col 0: M03 CARVAJAL...
        // Col 1: Code (e.g. 22014974)
        // Col 2: Description (e.g. SUPERCOR WENGUE LISO DE 25MM 1830MM X 2440MM)
        // Col 3: Date

        if (parts.length > 2 && parts[2].includes('SUPERCOR')) {
            const desc = parts[2].trim();
            if (desc) {
                supercorItems.add(desc);
            }
        } else {
            // Fallback for space separated if tabs fail
            // Look for 8 digit code then content
            const match = line.match(/\d{8}\s+(SUPERCOR.*?)\s+\d{1,2}-[a-z]{3}-\d{2}/i);
            if (match && match[1]) {
                supercorItems.add(match[1].trim());
            }
        }
    }
    // Also include DURALAM records if they are relevant?
    /*
    if (line.includes('DURALAM')) {
         const parts = line.split(/\t+/);
         if (parts.length > 2 && parts[2].includes('DURALAM')) {
            supercorItems.add(parts[2].trim());
         }
    }
    */
});

const sortedItems = Array.from(supercorItems).sort();

console.log(`Found ${sortedItems.length} SUPERCOR items.`);

// Update catalogos.json
const catalogos = JSON.parse(fs.readFileSync(catalogosPath, 'utf-8'));
const currentSupercor = new Set(catalogos.supercor || []);

// Merge or Replace? User said "debias complementar", implies merging.
// But we must exclude "GENERICO" items as requested.
sortedItems.forEach(item => {
    if (!item.toUpperCase().includes('GENERICO')) {
        currentSupercor.add(item);
    }
});

// Also filter existing items in case they were already there
const filteredSupercor = Array.from(currentSupercor).filter(item => !item.toUpperCase().includes('GENERICO')).sort();

catalogos.supercor = filteredSupercor;

fs.writeFileSync(catalogosPath, JSON.stringify(catalogos, null, 2), 'utf-8');
console.log('Updated catalogos.json');
console.log('Total Supercor Items:', catalogos.supercor.length);
