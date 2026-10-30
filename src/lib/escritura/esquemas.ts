/**
 * Esquemas de formulario por tipo de escritura (Fase 1).
 * El asistente por pasos se genera a partir de estos esquemas: cada acto aporta sus
 * pasos, y los pasos comunes (escritura, personas, inmuebles) se diligencian una sola vez.
 *
 * Tipos de campo:
 *   texto | textoLargo | entero | moneda | medida | fecha | booleano | opciones |
 *   persona | personas | inmueble | lista
 */
import type { TipoValidacion } from '../validaciones/formatos';
import { ESTADOS_CIVILES } from './tipos';
import type { TipoDocumental } from '../ia/documentos';

export interface Opcion { valor: string; etiqueta: string }

export interface Campo {
  id: string;
  etiqueta: string;
  tipo: 'texto' | 'textoLargo' | 'entero' | 'moneda' | 'medida' | 'fecha' | 'booleano' | 'opciones' | 'persona' | 'personas' | 'inmueble' | 'inmuebles' | 'lista';
  obligatorio?: boolean;
  validacion?: TipoValidacion;
  opciones?: Opcion[];
  ayuda?: string;
  predeterminado?: unknown;
  /** Solo se muestra si otro campo (del mismo nivel) tiene uno de estos valores */
  visibleSi?: { campo: string; valores: unknown[] };
  /** Campos de cada elemento cuando tipo = lista */
  subcampos?: Campo[];
}

export interface Paso { id: string; titulo: string; descripcion?: string; campos: Campo[] }

export interface EsquemaActo {
  tipo: string;
  version: number;
  titulo: string;
  plantillaFuente: string; // archivo de la notaría del que se derivó
  pasos: Paso[];
  documentosSoporte: { tipo: TipoDocumental; etiqueta: string; obligatorio: boolean }[];
  reglas: string[]; // códigos de reglas de cruce (src/lib/reglas/reglas.ts)
  /** Formulario armado con las variables de la plantilla aprobada (src/lib/escritura/actos-plantilla.ts) */
  porPlantilla?: { plantillaId: string; version: number };
}

const SI_NO: Opcion[] = [{ valor: 'true', etiqueta: 'Sí' }, { valor: 'false', etiqueta: 'No' }];

// ---------------------------------------------------------------- pasos comunes

export const CAMPOS_PERSONA: Campo[] = [
  { id: 'tipo_persona', etiqueta: 'Tipo de persona', tipo: 'opciones', obligatorio: true, predeterminado: 'NATURAL', opciones: [{ valor: 'NATURAL', etiqueta: 'Natural' }, { valor: 'JURIDICA', etiqueta: 'Jurídica (sociedad, banco, fiduciaria…)' }] },
  { id: 'nombre', etiqueta: 'Nombre completo / razón social', tipo: 'texto', obligatorio: true, ayuda: 'En mayúsculas, exactamente como en el documento de identidad o el certificado de existencia.' },
  { id: 'genero', etiqueta: 'Género (para la concordancia del texto)', tipo: 'opciones', obligatorio: true, opciones: [{ valor: 'F', etiqueta: 'Femenino' }, { valor: 'M', etiqueta: 'Masculino' }], visibleSi: { campo: 'tipo_persona', valores: ['NATURAL'] } },
  { id: 'tipo_documento', etiqueta: 'Tipo de documento', tipo: 'opciones', obligatorio: true, predeterminado: 'CC', opciones: [{ valor: 'CC', etiqueta: 'Cédula de ciudadanía' }, { valor: 'CE', etiqueta: 'Cédula de extranjería' }, { valor: 'NUIP', etiqueta: 'Registro civil (NUIP)' }, { valor: 'TI', etiqueta: 'Tarjeta de identidad' }, { valor: 'PASAPORTE', etiqueta: 'Pasaporte' }, { valor: 'NIT', etiqueta: 'NIT' }] },
  { id: 'numero_documento', etiqueta: 'Número de documento', tipo: 'texto', obligatorio: true, ayuda: 'Se valida según el tipo; el NIT exige dígito de verificación correcto.' },
  { id: 'lugar_expedicion', etiqueta: 'Lugar de expedición', tipo: 'texto', visibleSi: { campo: 'tipo_documento', valores: ['CC'] } },
  { id: 'domicilio', etiqueta: 'Domicilio (fórmula)', tipo: 'texto', predeterminado: 'la ciudad de Neiva (H)', ayuda: 'Ej.: "la ciudad de Neiva (H)" o "el Municipio de Palermo (H)".', visibleSi: { campo: 'tipo_persona', valores: ['NATURAL'] } },
  { id: 'menor_de_edad', etiqueta: 'Es menor de edad', tipo: 'booleano', visibleSi: { campo: 'tipo_persona', valores: ['NATURAL'] } },
  { id: 'estado_civil', etiqueta: 'Estado civil', tipo: 'opciones', opciones: ESTADOS_CIVILES.map((e) => ({ valor: e, etiqueta: e })), visibleSi: { campo: 'tipo_persona', valores: ['NATURAL'] } },
  { id: 'actividad_economica', etiqueta: 'Actividad económica', tipo: 'texto', visibleSi: { campo: 'tipo_persona', valores: ['NATURAL'] } },
  { id: 'apoderado_id', etiqueta: 'Comparece por apoderado(a)', tipo: 'persona', ayuda: 'Seleccione la persona que actúa como apoderada (regístrela antes en esta lista).', visibleSi: { campo: 'tipo_persona', valores: ['NATURAL'] } },
  { id: 'poder_tipo', etiqueta: 'Tipo de poder', tipo: 'opciones', opciones: [{ valor: 'ESPECIAL', etiqueta: 'Especial' }, { valor: 'GENERAL', etiqueta: 'General' }], predeterminado: 'ESPECIAL', visibleSi: { campo: 'tipo_persona', valores: ['NATURAL'] } },
  { id: 'poder_incluye_estado_civil', etiqueta: 'El poder faculta para declarar el estado civil', tipo: 'booleano', visibleSi: { campo: 'tipo_persona', valores: ['NATURAL'] } },
  { id: 'representante_legal_id', etiqueta: 'Representante legal del menor (padre/madre)', tipo: 'persona', visibleSi: { campo: 'menor_de_edad', valores: [true] } },
  { id: 'tarjeta_profesional', etiqueta: 'Tarjeta profesional (si actúa como abogado)', tipo: 'texto', validacion: 'tarjeta_profesional', visibleSi: { campo: 'tipo_persona', valores: ['NATURAL'] } },
  { id: 'descripcion_entidad', etiqueta: 'Descripción de la entidad', tipo: 'texto', ayuda: 'Ej.: "establecimiento bancario con domicilio principal en la ciudad de Bogotá D.C".', visibleSi: { campo: 'tipo_persona', valores: ['JURIDICA'] } },
  { id: 'constitucion_texto', etiqueta: 'Constitución e inscripción', tipo: 'textoLargo', visibleSi: { campo: 'tipo_persona', valores: ['JURIDICA'] } },
  { id: 'representante_id', etiqueta: 'Persona que comparece por la entidad', tipo: 'persona', visibleSi: { campo: 'tipo_persona', valores: ['JURIDICA'] } },
  { id: 'representacion', etiqueta: 'Calidad en que comparece', tipo: 'opciones', opciones: [{ valor: 'LEGAL', etiqueta: 'Representante legal' }, { valor: 'PODER', etiqueta: 'Apoderado de la entidad' }], visibleSi: { campo: 'tipo_persona', valores: ['JURIDICA'] } },
  { id: 'poder_entidad_soporte', etiqueta: 'Soporte del poder de la entidad', tipo: 'textoLargo', ayuda: 'Ej.: "escritura pública número 9359 del 20 de DICIEMBRE de 2019, otorgada en la Notaría Treinta y Ocho de Bogotá D.C".', visibleSi: { campo: 'representacion', valores: ['PODER'] } },
];

export const CAMPOS_INMUEBLE: Campo[] = [
  { id: 'tipo_inmueble', etiqueta: 'Tipo de inmueble', tipo: 'opciones', obligatorio: true, opciones: ['LOTE', 'CASA', 'APARTAMENTO', 'LOCAL', 'BODEGA', 'PARQUEADERO', 'DEPOSITO', 'PREDIO RURAL', 'MEJORAS'].map((v) => ({ valor: v, etiqueta: v })) },
  { id: 'nombre_corto', etiqueta: 'Identificación corta', tipo: 'texto', ayuda: 'Ej.: "LOTE 8 MANZANA 32", "APARTAMENTO 103 TORRE G".' },
  { id: 'direccion', etiqueta: 'Nombre o dirección del inmueble', tipo: 'texto', obligatorio: true },
  { id: 'municipio', etiqueta: 'Municipio', tipo: 'texto', obligatorio: true, predeterminado: 'Neiva' },
  { id: 'departamento', etiqueta: 'Departamento', tipo: 'texto', obligatorio: true, predeterminado: 'Huila' },
  { id: 'area_terreno', etiqueta: 'Área del terreno (m²)', tipo: 'medida', validacion: 'medida' },
  { id: 'area_construida', etiqueta: 'Área construida (m²)', tipo: 'medida', validacion: 'medida' },
  { id: 'descripcion', etiqueta: 'Descripción de la construcción / dependencias', tipo: 'textoLargo' },
  { id: 'linderos', etiqueta: 'Linderos (tal como constan en el título)', tipo: 'textoLargo', obligatorio: true },
  { id: 'matricula', etiqueta: 'Matrícula inmobiliaria', tipo: 'texto', obligatorio: true, validacion: 'matricula' },
  { id: 'orip', etiqueta: 'Oficina de registro', tipo: 'texto', obligatorio: true, predeterminado: 'NEIVA - HUILA' },
  { id: 'cedula_catastral', etiqueta: 'Cédula catastral', tipo: 'texto', obligatorio: true, validacion: 'cedula_catastral' },
  { id: 'cedula_catastral_paz_salvo', etiqueta: 'Cédula catastral del paz y salvo', tipo: 'texto', validacion: 'cedula_catastral' },
  { id: 'involucrada_mayor_extension', etiqueta: 'Cédula catastral involucrada en mayor extensión', tipo: 'booleano' },
  { id: 'matricula_matriz', etiqueta: 'Matrícula matriz', tipo: 'texto', validacion: 'matricula' },
  { id: 'fecha_certificado_tradicion', etiqueta: 'Fecha del certificado de tradición', tipo: 'fecha', obligatorio: true, validacion: 'fecha_pasada' },
  { id: 'tradicion.modo', etiqueta: 'Modo de adquisición', tipo: 'opciones', obligatorio: true, opciones: [{ valor: 'COMPRA', etiqueta: 'Compra' }, { valor: 'ADJUDICACION_SUCESION', etiqueta: 'Adjudicación en sucesión' }, { valor: 'ADJUDICACION_LIQUIDACION', etiqueta: 'Adjudicación en liquidación' }, { valor: 'DONACION', etiqueta: 'Donación' }, { valor: 'OTRO', etiqueta: 'Otro' }] },
  { id: 'tradicion.modo_texto_libre', etiqueta: 'Modo de adquisición (texto)', tipo: 'texto', visibleSi: { campo: 'tradicion.modo', valores: ['OTRO'] } },
  { id: 'tradicion.tradente', etiqueta: 'Adquirido de (tradente)', tipo: 'texto', obligatorio: true },
  { id: 'tradicion.escritura_numero', etiqueta: 'Escritura de adquisición – número', tipo: 'texto', obligatorio: true },
  { id: 'tradicion.escritura_fecha', etiqueta: 'Escritura de adquisición – fecha', tipo: 'fecha', obligatorio: true, validacion: 'fecha_pasada' },
  { id: 'tradicion.notaria', etiqueta: 'Escritura de adquisición – notaría', tipo: 'texto', obligatorio: true, predeterminado: 'la Notaria Primera de Neiva' },
  { id: 'tradicion.estado_civil_adquirente', etiqueta: 'Estado civil al adquirir', tipo: 'opciones', opciones: ESTADOS_CIVILES.map((e) => ({ valor: e, etiqueta: e })) },
  { id: 'ph_activo', etiqueta: 'Sometido a propiedad horizontal', tipo: 'booleano' },
  { id: 'ph.nombre_copropiedad', etiqueta: 'PH – nombre de la copropiedad', tipo: 'texto', visibleSi: { campo: 'ph_activo', valores: [true] } },
  { id: 'ph.escritura_numero', etiqueta: 'PH – escritura del reglamento (número)', tipo: 'texto', visibleSi: { campo: 'ph_activo', valores: [true] } },
  { id: 'ph.escritura_fecha', etiqueta: 'PH – fecha de la escritura', tipo: 'fecha', visibleSi: { campo: 'ph_activo', valores: [true] } },
  { id: 'ph.notaria', etiqueta: 'PH – notaría', tipo: 'texto', visibleSi: { campo: 'ph_activo', valores: [true] } },
  { id: 'paz_salvo.entidad', etiqueta: 'Paz y salvo – entidad', tipo: 'texto', predeterminado: 'la Secretaría de Hacienda de Neiva (H)' },
  { id: 'paz_salvo.vigencia_hasta', etiqueta: 'Paz y salvo – vigente hasta', tipo: 'fecha', validacion: 'fecha' },
  { id: 'paz_salvo.avaluo', etiqueta: 'Avalúo catastral', tipo: 'moneda', validacion: 'valor' },
];

export const PASOS_COMUNES: Paso[] = [
  {
    id: 'escritura', titulo: 'Datos de la escritura', descripcion: 'El número y la fecha se asignan al protocolizar; pueden quedar en blanco en el borrador.',
    campos: [
      { id: 'autoriza', etiqueta: 'Autoriza', tipo: 'opciones', obligatorio: true, predeterminado: 'TITULAR', opciones: [{ valor: 'TITULAR', etiqueta: 'Notario titular' }, { valor: 'ENCARGADO', etiqueta: 'Notario(a) encargado(a)' }] },
      { id: 'encargado_nombre', etiqueta: 'Nombre del notario(a) encargado(a)', tipo: 'texto', visibleSi: { campo: 'autoriza', valores: ['ENCARGADO'] } },
      { id: 'resolucion_encargo', etiqueta: 'Resolución del encargo', tipo: 'texto', ayuda: 'Ej.: 2026-018684-6 del 23 de Julio de 2026', visibleSi: { campo: 'autoriza', valores: ['ENCARGADO'] } },
      { id: 'numero', etiqueta: 'Número de escritura', tipo: 'entero' },
      { id: 'fecha_otorgamiento', etiqueta: 'Fecha de otorgamiento', tipo: 'fecha', validacion: 'fecha' },
      { id: 'diferentes_momentos', etiqueta: 'Se otorga en diferentes momentos', tipo: 'booleano', predeterminado: true },
      { id: 'codigo_minuta', etiqueta: 'Código interno de la minuta (pie)', tipo: 'texto' },
    ],
  },
  { id: 'personas', titulo: 'Personas', descripcion: 'Registre una vez a cada persona o entidad que interviene (incluidos apoderados, representantes y cónyuges que coadyuvan).', campos: CAMPOS_PERSONA },
  { id: 'inmuebles', titulo: 'Inmuebles', descripcion: 'Registre cada inmueble con los datos del certificado de tradición y del título anterior.', campos: CAMPOS_INMUEBLE },
];

// ---------------------------------------------------------------- esquemas por acto

const DOC = (tipo: TipoDocumental, etiqueta: string, obligatorio = true) => ({ tipo, etiqueta, obligatorio });

export const ESQUEMAS: Record<string, EsquemaActo> = {
  compraventa: {
    tipo: 'compraventa', version: 1, titulo: 'Compraventa de inmueble', plantillaFuente: 'F52 (410 - CASA HABITACION - SOLTERA)',
    pasos: [{
      id: 'compraventa', titulo: 'Compraventa',
      campos: [
        { id: 'vendedores', etiqueta: 'Vendedor(es)', tipo: 'personas', obligatorio: true },
        { id: 'compradores', etiqueta: 'Comprador(es)', tipo: 'personas', obligatorio: true },
        { id: 'inmuebles', etiqueta: 'Inmueble(s) que se venden', tipo: 'inmuebles', obligatorio: true },
        { id: 'es_cuota', etiqueta: 'Se vende un derecho de cuota', tipo: 'booleano' },
        { id: 'cuota_texto', etiqueta: 'Derecho de cuota (fracción o porcentaje)', tipo: 'texto', ayuda: 'Ej.: "1/10 parte" o "94.64%".', visibleSi: { campo: 'es_cuota', valores: [true] } },
        { id: 'precio', etiqueta: 'Precio', tipo: 'moneda', obligatorio: true, validacion: 'valor', ayuda: 'El valor en letras se genera automáticamente.' },
        { id: 'forma_pago_texto', etiqueta: 'Forma de pago (opcional)', tipo: 'textoLargo', ayuda: 'Si se deja vacío: "suma que el vendedor manifiesta haber recibido en su totalidad…"' },
        { id: 'afectacion', etiqueta: 'Afectación a vivienda familiar', tipo: 'opciones', obligatorio: true, opciones: [{ valor: 'NO_APLICA', etiqueta: 'No aplica (comprador soltero sin unión marital)' }, { valor: 'NO_PROCEDE_LOTE', etiqueta: 'No procede: lote de terreno sin construcción (cualquier estado civil)' }, { valor: 'SI', etiqueta: 'Sí se afecta' }, { valor: 'NO', etiqueta: 'No se afecta (constancia de indagación)' }] },
        { id: 'coadyuvante_id', etiqueta: 'Cónyuge o compañero(a) que coadyuva (si no compra)', tipo: 'persona', visibleSi: { campo: 'afectacion', valores: ['SI', 'NO'] } },
        { id: 'vinculo', etiqueta: 'Vínculo', tipo: 'opciones', opciones: [{ valor: 'CASADOS', etiqueta: 'Cónyuges' }, { valor: 'COMPANEROS', etiqueta: 'Compañeros permanentes' }], visibleSi: { campo: 'afectacion', valores: ['SI', 'NO'] } },
        { id: 'excepcion_gravamen', etiqueta: 'Gravamen que subsiste (excepción a la cláusula de libertad)', tipo: 'textoLargo', ayuda: 'Solo si un gravamen continúa vigente (caso F69). Va en un PARAGRAFO aparte después de la cláusula de libertad: escriba el gravamen (p. ej. «servidumbre de acueducto pasiva en mayor extensión, inscrita en la anotación 001») o el parágrafo completo empezando por «No obstante, …».' },
      ],
    }],
    documentosSoporte: [DOC('CERTIFICADO_TRADICION', 'Certificado de tradición y libertad'), DOC('PAZ_Y_SALVO', 'Paz y salvo predial y de valorización'), DOC('CEDULA', 'Cédulas de los comparecientes'), DOC('ESCRITURA_ANTERIOR', 'Título de adquisición', false), DOC('PODER', 'Poder (si hay apoderado)', false), DOC('CERTIFICADO_EXISTENCIA', 'Certificado de existencia (si interviene una sociedad)', false)],
    reglas: ['R01', 'R02', 'R03-TITULAR', 'R03-MATRICULA', 'R03-GRAVAMEN-VIGENTE', 'R03-LIMITACION-VIGENTE', 'R03-CERT-ANTIGUO', 'R04', 'R05-PRECIO-AVALUO', 'R05-AFECTACION', 'R08', 'R09', 'R12'],
  },
};

/**
 * Tipos con formulario propio (programado aquí). Los demás se agregan a ESQUEMAS en cuanto tienen
 * una plantilla aprobada, con el formulario armado desde sus variables (src/lib/servicios/actos-plantilla.ts).
 */
export const TIPOS_CON_FORMULARIO_PROPIO = new Set(Object.keys(ESQUEMAS));

/** Pasos completos de un expediente: comunes + los de cada acto, en orden */
export function pasosExpediente(actos: string[]): { paso: Paso; acto?: string }[] {
  return [
    ...PASOS_COMUNES.map((paso) => ({ paso })),
    ...actos.filter((a) => ESQUEMAS[a]).flatMap((a) => ESQUEMAS[a].pasos.map((paso) => ({ paso, acto: a }))),
  ];
}

export const SI_NO_OPCIONES = SI_NO;
