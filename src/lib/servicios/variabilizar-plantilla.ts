/**
 * Conversión de un caso real en plantilla. A veces lo que se carga como plantilla es la escritura
 * de un caso, con los nombres, cédulas, matrículas, valores… escritos. La IA ubica cada dato y dice
 * por qué variable se reemplaza; el sistema lo reemplaza en todas sus apariciones. Así quedan las
 * dos versiones: la plantilla SIN datos (con variables) y la plantilla llenada con datos de ejemplo
 * FICTICIOS (los del caso de ejemplo del tipo o, si no hay, los que propone la IA).
 *
 * Los datos reales no se guardan: solo qué tipo de dato se cambió por qué variable, y los valores
 * ficticios. Un valor ficticio que aparezca en el archivo original se descarta (podría ser real).
 */
import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from '../db';
import { vistaPreviaDocx, textoDeParrafos, etiquetasDe } from '../escritura/vista-previa';
import { reemplazarEnDocx, type ResultadoReemplazo } from '../escritura/editar-docx';
import { llamarEstructurado } from '../ia/cliente';
import { SISTEMA_VARIABILIZAR_PLANTILLA, ESQUEMA_VARIABILIZAR_PLANTILLA } from '../ia/instrucciones';
import { validarDocxPlantilla } from './plantillas';
import { contextoEjemplo } from './revision-plantillas';

export interface Variabilizacion {
  esCasoReal: boolean;
  resumen: string;
  /** Dato (descripción, sin el valor real) → etiqueta que lo reemplazó y cuántas veces */
  reemplazos: { dato: string; variable: string; veces: number }[];
  /** Datos que siguen escritos en la plantilla y deben cambiarse en Word */
  noAplicados: { dato: string; motivo: string }[];
  /** Variables que la IA creó y el sistema aún no sabe llenar */
  nuevas: string[];
  advertencias: string[];
  /** Variable → valor ficticio, para ver la plantilla llenada aunque el tipo no tenga caso de ejemplo */
  valoresEjemplo: Record<string, string>;
  modelo: string;
  duracionMs: number;
  /** La IA no respondió: la plantilla se cargó tal como venía */
  error: string | null;
  /** Conversión pedida después de cargar la versión (lista de plantillas con datos reales): no se vuelve a ofrecer */
  intentoPosterior?: boolean;
}

interface RespuestaIA {
  es_caso_real: boolean;
  resumen: string;
  reemplazos: { dato: string; original: string; nuevo: string; valor_ejemplo: string }[];
  advertencias: string[];
}

const LIMITE_TEXTO = 80_000;
const LIMITE_REFERENCIA = 40_000;
const LIMITE_OTROS = 60_000; // entre todos los otros casos

const MOTIVOS: Record<Exclude<ResultadoReemplazo, 'APLICADO'>, string> = {
  NO_ENCONTRADO: 'no se encontró tal cual en el texto',
  AMBIGUO: 'aparece varias veces',
  CRUZA_FORMATO: 'cruza una tabulación o un salto de línea',
};

/** Nombre base de una etiqueta: "a.vendedores | El:'vendedor'" → "a.vendedores" */
const base = (etiqueta: string) => etiqueta.split('|')[0].trim();
const normalizar = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Modelo limpio del tipo (plantillas/modelos/fuentes), sin los comentarios ni las marcas de formato */
async function modeloLimpio(tipoId: string): Promise<string | null> {
  if (!/^[a-z0-9_]+$/.test(tipoId)) return null;
  try {
    const t = await fs.readFile(path.join(process.cwd(), 'plantillas', 'modelos', 'fuentes', `${tipoId}.plantilla`), 'utf8');
    return t.split(/\r?\n/).filter((l) => !l.startsWith('//')).map((l) => l.replace(/^(#{1,3}|!!)\s*/, '')).join('\n').trim();
  } catch {
    return null;
  }
}

/** Valores sencillos del contexto de ejemplo, por ruta ("a.precio_letras" → "CIEN MILLONES…") */
function aplanar(obj: Record<string, unknown>, prefijo = '', salida = new Map<string, string>(), nivel = 0) {
  for (const [k, v] of Object.entries(obj)) {
    const ruta = prefijo ? `${prefijo}.${k}` : k;
    if (typeof v === 'string' || typeof v === 'number') salida.set(ruta, String(v).slice(0, 120));
    else if (v && typeof v === 'object' && !Array.isArray(v) && nivel < 3) aplanar(v as Record<string, unknown>, ruta, salida, nivel + 1);
  }
  return salida;
}

/**
 * Lo que la IA necesita para elegir las variables: las que ya usan las versiones del tipo y su modelo
 * limpio (con el valor del caso de ejemplo, si lo hay) y un texto de referencia que las use.
 */
async function referencias(tipoId: string, excluir?: string) {
  const versiones = await db.plantilla.findMany({ where: { tipoId, ...(excluir ? { id: { not: excluir } } : {}) }, orderBy: { version: 'desc' }, select: { archivo: true, estado: true } });
  const vigente = versiones.find((v) => v.estado === 'APROBADA') ?? versiones[0];
  const textoVigente = vigente ? textoDeParrafos(vistaPreviaDocx(Buffer.from(vigente.archivo))) : null;
  const modelo = await modeloLimpio(tipoId);
  const ejemplo = aplanar((await contextoEjemplo(tipoId).catch(() => null)) ?? {});

  const conocidas = new Map<string, string>();
  const textos = [textoVigente, modelo].filter((t): t is string => !!t);
  for (const t of textos) {
    for (const m of t.matchAll(/\{\{\s*([^#^/{}][^{}]*?)\s*\}\}/g)) {
      const v = m[1].replace(/\s+/g, ' ');
      if (!conocidas.has(v)) conocidas.set(v, ejemplo.get(base(v)) ?? '');
    }
  }
  // Las del caso de ejemplo que ninguna versión usa todavía también se pueden usar
  for (const [ruta, valor] of ejemplo) if (!conocidas.has(ruta)) conocidas.set(ruta, valor);
  return { conocidas, referencia: textoVigente ?? modelo };
}

/**
 * Pide a la IA los datos del caso y los reemplaza por variables. Devuelve el archivo convertido
 * (el mismo si no era un caso real) y el resumen que se guarda con la versión. Lanza ErrorIA.
 * `excluir`: versión ya guardada que se está convirtiendo (no sirve de referencia de sí misma).
 * `otros`: escrituras de otros casos del mismo tipo. No se modifican: comparadas con el archivo,
 * muestran qué texto es fijo y qué cambia de un caso a otro (los datos que van en variables).
 */
export async function variabilizarPlantilla(tipo: { id: string; nombre: string }, archivo: Buffer, opciones: { excluir?: string; otros?: Buffer[] } = {}): Promise<{ archivo: Buffer; variabilizacion: Variabilizacion }> {
  const texto = textoDeParrafos(vistaPreviaDocx(archivo));
  const { conocidas, referencia } = await referencias(tipo.id, opciones.excluir);
  const otros = (opciones.otros ?? []).map((o) => textoDeParrafos(vistaPreviaDocx(o)));
  const limiteOtro = Math.floor(LIMITE_OTROS / Math.max(otros.length, 1));
  const r = await llamarEstructurado<RespuestaIA>({
    proposito: 'PLANTILLA',
    sistema: SISTEMA_VARIABILIZAR_PLANTILLA,
    contenido: [{ type: 'text', text: [
      `TIPO: ${tipo.nombre} (${tipo.id})`,
      `VARIABLES CONOCIDAS (variable = valor ficticio de ejemplo):\n${[...conocidas].map(([v, ej]) => `{{${v}}}${ej ? ` = ${ej}` : ''}`).join('\n') || 'ninguna: cree nombres descriptivos'}`,
      referencia && `<plantilla_de_referencia>\n${referencia.slice(0, LIMITE_REFERENCIA)}\n</plantilla_de_referencia>`,
      `<archivo_cargado>\n${texto.slice(0, LIMITE_TEXTO)}\n</archivo_cargado>`,
      ...otros.map((t, i) => `<otro_caso numero="${i + 1}">\n${t.slice(0, limiteOtro)}\n</otro_caso>`),
      otros.length
        ? `Hay ${otros.length} escritura(s) de otros casos del mismo tipo: compáralas con el archivo cargado para distinguir el texto fijo de los datos. Indica los reemplazos para convertir el ARCHIVO CARGADO en plantilla.`
        : 'Indica si el archivo es un caso real y, si lo es, los reemplazos para convertirlo en plantilla.',
    ].filter(Boolean).join('\n\n') }],
    esquema: ESQUEMA_VARIABILIZAR_PLANTILLA as unknown as Record<string, unknown>,
    maxTokens: 32000,
  });

  const advertencias = r.datos.advertencias.map((a) => a.slice(0, 500));
  if (otros.some((t) => t.length > limiteOtro)) advertencias.push('Algún otro caso era muy largo: la IA solo comparó su primera parte.');
  if (texto.length > LIMITE_TEXTO) advertencias.push(`El archivo es muy largo: la IA solo revisó los primeros ${LIMITE_TEXTO.toLocaleString('es-CO')} caracteres. Revise el final en Word.`);
  const resultado: Variabilizacion = {
    esCasoReal: r.datos.es_caso_real, resumen: r.datos.resumen.slice(0, 1000), reemplazos: [], noAplicados: [], nuevas: [],
    advertencias, valoresEjemplo: {}, modelo: r.modelo, duracionMs: r.duracionMs, error: null,
  };
  if (!r.datos.es_caso_real) return { archivo, variabilizacion: resultado };

  // Solo datos (no etiquetas) por una sola variable; primero los más largos: un pasaje completo antes que los nombres que contiene
  const vistos = new Set<string>();
  const lista = r.datos.reemplazos
    .map((x) => ({ ...x, original: x.original.trim(), nuevo: x.nuevo.trim().replace(/^\{\{\s*([\s\S]*?)\s*\}\}$/, '{{$1}}') }))
    .filter((x) => x.original.length >= 3 && !/[{}]/.test(x.original) && /^\{\{[^{}#^/][^{}]*\}\}$/.test(x.nuevo) && !vistos.has(x.original) && !!vistos.add(x.original))
    .sort((a, b) => b.original.length - a.original.length);
  const aceptar = (doc: Buffer) => { const v = validarDocxPlantilla(doc); return v.ok ? null : v.error; };
  const hecho = reemplazarEnDocx(archivo, lista.map((x) => ({ original: x.original, nuevo: x.nuevo, todas: true })), aceptar);

  const textoFinal = normalizar(textoDeParrafos(vistaPreviaDocx(hecho.docx)));
  // Un valor ficticio se descarta si coincide con un dato real del caso (no basta con que la palabra aparezca en el texto: «casado», «compraventa»…)
  const reales = lista.map((x) => normalizar(x.original)).filter((x) => x.length >= 4);
  const esDatoReal = (valor: string) => { const v = normalizar(valor); return reales.some((r) => r === v || (v.length >= 6 && (r.includes(v) || v.includes(r)))); };
  const porVariable = new Map<string, Variabilizacion['reemplazos'][number]>();
  lista.forEach((x, i) => {
    const res = hecho.resultados[i];
    if (res !== 'APLICADO') {
      // Si ya no está en el texto, quedó dentro de un pasaje más largo que sí se reemplazó
      if (textoFinal.includes(normalizar(x.original))) resultado.noAplicados.push({ dato: x.dato.slice(0, 200), motivo: typeof res === 'string' ? MOTIVOS[res] : res.rechazado });
      return;
    }
    const variable = x.nuevo.slice(2, -2);
    const actual = porVariable.get(variable);
    if (actual) actual.veces += hecho.veces[i];
    else porVariable.set(variable, { dato: x.dato.slice(0, 200), variable: x.nuevo, veces: hecho.veces[i] });
    const valor = x.valor_ejemplo.trim().slice(0, 500);
    const ruta = base(variable);
    if (valor && /^[\w.]+$/.test(ruta) && !esDatoReal(valor)) resultado.valoresEjemplo[ruta] ??= valor;
  });
  resultado.reemplazos = [...porVariable.values()];
  const bases = new Set([...conocidas.keys()].map(base));
  resultado.nuevas = etiquetasDe(vistaPreviaDocx(hecho.docx)).variables.map(base).filter((v, i, a) => v !== 'ord()' && !bases.has(v) && a.indexOf(v) === i);
  return { archivo: resultado.reemplazos.length ? hecho.docx : archivo, variabilizacion: resultado };
}
