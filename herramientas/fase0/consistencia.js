/**
 * FASE 0 – Verificaciones automáticas de consistencia sobre cada escritura.
 * Prototipo de las reglas de cruce de la aplicación.
 *
 * Los mensajes NO incluyen nombres ni números de documento (van a docs/).
 *
 * Uso: node consistencia.js <carpeta_textos_compactos>   → escribe consistencia.json en el cwd
 */
'use strict';
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
const norm = (s) => s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Conversión de cifras en letras (español) a número, para comparar con "($n)"
const U = { CERO: 0, UN: 1, UNO: 1, UNA: 1, DOS: 2, TRES: 3, CUATRO: 4, CINCO: 5, SEIS: 6, SIETE: 7, OCHO: 8, NUEVE: 9, DIEZ: 10, ONCE: 11, DOCE: 12, TRECE: 13, CATORCE: 14, QUINCE: 15, DIECISEIS: 16, DIECISIETE: 17, DIECIOCHO: 18, DIECINUEVE: 19, VEINTE: 20, VEINTIUN: 21, VEINTIUNO: 21, VEINTIDOS: 22, VEINTITRES: 23, VEINTICUATRO: 24, VEINTICINCO: 25, VEINTISEIS: 26, VEINTISIETE: 27, VEINTIOCHO: 28, VEINTINUEVE: 29, TREINTA: 30, CUARENTA: 40, CINCUENTA: 50, SESENTA: 60, SETENTA: 70, OCHENTA: 80, NOVENTA: 90, CIEN: 100, CIENTO: 100, DOSCIENTOS: 200, TRESCIENTOS: 300, CUATROCIENTOS: 400, QUINIENTOS: 500, SEISCIENTOS: 600, SETECIENTOS: 700, OCHOCIENTOS: 800, NOVECIENTOS: 900 };
function letrasANumero(s) {
  const w = norm(s).replace(/[^A-Z ]/g, ' ').split(/\s+/).filter((x) => x && x !== 'Y' && x !== 'DE');
  let total = 0, actual = 0, ok = false;
  for (const x of w) {
    if (x in U) { actual += U[x]; ok = true; }
    else if (x === 'MIL') { actual = (actual || 1) * 1000; ok = true; }
    else if (x === 'MILLON' || x === 'MILLONES') { total += (actual || 1) * 1e6; actual = 0; ok = true; }
    else { total = 0; actual = 0; ok = false; }
  }
  return ok ? total + actual : null;
}

const VACIOS = [
  [/de estado civil\s*,/gi, 'estado civil'],
  [/estado civil\s*,\s*actividad/gi, 'estado civil'],
  [/actividad econ[oó]mica\s*,\s*(?:quien|en virtud|y manifest|identificad)/gi, 'actividad económica'],
  [/a los\s*,/gi, 'día de otorgamiento'],
  [/a los \(__\)/gi, 'día de otorgamiento'],
  [/residente en\s*,/gi, 'domicilio/residencia'],
];

const salida = {};
let cifrasComparadas = 0, cifrasDistintas = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.txt'))) {
  const t = fs.readFileSync(path.join(dir, f), 'utf8');
  const N = norm(t);
  const p = [];

  // 1) Valor en letras vs. número
  for (const m of N.matchAll(/((?:[A-Z]+ ){1,14}?)(?:DE )?PESOS(?: M\/?CTE| MONEDA CORRIENTE)?\.?\s*\(\$\s*([\d.]+)\)/g)) {
    const palabras = m[1].trim().split(' ');
    let valor = null;
    for (let k = 0; k < palabras.length; k++) { valor = letrasANumero(palabras.slice(k).join(' ')); if (valor !== null) break; }
    const numero = parseInt(m[2].replace(/\./g, ''), 10);
    if (valor !== null) { cifrasComparadas++; if (valor !== numero) cifrasDistintas++; }
    if (valor !== null && valor !== numero) p.push(`Valor en letras (${valor.toLocaleString('es-CO')}) distinto del número ($${m[2]})`);
  }

  // 2) Comparecientes de la carátula vs. cuerpo (solo personas naturales)
  const carat = (t.match(/PERSONAS QUE INTERVIENEN EN EL ACTO([\s\S]*?)C[OÓ]DIGO DE LA NOTAR/i) || [, ''])[1];
  const cuerpo = t.slice(t.search(/C[OÓ]DIGO DE LA NOTAR/i) + 20);
  const cuerpoN = norm(cuerpo);
  for (const m of carat.matchAll(/([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ .]{5,60}?)\s+(?:CC\.?\s*|C\.C\.\s*(?:No\.?)?\s*|NUIP\.?\s*)?(\d{1,3}(?:\.\d{3}){1,3})(?!-)/g)) {
    if (/NIT|S\.A|SAS/.test(m[1])) continue;
    const nombre = norm(m[1]).replace(/.*(?:POR|DE|:)\s+/, '').replace(/\.$/, '').trim();
    if (!cuerpo.includes(m[2])) p.push('CRÍTICO: el documento de un compareciente en la carátula no aparece en el cuerpo');
    else if (nombre.split(' ').length >= 2 && !cuerpoN.includes(nombre)) p.push('El nombre de un compareciente en la carátula no aparece igual en el cuerpo');
  }

  // 3) Matrícula de la carátula vs. cuerpo
  const espec = (t.match(/ESPECIFICACI[\s\S]*?(?:En la ciudad|Compareci|PRIMER ACTO)/i) || [''])[0];
  const resto = t.slice(t.indexOf(espec) + espec.length);
  for (const m of espec.matchAll(/MATR[IÍ]CULA[^:]*:\s*([\dA-Z]{2,4}-\d+)/gi)) {
    if (!resto.includes(m[1])) p.push('CRÍTICO: una matrícula de la carátula no aparece en el cuerpo');
  }

  // 4) Notario titular vs. encargado
  const firmaTitular = /EL NOTARIO,\s*\n\s*LUIS IGNACIO/i.test(t);
  const firmaEncargada = /LA NOTARIA E,/i.test(t);
  const encabezadoTitular = /(?:notario titular en (?:el )?ejercicio es el doctor|cuyo titular es el doctor|Notario Titular en ejercicio es el Doctor) LUIS IGNACIO/i.test(t);
  const encabezadoEncargada = /Notaria Encargada/i.test(t.slice(0, 3000));
  const diferentesMomentos = /Articulo 40 Decreto 960|diferentes momentos/i.test(t);
  if (encabezadoTitular && firmaEncargada && !firmaTitular && !diferentesMomentos) p.push('El encabezado cita al notario titular pero firma la notaria encargada');
  if (encabezadoEncargada && firmaTitular && !firmaEncargada && !diferentesMomentos) p.push('El encabezado cita a la notaria encargada pero firma el notario titular');

  // 5) Espacios sin diligenciar
  for (const [r, campo] of VACIOS) if (r.test(t)) p.push(`Espacio sin diligenciar: ${campo}`);

  // 6) Cifras mal formadas
  if (/\$\d{1,3}(?:\.\d{3})*\.\d{4,}/.test(t)) p.push('CRÍTICO: cifra mal formada (grupo de miles con 4 dígitos)');
  if (/\$\s?\d{1,3}(?:\.\d{3})*\.\s+\d{3}/.test(t)) p.push('Cifra con espacio dentro del número');

  // 7) Número de escritura sin asignar (borrador)
  if (/ESCRITURA P[UÚ]BLICA N[UÚ]MERO:?\s*\n/i.test(t)) p.push('Borrador: número y fecha de escritura sin asignar');

  salida[f] = [...new Set(p)];
}
salida.__resumen = { cifrasComparadas, cifrasDistintas };
fs.writeFileSync('consistencia.json', JSON.stringify(salida, null, 1));
console.log(`Consistencia: ${Object.values(salida).reduce((a, b) => a + b.length, 0)} hallazgos.`);
