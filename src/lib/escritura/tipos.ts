/**
 * Estructura de los datos de un expediente (lo que diligencia el formulario por pasos
 * y lo que precarga la IA). Las personas y los inmuebles se registran una sola vez y
 * cada acto los referencia por id, porque en una misma escritura suelen repetirse
 * (p. ej. la vendedora que primero cancela el patrimonio de familia y luego vende).
 */

export type Genero = 'M' | 'F';
export type TipoDocumento = 'CC' | 'CE' | 'NUIP' | 'TI' | 'PASAPORTE' | 'NIT';

export const ESTADOS_CIVILES = [
  'SOLTERO(A), SIN UNION MARITAL DE HECHO',
  'SOLTERO(A), CON UNION MARITAL DE HECHO',
  'CASADO(A), CON SOCIEDAD CONYUGAL VIGENTE',
  'CASADO(A), CON SOCIEDAD CONYUGAL DISUELTA Y LIQUIDADA',
  'DIVORCIADO(A), SIN UNION MARITAL DE HECHO',
  'DIVORCIADO(A), CON UNION MARITAL DE HECHO',
  'VIUDO(A), SIN UNION MARITAL DE HECHO',
  'VIUDO(A), CON UNION MARITAL DE HECHO',
] as const;

export interface Persona {
  id: string;
  tipo_persona: 'NATURAL' | 'JURIDICA';
  /** Natural: nombre completo. Jurídica: razón social. */
  nombre: string;
  genero?: Genero; // naturales; en jurídicas se usa el género gramatical ("la sociedad", "el banco")
  tipo_documento: TipoDocumento;
  numero_documento: string;
  lugar_expedicion?: string;
  /** Fórmula de domicilio, p. ej. "la ciudad de Neiva (H)" o "el Municipio de Palermo (H)" */
  domicilio?: string;
  /** Uno de ESTADOS_CIVILES (la (A) se resuelve según el género) */
  estado_civil?: string;
  actividad_economica?: string;
  menor_de_edad?: boolean;

  // ---- Persona jurídica
  /** p. ej. "establecimiento bancario con domicilio principal en la ciudad de Bogotá D.C" */
  descripcion_entidad?: string;
  /** p. ej. "constituida mediante documento privado de fecha … inscrita … en la Cámara de Comercio de …" */
  constitucion_texto?: string;
  /** Persona natural que comparece por la entidad */
  representante_id?: string;
  /** LEGAL (certificado de existencia) o PODER (apoderado de la entidad) */
  representacion?: 'LEGAL' | 'PODER';
  /** Soporte del poder de la entidad: "escritura pública número 9359 del 20 de DICIEMBRE de 2019, otorgada en la Notaría Treinta y Ocho de Bogotá D.C" */
  poder_entidad_soporte?: string;

  // ---- Persona natural representada
  apoderado_id?: string;
  poder_tipo?: 'ESPECIAL' | 'GENERAL';
  /** El poder faculta expresamente para declarar el estado civil (si no, va la constancia del notario) */
  poder_incluye_estado_civil?: boolean;
  /** Menor de edad: quien ejerce la patria potestad */
  representante_legal_id?: string;
  /** "su progenitora", "su progenitor" */
  parentesco_representante?: string;

  // ---- Apoderado abogado
  tarjeta_profesional?: string;
}

export interface Inmueble {
  id: string;
  tipo_inmueble: 'LOTE' | 'CASA' | 'APARTAMENTO' | 'LOCAL' | 'BODEGA' | 'PARQUEADERO' | 'DEPOSITO' | 'PREDIO RURAL' | 'MEJORAS';
  /** Nombre corto para el cuerpo: "LOTE 1", "CASA 15 MANZANA A", "APARTAMENTO 103 TORRE G" */
  nombre_corto?: string;
  /** Nomenclatura: "CARRERA 19 NÚMERO 6A SUR 12 - URBANIZACION EMAYA" */
  direccion: string;
  municipio: string;
  departamento: string;
  area_terreno?: number;
  area_construida?: number;
  /** Descripción de la construcción o dependencias */
  descripcion?: string;
  /** Linderos tal como constan en el título (uno por línea) */
  linderos: string;
  matricula: string;
  /** Oficina de registro: "NEIVA - HUILA" */
  orip: string;
  cedula_catastral: string;
  cedula_catastral_paz_salvo?: string;
  involucrada_mayor_extension?: boolean;
  matricula_matriz?: string;
  /** Marca del formulario: si es false se descartan los datos de propiedad horizontal */
  ph_activo?: boolean;
  ph?: {
    nombre_copropiedad: string;
    escritura_numero: string;
    escritura_fecha: string; // AAAA-MM-DD
    notaria: string; // "la Notaria Tercera de Neiva"
    coeficiente?: string;
  };
  tradicion: {
    modo: 'COMPRA' | 'ADJUDICACION_SUCESION' | 'ADJUDICACION_LIQUIDACION' | 'DONACION' | 'OTRO';
    modo_texto_libre?: string;
    tradente: string;
    escritura_numero: string;
    escritura_fecha: string; // AAAA-MM-DD
    notaria: string; // "la Notaria Primera de Neiva"
    estado_civil_adquirente?: string;
  };
  fecha_certificado_tradicion: string; // AAAA-MM-DD
  paz_salvo?: {
    entidad: string; // "la Secretaría de Hacienda de Neiva (H)"
    vigencia_hasta: string; // AAAA-MM-DD
    avaluo: number;
    paz_salvo_valorizacion?: boolean;
  };
}

export interface DatosEscritura {
  fecha_otorgamiento?: string;
  numero?: number;
  autoriza: 'TITULAR' | 'ENCARGADO';
  encargado_nombre?: string;
  resolucion_encargo?: string;
  diferentes_momentos?: boolean;
  codigo_minuta?: string;
  hojas?: string;
  derechos?: string;
  retefuente?: string;
  libro_varios?: string;
}

/** Datos por acto (la forma de cada uno la define su esquema de formulario) */
export type DatosActo = Record<string, unknown>;

export interface DatosExpediente {
  escritura: DatosEscritura;
  personas: Persona[];
  inmuebles: Inmueble[];
  /** Clave = id del tipo de acto */
  actos: Record<string, DatosActo>;
}

export const datosVacios = (): DatosExpediente => ({
  escritura: { autoriza: 'TITULAR', diferentes_momentos: true },
  personas: [],
  inmuebles: [],
  actos: {},
});
