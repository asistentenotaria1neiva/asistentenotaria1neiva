/**
 * Tipos de documento soporte y esquema de los "hechos" que la IA extrae de cada uno.
 *
 * Cada dato extraído tiene la forma { valor, pagina, fragmento, confianza }:
 *   - valor ....... el dato, o null si no aparece o no es legible (la IA no adivina)
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

/** Dato extraído con su fuente y confianza */
const dato = (tipo: 'string' | 'number' | 'boolean' | 'integer', descripcion: string): Esquema => ({
  type: 'object',
  description: descripcion,
  properties: {
    valor: { type: [tipo, 'null'] },
    pagina: { type: ['integer', 'null'] },
    fragmento: { type: ['string', 'null'], description: 'Texto literal del documento del que se tomó el dato' },
    confianza: { type: 'string', enum: ['ALTA', 'MEDIA', 'BAJA'] },
  },
  required: ['valor', 'pagina', 'fragmento', 'confianza'],
  additionalProperties: false,
});

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
export function esquemaExtraccion(tipo: TipoDocumental): Esquema {
  return objeto({
    tipo_detectado: { type: 'string', enum: Object.keys(TIPOS_DOCUMENTALES), description: 'Tipo de documento que realmente es' },
    legible: { type: 'boolean', description: 'false si el documento está tan borroso o incompleto que no se puede leer con seguridad' },
    observaciones: { type: 'array', items: { type: 'string' }, description: 'Problemas del documento: ilegible, incompleto, vencido, tachones, páginas faltantes, etc.' },
    datos: ESQUEMAS[tipo],
  } as Record<string, Esquema>);
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
