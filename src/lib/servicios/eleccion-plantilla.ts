/**
 * Elección de la variante de plantilla para un caso. En los tipos con variantes (p. ej. la
 * compraventa con hipoteca, cuya estructura cambia según el banco o la obra) hay varias plantillas
 * aprobadas a la vez; antes de redactar, la IA compara los documentos del caso con cada variante y
 * elige la que corresponde:
 *   - de cada variante recibe su nombre, sus criterios («cuándo usarla», escritos por la notaría) y
 *     el comienzo del modelo (la carátula: comparecientes, entidad, actos y valores);
 *   - del caso, lo ya extraído de cada documento (solo los valores) y las indicaciones del funcionario.
 * Es una llamada corta al modelo de documentos (Haiku, esfuerzo bajo: centavos). Si falla, se usa la
 * variante aprobada más reciente y queda una alerta para el revisor. Si el funcionario eligió la
 * variante al generar, no se llama a la IA.
 */
import 'server-only';
import { db } from '../db';
import { llamarEstructurado, ErrorIA } from '../ia/cliente';
import { TIPOS_DOCUMENTALES, type TipoDocumental } from '../ia/documentos';
import { textoDePlantilla } from './revision-plantillas';
import { nombreVariante } from './plantillas';

export type ConfianzaEleccion = 'ALTA' | 'MEDIA' | 'BAJA';

export interface EleccionPlantilla {
  tipoId: string;
  /** Plantilla (versión) elegida */
  id: string;
  version: number;
  variante: string;
  /** Por qué se eligió (de la IA, o «indicada por el funcionario») */
  motivo: string;
  confianza: ConfianzaEleccion;
  /** false: la indicó el funcionario */
  automatica: boolean;
  /** Variantes aprobadas entre las que se eligió */
  opciones: number;
}

export interface Candidata { id: string; version: number; variante: string | null; nombreArchivo: string; criterios: string | null; archivo: Uint8Array | Buffer }

const CARATULA = 1800; // caracteres del comienzo de cada modelo
const POR_DOCUMENTO = 3500;
const TOTAL_DOCUMENTOS = 45_000;

const SISTEMA_ELECCION = `Eres un asistente de la Notaría Primera del Círculo de Neiva (Colombia). Para un tipo de escritura pública la notaría tiene varias plantillas aprobadas (variantes), porque la estructura y las cláusulas cambian según la entidad que presta (banco, Fondo Nacional del Ahorro, cooperativa, caja de vivienda), la obra o constructora que vende (fideicomiso, proyecto, etapa), los subsidios (caja de compensación, Mi Casa Ya, Caja Honor) y los actos que van juntos (cancelación de patrimonio de familia o afectación, declaración de construcción, constitución de patrimonio, liberación de hipoteca…).

Recibes cada variante (código V1, V2…) con su nombre, sus criterios de uso y el comienzo de su texto, y los datos ya leídos de los documentos del caso. Elige la variante cuya estructura sirve mejor de modelo para redactar ESTE caso. Prioridad:
1. La misma entidad acreedora (el banco o entidad a cuyo favor se constituye la hipoteca). Es lo que más cambia la minuta: una variante de otro banco casi nunca sirve si hay una del mismo.
2. La misma obra, constructora o fideicomiso vendedor (proyectos nuevos con fiduciaria) o, si no hay, el mismo tipo de vendedor (persona natural, sociedad, fideicomiso).
3. Los mismos actos acompañantes (cancelaciones, declaración de construcción, patrimonio de familia, afectación a vivienda familiar, protocolizaciones).
4. El mismo subsidio o caja de compensación y el mismo tipo de inmueble (casa, apartamento en propiedad horizontal, varios inmuebles).
Las indicaciones del funcionario prevalecen. Los nombres de personas de las variantes son de otros casos: no los busques en el caso.

En "motivo" explica en una o dos frases qué coincide (y qué no, si algo importante difiere). "confianza": ALTA si coinciden la entidad y la obra o el tipo de vendedor; MEDIA si coincide la entidad pero no lo demás, o al revés; BAJA si no coincide la entidad o los documentos no permiten saberla.`;

/** Solo el valor de cada dato extraído (sin página, fragmento ni confianza): basta para elegir */
function soloValores(x: unknown): unknown {
  if (Array.isArray(x)) {
    const l = x.map(soloValores).filter((y) => y !== undefined);
    return l.length ? l : undefined;
  }
  if (!x || typeof x !== 'object') return x === '' || x === null ? undefined : x;
  const o = x as Record<string, unknown>;
  if ('valor' in o && 'confianza' in o) return o.valor === '' || o.valor === null ? undefined : o.valor;
  const r = Object.fromEntries(Object.entries(o).map(([k, v]) => [k, soloValores(v)] as const).filter(([, v]) => v !== undefined));
  return Object.keys(r).length ? r : undefined;
}

/** Lo que se sabe del caso para elegir: los documentos (lo extraído) y sus nombres */
async function documentosDelCaso(expedienteId: string) {
  const docs = await db.documento.findMany({ where: { expedienteId, estadoAnalisis: { not: 'DIVIDIDO' } }, orderBy: { creadoEn: 'asc' }, select: { nombreOriginal: true, tipoDocumental: true, estadoAnalisis: true, hechos: true } });
  let total = 0;
  return docs.map((d) => {
    const datos = d.estadoAnalisis === 'COMPLETADO' ? soloValores((d.hechos as { datos?: unknown } | null)?.datos) : undefined;
    let texto = datos ? JSON.stringify(datos).slice(0, POR_DOCUMENTO) : '';
    if (total + texto.length > TOTAL_DOCUMENTOS) texto = '';
    total += texto.length;
    return { documento: d.nombreOriginal, tipo: TIPOS_DOCUMENTALES[d.tipoDocumental as TipoDocumental] ?? d.tipoDocumental, ...(texto ? { datos: texto } : { datos: 'no se leyó' }) };
  });
}

/**
 * Elige entre las variantes aprobadas `candidatas` (la primera es la más reciente). `forzada`: id de
 * la que indicó el funcionario. Nunca falla: si la IA no responde, devuelve la más reciente con confianza BAJA.
 */
export async function elegirVariante(entrada: {
  tipoId: string; nombreTipo: string; candidatas: Candidata[]; expedienteId: string; usuarioId: string;
  indicaciones: string[]; forzada?: string | null;
}): Promise<EleccionPlantilla> {
  const { candidatas } = entrada;
  const resultado = (c: Candidata, motivo: string, confianza: ConfianzaEleccion, automatica = true): EleccionPlantilla => ({
    tipoId: entrada.tipoId, id: c.id, version: c.version, variante: nombreVariante(c), motivo, confianza, automatica, opciones: candidatas.length,
  });
  const forzada = entrada.forzada && candidatas.find((c) => c.id === entrada.forzada);
  if (forzada) return resultado(forzada, 'Indicada por el funcionario al generar la escritura.', 'ALTA', false);
  if (candidatas.length === 1) return resultado(candidatas[0], 'Es la única variante aprobada.', 'ALTA');

  const codigo = (i: number) => `V${i + 1}`;
  const variantes = candidatas.map((c, i) => [
    `<variante codigo="${codigo(i)}" nombre="${nombreVariante(c).replace(/"/g, "'")}">`,
    c.criterios ? `Cuándo usarla: ${c.criterios}` : 'Cuándo usarla: (sin criterios escritos; guíate por el comienzo del texto)',
    `Comienzo del modelo:\n${textoDePlantilla(c.archivo).slice(0, CARATULA)}`,
    '</variante>',
  ].join('\n')).join('\n\n');
  try {
    const r = await llamarEstructurado<{ variante: string; motivo: string; confianza: ConfianzaEleccion }>({
      proposito: 'EXTRACCION',
      esfuerzo: 'low',
      registro: { usuarioId: entrada.usuarioId, expedienteId: entrada.expedienteId },
      sistema: SISTEMA_ELECCION,
      contenido: [
        { type: 'text', text: `TIPO DE ESCRITURA: ${entrada.nombreTipo}\n\n<variantes>\n${variantes}\n</variantes>` },
        { type: 'text', text: [
          `<documentos_del_caso>\n${JSON.stringify(await documentosDelCaso(entrada.expedienteId))}\n</documentos_del_caso>`,
          entrada.indicaciones.length ? `<indicaciones_del_funcionario>\n${entrada.indicaciones.join('\n')}\n</indicaciones_del_funcionario>` : '',
          'Elige la variante para este caso.',
        ].filter(Boolean).join('\n') },
      ],
      esquema: {
        type: 'object', additionalProperties: false, required: ['variante', 'motivo', 'confianza'],
        properties: {
          variante: { type: 'string', enum: candidatas.map((_, i) => codigo(i)) },
          motivo: { type: 'string' },
          confianza: { type: 'string', enum: ['ALTA', 'MEDIA', 'BAJA'] },
        },
      },
      maxTokens: 4000,
    });
    const i = candidatas.findIndex((_, k) => codigo(k) === r.datos.variante);
    if (i < 0) throw new ErrorIA('La IA devolvió una variante que no existe.', 'FORMATO');
    const confianza = (['ALTA', 'MEDIA', 'BAJA'] as const).includes(r.datos.confianza) ? r.datos.confianza : 'BAJA';
    return resultado(candidatas[i], (r.datos.motivo ?? '').trim().slice(0, 600) || 'Sin explicación.', confianza);
  } catch (err) {
    if (!(err instanceof ErrorIA)) throw err;
    console.error('[eleccion-plantilla] no se pudo elegir la variante; se usa la más reciente', err.message);
    return resultado(candidatas[0], `La IA no pudo elegir la variante (${err.message}); se usó la aprobada más reciente. Verifique que corresponda al banco y a la obra del caso.`, 'BAJA');
  }
}
