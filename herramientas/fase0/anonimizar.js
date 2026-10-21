/**
 * FASE 0 – Anonimización de las copias de trabajo (Ley 1581 de 2012).
 *
 * Entrada : carpeta con los textos extraídos de las escrituras (datos reales).
 * Salida  : copias anonimizadas + informe de residuos para revisión humana.
 *
 * La anonimización es AUTOMÁTICA y por eso se acompaña de un informe de
 * "posibles residuos" (secuencias en mayúsculas poco frecuentes que podrían
 * ser nombres). Ninguna copia debe salir de datos_locales/ sin que una persona
 * revise ese informe.
 *
 * Uso: node anonimizar.js <carpeta_textos> <carpeta_salida>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { ARCHIVOS } = require('./catalogo');

const [entrada, salida] = process.argv.slice(2);
if (!entrada || !salida) {
  console.error('Uso: node anonimizar.js <carpeta_textos> <carpeta_salida>');
  process.exit(1);
}
fs.mkdirSync(salida, { recursive: true });

const sinTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Expresión que acepta el nombre con o sin tildes y con espacios variables
const regexNombre = (n) => new RegExp(
  sinTildes(n).split(/\s+/).map((w) => w.split('').map((ch) => {
    const variantes = { A: 'AÁ', E: 'EÉ', I: 'IÍ', O: 'OÓ', U: 'UÚÜ', N: 'NÑ' }[ch.toUpperCase()];
    return variantes ? `[${variantes}${variantes.toLowerCase()}]` : escapar(ch);
  }).join('')).join('\\s+'), 'gi');

// Palabras que indican entidad, lugar o término jurídico (no persona natural)
const NO_PERSONA = /\b(S\.?A\.?S?|SAS|LTDA|BANCO|BANCOLOMBIA|DAVIVIENDA|BBVA|FIDUCIARIA|FIDEICOMISO|NOTAR[IÍ]A|REGISTRADUR[IÍ]A|OFICINA|MUNICIPIO|DEPARTAMENTO|CONJUNTO|URBANIZACI[OÓ]N|BARRIO|CALLE|CARRERA|CAJA|FONDO|ASOCIACI[OÓ]N|CONSTRUCCIONES|INVERSIONES|SOCIEDAD|CORPORACI[OÓ]N|INSTITUTO|JUZGADO|SUPERINTENDENCIA|REP[UÚ]BLICA|PREDIO|VEREDA|LOTE|MANZANA|R[IÍ]O|QUEBRADA|CONDOMINIO|EDIFICIO|CENTRO|PROYECTO|CIUDADELA|ETAPA|TORRE|APARTAMENTO|CASA|LOCAL|PARQUEADERO|BODEGA|COMFAMILIAR|COLSUBSIDIO|CONSTRUESPACIOS|ADMINISTRACI[OÓ]N|PATRIMONIO|AUT[OÓ]NOMO|VIVIENDA|FAMILIAR|HIPOTECA|COMPRAVENTA|ACTO|ESCRITURA|C[EÉ]DULA|MATR[IÍ]CULA|SECRETAR[IÍ]A|ALCALD[IÍ]A|MINISTERIO|COMIT[EÉ]|ICA|ICBF|INCORA|CURADUR[IÍ]A|NIT|HUILA|NEIVA|COLOMBIA|BOGOT[AÁ]|PALERMO|RIVERA|CAMPOALEGRE|ACEVEDO|PITALITO|GARZ[OÓ]N|TELLO|AIPE|YAGUAR[AÁ]|GIGANTE|PLATA|FLORENCIA|CAQUET[AÁ]|TOLIMA|IBAGU[EÉ]|CUNDINAMARCA|DIOS|SUR|NORTE|ORIENTE|OCCIDENTE|M\/CTE|PESOS|SIN|CUANT[IÍ]A|VALOR|ESPECIFICACI[OÓ]N|ORDEN|SANTA|SAN)\b/i;

// Palabras que nunca forman parte de un nombre de persona en estas escrituras
// (países de las autorizaciones de salida, vehículos y términos técnicos/jurídicos poco frecuentes)
const NO_NOMBRE = new Set(('ARABIA SAUDITA BURKINA FASO EMIRATOS ARABES UNIDOS GUINEA ECUATORIAL ISLAS MARSHALL SALOMON PAISES BAJOS PAPUA NUEVA ' +
  'REINO UNIDO SANTO TOME SIERRA LEONA SRI LANKA TIMOR ORIENTAL BOSNIA HERZEGOVINA COSTA MARFIL SUDAN ' +
  'HIJUELAS HIJUELA OPONIBILIDAD CONTRATO FIDUCIARIO ENCARGO BIFAMILIAR MULTIFAMILIAR BODEGAS APARTAMENTOS PEDIATRA INTENSIVISTA CAMPESTRE PORTAL MONTE ' +
  'CAPITAN EJERCITO NACIONAL ALTA TENSION AZUL NEGRO SERVICIO MOTOCICLETA PASAJEROS GRIS METALICO CABINADO COMBUSTIBLE PEQUENOS PRODUCTORES ' +
  'SALUDABLES CONSIDERACIONES PREVIAS AGROPECUARIA DELIMITADA TOAL ADJUDICADO ASIGNACIONES FORZOSAS CONSTRUINVERSIONES ALTAIR SURABASTOS ' +
  'ACCION FIDUCIARIA ROSADO').split(' '));

// Funcionarios notariales que actúan en su cargo (se conservan: son variables de la plantilla)
const FUNCIONARIOS = ['LUIS IGNACIO VIVAS CEDEÑO', 'CAROLINA DUERO VARGAS'];

const NOMBRE = "[A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ'´]+(?:\\s+(?:DE\\s+LA\\s+|DE\\s+LOS\\s+|DEL\\s+|DE\\s+)?[A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ'´]+){1,5}";
const NOMBRE_TITULO = "[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+(?:\\s+(?:de\\s+la\\s+|del\\s+|de\\s+)?[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+){1,4}";
const DISPARADORES = [
  'dijo ser,?\\s*(?:[a-z]\\.\\s*)?', 'quienes dijeron ser,?\\s*(?:[a-z]\\.\\s*)?', 'señor(?:a|es|as)?\\s+', 'compra hecha (?:a|al|a la)\\s+(?:señor(?:a)?\\s+)?',
  'a favor de(?:l)?\\s+(?:la\\s+|el\\s+)?(?:menor\\s+(?:de edad\\s+)?)?', 'causante\\s+', 'padre\\s+', 'madre\\s+', 'progenitora?\\s+', 'hij[oa]s?\\s+', 'nombres? de\\s+',
  'representaci[oó]n de(?:l|\\s+la)?\\s+', 'menor(?:\\s+de\\s+edad)?\\s+', 'doctor(?:a)?\\s+', 'compañer[oa]s? permanentes?\\s+', 'c[oó]nyuges?\\s+', 'Juez\\s+',
  'otorgado (?:a|por)\\s+', 'Presentes?,?\\s+(?:la señora\\s+|el señor\\s+)?', 'predios de\\s+', 'con casa y solar de\\s+', 'propiedades .{0,20}de\\s+', 'Con el otorgante, señor\\s+',
  'conferido por\\s+', 'adjudica(?:do)?\\s+(?:a|al)\\s+', 'HIJUELA (?:PRIMERA|SEGUNDA|TERCERA)[^A-Z]{0,30}', 'PARA (?:EL|LA) COMPAÑER[OA] PERMANENTE\\s+', 'Para\\s+', 'TITULAR DEL ACTO:\\s*', 'PERSONA DE APOYO:\\s*',
  'REPRESENTAD[OA]S? POR:?\\s+', 'EN REPRESENTACI[OÓ]N DE\\s+', 'herederos?\\s+', 'asignatarios?\\s+', 'personas? de apoyo a las señoras\\s+', 'con\\s+', 'y\\s+', 'e\\s+',
];

function nombresDelTexto(texto) {
  const encontrados = new Set();
  const agregar = (n) => {
    n = n.replace(/\s+/g, ' ').trim().replace(/\s+(Y|E|CON|DE|DEL|LA)$/i, '');
    if (n.split(' ').length < 2 || n.length < 7 || NO_PERSONA.test(n)) return;
    // Si todas las palabras son vocabulario común de las escrituras, es una frase jurídica, no un nombre
    const palabras = sinTildes(n.toUpperCase()).split(' ').filter((w) => !['DE', 'DEL', 'LA', 'LOS'].includes(w));
    if (palabras.every((w) => (docFreq.get(w) || 0) >= 20)) return;
    if (FUNCIONARIOS.some((f) => sinTildes(f) === sinTildes(n.toUpperCase()))) return;
    encontrados.add(n);
  };
  // 1) Carátula: "NOMBRE  1.234.567"
  const caratula = (texto.match(/PERSONAS QUE INTERVIENEN EN EL ACTO([\s\S]*?)C[OÓ]DIGO DE LA NOTAR/i) || [, ''])[1];
  for (const m of caratula.matchAll(new RegExp(`(${NOMBRE})\\s*(?:—\\s*)?(?:C\\.?C\\.?\\s*(?:No\\.?)?\\s*|NUIP\\.?\\s*)?\\d{1,3}(?:\\.\\d{3}){1,3}`, 'g'))) {
    agregar(m[1].replace(/^.*?\b(?:POR|DE|EXOGENA%|\(ES\)|\(S\)|:)\s+/, '').replace(/^(?:VENDEDOR|COMPRADOR|ACREEDOR|HIPOTECANTE|TITULAR|PERSONA)\S*\s+/, ''));
  }
  // 2) Cuerpo: nombres en mayúsculas o en tipo título después de un disparador
  for (const d of DISPARADORES) {
    for (const m of texto.matchAll(new RegExp(`${d}(${NOMBRE})`, 'g'))) agregar(m[1]);
    const generico = ['con\\s+', 'y\\s+', 'e\\s+', 'Para\\s+'].includes(d);
    if (!generico) for (const m of texto.matchAll(new RegExp(`${d}(${NOMBRE_TITULO})`, 'g'))) agregar(m[1]);
  }
  // Ordenar de más largo a más corto para reemplazar primero los nombres completos
  return [...encontrados].sort((a, b) => b.length - a.length);
}

function anonimizar(texto) {
  const mapas = { NOMBRE: new Map(), DOC: new Map(), MATRICULA: new Map(), CATASTRAL: new Map(), DIRECCION: new Map(), TEL: new Map(), CORREO: new Map(), PLACA: new Map(), SERIAL: new Map(), CUENTA: new Map(), MOTOR: new Map() };
  const marca = (tipo, valor) => {
    const k = sinTildes(valor.toUpperCase().replace(/\s+/g, ' '));
    if (!mapas[tipo].has(k)) mapas[tipo].set(k, `[${tipo}_${String(mapas[tipo].size + 1).padStart(2, '0')}]`);
    return mapas[tipo].get(k);
  };
  let t = texto;
  // Correos y teléfonos (antes que los números)
  const correosInstitucionales = /SUPERNOTARIADO|NOTARIAPRIMERADENEIVA|notaria1neiva/i;
  t = t.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, (m) => (correosInstitucionales.test(m) ? m : marca('CORREO', m)));
  t = t.replace(/\b3\d{9}\b/g, (m) => marca('TEL', m));
  // Cuentas bancarias
  t = t.replace(/(cuenta[^.\n]{0,60}?No\.?\s*)(\d{6,})/gi, (_, a, n) => a + marca('CUENTA', n));
  // Seriales de registro civil e indicativos
  t = t.replace(/((?:indicativo serial|serial indicativo|serial)\s+(?:número\s+)?)(\d{5,})/gi, (_, a, n) => a + marca('SERIAL', n));
  t = t.replace(/(TOMO\s+\d+\s*-?\s*FOLIO\s+)(\d+)/gi, (_, a, n) => a + marca('SERIAL', n));
  // Vehículos
  t = t.replace(/(PLACA:\s*)([A-Z]{3}\d{2,3}[A-Z]?)/g, (_, a, p) => a + marca('PLACA', p));
  t = t.replace(/((?:CHASIS|MOTOR):?\s*)([A-Z0-9]{8,})/g, (_, a, p) => a + marca('MOTOR', p));
  // Matrículas inmobiliarias (200-3626, 50C-1513366)
  t = t.replace(/\b(\d{2,3}[A-Z]?-\d{3,7})\b/g, (m) => marca('MATRICULA', m));
  // Cédulas catastrales (15 a 30 dígitos)
  t = t.replace(/\b\d{15,30}\b/g, (m) => marca('CATASTRAL', m));
  // Documentos de identidad: números con 3+ grupos de miles que no son pesos
  t = t.replace(/(\$\s*)?\b\d{1,3}(?:\.\d{3}){2,3}\b/g, (m, pesos) => (pesos ? m : marca('DOC', m)));
  t = t.replace(/(NUIP\.?\s*|tarjeta de identidad número\s+|tarjeta profesional número\s+)([\d.]{6,})/gi, (_, a, n) => a + marca('DOC', n));
  // Direcciones
  t = t.replace(/\b(?:AVENIDA\s+)?(?:CALLE|CARRERA|TRANSVERSAL|DIAGONAL|AVENIDA|Calle|Carrera|Transversal|Diagonal|Avenida)\s+\d+[A-Z]?(?:\s?BIS)?(?:\s?[A-Z]\b)?(?:\s+SUR)?\s*(?:NÚMERO|NUMERO|No\.?|#|N°)\s*\d+[A-Z]?(?:\s?BIS)?(?:\s+SUR)?\s*-?\s*\d+[A-Z]?(?:\/\d+)?(?:\s+SUR)?(?:\s+P\b)?/g, (m) => marca('DIRECCION', m));
  // Nombres de personas
  for (const n of nombresDelTexto(t)) t = t.replace(regexNombre(n), () => marca('NOMBRE', n));
  const conteo = Object.fromEntries(Object.entries(mapas).map(([k, v]) => [k, v.size]));
  return { texto: t, conteo };
}

// Vocabulario común (palabras en mayúsculas presentes en muchos archivos) para detectar residuos
const textos = ARCHIVOS.map((a) => {
  const p = path.join(entrada, a.archivo.replace(/\.docx$/i, '.txt'));
  return { a, texto: fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null };
});
const docFreq = new Map();
for (const { texto } of textos) {
  if (!texto) continue;
  for (const w of new Set(sinTildes(texto).toUpperCase().match(/\b[A-Z]{3,}\b/g) || [])) docFreq.set(w, (docFreq.get(w) || 0) + 1);
}

const informe = [];
let totalResiduos = 0;
for (const { a, texto } of textos) {
  if (!texto) { informe.push(`## ${a.id}\n- No se encontró el texto extraído.`); continue; }
  const { texto: anon, conteo } = anonimizar(texto);
  const nombreSalida = `${a.id} - ${a.alias.replace(/[\\/:*?"<>|]/g, '_')}.txt`;
  const cabecera = `COPIA DE TRABAJO ANONIMIZADA AUTOMÁTICAMENTE – ${a.id}\nNo usar como escritura. Revisar el informe de residuos antes de compartir.\n${'='.repeat(70)}\n`;
  fs.writeFileSync(path.join(salida, nombreSalida), cabecera + anon);
  // Residuos: 2+ palabras en mayúsculas consecutivas, con al menos 2 palabras raras (≤ 3 archivos)
  const residuos = new Set();
  for (const m of anon.matchAll(/\b[A-ZÁÉÍÓÚÑ]{3,}(?:\s+[A-ZÁÉÍÓÚÑ]{3,}){1,4}\b/g)) {
    const raras = m[0].split(/\s+/).filter((w) => (docFreq.get(sinTildes(w)) || 0) <= 3);
    if (raras.length >= 2 && !NO_PERSONA.test(m[0])) residuos.add(m[0]);
  }
  // Segunda pasada: los residuos que no son países ni términos técnicos se tratan como nombres.
  // (Reemplazar de más en una copia de trabajo es inofensivo; reemplazar de menos, no.)
  let anon2 = anon;
  let n2 = 0;
  for (const r of [...residuos].sort((x, y) => y.length - x.length)) {
    const palabras = sinTildes(r).split(/\s+/);
    if (palabras.some((w) => NO_NOMBRE.has(w))) continue;
    anon2 = anon2.replace(regexNombre(r), () => `[NOMBRE_R${String(++n2).padStart(2, '0')}]`);
    residuos.delete(r);
  }
  if (n2) fs.writeFileSync(path.join(salida, nombreSalida), cabecera + anon2);
  totalResiduos += residuos.size;
  informe.push(`## ${a.id} – ${a.alias}\n- Reemplazos: ${Object.entries(conteo).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(', ') || 'ninguno'}\n- Posibles residuos para revisar (${residuos.size}): ${[...residuos].slice(0, 40).join(' · ') || 'ninguno'}`);
}
fs.writeFileSync(path.join(salida, '_INFORME_RESIDUOS.md'),
  `# Informe de anonimización automática\n\nGenerado: ${new Date().toISOString()}\n\n` +
  'Cada copia reemplaza nombres, documentos, matrículas, cédulas catastrales, direcciones, teléfonos, correos, placas, seriales y cuentas por marcadores ' +
  '([NOMBRE_01], [DOC_01]…). Los "posibles residuos" son secuencias en mayúsculas poco frecuentes que podrían ser nombres no detectados: **una persona debe revisarlos**.\n\n' +
  `Total de posibles residuos: ${totalResiduos}\n\n` + informe.join('\n\n') + '\n');
console.log(`Copias anonimizadas: ${textos.filter((x) => x.texto).length}. Posibles residuos a revisar: ${totalResiduos}.`);
