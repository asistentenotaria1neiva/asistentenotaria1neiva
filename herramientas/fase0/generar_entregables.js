/**
 * FASE 0 – Generación de entregables:
 *   docs/plantillas/CHECKLIST_PLANTILLAS.xlsx  (hojas "Checklist" e "Inventario de archivos")
 *   docs/plantillas/CHECKLIST_PLANTILLAS.md
 *   docs/plantillas/fichas/<tipo>.md
 *   datos_locales/fase0/MAPA_ARCHIVOS_REALES.md (correspondencia ID → nombre real; NO va al repositorio)
 *
 * Uso: node herramientas/fase0/generar_entregables.js <carpeta_origen> <carpeta_analisis_local>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { BLOQUES, ESP, TIPOS, ARCHIVOS } = require('./catalogo');

const [ORIGEN, LOCAL] = process.argv.slice(2);
const RAIZ = path.resolve(__dirname, '..', '..');
const DOCS = path.join(RAIZ, 'docs', 'plantillas');
const FICHAS = path.join(DOCS, 'fichas');
fs.mkdirSync(FICHAS, { recursive: true });

const leerJSON = (p, def) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : def);
const inventario = leerJSON(path.join(LOCAL, 'txt', '_inventario.json'), []);
const consistencia = leerJSON(path.join(LOCAL, 'consistencia.json'), {});
const normas = leerJSON(path.join(LOCAL, 'normas.json'), {});
const rasgos = leerJSON(path.join(LOCAL, 'rasgos.json'), []);

const txt = (a) => a.archivo.replace(/\.docx$/i, '.txt');
const invDe = (a) => inventario.find((r) => r.archivo === a.archivo) || {};
const rasgoDe = (a) => rasgos.find((r) => r.f === txt(a)) || {};
const porId = Object.fromEntries(ARCHIVOS.map((a) => [a.id, a]));
const tipoPorId = Object.fromEntries(TIPOS.map((t) => [t.id, t]));
const ORDEN_PRIORIDAD = { Alta: 0, Media: 1, Baja: 2 };
const fechaHoy = new Date().toISOString().slice(0, 10);

// Normaliza "LEY 258 de 1996" → "Ley 258 de 1996"
const normaCanonica = (n) => n.replace(/^LEY\b/i, 'Ley').replace(/^DECRETO LEY\b/i, 'Decreto Ley').replace(/^DECRETO\b/i, 'Decreto')
  .replace(/Decreto Ley 0019/i, 'Decreto Ley 19').replace(/Decreto 0019/i, 'Decreto Ley 19');

// Problemas consolidados por archivo (manuales del catálogo + automáticos)
function problemasDe(a) {
  const auto = consistencia[txt(a)] || [];
  const base = ['Escritura real con datos personales sin anonimizar (nombres, documentos, matrículas, direcciones).'];
  if (a.tipos.length > 1) base.push(`Combina ${a.tipos.length} actos: ${a.tipos.map((t) => tipoPorId[t].nombre.replace(/ \(tipo encontrado\)/, '')).join(' + ')}.`);
  return [...new Set([...base, ...a.problemas, ...auto])];
}
const esCritico = (p) => /CRÍTICO/.test(p);

// Estado y datos de cada tipo
const filasTipo = TIPOS.map((t) => {
  const fuentes = ARCHIVOS.filter((a) => a.tipos.includes(t.id));
  const independientes = fuentes.filter((a) => a.tipos.length === 1);
  const combinadas = fuentes.filter((a) => a.tipos.length > 1);
  const estado = fuentes.length ? '⚠️ Existe con problemas' : '❌ Falta';
  // Fuente sugerida: la marcada como canónica; si no, la de menos actos, sin duplicado y con menos problemas
  const puntaje = (a) => a.tipos.length * 100 + (a.duplicadoDe ? 50 : 0) + (problemasDe(a).some(esCritico) ? 500 : 0) + problemasDe(a).length;
  const recomendado = fuentes.find((a) => a.canonico) || [...fuentes].sort((x, y) => puntaje(x) - puntaje(y))[0];
  const varsEsp = (t.vars || []).flatMap((k) => ESP[k] || []);
  const obs = [];
  if (fuentes.length) {
    if (independientes.length) obs.push(`Independiente en: ${independientes.map((a) => a.id).join(', ')}.`);
    else obs.push('No existe como escritura independiente: solo aparece combinado con otros actos.');
    if (combinadas.length) obs.push(`Combinado en: ${combinadas.map((a) => a.id).join(', ')}.`);
    if (recomendado) obs.push(`Fuente sugerida para la plantilla: ${recomendado.id}.`);
    const dups = fuentes.filter((a) => a.duplicadoDe).map((a) => `${a.id}≈${a.duplicadoDe}`);
    if (dups.length) obs.push(`Duplicados: ${dups.join(', ')}.`);
    const criticos = fuentes.filter((a) => problemasDe(a).some(esCritico)).map((a) => a.id);
    if (criticos.length) obs.push(`Con errores críticos: ${criticos.join(', ')}.`);
    obs.push('Todas las fuentes son escrituras reales: deben convertirse en minuta con variables y aprobarse.');
  } else {
    obs.push('Solicitar a la notaría la minuta aprobada.');
  }
  if (t.nuevo) obs.push('Tipo no incluido en el catálogo base; encontrado en la carpeta.');
  return { t, fuentes, independientes, combinadas, estado, recomendado, varsEsp, obs };
});

// ---------------------------------------------------------------- XLSX
async function generarXlsx() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Automind';
  wb.created = new Date();
  const estiloEncabezado = (ws) => {
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
    ws.getRow(1).alignment = { vertical: 'middle', wrapText: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  };

  const ws = wb.addWorksheet('Checklist');
  ws.columns = [
    { header: 'Categoría', key: 'cat', width: 26 },
    { header: 'Tipo de escritura', key: 'tipo', width: 42 },
    { header: 'Estado', key: 'estado', width: 22 },
    { header: 'Archivo(s) en la carpeta', key: 'archivos', width: 60 },
    { header: 'Variables detectadas', key: 'vars', width: 60 },
    { header: 'Observaciones', key: 'obs', width: 70 },
    { header: 'Prioridad', key: 'prio', width: 10 },
  ];
  for (const f of filasTipo) {
    const r = ws.addRow({
      cat: f.t.categoria,
      tipo: f.t.nombre,
      estado: f.estado,
      archivos: f.fuentes.map((a) => `${a.id} – ${a.alias}`).join('\n'),
      vars: f.fuentes.length ? f.varsEsp.map((v) => v.nombre).join(', ') + (f.varsEsp.length ? ' + bloques comunes (encabezado, comparecientes, cierre)' : '') : '',
      obs: f.obs.join(' '),
      prio: f.t.prioridad,
    });
    r.alignment = { vertical: 'top', wrapText: true };
    const color = f.fuentes.length ? 'FFFFF2CC' : 'FFF8CBAD';
    r.getCell('estado').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    if (f.t.prioridad === 'Alta') r.getCell('prio').font = { bold: true };
  }
  estiloEncabezado(ws);

  const wi = wb.addWorksheet('Inventario de archivos');
  wi.columns = [
    { header: 'ID', key: 'id', width: 6 },
    { header: 'Ruta', key: 'ruta', width: 40 },
    { header: 'Nombre (alias anonimizado)', key: 'nombre', width: 60 },
    { header: 'Formato', key: 'formato', width: 9 },
    { header: 'Tamaño (KB)', key: 'kb', width: 11 },
    { header: 'Fecha de modificación', key: 'fecha', width: 20 },
    { header: 'Tipo(s) asignado(s)', key: 'tipos', width: 55 },
    { header: '¿Duplicado?', key: 'dup', width: 22 },
    { header: 'Estado de lectura', key: 'lectura', width: 14 },
    { header: 'Variante / contenido', key: 'variante', width: 60 },
    { header: 'Código de minuta (pie)', key: 'codigo', width: 28 },
    { header: 'Problemas detectados', key: 'problemas', width: 90 },
  ];
  for (const a of ARCHIVOS) {
    const inv = invDe(a);
    const dup = a.duplicadoDe ? `Sí – de ${a.duplicadoDe}` : (ARCHIVOS.some((b) => b.duplicadoDe === a.id) ? 'Tiene duplicado' : 'No');
    const codigo = (rasgoDe(a).elab || '').match(/[A-ZÁÉÍÓÚ ]+\d+\s*\/\s*MILAN/i);
    const r = wi.addRow({
      id: a.id,
      ruta: path.basename(ORIGEN) + '\\',
      nombre: a.alias + '.docx',
      formato: '.docx',
      kb: inv.tamano ? Math.round(inv.tamano / 1024) : '',
      fecha: inv.modificado ? inv.modificado.slice(0, 10) : '',
      tipos: a.tipos.length ? a.tipos.map((t) => tipoPorId[t].nombre).join(' + ') : 'Sin clasificar',
      dup,
      lectura: inv.estado === 'OK' ? 'Leído completo' : (inv.estado || 'Sin dato'),
      variante: a.variante,
      codigo: codigo ? codigo[0].trim() : '',
      problemas: problemasDe(a).map((p) => '• ' + p).join('\n'),
    });
    r.alignment = { vertical: 'top', wrapText: true };
    if (problemasDe(a).some(esCritico)) r.getCell('problemas').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8CBAD' } };
  }
  estiloEncabezado(wi);
  await wb.xlsx.writeFile(path.join(DOCS, 'CHECKLIST_PLANTILLAS.xlsx'));
}

// ---------------------------------------------------------------- MD
const celda = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
function generarMd() {
  const cubiertos = filasTipo.filter((f) => f.fuentes.length);
  const faltantes = filasTipo.filter((f) => !f.fuentes.length).sort((a, b) => ORDEN_PRIORIDAD[a.t.prioridad] - ORDEN_PRIORIDAD[b.t.prioridad]);
  const conCriticos = ARCHIVOS.filter((a) => problemasDe(a).some(esCritico));
  const fechasMod = [...new Set(inventario.map((r) => (r.modificado || '').slice(0, 10)))];
  const L = [];
  L.push('# Checklist de plantillas – Notaría Primera del Círculo de Neiva', '');
  L.push(`Generado el ${fechaHoy} por la Fase 0 del proyecto (Automind). Fuente: carpeta \`${path.basename(ORIGEN)}\` (solo lectura; no se modificó ningún archivo).`, '');
  L.push('## Resumen', '');
  L.push(`- **Archivos encontrados:** ${ARCHIVOS.length} (todos .docx, en una sola carpeta, sin subcarpetas). Todos se leyeron completos; ninguno está vacío o dañado.`);
  L.push(`- **Tipos en el catálogo:** ${TIPOS.length} (${TIPOS.filter((t) => !t.nuevo).length} del catálogo base, con afectación y patrimonio de familia separados en constitución y cancelación, + ${TIPOS.filter((t) => t.nuevo).length} tipos nuevos encontrados en la carpeta).`);
  L.push(`- **Tipos cubiertos:** ${cubiertos.length} · **Tipos faltantes:** ${faltantes.length}.`);
  const sinClasificar = ARCHIVOS.filter((a) => !a.tipos.length);
  L.push(`- **Archivos sin clasificar:** ${sinClasificar.length}${sinClasificar.length ? ' (ver lista abajo)' : ' (todos se clasificaron por su contenido)'}.`);
  L.push(`- **Archivos con errores críticos:** ${conCriticos.length} (${conCriticos.map((a) => a.id).join(', ')}).`, '');
  L.push('### Hallazgo principal', '');
  L.push('**Ninguno de los 72 archivos es una minuta limpia.** Todos son escrituras ya elaboradas para casos reales (2025‑2026), con nombres, cédulas, matrículas, direcciones y valores. Por eso todos los tipos existentes quedan en estado `⚠️ Existe con problemas` hasta que se conviertan en plantillas con variables y el notario las apruebe (Fase 1).', '');
  L.push('Otros hallazgos:', '');
  L.push(`- **Las escrituras son modulares.** Cada una tiene carátula → "PRIMER ACTO", "SEGUNDO ACTO"… → cierre común (datos personales, advertencias, otorgamiento, firmas con formato PEP). ${ARCHIVOS.filter((a) => a.tipos.length > 1).length} de los ${ARCHIVOS.length} archivos combinan 2 o más actos. El sistema debe armar la escritura por bloques de acto y no tener una plantilla por cada combinación.`);
  L.push('- **Las hipotecas a favor de entidades financieras son minutas del banco** ("HASTA AQUÍ LA MINUTA PRESENTADA"): Banco de Bogotá, Banco Agrario, BBVA, Davivienda, Bancolombia, Banco Caja Social y Fondo Nacional del Ahorro. Se manejarán como bloques de texto externos por entidad, versionados.');
  L.push('- **El nombre del archivo no siempre describe el contenido**: "ESCRITURA SUCESION EN VIDA2" es una *partición del patrimonio en vida* (no es una sucesión); los archivos "MENOR (1)" son *autorizaciones de salida del país*; el número inicial del nombre coincide con el código interno de la minuta del pie ("COMPRAVENTA 410/ MILAN").');
  L.push(`- **Fechas de modificación:** todos los archivos muestran ${fechasMod.join(', ')} (sincronización de OneDrive), así que la fecha no sirve para saber cuál versión es la más reciente. Las versiones se compararon por contenido.`);
  L.push('- **Errores reales encontrados** que la aplicación debe atrapar: cédula distinta entre carátula y cuerpo (F70), total de hijuela mal escrito "$466.8666.000" (F71), espacios sin diligenciar (F70, F71, F72), palabras mal escritas en fechas ("VEITISEIS", "VEITNISEIS", "SESIS"), texto arrastrado de otra minuta (F72).', '');
  const res = consistencia.__resumen || {};
  L.push(`- **Cifras en letras vs. números:** se compararon ${res.cifrasComparadas ?? '?'} cifras; ${res.cifrasDistintas ? res.cifrasDistintas + ' con diferencias' : 'no hubo diferencias'}.`, '');

  L.push('## Plantillas que la notaría debe entregar (faltantes), por prioridad', '');
  for (const p of ['Alta', 'Media', 'Baja']) {
    const lista = faltantes.filter((f) => f.t.prioridad === p);
    if (!lista.length) continue;
    L.push(`**Prioridad ${p}**`, '');
    for (const f of lista) L.push(`- [ ] ${f.t.nombre} _(${f.t.categoria.slice(3)})_`);
    L.push('');
  }
  L.push('Además, para los tipos que sí existen, la notaría debería confirmar **cuál es la versión vigente** de cada minuta (ver "Fuente sugerida" en la tabla) y entregar las **minutas bancarias vigentes** de cada entidad con la que trabaja.', '');

  L.push('## Archivos con problemas que el notario debe revisar', '');
  L.push('Primero los que tienen errores **críticos**; luego los demás con observaciones propias (además de contener datos reales, lo que aplica a todos).', '');
  const ordenados = [...ARCHIVOS].sort((a, b) => Number(problemasDe(b).some(esCritico)) - Number(problemasDe(a).some(esCritico)));
  for (const a of ordenados) {
    const propios = problemasDe(a).filter((p) => !/^Escritura real con datos personales/.test(p) && !/^Combina \d+ actos/.test(p) && !/^Borrador:/.test(p));
    if (!propios.length) continue;
    L.push(`- **${a.id}** – ${a.alias}${problemasDe(a).some(esCritico) ? ' 🔴' : ''}`);
    for (const p of propios) L.push(`  - ${p}`);
  }
  L.push('');
  L.push('### Archivos sin clasificar', '', sinClasificar.length ? sinClasificar.map((a) => `- ${a.id} – ${a.alias}`).join('\n') : 'Ninguno.', '');

  L.push('## Checklist por tipo de escritura', '');
  L.push('| Categoría | Tipo de escritura | Estado | Archivo(s) en la carpeta | Variables detectadas | Observaciones | Prioridad |');
  L.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const f of filasTipo) {
    const ficha = f.fuentes.length ? `[${f.t.nombre}](fichas/${f.t.id}.md)` : f.t.nombre;
    L.push(`| ${celda(f.t.categoria)} | ${ficha} | ${f.estado} | ${celda(f.fuentes.map((a) => a.id).join(', '))} | ${celda(f.varsEsp.map((v) => '`' + v.nombre + '`').join(', '))} | ${celda(f.obs.join(' '))} | ${f.t.prioridad} |`);
  }
  L.push('');
  L.push('## Inventario de archivos', '');
  L.push('Los nombres de archivo contienen nombres de clientes y abogados; aquí se muestran con iniciales entre corchetes. La correspondencia con el nombre real está solo en `datos_locales/fase0/MAPA_ARCHIVOS_REALES.md` (fuera del repositorio).', '');
  L.push('| ID | Nombre (alias) | Formato | Tamaño | Tipo(s) asignado(s) | ¿Duplicado? | Lectura | Variante |');
  L.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const a of ARCHIVOS) {
    const inv = invDe(a);
    const dup = a.duplicadoDe ? `Sí – de ${a.duplicadoDe}` : (ARCHIVOS.some((b) => b.duplicadoDe === a.id) ? 'Tiene duplicado' : 'No');
    L.push(`| ${a.id} | ${celda(a.alias)} | .docx | ${inv.tamano ? Math.round(inv.tamano / 1024) + ' KB' : ''} | ${celda(a.tipos.length ? a.tipos.map((t) => tipoPorId[t].nombre).join(' + ') : 'Sin clasificar')} | ${dup} | ${inv.estado === 'OK' ? 'Completa' : inv.estado || ''} | ${celda(a.variante)} |`);
  }
  L.push('', '---', '', '_Referencias normativas: ver cada ficha. Todas quedan como **"referencia normativa – pendiente de validar por el notario"**; esta checklist no afirma la vigencia de ninguna norma._', '');
  fs.writeFileSync(path.join(DOCS, 'CHECKLIST_PLANTILLAS.md'), L.join('\n'));
}

// ---------------------------------------------------------------- Fichas
const ES_INMUEBLE = (t) => t.categoria.startsWith('A.');
const COMUNES_CIERRE = [
  'Ley 1581 de 2012 y Decreto 1377 de 2013 (datos personales)',
  'Decreto 960 de 1970, art. 35 (corrección de errores por nueva escritura)',
  'Ley 223 de 1995, art. 232 y Decreto 650 de 1996, art. 14 (plazo de registro de dos meses)',
  'Decreto 2148 de 1983, art. 9 (otorgamiento en diferentes momentos)',
  'Decreto 830 de 2021 (personas expuestas políticamente – formato de firmas)',
];
const COMUNES_ENAJENACION = [
  'Ley 2010 de 2019, art. 61 (declaración del precio real)',
  'Ley 2097 de 2021 y Decreto 1310 de 2022 (constancia REDAM)',
];

function tablaVars(vars) {
  const L = ['| Variable | Tipo | Validación | Obligatoria |', '| --- | --- | --- | --- |'];
  for (const v of vars) L.push(`| \`${v.nombre}\` | ${v.tipo} | ${celda(v.validacion)} | ${v.obligatorio ? 'Sí' : 'No'} |`);
  return L.join('\n');
}

function generarFichas() {
  for (const f of fs.readdirSync(FICHAS)) if (f.endsWith('.md')) fs.unlinkSync(path.join(FICHAS, f));
  let n = 0;
  for (const f of filasTipo.filter((x) => x.fuentes.length)) {
    const t = f.t;
    const fuentesNormas = f.independientes.length ? f.independientes : f.fuentes;
    const conteo = {};
    for (const a of fuentesNormas) for (const nn of normas[txt(a)] || []) { const k = normaCanonica(nn); conteo[k] = (conteo[k] || 0) + 1; }
    const listaNormas = Object.entries(conteo).sort((a, b) => b[1] - a[1]);
    const combinaciones = [...new Set(f.combinadas.map((a) => a.tipos.map((x) => tipoPorId[x].nombre.replace(/ \(tipo encontrado\)/, '')).join(' + ')))];
    const enajena = ['compraventa', 'compraventa_hipoteca', 'compraventa_vis', 'compraventa_cuota', 'derechos_herenciales', 'compraventa_mejoras'].includes(t.id);
    const L = [];
    L.push(`# Ficha: ${t.nombre.replace(/ \(tipo encontrado\)/, '')}`, '');
    L.push(`- **Identificador:** \`${t.id}\``);
    L.push(`- **Categoría:** ${t.categoria}`);
    L.push(`- **Prioridad:** ${t.prioridad}`);
    L.push(`- **Estado en la carpeta:** ${f.estado}`);
    L.push('- **Estado de aprobación:** Pendiente de aprobación del notario');
    if (t.nuevo) L.push('- **Origen:** tipo no incluido en el catálogo base; encontrado en la carpeta.');
    L.push('');
    L.push('## Archivo(s) fuente', '');
    for (const a of f.fuentes) L.push(`- **${a.id}** – ${a.alias}${a === f.recomendado ? ' ← **fuente sugerida para la plantilla**' : ''}${a.duplicadoDe ? ` (duplicado de ${a.duplicadoDe})` : ''}  \n  ${a.variante}`);
    L.push('');
    L.push('## Actos que incluye', '');
    L.push(f.independientes.length ? `- Como escritura independiente: ${f.independientes.map((a) => a.id).join(', ')}.` : '- No aparece como escritura independiente.');
    if (combinaciones.length) { L.push('- Combinaciones observadas en la carpeta:'); for (const c of combinaciones) L.push(`  - ${c}`); }
    L.push('');
    L.push('## Variables', '');
    L.push('### Específicas del acto', '', f.varsEsp.length ? tablaVars(f.varsEsp) : '_Pendiente de definir._', '');
    L.push('### Bloques comunes', '');
    const bloques = ['encabezado', 'persona_natural', 'representacion', ...(ES_INMUEBLE(t) ? ['persona_juridica', 'inmueble', 'tradicion', 'soportes_fiscales'] : []), 'cierre'];
    const titulos = { encabezado: 'Encabezado / carátula', persona_natural: 'Cada compareciente (persona natural)', representacion: 'Representación (apoderados)', persona_juridica: 'Persona jurídica (bancos, fiduciarias, sociedades)', inmueble: 'Cada inmueble', tradicion: 'Tradición', soportes_fiscales: 'Soportes fiscales y certificado de tradición', cierre: 'Cierre' };
    for (const b of bloques) L.push(`**${titulos[b]}**`, '', tablaVars(BLOQUES[b]), '');
    L.push('## Documentos soporte requeridos', '');
    for (const s of t.soportes || ['Pendiente de definir']) L.push(`- ${s}`);
    L.push('');
    L.push('## Comparecientes', '', t.comparecientes || 'Pendiente de definir', '');
    L.push('## Problemas detectados en las fuentes', '');
    for (const a of f.fuentes) {
      const propios = problemasDe(a).filter((p) => !/^Escritura real con datos personales/.test(p));
      if (propios.length) L.push(`- **${a.id}:** ${propios.join(' · ')}`);
    }
    L.push('- **Todas:** son escrituras reales con datos personales; se trabajó sobre copias anonimizadas en `datos_locales/copias_trabajo/`.', '');
    L.push('## Referencia normativa – pendiente de validar por el notario', '');
    L.push('> Normas **citadas en los textos de la notaría** para este tipo. Se registran como referencia; **no se afirma su vigencia** ni su aplicabilidad. El notario debe validarlas.', '');
    if (listaNormas.length) for (const [nn, c] of listaNormas) L.push(`- ${nn} _(citada en ${c} de ${fuentesNormas.length} archivo(s) fuente)_`);
    else L.push('- No se encontraron citas normativas específicas en las fuentes de este tipo.');
    if (!f.independientes.length) L.push('', '_Nota: este tipo solo aparece combinado; la lista puede incluir normas de los otros actos de esas escrituras._');
    L.push('', 'Citadas en el cierre común de las escrituras:', '');
    for (const c of COMUNES_CIERRE) L.push(`- ${c}`);
    if (enajena) for (const c of COMUNES_ENAJENACION) L.push(`- ${c}`);
    L.push('');
    fs.writeFileSync(path.join(FICHAS, `${t.id}.md`), L.join('\n'));
    n++;
  }
  return n;
}

// ---------------------------------------------------------------- Mapa real (local)
function generarMapaLocal() {
  const L = ['# Mapa de archivos reales (CONFIDENCIAL – no subir a ningún repositorio)', '', '| ID | Archivo real | Alias usado en docs/ |', '| --- | --- | --- |'];
  for (const a of ARCHIVOS) L.push(`| ${a.id} | ${celda(a.archivo)} | ${celda(a.alias)} |`);
  fs.writeFileSync(path.join(LOCAL, 'MAPA_ARCHIVOS_REALES.md'), L.join('\n') + '\n');
}

(async () => {
  // Control: todo archivo de la carpeta debe estar clasificado en el catálogo
  const enCarpeta = fs.existsSync(ORIGEN) ? fs.readdirSync(ORIGEN).filter((x) => !x.startsWith('~$')) : [];
  const sinCatalogo = enCarpeta.filter((x) => !ARCHIVOS.some((a) => a.archivo === x));
  sinCatalogo.forEach((archivo, i) => {
    // El nombre real puede contener datos personales: en docs/ se muestra un alias genérico
    ARCHIVOS.push({ id: `N${String(i + 1).padStart(2, '0')}`, archivo, alias: `Archivo nuevo ${i + 1} (nombre real en el mapa local)`, tipos: [], variante: 'Sin clasificar: pendiente de lectura y clasificación por contenido.', problemas: ['Sin clasificar'] });
  });
  if (sinCatalogo.length) console.warn(`ATENCIÓN: ${sinCatalogo.length} archivo(s) nuevo(s) quedan "Sin clasificar". Actualice herramientas/fase0/catalogo.js.`);
  await generarXlsx();
  generarMd();
  const n = generarFichas();
  generarMapaLocal();
  const cub = filasTipo.filter((f) => f.fuentes.length).length;
  console.log(`Entregables generados: checklist (${TIPOS.length} tipos: ${cub} cubiertos, ${TIPOS.length - cub} faltantes), inventario (${ARCHIVOS.length} archivos), ${n} fichas.`);
})().catch((e) => { console.error(e); process.exit(1); });
