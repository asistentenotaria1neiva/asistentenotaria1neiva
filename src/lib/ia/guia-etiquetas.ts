/**
 * Guía de las etiquetas {{…}} de las plantillas para la redacción con IA.
 *
 * Algunas plantillas aprobadas conservan las etiquetas del motor de plantillas
 * (src/lib/escritura/actos.ts, inmuebles.ts, contexto.ts): el texto de cada una lo arma el sistema con
 * fórmulas fijas de la notaría. La IA solo ve el nombre de la etiqueta, así que sin esta guía redacta a su
 * manera lo que la plantilla ya define (la forma de pago, el parágrafo de gravámenes, los certificados que
 * se citan o el texto del paz y salvo). Aquí va, para cada etiqueta, qué texto lleva y cuándo se omite.
 * Se envían solo las de las etiquetas que aparecen en las plantillas del caso.
 *
 * Si se cambia una fórmula en actos.ts o inmuebles.ts, hay que cambiarla también aquí.
 */

interface Entrada {
  /** Etiquetas (sin «a.») a las que se aplica */
  etiquetas: string[];
  guia: string;
}

const GUIA: Entrada[] = [
  {
    etiquetas: ['forma_pago_texto'],
    guia: 'Forma de pago del precio. Si la hoja de radicación, la minuta o el funcionario indican una forma de pago (contado, cuotas, crédito, subsidio…), va esa. Si NO la indican, NO es un dato faltante (nunca «FALTA»): va exactamente «suma que el vendedor manifiesta haber recibido en su totalidad a entera satisfacción de manos del comprador.», concordando vendedor y comprador en número y género («la vendedora manifiesta», «los vendedores manifiestan», «de manos de los compradores»).',
  },
  {
    etiquetas: ['paragrafo_gravamen'],
    guia: 'PARAGRAFO que sigue a la cláusula de libertad de gravámenes. SOLO va si sobre el inmueble subsiste un gravamen, limitación o medida cautelar VIGENTE (hipoteca, embargo, patrimonio de familia, afectación a vivienda familiar, condición resolutoria… que no haya sido cancelada por una anotación posterior) o si el funcionario lo indica. Texto: «PARAGRAFO: No obstante, el(la)(los) otorgante(s) dejan constancia que tienen conocimiento que sobre el inmueble subsiste <el gravamen vigente, con su anotación y documento>, e insisten al Notario autorizar el presente instrumento público.» (concordado). Si no hay ninguno vigente, el PARAGRAFO se omite por completo. Los gravámenes ya cancelados NUNCA se mencionan en la escritura.',
  },
  {
    etiquetas: ['certificados_texto'],
    guia: 'Solo el certificado de tradición y libertad: «el Certificado de Tradición y Libertad del folio de matrícula inmobiliaria número <matrícula> de fecha <DD de Mes de AAAA>» (con varios inmuebles: «los Certificados de Tradición y Libertad de los folios de matrícula inmobiliaria números <matrícula> de fecha <fecha>, <matrícula> de fecha <fecha> y …»). Aquí NO van los paz y salvos ni otros documentos: esos se relacionan en los comprobantes del cierre.',
  },
  {
    etiquetas: ['comprobantes', 'hay_fiscales'],
    guia: 'Lista de comprobantes del cierre, uno por renglón con guion, en este orden y con estos textos: (1) por cada inmueble con paz y salvo: «Certificados de paz y salvos por concepto de predial unificado y valorización del predio inscrito en el catastro vigente bajo el número <cédula catastral del paz y salvo, o la del certificado si el paz y salvo no la trae> expedidos por <la entidad, como «la Secretaría de Hacienda de Palermo (H)»>, con vigencia hasta el <DD de Mes de AAAA>, en el cual consta que el referido inmueble tiene un avalúo de $<avalúo>.» (sin «y valorización» solo si el paz y salvo dice expresamente que no incluye valorización; si la cédula catastral está involucrada en mayor extensión se agrega «; cuya cédula catastral actualmente se encuentra involucrada en mayor extensión (Inciso 2 Art. 27 de la Ley 14 de 1983, Instrucción Administrativa 4 del 16 de Mayo de 2007 y Circular CIR-2025-000186-4 del 27 de Mayo 2025 de la SNR)»). No se escribe el número del paz y salvo, ni a nombre de quién está, ni la fecha de expedición. (2) «Fotocopias de las cédulas de ciudadanía correspondientes.» (3) Según el caso: «Poder especial otorgado a <apoderado>.» (o «general»), «Certificado de Existencia y Representación Legal de la <sociedad>.», «Escritura de poder otorgado a <representante>.», «Registro civil de nacimiento de <menor>.», y en propiedad horizontal «Fotocopia simple paz y salvo de administración.». El rótulo dice «comprobantes fiscales» cuando hay paz y salvo.',
  },
  {
    etiquetas: ['ec_adquirente', 'tradicion_texto', 'catastral_tradicion'],
    guia: 'Tradición: el estado civil con que el vendedor ADQUIRIÓ, tomado de la comparecencia de la escritura anterior (si no aparece en lo leído, «FALTA: estado civil del vendedor al adquirir»: el sistema lo busca después en los documentos originales); el modo, de quién y la escritura (número, fecha y notaría) por la que adquirió; y la cédula catastral del paz y salvo (o la del certificado si el paz y salvo no la trae).',
  },
  {
    etiquetas: ['constancia_poder'],
    guia: 'PARAGRAFO. CONSTANCIA DEL NOTARIO: solo si una parte comparece por apoderado y el poder no faculta expresamente para declarar su estado civil. Se escribe el texto de la plantilla, concordado.',
  },
  {
    etiquetas: ['afecta_no_aplica', 'afecta_lote', 'afecta_conyuges_compran', 'afecta_con_coadyuvante', 'afecta_si', 'lote_sin_construccion', 'estado_civil_compradores', 'vinculo_compradores'],
    guia: 'Literal b. de la aceptación: va UNA sola de las alternativas de la plantilla. Lote sin construcción (o local, bodega, comprador persona jurídica): «b. No procede la AFECTACIÓN A VIVIENDA FAMILIAR … por tratarse de un lote de terreno sin construcción.». Comprador soltero sin unión marital: la de «manifestó ser de estado civil …, razón por la cual no procede…». Compradores casados o compañeros entre sí, o con coadyuvante: la que corresponde, con «SI LO AFECTAN» o «NO LO AFECTAN» según lo indicado.',
  },
  {
    etiquetas: ['catastral_paz_salvo'],
    guia: 'El renglón «CEDULA CATASTRAL PAZ Y SALVO: …» solo va si el paz y salvo trae la cédula catastral escrita distinta a la del certificado.',
  },
];

/** Etiquetas que aparecen en el texto de las plantillas (sin «a.» ni filtros) */
export function etiquetasDe(texto: string): Set<string> {
  return new Set([...texto.matchAll(/\{\{\s*[#^/]?\s*([\w.]+)/g)].map((m) => m[1].replace(/^a\./, '')));
}

/** Guía de las etiquetas presentes en los modelos; vacío si no traen ninguna de las de la guía */
export function guiaEtiquetas(textos: string[]): string {
  const presentes = etiquetasDe(textos.join('\n'));
  const usadas = GUIA.filter((g) => g.etiquetas.some((e) => presentes.has(e)));
  if (!usadas.length) return '';
  return [
    '<guia_etiquetas>',
    'Las etiquetas {{…}} del modelo son de la notaría: este es el texto que lleva cada una. Escríbelo así (con los datos de este caso y concordado), sin redactarlo a tu manera. Un bloque {{#x}}…{{/x}} va solo si se cumple su condición; {{^x}}…{{/x}}, solo si no se cumple.',
    ...usadas.map((g) => `- ${g.etiquetas.map((e) => `{{${e}}}`).join(', ')}: ${g.guia}`),
    '</guia_etiquetas>',
  ].join('\n');
}
