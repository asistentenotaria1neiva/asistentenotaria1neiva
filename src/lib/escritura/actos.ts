/**
 * Registro de los actos con plantilla convertida. Por ahora solo la compraventa: los demás
 * actos se retiraron y se agregarán cuando la notaría entregue sus plantillas.
 *
 * Para cada acto se define:
 *   - la plantilla (.docx) y, si aplica, el anexo (oficios);
 *   - cómo se prepara su contexto a partir de los datos del formulario;
 *   - su línea en la ESPECIFICACIÓN de la carátula;
 *   - los comprobantes que se relacionan en el cierre;
 *   - quiénes comparecen (para la lista de intervinientes y las firmas).
 *
 * Los textos derivados (p. ej. "dos (2) años", "su extinto padre") reproducen
 * la redacción de las escrituras fuente citadas en cada plantilla.
 */
import type { DatosActo, DatosExpediente } from './tipos';
import {
  type PersonaPreparada, type UnidadComparecencia, ErrorDatos,
  comparecencia, identificacionGrupo, aceptacion, unidadesComparecencia,
} from './personas';
import { type InmueblePreparado } from './inmuebles';
import { articuloSustantivo, generoGrupo, unirNombres, estadoCivilConGenero } from '../texto/concordancia';
import { pesosEnLetras, formatoPesos, formatoMiles } from '../texto/numeros-a-letras';

export interface Ayudas {
  persona(id: unknown, campo: string): PersonaPreparada;
  personas(ids: unknown, campo: string): PersonaPreparada[];
  inmueble(id: unknown, campo: string): InmueblePreparado;
  inmuebles(ids: unknown, campo: string): InmueblePreparado[];
  datos: DatosExpediente;
}

export interface Oficio {
  destinatario: string;
  numero_escritura: string;
  fecha_escritura: string;
  acto_texto: string;
  personas: string;
  registro_texto: string;
  notario: string;
}

export interface ActoPreparado {
  a: Record<string, unknown>;
  /** Actos por plantilla: valores de las variables, que van sueltos en el contexto ({{nombre_propietario}}) */
  plano?: Record<string, unknown>;
  especificacion: { acto: string; valor: string }[];
  unidades: UnidadComparecencia[];
  /** Personas que firman sin estar en una unidad de comparecencia (p. ej. coadyuvante) */
  firmantesAdicionales: PersonaPreparada[];
  inmuebles: InmueblePreparado[];
  comprobantes: string[];
  oficios?: Omit<Oficio, 'numero_escritura' | 'fecha_escritura' | 'notario'>[];
}

export interface DefinicionActo {
  id: string;
  nombre: string;
  plantilla: string;
  anexo?: string;
  /** Enajenación: lleva advertencia del art. 61 de la Ley 2010 de 2019 y REDAM */
  enajenacion: boolean;
  /** Debe inscribirse en la oficina de registro (advertencia de los dos meses) */
  registro: boolean;
  /** Se anota en el Libro de Varios (actos del estado civil) */
  libroVarios: boolean;
  /** Su plantilla es la escritura completa: no lleva la carátula ni el cierre comunes */
  porPlantilla?: boolean;
  preparar(d: DatosActo, h: Ayudas): ActoPreparado;
}

// ------------------------------------------------------------------ utilidades

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const requerido = (d: DatosActo, campo: string, etiqueta: string): string => {
  const v = d[campo];
  if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) throw new ErrorDatos([etiqueta]);
  return String(v).trim();
};
const numeroRequerido = (d: DatosActo, campo: string, etiqueta: string): number => {
  const n = Number(d[campo]);
  if (!Number.isFinite(n) || n <= 0) throw new ErrorDatos([etiqueta]);
  return n;
};

function comprobantesPersonas(grupo: PersonaPreparada[]): string[] {
  const c: string[] = [];
  for (const p of grupo) {
    if (p.tipo_persona === 'JURIDICA') c.push(`Certificado de Existencia y Representación Legal ${p.genero_gramatical === 'M' ? 'del' : 'de la'} ${p.nombre}.`);
    if (p.tipo_persona === 'JURIDICA' && p.representacion === 'PODER' && p.representante) c.push(`Escritura de poder otorgado a ${p.representante.nombre}.`);
    if (p.apoderado) c.push(`Poder ${p.poder_tipo === 'GENERAL' ? 'general' : 'especial'} otorgado a ${p.apoderado.nombre}.`);
    if (p.menor_de_edad) c.push(`Registro civil de nacimiento de ${p.nombre}.`);
  }
  return c;
}

function certificadosTexto(inmuebles: InmueblePreparado[]): string {
  if (inmuebles.length === 1) {
    const i = inmuebles[0];
    return `el Certificado de Tradición y Libertad del folio de matrícula inmobiliaria número ${i.matricula} de fecha ${i.fecha_certificado}`;
  }
  return `los Certificados de Tradición y Libertad de los folios de matrícula inmobiliaria números ${unirNombres(inmuebles.map((i) => `${i.matricula} de fecha ${i.fecha_certificado}`))}`;
}

/** Estado civil de un grupo: "SOLTERA, SIN UNION…" o "SOLTEROS, SIN UNION…" cuando todos comparten el mismo */
function estadoCivilGrupo(grupo: PersonaPreparada[]): string {
  const bases = [...new Set(grupo.map((p) => p.estado_civil?.replace(/^([A-Z]+?)(O|A)\b/, '$1(A)')))];
  if (grupo.length === 1) return grupo[0].estado_civil;
  if (bases.length === 1 && bases[0]) {
    const g = generoGrupo(grupo);
    return bases[0].replace(/^([A-Z]+?)\(A\)/, (_, raiz) => raiz + (g === 'F' ? 'AS' : 'OS'));
  }
  return unirNombres(grupo.map((p) => `${p.nombre} de estado civil ${p.estado_civil}`));
}

const trato = (p: PersonaPreparada) => articuloSustantivo(p, 'señor'); // "el señor" | "la señora"

// ------------------------------------------------------------------ actos

const compraventa: DefinicionActo = {
  id: 'compraventa', nombre: 'Compraventa de inmueble', plantilla: 'compraventa',
  enajenacion: true, registro: true, libroVarios: false,
  preparar(d, h) {
    const vendedores = h.personas(d.vendedores, 'vendedor(es)');
    const compradores = h.personas(d.compradores, 'comprador(es)');
    const inmuebles = h.inmuebles(d.inmuebles, 'inmueble(s) objeto de venta');
    const precio = numeroRequerido(d, 'precio', 'precio de la venta');
    const esCuota = d.es_cuota === true;
    if (esCuota) requerido(d, 'cuota_texto', 'fracción o porcentaje del derecho de cuota');
    const afectacion = requerido(d, 'afectacion', 'decisión sobre afectación a vivienda familiar') as 'NO_APLICA' | 'SI' | 'NO';
    const coadyuvante = d.coadyuvante_id ? h.persona(d.coadyuvante_id, 'cónyuge o compañero(a) que coadyuva') : undefined;
    const vinculo = d.vinculo === 'COMPANEROS' ? 'COMPANEROS' : 'CASADOS';
    if (afectacion !== 'NO_APLICA' && !coadyuvante && compradores.length < 2) {
      throw new ErrorDatos(['para decidir sobre la afectación se requieren ambos cónyuges/compañeros (como compradores o uno como coadyuvante)']);
    }
    const cv = comparecencia(vendedores);
    const gVend = generoGrupo(vendedores);
    for (const i of inmuebles) {
      (i as InmueblePreparado & { ec_adquirente?: string }).ec_adquirente = estadoCivilConGenero(i.tradicion.estado_civil_adquirente, gVend);
    }
    const formaPago = texto(d.forma_pago_texto) ||
      `suma que ${articuloSustantivo(vendedores, 'vendedor')} ${vendedores.length > 1 ? 'manifiestan' : 'manifiesta'} haber recibido en su totalidad a entera satisfacción de manos de ${articuloSustantivo(compradores, 'comprador')}.`;
    const representadosSinFacultad = [...vendedores, ...compradores].some((p) => p.apoderado && !p.poder_incluye_estado_civil);
    const uComp = unidadesComparecencia(compradores);
    const especificacion = [{ acto: esCuota ? 'COMPRAVENTA DERECHO DE CUOTA' : 'COMPRAVENTA', valor: formatoPesos(precio) }];
    if (afectacion === 'SI') especificacion.push({ acto: 'AFECTACION A VIVIENDA FAMILIAR', valor: 'SIN CUANTIA' });
    return {
      a: {
        vendedores, compradores, inmuebles,
        otorgantes: [...vendedores, ...compradores],
        comparecencia_vendedores: cv.texto,
        manifesto_vendedores: cv.manifesto,
        constancia_poder: representadosSinFacultad,
        compradores_identificacion: identificacionGrupo(compradores),
        es_cuota: esCuota,
        cuota_texto: texto(d.cuota_texto),
        objeto_inmuebles: inmuebles.length > 1 ? 'los siguientes inmuebles' : 'el siguiente inmueble',
        precio_letras: pesosEnLetras(precio),
        forma_pago_texto: formaPago.endsWith('.') ? formaPago : formaPago + '.',
        excepcion_gravamen: texto(d.excepcion_gravamen),
        certificados_texto: certificadosTexto(inmuebles),
        aceptacion_compradores: aceptacion(compradores),
        afecta_no_aplica: afectacion === 'NO_APLICA',
        afecta_conyuges_compran: afectacion !== 'NO_APLICA' && !coadyuvante,
        afecta_con_coadyuvante: afectacion !== 'NO_APLICA' && !!coadyuvante,
        afecta_si: afectacion === 'SI',
        estado_civil_compradores: estadoCivilGrupo(compradores),
        vinculo_compradores: vinculo === 'CASADOS' ? 'CASADOS ENTRE SI, CON SOCIEDAD CONYUGAL VIGENTE' : 'SOLTEROS, CON UNION MARITAL DE HECHO ENTRE SI',
        vinculo_plural: vinculo === 'CASADOS' ? 'cónyuges' : 'compañeros permanentes',
        coadyuvante,
        coadyuvante_trato: coadyuvante ? trato(coadyuvante) : '',
      },
      especificacion,
      unidades: [...cv.unidades, ...uComp],
      firmantesAdicionales: coadyuvante ? [coadyuvante] : [],
      inmuebles,
      comprobantes: [
        ...inmuebles.map((i) => i.comprobante_paz_salvo).filter((x): x is string => !!x),
        'Fotocopias de las cédulas de ciudadanía correspondientes.',
        ...comprobantesPersonas([...vendedores, ...compradores]),
        ...inmuebles.filter((i) => i.ph).length ? ['Fotocopia simple paz y salvo de administración.'] : [],
      ],
    };
  },
};

export const ACTOS: Record<string, DefinicionActo> = Object.fromEntries(
  [compraventa].map((a) => [a.id, a]),
);

/** Ids de plantilla de los bloques comunes */
export const BLOQUES_COMUNES = ['caratula', 'cierre'] as const;

/** Formato del número de escritura en los oficios */
export const numeroCorto = (n?: number) => (n ? formatoMiles(n) : '______');
