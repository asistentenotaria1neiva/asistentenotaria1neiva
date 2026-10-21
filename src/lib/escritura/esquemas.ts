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
        { id: 'afectacion', etiqueta: 'Afectación a vivienda familiar', tipo: 'opciones', obligatorio: true, opciones: [{ valor: 'NO_APLICA', etiqueta: 'No aplica (comprador soltero sin unión marital)' }, { valor: 'SI', etiqueta: 'Sí se afecta' }, { valor: 'NO', etiqueta: 'No se afecta (constancia de indagación)' }] },
        { id: 'coadyuvante_id', etiqueta: 'Cónyuge o compañero(a) que coadyuva (si no compra)', tipo: 'persona', visibleSi: { campo: 'afectacion', valores: ['SI', 'NO'] } },
        { id: 'vinculo', etiqueta: 'Vínculo', tipo: 'opciones', opciones: [{ valor: 'CASADOS', etiqueta: 'Cónyuges' }, { valor: 'COMPANEROS', etiqueta: 'Compañeros permanentes' }], visibleSi: { campo: 'afectacion', valores: ['SI', 'NO'] } },
        { id: 'excepcion_gravamen', etiqueta: 'Gravamen que subsiste (excepción a la cláusula de libertad)', tipo: 'textoLargo', ayuda: 'Solo si un gravamen continúa vigente (caso F69).' },
      ],
    }],
    documentosSoporte: [DOC('CERTIFICADO_TRADICION', 'Certificado de tradición y libertad'), DOC('PAZ_Y_SALVO', 'Paz y salvo predial y de valorización'), DOC('CEDULA', 'Cédulas de los comparecientes'), DOC('ESCRITURA_ANTERIOR', 'Título de adquisición', false), DOC('PODER', 'Poder (si hay apoderado)', false), DOC('CERTIFICADO_EXISTENCIA', 'Certificado de existencia (si interviene una sociedad)', false)],
    reglas: ['R01', 'R02', 'R03-TITULAR', 'R03-MATRICULA', 'R03-GRAVAMEN-VIGENTE', 'R03-LIMITACION-VIGENTE', 'R03-CERT-ANTIGUO', 'R04', 'R05-PRECIO-AVALUO', 'R05-AFECTACION', 'R08', 'R09', 'R12'],
  },
  cancelacion_hipoteca: {
    tipo: 'cancelacion_hipoteca', version: 1, titulo: 'Cancelación de hipoteca', plantillaFuente: 'F16 (23 - BANCO DE BOGOTA)',
    pasos: [{
      id: 'cancelacion_hipoteca', titulo: 'Cancelación de hipoteca',
      campos: [
        { id: 'acreedor_id', etiqueta: 'Entidad acreedora', tipo: 'persona', obligatorio: true },
        { id: 'deudores', etiqueta: 'Deudor(es) que constituyeron la hipoteca', tipo: 'personas', obligatorio: true },
        { id: 'inmueble_id', etiqueta: 'Inmueble hipotecado', tipo: 'inmueble', obligatorio: true },
        { id: 'escritura_hipoteca_numero', etiqueta: 'Escritura de hipoteca – número', tipo: 'texto', obligatorio: true },
        { id: 'escritura_hipoteca_fecha', etiqueta: 'Escritura de hipoteca – fecha', tipo: 'fecha', obligatorio: true, validacion: 'fecha_pasada' },
        { id: 'escritura_hipoteca_notaria', etiqueta: 'Escritura de hipoteca – notaría', tipo: 'texto', obligatorio: true, predeterminado: 'la Notaría Primera de Neiva' },
        { id: 'valor_hipoteca', etiqueta: 'Valor garantizado', tipo: 'moneda', obligatorio: true, validacion: 'valor' },
        { id: 'sin_cuantia', etiqueta: 'Acto sin cuantía (art. 23 Ley 546 de 1999)', tipo: 'booleano', predeterminado: true, ayuda: 'Criterio pendiente de definir por el notario (F34 y F32 se otorgaron con cuantía).' },
        { id: 'minuta_presentada', etiqueta: 'Elaborada con minuta presentada por la entidad', tipo: 'booleano', predeterminado: true },
      ],
    }],
    documentosSoporte: [DOC('CERTIFICADO_TRADICION', 'Certificado de tradición'), DOC('PODER', 'Poder del apoderado del banco y certificado de vigencia'), DOC('CERTIFICADO_EXISTENCIA', 'Certificado de existencia de la entidad'), DOC('OTRO', 'Minuta o carta de la entidad', false)],
    reglas: ['R01', 'R02', 'R03-CANCELA-INEXISTENTE', 'R09'],
  },
  constitucion_afectacion: {
    tipo: 'constitucion_afectacion', version: 1, titulo: 'Constitución de afectación a vivienda familiar', plantillaFuente: 'F11 (2 - CASADOS - BIFAMILIAR ROSADO)',
    pasos: [{ id: 'constitucion_afectacion', titulo: 'Afectación', campos: [
      { id: 'propietario_id', etiqueta: 'Propietario(a)', tipo: 'persona', obligatorio: true },
      { id: 'conyuge_id', etiqueta: 'Cónyuge o compañero(a) permanente', tipo: 'persona', obligatorio: true },
      { id: 'inmueble_id', etiqueta: 'Inmueble', tipo: 'inmueble', obligatorio: true },
    ] }],
    documentosSoporte: [DOC('CERTIFICADO_TRADICION', 'Certificado de tradición'), DOC('PAZ_Y_SALVO', 'Paz y salvo predial'), DOC('CEDULA', 'Cédulas'), DOC('REGISTRO_CIVIL_MATRIMONIO', 'Registro civil de matrimonio o prueba de la unión marital', false)],
    reglas: ['R01', 'R02', 'R03-TITULAR', 'R03-GRAVAMEN-VIGENTE', 'R04', 'R08'],
  },
  cancelacion_afectacion: {
    tipo: 'cancelacion_afectacion', version: 1, titulo: 'Cancelación de afectación a vivienda familiar', plantillaFuente: 'F14 (2 - UNION LIBRE)',
    pasos: [{ id: 'cancelacion_afectacion', titulo: 'Cancelación de afectación', campos: [
      { id: 'propietario_id', etiqueta: 'Propietario(a)', tipo: 'persona', obligatorio: true },
      { id: 'conyuge_id', etiqueta: 'Cónyuge o compañero(a) permanente', tipo: 'persona', obligatorio: true },
      { id: 'inmueble_id', etiqueta: 'Inmueble', tipo: 'inmueble', obligatorio: true },
      { id: 'forma_afectacion', etiqueta: 'Cómo quedó afectado', tipo: 'opciones', obligatorio: true, opciones: [{ valor: 'LEY', etiqueta: 'Por ministerio de la ley (en la escritura de compra)' }, { valor: 'VOLUNTARIA', etiqueta: 'Voluntariamente' }] },
      { id: 'escritura_afectacion_texto', etiqueta: 'Escritura de afectación (si es distinta a la de adquisición)', tipo: 'texto', ayuda: 'Formato: "214 del 06 de FEBRERO de 2024, otorgada en la Notaria Primera de Neiva".' },
    ] }],
    documentosSoporte: [DOC('CERTIFICADO_TRADICION', 'Certificado de tradición'), DOC('CEDULA', 'Cédulas'), DOC('PODER', 'Poder (si un cónyuge comparece por el otro)', false)],
    reglas: ['R01', 'R02', 'R03-TITULAR', 'R03-CANCELA-INEXISTENTE', 'R08', 'R09'],
  },
  cancelacion_patrimonio: {
    tipo: 'cancelacion_patrimonio', version: 1, titulo: 'Cancelación de patrimonio de familia', plantillaFuente: 'F61 (6 - CONDICION 5 AÑOS - CANCELACION PATRIMONIO), segundo acto',
    pasos: [{ id: 'cancelacion_patrimonio', titulo: 'Cancelación de patrimonio de familia', campos: [
      { id: 'propietario_id', etiqueta: 'Propietario(a) que lo constituyó', tipo: 'persona', obligatorio: true },
      { id: 'inmueble_id', etiqueta: 'Inmueble', tipo: 'inmueble', obligatorio: true },
      { id: 'beneficiarios_cita', etiqueta: 'Beneficiarios (cita textual de la escritura de constitución)', tipo: 'textoLargo', obligatorio: true, ayuda: 'Ej.: "A favor suyo, de sus hijos y de los hijos que llegare a tener en el futuro".' },
      { id: 'escritura_constitucion_texto', etiqueta: 'Escritura de constitución (si es distinta a la de adquisición)', tipo: 'texto' },
      { id: 'hijos', etiqueta: 'Hijos beneficiarios', tipo: 'lista', obligatorio: true, subcampos: [
        { id: 'nombre', etiqueta: 'Nombre completo', tipo: 'texto', obligatorio: true },
        { id: 'genero', etiqueta: 'Género', tipo: 'opciones', opciones: [{ valor: 'F', etiqueta: 'F' }, { valor: 'M', etiqueta: 'M' }] },
        { id: 'mayor_de_edad', etiqueta: 'Es mayor de edad', tipo: 'booleano', obligatorio: true, predeterminado: true },
      ] },
    ] }],
    documentosSoporte: [DOC('CERTIFICADO_TRADICION', 'Certificado de tradición'), DOC('REGISTRO_CIVIL_NACIMIENTO', 'Registros civiles de nacimiento de los beneficiarios'), DOC('CEDULA', 'Cédula')],
    reglas: ['R01', 'R02', 'R03-TITULAR', 'R03-CANCELA-INEXISTENTE', 'R07-PATRIMONIO-MENORES', 'R08'],
  },
  cancelacion_condicion: {
    tipo: 'cancelacion_condicion', version: 1, titulo: 'Cancelación de condición resolutoria', plantillaFuente: 'F44 (4 - CONDICION 2 AÑOS) y F61',
    pasos: [{ id: 'cancelacion_condicion', titulo: 'Cancelación de condición resolutoria', campos: [
      { id: 'propietario_id', etiqueta: 'Propietario(a) actual', tipo: 'persona', obligatorio: true },
      { id: 'inmueble_id', etiqueta: 'Inmueble', tipo: 'inmueble', obligatorio: true },
      { id: 'plazo_anios', etiqueta: 'Plazo de la condición', tipo: 'opciones', obligatorio: true, opciones: [{ valor: '2', etiqueta: '2 años (desde la escritura)' }, { valor: '5', etiqueta: '5 años (desde la asignación del subsidio)' }] },
      { id: 'clausula', etiqueta: 'Cláusula donde se pactó', tipo: 'texto', obligatorio: true, ayuda: 'Ej.: "séptima".' },
      { id: 'anotacion', etiqueta: 'Número de anotación en el certificado', tipo: 'texto', obligatorio: true },
      { id: 'inscripcion_texto', etiqueta: 'Texto de la inscripción en el certificado', tipo: 'texto', ayuda: 'Se precarga según el plazo; debe coincidir con el certificado.' },
      { id: 'acto_asignacion_subsidio', etiqueta: 'Oficio/acta de asignación del subsidio', tipo: 'textoLargo', visibleSi: { campo: 'plazo_anios', valores: ['5', 5] } },
      { id: 'escritura_origen_texto', etiqueta: 'Escritura de origen (si es distinta a la de adquisición)', tipo: 'texto' },
    ] }],
    documentosSoporte: [DOC('CERTIFICADO_TRADICION', 'Certificado de tradición (anotación de la condición)'), DOC('ESCRITURA_ANTERIOR', 'Escritura donde se pactó la condición', false), DOC('CEDULA', 'Cédula')],
    reglas: ['R01', 'R02', 'R03-TITULAR', 'R03-ANOTACION', 'R06-PLAZO-CONDICION', 'R08'],
  },
  derechos_herenciales: {
    tipo: 'derechos_herenciales', version: 1, titulo: 'Compraventa de derechos herenciales (título universal)', plantillaFuente: 'F36 (364 - DERECHOS HERENCIALES UNIVERSAL)',
    pasos: [{ id: 'derechos_herenciales', titulo: 'Derechos herenciales', campos: [
      { id: 'vendedores', etiqueta: 'Heredero(s) que venden', tipo: 'personas', obligatorio: true },
      { id: 'compradores', etiqueta: 'Comprador(es)', tipo: 'personas', obligatorio: true },
      { id: 'precio', etiqueta: 'Precio', tipo: 'moneda', obligatorio: true, validacion: 'valor' },
      { id: 'porcentaje', etiqueta: 'Porcentaje que se vende (si no es la totalidad)', tipo: 'texto', ayuda: 'Ej.: "50%".' },
      { id: 'causante_nombre', etiqueta: 'Causante – nombre', tipo: 'texto', obligatorio: true },
      { id: 'causante_genero', etiqueta: 'Causante – género', tipo: 'opciones', obligatorio: true, opciones: [{ valor: 'M', etiqueta: 'Masculino' }, { valor: 'F', etiqueta: 'Femenino' }] },
      { id: 'causante_documento', etiqueta: 'Causante – cédula', tipo: 'texto', obligatorio: true, validacion: 'cedula' },
      { id: 'causante_fecha_defuncion', etiqueta: 'Causante – fecha de defunción', tipo: 'fecha', obligatorio: true, validacion: 'fecha_pasada' },
      { id: 'causante_lugar_defuncion', etiqueta: 'Causante – lugar de defunción', tipo: 'texto', obligatorio: true, predeterminado: 'la ciudad de Neiva, Departamento del Huila' },
      { id: 'parentesco', etiqueta: 'Parentesco del vendedor con el causante', tipo: 'texto', obligatorio: true, ayuda: 'Ej.: "padre", "madre".' },
    ] }],
    documentosSoporte: [DOC('REGISTRO_CIVIL_DEFUNCION', 'Registro civil de defunción del causante'), DOC('REGISTRO_CIVIL_NACIMIENTO', 'Registros civiles que acreditan el parentesco'), DOC('CEDULA', 'Cédulas')],
    reglas: ['R01', 'R08', 'R09', 'R12'],
  },
  salida_pais_menor: {
    tipo: 'salida_pais_menor', version: 1, titulo: 'Autorización de salida del país de menor', plantillaFuente: 'F04 (12 - MENOR (1) - TODOS LOS PAISES) y F07',
    pasos: [{ id: 'salida_pais_menor', titulo: 'Autorización de salida del país', campos: [
      { id: 'otorgante_id', etiqueta: 'Padre o madre que autoriza', tipo: 'persona', obligatorio: true },
      { id: 'menor_id', etiqueta: 'Menor de edad', tipo: 'persona', obligatorio: true },
      { id: 'acompanante_id', etiqueta: 'Persona que acompaña al menor', tipo: 'persona', obligatorio: true },
      { id: 'parentesco_acompanante', etiqueta: 'Parentesco del acompañante con el menor', tipo: 'texto', ayuda: 'Ej.: "madre".' },
      { id: 'paises_texto', etiqueta: 'Países de destino', tipo: 'textoLargo', obligatorio: true, ayuda: 'Lista de países, o todos los países tal como los relaciona la notaría.' },
      { id: 'proposito', etiqueta: 'Propósito del viaje', tipo: 'texto', obligatorio: true },
      { id: 'fecha_inicio', etiqueta: 'Autoriza a partir de', tipo: 'fecha', obligatorio: true, validacion: 'fecha' },
      { id: 'vigencia_hasta', etiqueta: 'Autoriza hasta', tipo: 'fecha', obligatorio: true, validacion: 'fecha' },
      { id: 'con_aceptacion', etiqueta: 'El acompañante comparece y acepta', tipo: 'booleano', predeterminado: true },
      { id: 'facultades_adicionales', etiqueta: 'Facultades adicionales (opcional)', tipo: 'textoLargo', ayuda: 'Ej.: empadronamiento, pasaportes, visados (variante F60).' },
    ] }],
    documentosSoporte: [DOC('REGISTRO_CIVIL_NACIMIENTO', 'Registro civil de nacimiento del menor'), DOC('CEDULA', 'Cédulas del otorgante y del acompañante')],
    reglas: ['R01', 'R08', 'R10'],
  },
  divorcio_civil: {
    tipo: 'divorcio_civil', version: 1, titulo: 'Divorcio de matrimonio civil (liquidación en ceros)', plantillaFuente: 'F59 (5 - MATRIMONIO CIVIL - LIQUIDACION EN 0 - SIN HIJOS)',
    pasos: [{ id: 'divorcio_civil', titulo: 'Divorcio', campos: [
      { id: 'conyuges', etiqueta: 'Cónyuges', tipo: 'personas', obligatorio: true },
      { id: 'apoderado_id', etiqueta: 'Apoderado(a) abogado(a)', tipo: 'persona', obligatorio: true },
      { id: 'matrimonio_fecha', etiqueta: 'Fecha del matrimonio', tipo: 'fecha', obligatorio: true, validacion: 'fecha_pasada' },
      { id: 'matrimonio_lugar', etiqueta: 'Lugar de celebración', tipo: 'texto', obligatorio: true },
      { id: 'matrimonio_inscripcion', etiqueta: 'Fecha de inscripción', tipo: 'fecha', obligatorio: true, validacion: 'fecha_pasada' },
      { id: 'matrimonio_serial', etiqueta: 'Indicativo serial', tipo: 'texto', obligatorio: true },
      { id: 'matrimonio_registro', etiqueta: 'Oficina de registro', tipo: 'texto', obligatorio: true },
      { id: 'hijos', etiqueta: 'Hijos', tipo: 'opciones', obligatorio: true, opciones: [{ valor: 'NINGUNO', etiqueta: 'No procrearon hijos' }, { valor: 'MAYORES', etiqueta: 'Hijos mayores de edad' }, { valor: 'MENORES', etiqueta: 'Hijos menores de edad' }] },
      { id: 'hijos_texto', etiqueta: 'Texto sobre los hijos', tipo: 'textoLargo', visibleSi: { campo: 'hijos', valores: ['MAYORES', 'MENORES'] } },
      { id: 'acuerdo', etiqueta: 'Acuerdo firmado por los cónyuges (transcripción literal)', tipo: 'textoLargo', obligatorio: true },
      { id: 'alimentos', etiqueta: 'Incluye obligación alimentaria (mérito ejecutivo)', tipo: 'booleano' },
      { id: 'oficios', etiqueta: 'Oficios a registro civil', tipo: 'lista', subcampos: [
        { id: 'destinatario', etiqueta: 'Destinatario', tipo: 'texto', obligatorio: true },
        { id: 'registro', etiqueta: 'Registro', tipo: 'opciones', obligatorio: true, opciones: [{ valor: 'NACIMIENTO', etiqueta: 'Nacimiento' }, { valor: 'MATRIMONIO', etiqueta: 'Matrimonio' }] },
        { id: 'persona', etiqueta: 'Persona (si es de nacimiento)', tipo: 'texto' },
        { id: 'oficina', etiqueta: 'Oficina', tipo: 'opciones', obligatorio: true, opciones: [{ valor: 'REGISTRADURIA', etiqueta: 'Registraduría' }, { valor: 'NOTARIA', etiqueta: 'Notaría' }] },
        { id: 'ubicacion', etiqueta: 'Ubicación', tipo: 'texto', obligatorio: true, ayuda: 'Ej.: "bajo indicativo serial número 2692201" o "al TOMO 23 - FOLIO 11".' },
        { id: 'fecha', etiqueta: 'Fecha de inscripción', tipo: 'fecha', obligatorio: true },
      ] },
    ] }],
    documentosSoporte: [DOC('REGISTRO_CIVIL_MATRIMONIO', 'Registro civil de matrimonio'), DOC('REGISTRO_CIVIL_NACIMIENTO', 'Registros civiles de nacimiento de los cónyuges'), DOC('PODER', 'Poder especial al abogado'), DOC('CEDULA', 'Cédulas'), DOC('OTRO', 'Solicitud y acuerdo firmados')],
    reglas: ['R01', 'R07-DIVORCIO-MENORES', 'R09', 'R12'],
  },
};

/** Pasos completos de un expediente: comunes + los de cada acto, en orden */
export function pasosExpediente(actos: string[]): { paso: Paso; acto?: string }[] {
  return [
    ...PASOS_COMUNES.map((paso) => ({ paso })),
    ...actos.filter((a) => ESQUEMAS[a]).flatMap((a) => ESQUEMAS[a].pasos.map((paso) => ({ paso, acto: a }))),
  ];
}

export const SI_NO_OPCIONES = SI_NO;
