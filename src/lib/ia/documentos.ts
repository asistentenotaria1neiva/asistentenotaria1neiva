/**
 * Tipos de documento soporte y esquema de los "hechos" que la IA extrae de cada uno.
 *
 * Cada dato extraído tiene la forma { valor, pagina, fragmento, confianza }:
 *   - valor ....... el dato, o null si no aparece o no es legible (la IA no adivina; lo devuelve
 *                   como texto vacío y normalizarExtraccion lo convierte)
 *   - pagina ...... página del documento de donde salió (1 = primera)
 *   - fragmento ... texto literal de origen, para que el usuario lo verifique
 *   - confianza ... ALTA | MEDIA | BAJA (BAJA = documento borroso o dato dudoso → revisión manual)
 */

export const TIPOS_DOCUMENTALES = {
  CEDULA: 'Cédula de ciudadanía',
  REGISTRO_CIVIL_NACIMIENTO: 'Registro civil de nacimiento',
  REGISTRO_CIVIL_MATRIMONIO: 'Registro civil de matrimonio',
  REGISTRO_CIVIL_DEFUNCION: 'Registro civil de defunción',
  CERTIFICADO_TRADICION: 'Certificado de tradición y libertad',
  PAZ_Y_SALVO: 'Paz y salvo predial / valorización',
  ESCRITURA_ANTERIOR: 'Escritura anterior (título de adquisición)',
  PODER: 'Poder',
  CERTIFICADO_EXISTENCIA: 'Certificado de existencia y representación legal',
  OTRO: 'Otro documento',
} as const;

export type TipoDocumental = keyof typeof TIPOS_DOCUMENTALES;

type Esquema = Record<string, unknown>;

type TipoDato = 'string' | 'number' | 'boolean' | 'integer';

/** Tipo y descripción de cada dato del esquema (el esquema describe la estructura; a la API se envía la lista plana) */
const tiposDato = new WeakMap<Esquema, { tipo: TipoDato; descripcion: string }>();

const FORMATO_VALOR: Record<TipoDato, string> = {
  string: 'texto',
  integer: 'número entero, solo dígitos y sin puntos de miles',
  number: 'número con punto decimal, p. ej. 88.00',
  boolean: '"true" o "false"',
};

/** Marca un dato extraído: en la respuesta llega como una entrada de la lista con su valor, fuente y confianza */
const dato = (tipo: TipoDato, descripcion: string): Esquema => {
  const e: Esquema = { type: 'dato' };
  tiposDato.set(e, { tipo, descripcion });
  return e;
};

function convertir(tipo: TipoDato, crudo: unknown): unknown {
  const t = String(crudo ?? '').trim();
  if (!t || /^null$/i.test(t)) return null;
  switch (tipo) {
    case 'integer': { const digitos = t.replace(/[^\d-]/g, ''); return /\d/.test(digitos) && Number.isFinite(Number(digitos)) ? Number(digitos) : null; }
    case 'number': { const n = Number(t.replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; }
    case 'boolean': return /^(true|s[ií]|yes)$/i.test(t) ? true : /^(false|no)$/i.test(t) ? false : null;
    default: return t;
  }
}

/** Una entrada de la respuesta de la IA: un dato del documento */
interface Entrada { campo: string; indice: number; valor: string; pagina: number; fragmento: string; confianza: string }

interface CampoPlano { campo: string; descripcion: string; enLista: boolean; opciones?: string[] }

/** Lista los campos del esquema con su ruta ("matricula", "propietarios.nombre", "ultima_adquisicion.modo") */
function camposPlanos(esquema: Esquema, prefijo = '', enLista = false): CampoPlano[] {
  return Object.entries((esquema.properties ?? {}) as Record<string, Esquema>).flatMap(([k, e]) => {
    const ruta = prefijo + k;
    const d = tiposDato.get(e);
    if (d) return [{ campo: ruta, descripcion: `${d.descripcion ? `${d.descripcion} ` : ''}(${FORMATO_VALOR[d.tipo]})`, enLista }];
    if (e.type === 'array') return camposPlanos(e.items as Esquema, `${ruta}.`, true).map((c) => ({ ...c, descripcion: `${c.descripcion} — elemento de la lista «${ruta}»: ${e.description ?? ''}` }));
    if (e.type === 'object') return camposPlanos(e, `${ruta}.`, enLista);
    return [{ campo: ruta, descripcion: `uno de: ${(e.enum as string[]).join(', ')}`, enLista, opciones: e.enum as string[] }];
  });
}

/** Reconstruye la forma de siempre ({ campo: { valor, pagina, fragmento, confianza } }) a partir de la lista plana */
function reconstruir(esquema: Esquema, entradas: Entrada[], prefijo = ''): Record<string, unknown> {
  return Object.fromEntries(Object.entries((esquema.properties ?? {}) as Record<string, Esquema>).map(([k, e]) => {
    const ruta = prefijo + k;
    const d = tiposDato.get(e);
    if (d) {
      const x = entradas.find((y) => y.campo === ruta && String(y.valor ?? '').trim());
      const pagina = Number(x?.pagina);
      return [k, {
        valor: x ? convertir(d.tipo, x.valor) : null,
        pagina: Number.isInteger(pagina) && pagina > 0 ? pagina : null,
        fragmento: x?.fragmento?.trim() ? x.fragmento : null,
        confianza: x && ['ALTA', 'MEDIA', 'BAJA'].includes(x.confianza) ? x.confianza : 'BAJA',
      }];
    }
    if (e.type === 'array') {
      const propias = entradas.filter((y) => y.campo.startsWith(`${ruta}.`));
      const indices = [...new Set(propias.map((y) => y.indice))].sort((a, b) => a - b);
      return [k, indices.map((i) => reconstruir(e.items as Esquema, propias.filter((y) => y.indice === i), `${ruta}.`))];
    }
    if (e.type === 'object') return [k, reconstruir(e, entradas, `${ruta}.`)];
    const valor = entradas.find((y) => y.campo === ruta)?.valor;
    const opciones = (e.enum as string[] | undefined) ?? [];
    return [k, opciones.includes(String(valor)) ? valor : opciones[opciones.length - 1] ?? valor ?? null];
  }));
}

const objeto = (props: Record<string, Esquema>, descripcion?: string): Esquema => ({
  type: 'object',
  ...(descripcion ? { description: descripcion } : {}),
  properties: props,
  required: Object.keys(props),
  additionalProperties: false,
});

const lista = (item: Esquema, descripcion: string): Esquema => ({ type: 'array', description: descripcion, items: item });

const TIPO_ANOTACION = {
  type: 'string',
  enum: ['COMPRAVENTA', 'HIPOTECA', 'CANCELACION_HIPOTECA', 'EMBARGO', 'AFECTACION_VIVIENDA_FAMILIAR', 'PATRIMONIO_FAMILIA',
    'CONDICION_RESOLUTORIA', 'PROHIBICION_ENAJENAR', 'VALORIZACION', 'USUFRUCTO', 'SERVIDUMBRE', 'PROPIEDAD_HORIZONTAL',
    'ADJUDICACION', 'DEMANDA', 'LIMITACION_OTRA', 'OTRA'],
};

const ESQUEMAS: Record<TipoDocumental, Esquema> = {
  CEDULA: objeto({
    numero: dato('string', 'Número de cédula, con los puntos tal como aparece'),
    nombres: dato('string', 'Nombres'),
    apellidos: dato('string', 'Apellidos'),
    sexo: dato('string', 'M o F'),
    fecha_nacimiento: dato('string', 'AAAA-MM-DD'),
    lugar_nacimiento: dato('string', 'Lugar de nacimiento'),
    fecha_expedicion: dato('string', 'AAAA-MM-DD'),
    lugar_expedicion: dato('string', 'Municipio de expedición'),
  }),
  REGISTRO_CIVIL_NACIMIENTO: objeto({
    nombre: dato('string', 'Nombre completo del inscrito'),
    nuip: dato('string', 'NUIP o número de identificación'),
    sexo: dato('string', 'M o F'),
    fecha_nacimiento: dato('string', 'AAAA-MM-DD'),
    lugar_nacimiento: dato('string', ''),
    padre_nombre: dato('string', ''),
    padre_documento: dato('string', ''),
    madre_nombre: dato('string', ''),
    madre_documento: dato('string', ''),
    serial: dato('string', 'Indicativo serial, o tomo y folio'),
    oficina_registro: dato('string', 'Notaría o registraduría'),
    fecha_inscripcion: dato('string', 'AAAA-MM-DD'),
  }),
  REGISTRO_CIVIL_MATRIMONIO: objeto({
    contrayente_1: dato('string', 'Nombre e identificación'),
    contrayente_2: dato('string', 'Nombre e identificación'),
    fecha_matrimonio: dato('string', 'AAAA-MM-DD'),
    lugar_matrimonio: dato('string', 'Notaría, parroquia o juzgado y municipio'),
    serial: dato('string', 'Indicativo serial'),
    oficina_registro: dato('string', ''),
    fecha_inscripcion: dato('string', 'AAAA-MM-DD'),
    notas_marginales: dato('string', 'Notas marginales (divorcio, liquidación, etc.)'),
  }),
  REGISTRO_CIVIL_DEFUNCION: objeto({
    nombre: dato('string', ''),
    documento: dato('string', ''),
    fecha_defuncion: dato('string', 'AAAA-MM-DD'),
    lugar_defuncion: dato('string', ''),
    serial: dato('string', ''),
  }),
  CERTIFICADO_TRADICION: objeto({
    matricula: dato('string', 'Número de matrícula inmobiliaria, formato 200-12345'),
    fecha_impresion: dato('string', 'Fecha y hora de expedición/impresión del certificado, AAAA-MM-DD'),
    circulo_registral: dato('string', 'Oficina de registro'),
    cedula_catastral: dato('string', 'Cédula catastral o número predial, solo dígitos'),
    direccion: dato('string', 'Dirección del inmueble'),
    municipio: dato('string', ''),
    tipo_predio: dato('string', 'URBANO o RURAL'),
    area: dato('string', 'Área registrada si aparece'),
    propietarios: lista(objeto({
      nombre: dato('string', 'Titular de derecho real de dominio actual'),
      documento: dato('string', 'Cédula o NIT'),
      porcentaje: dato('string', 'Porcentaje o cuota si aparece'),
    }), 'Titulares ACTUALES del derecho de dominio (los marcados con X en la última anotación de adquisición)'),
    anotaciones_vigentes: lista(objeto({
      numero: dato('string', 'Número de la anotación'),
      fecha: dato('string', 'AAAA-MM-DD'),
      especificacion: dato('string', 'Texto de la especificación'),
      tipo: { type: 'string', enum: TIPO_ANOTACION.enum },
      a_favor_de: dato('string', 'Beneficiario o acreedor'),
      documento_origen: dato('string', 'Escritura, oficio o resolución que la originó'),
    }), 'Gravámenes, limitaciones y medidas cautelares VIGENTES (no canceladas): hipotecas, embargos, afectación a vivienda familiar, patrimonio de familia, condiciones resolutorias, prohibiciones, demandas, etc.'),
    ultima_adquisicion: objeto({
      modo: dato('string', 'COMPRAVENTA, ADJUDICACION, DONACION, etc.'),
      de: dato('string', 'Quién transfirió'),
      a: dato('string', 'Quién adquirió'),
      escritura_numero: dato('string', ''),
      escritura_fecha: dato('string', 'AAAA-MM-DD'),
      notaria: dato('string', 'Notaría y ciudad'),
      anotacion: dato('string', 'Número de anotación'),
    }, 'Anotación por la cual adquirieron los propietarios actuales'),
  }),
  PAZ_Y_SALVO: objeto({
    tipo: dato('string', 'PREDIAL, VALORIZACION o AMBOS'),
    entidad: dato('string', 'Entidad que lo expide'),
    numero: dato('string', 'Número del paz y salvo si aparece'),
    cedula_catastral: dato('string', 'Número predial, solo dígitos'),
    propietario: dato('string', ''),
    direccion: dato('string', ''),
    avaluo: dato('integer', 'Avalúo catastral en pesos, sin puntos'),
    fecha_expedicion: dato('string', 'AAAA-MM-DD'),
    vigencia_hasta: dato('string', 'AAAA-MM-DD'),
  }),
  ESCRITURA_ANTERIOR: objeto({
    numero: dato('string', ''),
    fecha: dato('string', 'AAAA-MM-DD'),
    notaria: dato('string', ''),
    actos: dato('string', 'Actos que contiene'),
    adquirentes: dato('string', 'Nombres e identificación de quienes adquirieron'),
    tradentes: dato('string', 'Nombres de quienes transfirieron'),
    matricula: dato('string', ''),
    cedula_catastral: dato('string', ''),
    direccion: dato('string', ''),
    area_terreno: dato('number', 'Metros cuadrados'),
    area_construida: dato('number', 'Metros cuadrados'),
    linderos: dato('string', 'Linderos completos, literal'),
    afecta_vivienda_familiar: dato('boolean', '¿El inmueble quedó afectado a vivienda familiar?'),
    patrimonio_familia: dato('string', 'Si se constituyó patrimonio de familia, cita textual de beneficiarios'),
    condicion_resolutoria: dato('string', 'Cláusula de condición resolutoria o prohibición de enajenar, si existe'),
  }),
  PODER: objeto({
    tipo: dato('string', 'ESPECIAL o GENERAL'),
    poderdantes: dato('string', 'Nombres y documentos de quienes otorgan'),
    apoderado_nombre: dato('string', ''),
    apoderado_documento: dato('string', ''),
    apoderado_tarjeta_profesional: dato('string', ''),
    actos_autorizados: dato('string', 'Actos para los que faculta, literal'),
    inmueble_matricula: dato('string', 'Matrícula del inmueble si el poder lo identifica'),
    faculta_declarar_estado_civil: dato('boolean', '¿Faculta expresamente para declarar el estado civil?'),
    fecha: dato('string', 'AAAA-MM-DD'),
    presentacion_personal: dato('boolean', '¿Tiene diligencia de presentación personal o es por escritura?'),
    escritura_poder: dato('string', 'Si es por escritura: número, fecha y notaría'),
  }),
  CERTIFICADO_EXISTENCIA: objeto({
    razon_social: dato('string', ''),
    nit: dato('string', 'NIT con dígito de verificación'),
    domicilio: dato('string', ''),
    fecha_expedicion: dato('string', 'AAAA-MM-DD'),
    representante_nombre: dato('string', ''),
    representante_documento: dato('string', ''),
    representante_cargo: dato('string', ''),
    limitaciones: dato('string', 'Límites de cuantía o actos que requieren autorización de junta/asamblea, literal'),
    constitucion: dato('string', 'Documento de constitución e inscripción'),
  }),
  OTRO: objeto({
    descripcion: dato('string', 'Qué documento es'),
    datos_relevantes: dato('string', 'Datos relevantes para la escritura, literal'),
  }),
};

/** Esquema completo de la respuesta de extracción para un tipo de documento */
/**
 * Esquema completo de la respuesta de extracción para un tipo de documento. Los datos van como una
 * lista plana (campo, índice, valor, página, fragmento, confianza): la API rechaza las gramáticas
 * grandes y los esquemas con muchos campos opcionales, y así el tamaño no depende del documento.
 */
export function esquemaExtraccion(tipo: TipoDocumental): Esquema {
  const campos = camposPlanos(ESQUEMAS[tipo]);
  return objeto({
    tipo_detectado: { type: 'string', enum: Object.keys(TIPOS_DOCUMENTALES), description: 'Tipo de documento que realmente es' },
    legible: { type: 'boolean', description: 'false si el documento está tan borroso o incompleto que no se puede leer con seguridad' },
    observaciones: { type: 'array', items: { type: 'string' }, description: 'Problemas del documento: ilegible, incompleto, vencido, tachones, páginas faltantes, etc.' },
    datos: lista(objeto({
      campo: { type: 'string', enum: campos.map((c) => c.campo), description: `Dato extraído. Campos:\n${campos.map((c) => `- ${c.campo}: ${c.descripcion}`).join('\n')}` },
      indice: { type: 'integer', description: 'Para los campos de una lista, número del elemento (0, 1, 2…) que agrupa sus datos; 0 para los demás' },
      valor: { type: 'string', description: 'El dato en el formato indicado para el campo' },
      pagina: { type: 'integer', description: 'Página del documento de donde salió (1 = primera)' },
      fragmento: { type: 'string', description: 'Texto literal del documento del que se tomó el dato' },
      confianza: { type: 'string', enum: ['ALTA', 'MEDIA', 'BAJA'] },
    }), 'Un elemento por cada dato que aparece en el documento. Los datos que no aparecen o no se pueden leer no se incluyen.'),
  } as Record<string, Esquema>);
}

/** Convierte la lista plana de la IA a la forma de siempre: cada dato con su tipo real y null si no aparece */
export function normalizarExtraccion(tipo: TipoDocumental, r: ResultadoExtraccion): ResultadoExtraccion {
  const entradas = Array.isArray(r.datos) ? (r.datos as Entrada[]) : [];
  return { ...r, datos: reconstruir(ESQUEMAS[tipo], entradas) };
}

export interface DatoConFuente<T = unknown> {
  valor: T | null;
  pagina: number | null;
  fragmento: string | null;
  confianza: 'ALTA' | 'MEDIA' | 'BAJA';
}

export interface ResultadoExtraccion {
  tipo_detectado: TipoDocumental;
  legible: boolean;
  observaciones: string[];
  datos: Record<string, unknown>;
}
