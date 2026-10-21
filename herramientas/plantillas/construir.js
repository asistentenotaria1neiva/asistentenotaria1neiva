/**
 * FASE 1 – Constructor de plantillas .docx a partir de fuentes de texto.
 *
 * Cada archivo plantillas/fuentes/<id>.plantilla se convierte en plantillas/docx/<id>.docx
 * con el formato de las escrituras de la notaría:
 *   carta, márgenes sup. 3,3 cm / der. 2,4 cm / inf. 1,3 cm / izq. 3,5 cm, Arial 12,
 *   interlineado 1,5, justificado, relleno de guiones al final de cada párrafo
 *   (tabulación con guía de guiones) y "Hoja No. N" en el encabezado desde la hoja 2.
 *
 * Marcado de las fuentes (una línea = un párrafo):
 *   ## TEXTO          título centrado en negrilla
 *   ### TEXTO         título a la izquierda en negrilla
 *   !! texto          párrafo sin relleno de guiones (firmas, oficios)
 *   **texto**         negrilla dentro del párrafo
 *   {{variable}}      variable (docxtemplater, delimitadores {{ }})
 *   {{#cond}} … {{/cond}}  bloque condicional o repetición (si va solo en su línea, abarca párrafos)
 *   @@SALTO_PAGINA@@  salto de página
 *   // comentario     no se incluye en el documento (notas para quien mantiene la plantilla)
 *
 * Uso: node herramientas/plantillas/construir.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const RAIZ = path.resolve(__dirname, '..', '..');
const FUENTES = path.join(RAIZ, 'plantillas', 'fuentes');
const SALIDA = path.join(RAIZ, 'plantillas', 'docx');

// Página (twips) tomada de las escrituras de la notaría
const PAGINA = { ancho: 12240, alto: 15840, sup: 1871, der: 1361, inf: 737, izq: 1985 };
const ANCHO_TEXTO = PAGINA.ancho - PAGINA.izq - PAGINA.der;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function runs(texto, negrillaBase = false) {
  // Divide por **…** para negrilla; las etiquetas {{…}} nunca se parten entre runs
  const partes = texto.split(/(\*\*[^*]+\*\*)/g).filter((p) => p !== '');
  return partes.map((p) => {
    const negrilla = negrillaBase || /^\*\*[^*]+\*\*$/.test(p);
    const t = p.replace(/^\*\*|\*\*$/g, '');
    return `<w:r>${negrilla ? '<w:rPr><w:b/><w:bCs/></w:rPr>' : ''}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
  }).join('');
}

function parrafo(linea) {
  if (linea.trim() === '@@SALTO_PAGINA@@') return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  if (linea.trim() === '!!') return '<w:p><w:pPr><w:spacing w:after="0" w:line="360" w:lineRule="auto"/></w:pPr></w:p>';
  let alineacion = 'both';
  let relleno = true;
  let negrilla = false;
  let texto = linea;
  if (texto.startsWith('## ')) { alineacion = 'center'; negrilla = true; relleno = false; texto = texto.slice(3); }
  else if (texto.startsWith('### ')) { negrilla = true; texto = texto.slice(4); }
  else if (texto.startsWith('!! ')) { relleno = false; alineacion = 'left'; texto = texto.slice(3); }
  // Un párrafo que solo contiene etiquetas de bloque no lleva relleno (docxtemplater lo elimina)
  if (/^\s*(\{\{[#/^][^}]*\}\}\s*)+$/.test(texto)) relleno = false;
  const tabs = relleno ? `<w:tabs><w:tab w:val="right" w:leader="hyphen" w:pos="${ANCHO_TEXTO}"/></w:tabs>` : '';
  const ppr = `<w:pPr>${tabs}<w:spacing w:after="0" w:line="360" w:lineRule="auto"/><w:jc w:val="${alineacion}"/></w:pPr>`;
  const fin = relleno ? '<w:r><w:tab/></w:r>' : '';
  return `<w:p>${ppr}${runs(texto, negrilla)}${fin}</w:p>`;
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

function documento(cuerpo) {
  return `${XML}<w:document ${NS}><w:body>${cuerpo}` +
    `<w:sectPr><w:headerReference w:type="default" r:id="rIdEncabezado"/><w:headerReference w:type="first" r:id="rIdEncabezadoPrimera"/>` +
    `<w:pgSz w:w="${PAGINA.ancho}" w:h="${PAGINA.alto}" w:code="1"/>` +
    `<w:pgMar w:top="${PAGINA.sup}" w:right="${PAGINA.der}" w:bottom="${PAGINA.inf}" w:left="${PAGINA.izq}" w:header="709" w:footer="0" w:gutter="0"/>` +
    `<w:titlePg/></w:sectPr></w:body></w:document>`;
}

const ESTILOS = `${XML}<w:styles ${NS}>` +
  '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="es-CO" w:eastAsia="es-CO"/></w:rPr></w:rPrDefault>' +
  '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="360" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr></w:pPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
  '<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Encabezado"><w:name w:val="header"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="right"/></w:pPr></w:style>' +
  '</w:styles>';

const ENCABEZADO = `${XML}<w:hdr ${NS}><w:p><w:pPr><w:pStyle w:val="Encabezado"/></w:pPr>` +
  '<w:r><w:t xml:space="preserve">Hoja No. </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>' +
  '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>2</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:hdr>';
const ENCABEZADO_PRIMERA = `${XML}<w:hdr ${NS}><w:p><w:pPr><w:pStyle w:val="Encabezado"/></w:pPr></w:p></w:hdr>`;

const CONTENT_TYPES = `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
  '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' +
  '<Override PartName="/word/header2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' +
  '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
  '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';

const RELS = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
  '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>';

const DOC_RELS = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  '<Relationship Id="rIdEstilos" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '<Relationship Id="rIdAjustes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' +
  '<Relationship Id="rIdEncabezado" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>' +
  '<Relationship Id="rIdEncabezadoPrimera" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header2.xml"/></Relationships>';

const AJUSTES = `${XML}<w:settings ${NS}><w:defaultTabStop w:val="709"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;

function propiedades(titulo) {
  const ahora = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  return {
    core: `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
      `<dc:title>${esc(titulo)}</dc:title><dc:creator>Notaría Primera de Neiva – Asistente de escrituración</dc:creator>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${ahora}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${ahora}</dcterms:modified></cp:coreProperties>`,
    app: `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Asistente de escrituración</Application></Properties>`,
  };
}

/** Construye el .docx a partir del texto fuente; devuelve un Buffer */
async function construirDocx(fuente, titulo) {
  const lineas = fuente.split(/\r?\n/).filter((l) => l.trim() !== '' && !l.trimStart().startsWith('//'));
  const zip = new JSZip();
  const { core, app } = propiedades(titulo);
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', RELS);
  zip.file('word/_rels/document.xml.rels', DOC_RELS);
  zip.file('word/document.xml', documento(lineas.map(parrafo).join('')));
  zip.file('word/styles.xml', ESTILOS);
  zip.file('word/settings.xml', AJUSTES);
  zip.file('word/header1.xml', ENCABEZADO);
  zip.file('word/header2.xml', ENCABEZADO_PRIMERA);
  zip.file('docProps/core.xml', core);
  zip.file('docProps/app.xml', app);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function principal() {
  fs.mkdirSync(SALIDA, { recursive: true });
  const archivos = fs.readdirSync(FUENTES).filter((f) => f.endsWith('.plantilla'));
  for (const f of archivos) {
    const id = f.replace(/\.plantilla$/, '');
    const fuente = fs.readFileSync(path.join(FUENTES, f), 'utf8');
    // Control de balance de etiquetas de bloque
    const abiertas = (fuente.match(/\{\{[#^]([^}]+)\}\}/g) || []).length;
    const cerradas = (fuente.match(/\{\{\/([^}]*)\}\}/g) || []).length;
    if (abiertas !== cerradas) throw new Error(`${f}: etiquetas de bloque desbalanceadas (${abiertas} abiertas, ${cerradas} cerradas)`);
    fs.writeFileSync(path.join(SALIDA, `${id}.docx`), await construirDocx(fuente, id));
  }
  console.log(`Plantillas construidas: ${archivos.length} → plantillas/docx/`);
}

if (require.main === module) principal().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { construirDocx };
