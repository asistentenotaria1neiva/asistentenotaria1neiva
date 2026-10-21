/**
 * Modelos limpios por tipo de escritura.
 *
 * Toma la escritura elegida como mejor ejemplo de cada tipo, reemplaza todos los datos del
 * caso por marcadores {{dato}} y conserva literalmente el resto del texto de la notaría.
 * Si el tipo solo existe combinado con otros actos, extrae su sección (con carátula y cierre).
 *
 * Las tablas de reemplazo contienen los datos reales: viven en datos_locales/modelos/*.js
 * (excluida del repositorio). Aquí solo está la lógica.
 *
 * Salida (sin datos personales):
 *   plantillas/modelos/fuentes/<tipo>.plantilla   texto con marcadores
 *   plantillas/modelos/docx/<tipo>.docx           Word con el formato de la notaría
 *
 * Uso: node herramientas/plantillas/crear_modelos.js [tipo]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { construirDocx } = require('./construir');

const RAIZ = path.resolve(__dirname, '..', '..');
const CONFIG = path.join(RAIZ, 'datos_locales', 'modelos');
const COMPACTO = path.join(RAIZ, 'datos_locales', 'fase0', 'compacto');
const MAPA = JSON.parse(fs.readFileSync(path.join(RAIZ, 'datos_locales', 'fase0', 'archivos_reales.json'), 'utf8'));
const SALIDA = path.join(RAIZ, 'plantillas', 'modelos');

// Fechas de normas citadas en el texto fijo de la notaría (no son datos del caso)
const FECHAS_NORMAS = /(Ley|Decreto|Circular|Resoluci[oó]n|Instrucci[oó]n)( No\.)?[^.]{0,40}$/i;

// Textos fijos de la notaría que contienen números
const PERMITIDOS = ['CODIGO DE LA NOTARIA 410010001', 'CÓDIGO DE LA NOTARIA 410010001'];

const sinTilde = (w) => w.normalize('NFD').replace(/[̀-ͯ]/g, '');

function textoFuente(id) {
  const archivo = MAPA[id];
  if (!archivo) throw new Error(`No se encontró el archivo real de ${id} en el mapa local.`);
  return fs.readFileSync(path.join(COMPACTO, archivo.replace(/\.docx$/i, '.txt')), 'utf8').replace(/ /g, ' ').replace(/\r/g, '');
}

let _vocabulario;
/** Palabras en mayúsculas que aparecen en 6 o más escrituras distintas: texto fijo de la notaría, no nombres */
function vocabularioNotarial() {
  if (_vocabulario) return _vocabulario;
  const cuenta = new Map();
  for (const f of fs.readdirSync(COMPACTO)) {
    const palabras = new Set((fs.readFileSync(path.join(COMPACTO, f), 'utf8').match(/[A-ZÁÉÍÓÚÑ]{3,}/g) ?? []).map(sinTilde));
    for (const w of palabras) cuenta.set(w, (cuenta.get(w) ?? 0) + 1);
  }
  _vocabulario = new Set([...cuenta].filter(([, n]) => n >= 6).map(([w]) => w));
  return _vocabulario;
}

/**
 * Recorta el texto a las secciones indicadas. `secciones` es una lista de pares [desde, hasta]
 * (expresiones regulares; `hasta` null = hasta el final). Se concatenan en orden.
 */
function recortar(t, secciones) {
  return secciones.map(([desde, hasta]) => {
    const i = desde === 0 ? 0 : t.search(desde);
    if (i < 0) throw new Error(`No se encontró el inicio de sección ${desde}`);
    const resto = t.slice(i);
    if (!hasta) return resto;
    const j = resto.slice(1).search(hasta);
    if (j < 0) throw new Error(`No se encontró el fin de sección ${hasta}`);
    return resto.slice(0, j + 1);
  }).join('\n');
}

function aplicar(t, lista) {
  for (const [buscar, reemplazo] of lista ?? []) {
    if (typeof buscar === 'string') {
      if (!t.includes(buscar)) throw new Error(`Reemplazo sin coincidencia: "${buscar.slice(0, 50)}"`);
      t = t.split(buscar).join(reemplazo);
    } else {
      const antes = t;
      t = t.replace(buscar, reemplazo);
      if (antes === t) throw new Error(`Reemplazo sin coincidencia: ${buscar}`);
    }
  }
  return t;
}

/**
 * Datos de comparecencia de cada persona: alrededor de cada aparición de su documento
 * reemplaza domicilio, lugar de expedición, estado civil y actividad por marcadores.
 * personas: [nombre, documento, rol, { dom, exp, estado, act }]
 */
function reemplazarComparecencias(t, personas) {
  const CAMPOS = { dom: 'domicilio', exp: 'lugar_expedicion', estado: 'estado_civil', act: 'actividad_economica' };
  for (const [, doc, rol, det] of personas ?? []) {
    if (!det || !doc) continue;
    let desde = 0;
    let usado = false;
    for (;;) {
      const i = t.indexOf(doc, desde);
      if (i < 0) break;
      // Solo en frases de comparecencia ("…número <documento>"), no en la lista de la carátula
      if (!/(n[uú]mero|ciudadan[ií]a No\.)\s*$/.test(t.slice(Math.max(0, i - 20), i))) { desde = i + doc.length; continue; }
      const a = Math.max(0, i - 170);
      const b = Math.min(t.length, i + 280);
      let seg = t.slice(a, b);
      for (const [clave, campo] of Object.entries(CAMPOS)) {
        if (!det[clave]) continue;
        // El domicilio va antes del documento; los demás datos, después
        const k = clave === 'dom' ? seg.lastIndexOf(det[clave], seg.indexOf(doc)) : seg.indexOf(det[clave], seg.indexOf(doc));
        if (k >= 0) { seg = seg.slice(0, k) + `{{${campo}_${rol}}}` + seg.slice(k + det[clave].length); usado = true; }
      }
      t = t.slice(0, a) + seg + t.slice(b);
      desde = a + seg.indexOf(doc) + doc.length;
    }
    if (!usado) throw new Error(`No se encontraron los datos de comparecencia de ${rol}`);
  }
  return t;
}

/** Personas: [nombre, documento, rol] → {{nombre_rol}}, {{documento_rol}} */
function reemplazosPersonas(personas) {
  const r = [];
  for (const [nombre, doc, rol] of personas ?? []) {
    if (doc) r.push([doc, `{{documento_${rol}}}`]);
    r.push([nombre, `{{nombre_${rol}}}`]);
  }
  return r;
}

function limpiezaGeneral(t) {
  return t
    .replace(/\r/g, '')
    // Un salto de hoja a mitad de frase une las dos líneas
    .replace(/([^.:\s])[ \t]*\n[ \t]*Hoja No\.? ?\d+\.?[ \t]*\n?/g, '$1 ')
    .replace(/^.*MERGEFORMAT.*\n/gm, '')
    .replace(/^\s*Hoja No\.? ?\d+\.?\s*$/gim, '')
    .replace(/Hoja No\.? ?\d+\.\s*/g, '')
    .replace(/^[ \t]*(Aa\d{6,}[ ,.;y-]*)+$/gm, '')
    .replace(/(hojas de papel notarial n[uú]meros:?)[^\n]*/gi, '$1 {{hojas_papel_notarial}}')
    .replace(/(DERECHOS NOTARIALES:)[^\n]*/g, '$1 {{derechos_notariales}}')
    .replace(/(RETEFUENTE:)[^\n]*/g, '$1 {{retefuente}}')
    .replace(/(LIBRO DE VARIOS:)[^\n]*/g, '$1 {{libro_varios}}')
    .replace(/Resoluci[oó]n No\.? ?\d{4}-\d{6}-\d del \d{1,2} de \w+ de \d{4}/g, 'Resolución No. {{resolucion_tarifas}}')
    .replace(/^(ESCRITURA P[UÚ]BLICA N[UÚ]MERO:).*$/m, '$1 {{numero_escritura_letras}}')
    .replace(/^(FECHA DE OTORGAMIENTO:).*$/m, '$1 {{fecha_otorgamiento_letras}}')
    .replace(/LUIS IGNACIO VIVAS CEDE[ÑN]O/g, '{{nombre_notario}}')
    .replace(/[ \t]+-{2,}[ \t]*$/gm, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/^[ \t]+/gm, '')
    .replace(/\n{2,}/g, '\n');
}

/** Formato del constructor: carátula sin relleno, títulos de acto y bloque de firmas */
function marcar(t) {
  const lineas = t.split('\n').filter((l) => l.trim());
  const salida = [];
  let enCaratula = true;
  let enFirmas = false;
  for (let l of lineas) {
    l = l.trim();
    // Líneas que la configuración ya marcó
    if (/^(## |### |!!|@@)/.test(l)) { if (/^## /.test(l)) enCaratula = false; salida.push(l); continue; }
    if (/^(En la ciudad|Compareci|PRIMER ACTO)/i.test(l)) enCaratula = false;
    if (!enCaratula && /^(EL|LA|LOS|LAS) (OTORGANTES?|COMPARECIENTES?|NOTARI[OA]|PODERDANTES?|APODERAD[OA]S?)\b.*,$/i.test(l)) enFirmas = true;
    if (/^(ESCRITURA P|FECHA DE OTORGAMIENTO|PERSONAS QUE INTERVIENEN|C[OÓ]DIGO DE LA NOTAR|ESPECIFICACI[OÓ]N)/i.test(l)) { salida.push(`### ${l}`); continue; }
    if (/^(PRIMER|SEGUNDO|TERCER|CUARTO|QUINTO|SEXTO) ACTO\b/i.test(l)) { salida.push(`## ${l}`); continue; }
    if (enFirmas) {
      if (/^(EL|LA|LOS|LAS) [A-ZÁÉÍÓÚÑ ]+,$/.test(l)) salida.push('!!', `!! ${l}`);
      else if (/^\{\{nombre_/.test(l)) salida.push('!!', '!!', '!! ______________________________________', `!! ${l}`);
      else salida.push(`!! ${l.replace(/\bSI NO\b/, 'SI ___ NO ___').replace(/^Nacional Extranjera$/, 'Nacional ___ Extranjera ___')}`);
      continue;
    }
    if (enCaratula && !/^(MATR[IÍ]CULA|C[EÉ]DULA CATASTRAL|NOMBRE O DIRECCI|OFICINA DE REGISTRO)/i.test(l)) { salida.push(`!! ${l}`); continue; }
    salida.push(l);
  }
  return salida.join('\n');
}

/** Verificación: ningún dato real ni patrón de dato personal en la salida */
function verificar(salida, cfg, reemplazos) {
  const problemas = [];
  for (const [buscar] of reemplazos) {
    if (typeof buscar === 'string' && buscar.length >= 4 && !buscar.includes('{{') && salida.includes(buscar)) problemas.push(`queda el valor real "${buscar}"`);
  }
  // Datos que se eliminaron con reemplazos amplios (p. ej., listas de personas)
  for (const dato of cfg.ausentes ?? []) if (salida.includes(dato)) problemas.push(`queda el dato real "${dato}"`);
  const sinMarcadores = salida.replace(/\{\{[^}]+\}\}/g, '·');
  const patrones = [
    [/\b\d{1,3}(?:\.\d{3}){2,3}\b/g, 'número de documento o valor'],
    [/\$\s?\d[\d.,]{2,}/g, 'valor en pesos'],
    [/\b\d{2,3}[A-Z]?\s?-\s?\d{3,7}\b/g, 'matrícula'],
    [/\b\d{9,30}\b/g, 'número largo (catastral, NUIP, teléfono)'],
    [/\b\d{1,2}\s+de\s+[A-Za-záéíóú]+\s+(?:de|del)\s+\d{4}\b/gi, 'fecha'],
    [/\b(?:CALLE|CARRERA|TRANSVERSAL|DIAGONAL|AVENIDA|KRA|CRA|CLL)\.?\s+\d+/gi, 'dirección'],
    [/\b(?:escritura p[uú]blica|escritura)\s+(?:n[uú]mero|No\.?)\s+\d+/gi, 'número de escritura citada'],
    [/\b(?:lote|manzana|casa|apartamento|torre|bloque)\s+(?:No\.?\s*)?\d+/gi, 'nomenclatura del inmueble'],
    [/@[a-z0-9-]+\.[a-z]/gi, 'correo electrónico'],
    [/\b3\d{2}\s?\d{3}\s?\d{4}\b/g, 'teléfono'],
  ];
  for (const [re, nombre] of patrones) {
    for (const m of sinMarcadores.matchAll(re)) {
      const antes = sinMarcadores.slice(Math.max(0, m.index - 60), m.index);
      if (nombre === 'fecha' && FECHAS_NORMAS.test(antes)) continue;
      const ctx = sinMarcadores.slice(Math.max(0, m.index - 50), m.index + m[0].length + 15).replace(/\s+/g, ' ');
      if ([...PERMITIDOS, ...(cfg.permitidos ?? [])].some((p) => ctx.includes(p))) continue;
      problemas.push(`${nombre}: "…${ctx}…"`);
    }
  }
  const vocabulario = vocabularioNotarial();
  const sospechosas = new Set();
  for (const m of sinMarcadores.matchAll(/(?<!\p{L})[A-ZÁÉÍÓÚÑ]{3,}(?!\p{L})/gu)) {
    if (!vocabulario.has(sinTilde(m[0])) && !(cfg.revisadas ?? []).includes(m[0]) && !(cfg.permitidos ?? []).some((p) => p.includes(m[0]))) sospechosas.add(m[0]);
  }
  if (sospechosas.size) problemas.push(`palabras en mayúsculas poco frecuentes (¿nombres?): ${[...sospechosas].join(', ')}`);
  return problemas;
}

async function crear(tipo) {
  const cfg = require(path.join(CONFIG, `${tipo}.js`));
  let t = textoFuente(cfg.fuente);
  if (cfg.secciones) t = recortar(t, cfg.secciones);
  const reemplazos = [...(cfg.reemplazos ?? []), ...reemplazosPersonas(cfg.personas)];
  t = aplicar(t, cfg.reemplazos);
  t = reemplazarComparecencias(t, cfg.personas);
  t = aplicar(t, reemplazosPersonas(cfg.personas));
  t = limpiezaGeneral(t);
  t = aplicar(t, cfg.despues);
  const marcado = marcar(t);
  const problemas = verificar(marcado, cfg, reemplazos);
  const cabecera = [
    `// MODELO LIMPIO – ${cfg.titulo}`,
    `// Fuente: ${cfg.fuente} (ver plantillas/modelos/INDICE.md). Datos del caso reemplazados por {{marcadores}}; el resto es el texto literal de la notaría.`,
    '// Estado: PENDIENTE DE APROBACIÓN DEL NOTARIO.',
    ...(cfg.notas ?? []).map((n) => `// Nota: ${n}`),
  ].join('\n');
  fs.mkdirSync(path.join(SALIDA, 'fuentes'), { recursive: true });
  fs.mkdirSync(path.join(SALIDA, 'docx'), { recursive: true });
  fs.writeFileSync(path.join(SALIDA, 'fuentes', `${tipo}.plantilla`), `${cabecera}\n${marcado}\n`);
  fs.writeFileSync(path.join(SALIDA, 'docx', `${tipo}.docx`), await construirDocx(marcado, `Modelo – ${cfg.titulo}`));
  const marcadores = [...new Set((marcado.match(/\{\{[^}]+\}\}/g) ?? []).map((m) => m.slice(2, -2)))];
  return { tipo, titulo: cfg.titulo, fuente: cfg.fuente, problemas, marcadores };
}

/** Índice de modelos (solo IDs y alias del catálogo; ningún dato real) */
function escribirIndice(resultados) {
  const { TIPOS, ARCHIVOS } = require('../fase0/catalogo');
  const alias = (id) => ARCHIVOS.find((a) => a.id === id)?.alias ?? '';
  const incluidos = {
    liquidacion_sociedad_conyugal: ['divorcio_civil', 'cesacion_efectos_civiles'],
    liquidacion_sociedad_patrimonial: ['union_marital'],
    constitucion_patrimonio: ['compraventa_vis'],
  };
  const l = [
    '# Modelos limpios por tipo de escritura',
    '',
    '> Estado: **PENDIENTE DE APROBACIÓN DEL NOTARIO**. Generado por `npm run plantillas:modelos` (no editar a mano).',
    '',
    'Para cada tipo de escritura encontrado en las plantillas de la notaría se eligió **un solo ejemplo** (el mejor) y se convirtió en modelo:',
    'todos los datos del caso (nombres, documentos, domicilios, estado civil, matrículas, cédulas catastrales, direcciones, linderos, áreas,',
    'valores, fechas, números de escrituras, juzgados, radicados, cuentas, placas) quedaron como `{{marcador}}`, y el resto es el **texto literal de la notaría**.',
    '',
    '- Fuentes con marcado: `fuentes/<tipo>.plantilla` (cada una indica al inicio la fuente, notas y correcciones propuestas).',
    '- Word con el formato de la notaría (carta, márgenes, Arial 12, relleno de guiones, firmas con formato PEP): `docx/<tipo>.docx`.',
    '- Las tablas de reemplazo contienen los datos reales y **no** están en el repositorio (`datos_locales/modelos/`).',
    '- Verificación automática en cada generación: ningún valor reemplazado queda en el texto; no quedan patrones de cédula, NIT, matrícula,',
    '  cédula catastral, fechas (salvo las de normas), direcciones, teléfonos, correos ni nombres en mayúsculas fuera del vocabulario notarial.',
    '  Además se verificó contra los 194 nombres y 675 números de identificación de las 72 escrituras: sin coincidencias (solo el NIT público',
    '  del Banco Agrario en la minuta de ese banco).',
    '',
    '## Criterios de elección',
    '',
    '1. Sin errores detectados en la FASE 0 (o con errores corregibles, marcados).',
    '2. Completo (encabezado, comparecencia, cláusulas, comprobantes, cierre y firmas).',
    '3. Acto independiente; si el tipo solo existe combinado con otros actos, se extrajo su sección con la carátula y el cierre.',
    '4. Formato vigente de la notaría y el ejemplo más reciente.',
    '',
    '## Modelos',
    '',
    '| Tipo | Modelo | Fuente elegida | Otros ejemplos del tipo | Marcadores |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const r of resultados) {
    const t = TIPOS.find((x) => x.id === r.tipo);
    const otros = ARCHIVOS.filter((a) => a.tipos.includes(r.tipo) && a.id !== r.fuente).map((a) => a.id);
    l.push(`| ${t?.nombre ?? r.tipo} | [${r.tipo}](fuentes/${r.tipo}.plantilla) · [docx](docx/${r.tipo}.docx) | ${r.fuente} – ${alias(r.fuente)} | ${otros.join(', ') || '—'} | ${r.marcadores.length} |`);
  }
  l.push('', '## Por qué se eligió cada ejemplo y qué hay que revisar', '');
  for (const r of resultados) {
    const cfg = require(path.join(CONFIG, `${r.tipo}.js`));
    l.push(`### ${r.titulo}`, '', `- **Fuente:** ${r.fuente} – ${alias(r.fuente)}`, `- **Motivo:** ${cfg.motivo}`);
    for (const n of cfg.notas ?? []) l.push(`- ${n}`);
    l.push(`- **Marcadores:** ${r.marcadores.map((m) => `\`${m}\``).join(', ')}`, '');
  }
  l.push('## Tipos incluidos dentro de otros modelos', '');
  for (const [tipo, en] of Object.entries(incluidos)) l.push(`- **${TIPOS.find((x) => x.id === tipo)?.nombre ?? tipo}**: dentro de ${en.map((e) => `\`${e}\``).join(' y ')}.`);
  const sinModelo = TIPOS.filter((t) => !resultados.some((r) => r.tipo === t.id) && !incluidos[t.id]);
  l.push('', `## Tipos sin ejemplo en la carpeta (${sinModelo.length})`, '',
    'No se redactaron desde cero (regla del proyecto). La notaría debe entregar un ejemplo de cada uno; ver prioridades en `docs/plantillas/CHECKLIST_PLANTILLAS.md`.', '',
    sinModelo.map((t) => `${t.nombre} (${t.prioridad})`).join(' · '), '');
  fs.writeFileSync(path.join(SALIDA, 'INDICE.md'), l.join('\n'));
}

async function principal() {
  const solo = process.argv[2];
  const tipos = fs.readdirSync(CONFIG).filter((f) => /^[a-z_]+\.js$/.test(f)).map((f) => f.replace(/\.js$/, '')).filter((x) => !solo || x === solo);
  let conProblemas = 0;
  const resultados = [];
  for (const tipo of tipos) {
    try {
      const r = await crear(tipo);
      resultados.push(r);
      if (r.problemas.length) { conProblemas++; console.log(`\n✖ ${tipo}\n  - ${r.problemas.join('\n  - ')}`); }
      else console.log(`✔ ${tipo}: ${r.marcadores.length} marcadores`);
    } catch (e) { conProblemas++; console.log(`\n✖ ${tipo}: ${e.message}`); }
  }
  if (!solo && !conProblemas) escribirIndice(resultados);
  if (conProblemas) { console.log(`\n${conProblemas} modelo(s) con observaciones.`); process.exitCode = 1; }
}

principal();
