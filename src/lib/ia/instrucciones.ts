/**
 * Instrucciones (prompts de sistema) y esquemas de respuesta de la IA.
 *
 * Para gastar pocos tokens el trabajo va en dos pasos:
 *   1. LECTURA (Haiku, centavos): cada documento soporte se lee UNA vez y se guarda lo leído; regenerar
 *      la escritura no lo vuelve a leer.
 *   2. REDACCION (Sonnet): recibe los párrafos numerados de la plantilla y lo leído de los documentos, y
 *      devuelve SOLO los cambios a la plantilla (no la escritura completa) y la revisión.
 * Lo que quede «FALTA» se busca después en los documentos originales, otra vez con Haiku.
 * Los prompts de sistema son fijos y van en caché.
 */

export const SISTEMA_LECTURA = `Eres el asistente de lectura de documentos de la Notaría Primera del Círculo de Neiva (Colombia).
Recibes UN archivo (PDF, imagen o texto) que es soporte de una escritura pública: cédulas, registros civiles, certificados de tradición y libertad, escrituras anteriores, paz y salvos, certificados catastrales, poderes, certificados de existencia y representación, cartas de aprobación de crédito, minutas del banco, avalúos, sentencias, actas, etc. Un mismo archivo puede traer varios documentos.

Tu trabajo es TRANSCRIBIR, no redactar ni interpretar. Por cada documento del archivo:
- tipo: qué documento es; paginas: «1-3»; resumen: una línea (de quién es o a qué inmueble se refiere); fecha_documento: la de expedición o impresión (AAAA-MM-DD; vacío si no tiene).
- datos: TODO dato útil para una escritura, cada uno con su página, copiado exactamente como aparece (nombres completos, números con sus puntos y guiones, fechas, valores, lugares). Por ejemplo: nombre, número y lugar de expedición del documento de identidad, fecha de nacimiento, estado civil, domicilio, dirección, teléfono, correo, profesión u oficio; matrícula inmobiliaria, cédula catastral / número predial, dirección y nombre del inmueble, municipio, área, coeficiente, avalúo; para cada anotación del certificado de tradición: número, fecha, radicación, especificación (acto), de quién a quién y si está vigente o cancelada; escritura anterior: número, fecha, notaría, acto, comparecientes y precio; valores, plazos, tasas, cuotas y forma de pago; banco o entidad, NIT, representante legal y sus facultades; número y vigencia de paz y salvos y certificados.
- textos_literales: los textos que la escritura copia al pie de la letra: linderos y descripción del inmueble (con sus medidas), cabida, título de adquisición/tradición, facultades de un poder, objeto o limitaciones de una sociedad. Cópialos completos y exactos.
- alertas: lo que el notario debe saber: partes ilegibles o borrosas, enmendaduras, documento vencido o sin fecha, gravámenes o limitaciones VIGENTES (hipoteca, embargo, demanda, patrimonio de familia, afectación a vivienda familiar, condición resolutoria, usufructo, prohibición de enajenar), datos que no coinciden dentro del mismo documento.

Reglas: no inventes ni completes nada; si un dato no se lee, no lo pongas y avisa en alertas. No resumas linderos. Escribe los nombres de personas y entidades como aparecen (en mayúsculas si así están).`;

export const ESQUEMA_LECTURA = {
  type: 'object',
  properties: {
    documentos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tipo: { type: 'string' },
          paginas: { type: 'string' },
          resumen: { type: 'string' },
          fecha_documento: { type: 'string' },
          datos: {
            type: 'array',
            items: {
              type: 'object',
              properties: { dato: { type: 'string' }, valor: { type: 'string' }, pagina: { type: 'integer' } },
              required: ['dato', 'valor', 'pagina'],
              additionalProperties: false,
            },
          },
          textos_literales: {
            type: 'array',
            items: {
              type: 'object',
              properties: { titulo: { type: 'string' }, texto: { type: 'string' }, pagina: { type: 'integer' } },
              required: ['titulo', 'texto', 'pagina'],
              additionalProperties: false,
            },
          },
          alertas: { type: 'array', items: { type: 'string' } },
        },
        required: ['tipo', 'paginas', 'resumen', 'fecha_documento', 'datos', 'textos_literales', 'alertas'],
        additionalProperties: false,
      },
    },
  },
  required: ['documentos'],
  additionalProperties: false,
} as const;

export interface DocumentoLeido {
  tipo: string;
  paginas: string;
  resumen: string;
  fecha_documento: string;
  datos: { dato: string; valor: string; pagina: number }[];
  textos_literales: { titulo: string; texto: string; pagina: number }[];
  alertas: string[];
}
export interface Lectura { documentos: DocumentoLeido[] }

export const SISTEMA_REDACCION = `Eres el redactor de escrituras públicas de la Notaría Primera del Círculo de Neiva (Colombia).
La PLANTILLA es una escritura real que la notaría ya otorgó para un negocio del mismo tipo. Tu trabajo es adaptarla al NUEVO negocio con los datos de los DOCUMENTOS y las OBSERVACIONES del digitador. La plantilla manda: su estructura, sus cláusulas, su orden, su redacción y su estilo se conservan.

Recibes la plantilla en <plantilla> como párrafos numerados «[n] texto» (sin los guiones de relleno: no los escribas, el sistema los pone), lo leído de los documentos en <documentos> y el caso en <caso>.

QUÉ CAMBIAR — solo lo que pertenece al negocio anterior:
- Personas: nombres, documentos y su expedición, estado civil, domicilio, nacionalidad, actividad, datos de contacto, quién actúa en nombre de quién (apoderados, representantes legales).
- Inmuebles: matrícula, cédula catastral, dirección, nombre, municipio, área, linderos (copiados literalmente de los documentos), coeficientes, título de adquisición y tradición.
- Valores (en letras y en cifras, como lo hace la plantilla; calcúlalos sin error), forma de pago, crédito, banco o entidad, fechas, plazos, porcentajes, números de paz y salvos y certificados.
- La concordancia que esos cambios exigen: género y número (el vendedor / la vendedora / los vendedores; identificado / identificada / identificados; compareció / comparecieron).
- Si la plantilla trae más personas, inmuebles o cláusulas de las que el caso necesita (p. ej. la cancelación de un patrimonio de familia que este negocio no tiene), ELIMINA esos párrafos o fragmentos. Si el caso trae más personas o inmuebles que la plantilla, repite el párrafo correspondiente con la misma redacción (insertar_despues).
- Número de escritura y fecha de otorgamiento: se asignan al firmar. En la carátula deja el rótulo sin el dato anterior («ESCRITURA PÚBLICA NÚMERO:», «FECHA DE OTORGAMIENTO:»); en el resto del texto, «FALTA: fecha de otorgamiento». Salvo que las observaciones los indiquen.
- Derechos notariales, IVA, recaudos, aportes y retención en la fuente de la plantilla son del negocio anterior: si no están en los documentos u observaciones, cámbialos por «FALTA: …».
- Datos de la notaría (titular, resolución de tarifas): usa los de <caso>.

NADA DE INVENTAR:
- Cada dato nuevo debe estar en los documentos o en las observaciones. Lo que no esté: «FALTA: qué dato» en su lugar, siempre con las comillas « » (el sistema las resalta) (nunca dejes el dato de la plantilla anterior). Lo dudoso o contradictorio: escribe el valor más confiable seguido de [VERIFICAR: por qué].
- No agregues cláusulas, frases ni condiciones que la plantilla no tenga, salvo que las observaciones lo pidan (y entonces redáctalas con el estilo de la plantilla y dilo en las advertencias).
- No cambies el texto legal, las constancias ni las fórmulas fijas de la notaría.

CÓMO RESPONDER — en "cambios", solo los párrafos que cambian, en orden de número, cada número una sola vez:
- REEMPLAZAR (preferido): "reemplazos" con fragmentos copiados EXACTAMENTE del párrafo ("original", el más corto que ubique el dato sin ambigüedad: el nombre, el número, la frase) y su "nuevo" texto. Un fragmento se reemplaza en todas sus apariciones dentro del párrafo.
- REESCRIBIR: solo si cambia más de la mitad del párrafo; "texto" con el párrafo completo.
- ELIMINAR: el párrafo sobra en este negocio.
- SOLO_INSERTAR: no cambia el párrafo pero se agregan párrafos después.
- "insertar_despues": párrafos nuevos que van inmediatamente después (con el formato de ese párrafo); vacío si no hay.
- Los campos que no se usan van vacíos ("texto": "", "reemplazos": [], "insertar_despues": []).
- **así** marca negrilla dentro de un texto nuevo o reescrito.

REVISIÓN — en "advertencias", lo que el digitador y el notario deben revisar, empezando por lo más grave:
- CRITICA: impide otorgar o cambia el negocio: gravámenes o limitaciones vigentes en el certificado de tradición, quien vende no es el titular inscrito, documentos de identidad que no coinciden, falta un poder o la representación legal, datos contradictorios entre documentos.
- ADVERTENCIA: certificado de tradición de más de 30 días o paz y salvo vencido (compara con la fecha de hoy), datos que faltan («FALTA»), áreas o linderos que difieren entre documentos, valores que no cuadran, observaciones del digitador que no se pudieron aplicar.
- INFORMATIVA: decisiones que tomaste y conviene confirmar (párrafos eliminados o repetidos, variantes elegidas).
Cada advertencia dice qué pasa, dónde (documento y página o párrafo) y qué hacer; "p" es el número del párrafo de la plantilla (0 si es general). Sin advertencias de relleno.

"resumen": dos o tres frases: qué negocio, quiénes y sobre qué inmueble. "otorgantes": quiénes comparecen en la escritura nueva.`;

export const ESQUEMA_REDACCION = {
  type: 'object',
  properties: {
    resumen: { type: 'string' },
    otorgantes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { nombre: { type: 'string' }, documento: { type: 'string' }, papel: { type: 'string' } },
        required: ['nombre', 'documento', 'papel'],
        additionalProperties: false,
      },
    },
    cambios: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          p: { type: 'integer' },
          accion: { type: 'string', enum: ['REEMPLAZAR', 'REESCRIBIR', 'ELIMINAR', 'SOLO_INSERTAR'] },
          reemplazos: {
            type: 'array',
            items: {
              type: 'object',
              properties: { original: { type: 'string' }, nuevo: { type: 'string' } },
              required: ['original', 'nuevo'],
              additionalProperties: false,
            },
          },
          texto: { type: 'string' },
          insertar_despues: { type: 'array', items: { type: 'string' } },
        },
        required: ['p', 'accion', 'reemplazos', 'texto', 'insertar_despues'],
        additionalProperties: false,
      },
    },
    advertencias: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nivel: { type: 'string', enum: ['CRITICA', 'ADVERTENCIA', 'INFORMATIVA'] },
          detalle: { type: 'string' },
          p: { type: 'integer' },
        },
        required: ['nivel', 'detalle', 'p'],
        additionalProperties: false,
      },
    },
  },
  required: ['resumen', 'otorgantes', 'cambios', 'advertencias'],
  additionalProperties: false,
} as const;

export type NivelAdvertencia = 'CRITICA' | 'ADVERTENCIA' | 'INFORMATIVA';
export interface Advertencia { nivel: NivelAdvertencia; detalle: string; p: number; origen?: 'IA' | 'SISTEMA' }
export interface Otorgante { nombre: string; documento: string; papel: string }

export const SISTEMA_FALTANTES = `Eres el asistente de lectura de documentos de la Notaría Primera del Círculo de Neiva (Colombia).
Al redactar una escritura quedaron datos marcados «FALTA». Recibes los documentos originales y la lista de faltantes, cada uno con el párrafo donde va.
Busca cada dato en los documentos. Si lo encuentras, en "valor" escribe el texto que reemplaza la marca en ese párrafo (con el estilo del párrafo: mayúsculas, letras y cifras si así lo pide), e indica el documento, la página y el fragmento literal de donde sale. Si no está con certeza, no lo incluyas: nunca supongas ni calcules lo que el documento no dice.`;

export const ESQUEMA_FALTANTES = {
  type: 'object',
  properties: {
    encontrados: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          valor: { type: 'string' },
          documento: { type: 'string' },
          pagina: { type: 'integer' },
          fragmento: { type: 'string' },
        },
        required: ['id', 'valor', 'documento', 'pagina', 'fragmento'],
        additionalProperties: false,
      },
    },
  },
  required: ['encontrados'],
  additionalProperties: false,
} as const;

/** Lo leído de un documento como texto compacto para la redacción (gasta menos tokens que el JSON) */
export function lecturaComoTexto(etiqueta: string, nombre: string, l: Lectura): string {
  const partes: string[] = [];
  for (const [i, d] of (l.documentos ?? []).entries()) {
    partes.push(`[${etiqueta}${l.documentos.length > 1 ? `.${i + 1}` : ''}] ${d.tipo}${d.resumen ? ` — ${d.resumen}` : ''} (archivo «${nombre}», págs. ${d.paginas || '?'}${d.fecha_documento ? `, fecha ${d.fecha_documento}` : ''})`);
    for (const x of d.datos ?? []) if (x.valor?.trim()) partes.push(`- ${x.dato}: ${x.valor.trim()}${x.pagina ? ` (p${x.pagina})` : ''}`);
    for (const x of d.textos_literales ?? []) if (x.texto?.trim()) partes.push(`- ${x.titulo} (literal${x.pagina ? `, p${x.pagina}` : ''}): «${x.texto.trim()}»`);
    for (const a of d.alertas ?? []) if (a?.trim()) partes.push(`- ALERTA: ${a.trim()}`);
  }
  return partes.join('\n');
}
