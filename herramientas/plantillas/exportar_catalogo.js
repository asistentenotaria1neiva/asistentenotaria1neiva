/**
 * Exporta el catálogo de tipos de escritura de la Fase 0 a plantillas/catalogo.json,
 * que la aplicación carga al iniciar (tabla tipos_escritura).
 * Uso: node herramientas/plantillas/exportar_catalogo.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { TIPOS, ARCHIVOS } = require('../fase0/catalogo');

// La carátula, el cierre y los oficios ya no son bloques aparte: cada escritura modelo los trae completos
const BLOQUES = [];

const catalogo = [
  ...BLOQUES,
  ...TIPOS.map((t) => ({
    id: t.id, categoria: t.categoria, nombre: t.nombre.replace(/ \(tipo encontrado\)/, ''), prioridad: t.prioridad, esBloque: false,
    descripcion: [t.nuevo ? 'Tipo encontrado en la carpeta de la notaría (no estaba en el catálogo base).' : null,
      ARCHIVOS.some((a) => a.tipos.includes(t.id)) ? `Fuentes en la carpeta: ${ARCHIVOS.filter((a) => a.tipos.includes(t.id)).map((a) => a.id).join(', ')}.` : 'Sin plantilla en la carpeta: la notaría debe entregarla.']
      .filter(Boolean).join(' '),
  })),
];
const destino = path.resolve(__dirname, '..', '..', 'plantillas', 'catalogo.json');
fs.writeFileSync(destino, JSON.stringify(catalogo, null, 2) + '\n');
console.log(`Catálogo exportado: ${catalogo.length} tipos → plantillas/catalogo.json`);
