/**
 * Redacción de la escritura con IA, directamente desde los documentos (como se haría con Claude):
 *   1. El funcionario elige el tipo de escritura (al crear el expediente) y carga los documentos.
 *   2. La plantilla es la APROBADA del tipo elegido: es la escritura de referencia (estructura,
 *      cláusulas, lenguaje y formato), no un formulario que se llena.
 *   3. La IA lee los documentos ORIGINALES (PDF e imágenes), extrae y cruza los datos y redacta la
 *      escritura completa sobre la plantilla. No pregunta nada: lo dudoso queda «[VERIFICAR: …]», lo
 *      que no está en ningún documento queda «FALTA: …», y todo va como alerta para el revisor.
 * Si el funcionario ya diligenció datos, respondió el asistente o escribe indicaciones, la IA también
 * los usa (las indicaciones prevalecen): así se corrige una versión sin volver a empezar.
 *
 * Las alertas quedan como observaciones (CRITICA impide enviar a revisión; REVISAR exige corregir o
 * justificar). Las marcas «FALTA» las vigila la regla R12. El Word se arma con el paquete de la
 * plantilla y el formato de la notaría (src/lib/escritura/generar.ts), cifrado y versionado.
 * Corre en segundo plano (tarda unos minutos) y avisa al terminar.
 *
 * Por partes: en Vercel cada invocación se corta a los 5 minutos y una escritura de varios actos,
 * redactada de una sola vez, tarda más (la redacción moría a medias y quedaba «interrumpida»). Cada
 * acto se redacta en su propia invocación (la primera parte lleva además la carátula y la última el
 * cierre); la IA recibe lo ya redactado y continúa desde ahí. Al final, otra etapa arma el Word. Las
 * etapas se encadenan con /api/tareas, como el análisis de documentos (src/lib/servicios/tareas.ts),
 * y si una se corta, la página la reanuda (repite solo esa parte).
 */
import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import type { Prisma } from '@prisma/client';
import { db } from '../db';
import { auditar } from '../auditoria';
import { datosAuditoria, type SesionActiva } from '../sesion-tipos';
import { guardarCifrado, leerCifrado } from '../almacenamiento';
import { sha256 } from '../seguridad/cifrado';
import { prepararContexto, type ContextoEscritura } from '../escritura/contexto';
import { ACTOS } from '../escritura/actos';
import { ESQUEMAS } from '../escritura/esquemas';
import { CAMPO_INDICACIONES, valoresAutomaticos } from '../escritura/actos-plantilla';
import { armarEscritura, convertirAPdf, type ParrafoRedactado } from '../escritura/generar';
import { datosVacios, type DatosExpediente } from '../escritura/tipos';
import { obtenerConfig } from '../configuracion';
import { abrirPdf } from '../pdf';
import { llamarEstructurado, configuracionModelo, prepararDocumento, ErrorIA, type ResultadoLlamada } from '../ia/cliente';
import { SISTEMA_REDACCION, ESQUEMA_REDACCION } from '../ia/instrucciones';
import { TIPOS_DOCUMENTALES, compactarHechos, type TipoDocumental } from '../ia/documentos';
import { plantillaAprobada, ErrorPlantilla } from './plantillas';
import { textoDePlantilla } from './revision-plantillas';
import { obtenerExpediente, puedeEditar, datosDe, actosDe, bloqueos, ErrorNegocio } from './expedientes';
import { estadoAsistente, esAdicional } from './asistente';
import { instruccionesAprobadas } from './documentos';
import { ejecutarRevision } from './revision';
import { notificar } from './notificaciones';
import { firmaEtapa, LIMITE_SIN_LATIDO_MS } from './tareas';

/** Observaciones con las alertas de la redacción */
export const CODIGO_REDACCION = 'IA-REDACCION';
/** Regla de las marcas «FALTA» en el texto del borrador (src/lib/reglas/reglas.ts) */
const CODIGO_BORRADOR_INCOMPLETO = 'R12-BORRADOR-INCOMPLETO';
/** Observaciones que no impiden redactar de nuevo: precisamente se resuelven redactando otra versión */
const NO_BLOQUEAN = new Set([CODIGO_BORRADOR_INCOMPLETO, CODIGO_REDACCION]);
/** Una redacción EN_CURSO sin avance por etapas (de antes) más antigua que esto se da por interrumpida */
const LIMITE_REDACCION_MS = 15 * 60 * 1000;
/** Veces que se repite una parte cortada antes de dar la redacción por fallida */
const MAX_REANUDACIONES = 3;
const LIMITE_MODELO = 120_000; // caracteres de cada plantilla enviados a la IA
/** Límites de una solicitud con documentos (la API admite 100 páginas de PDF y 32 MB) */
const MAX_PAGINAS = 100;
const MAX_BYTES_EN_LINEA = 22 * 1024 * 1024;

type NivelAlerta = 'CRITICA' | 'REVISAR' | 'INFORMATIVA';
interface RespuestaRedaccion {
  resumen: string;
  datos_extraidos: { grupo: string; dato: string; valor: string; fuente: string }[];
  parrafos: ParrafoRedactado[];
  alertas: { nivel: NivelAlerta; campo: string; detalle: string }[];
  documentos_no_utilizados: { documento: string; motivo: string }[];
  otorgantes?: Otorgante[];
}

/** Persona que comparece u otorga en la escritura, según la redacción */
export interface Otorgante { nombre: string; documento: string; papel: string }

/** Agrega a `lista` los otorgantes que aún no están (por documento o, sin documento, por nombre) */
export function unirOtorgantes(lista: Otorgante[], nuevos: Otorgante[] | undefined): Otorgante[] {
  const clave = (o: Otorgante) => o.documento.replace(/\D/g, '') || o.nombre.trim().toUpperCase();
  for (const o of nuevos ?? []) {
    if (typeof o?.nombre !== 'string' || !o.nombre.trim()) continue;
    const x = { nombre: o.nombre.trim().toUpperCase().slice(0, 200), documento: String(o.documento ?? '').trim().slice(0, 40), papel: String(o.papel ?? '').trim().slice(0, 80) };
    if (!lista.some((y) => clave(y) === clave(x))) lista.push(x);
  }
  return lista;
}

/** Texto para buscar: nombres en mayúsculas y cada documento como viene y sin puntos */
export const textoOtorgantes = (lista: Otorgante[]) => lista.map((o) => `${o.nombre} ${o.documento} ${o.documento.replace(/\D/g, '')}`.trim()).join(' | ').toUpperCase();

/** Lo que se guarda en el borrador sobre su redacción */
export interface InfoRedaccion {
  resumen: string;
  /** Quiénes comparecen u otorgan (para la lista de expedientes y la búsqueda) */
  otorgantes?: Otorgante[];
  /** Nombres y documentos de los otorgantes en un solo texto, en mayúsculas (para buscar) */
  otorgantesTexto?: string;
  datosExtraidos: RespuestaRedaccion['datos_extraidos'];
  alertas: RespuestaRedaccion['alertas'];
  documentosNoUtilizados: RespuestaRedaccion['documentos_no_utilizados'];
  /** Datos marcados «FALTA» en el texto */
  faltantes: string[];
  /** Puntos marcados «[VERIFICAR: …]» en el texto */
  verificar?: string[];
  indicaciones: string | null;
  modelo: string;
}

/** Avance de una redacción por partes (analisis_ia.progreso) */
interface ProgresoRedaccion {
  clase: 'REDACCION';
  /** Partes ya redactadas; cuando llega a `partes`, falta armar el Word */
  hechas: number;
  partes: number;
  turno: number;
  reanudaciones: number;
  sesion: SesionActiva;
  /** Dirección de la aplicación para encadenar las etapas; sin ella (pruebas) todo corre seguido */
  base: string | null;
  indicaciones: string | null;
  plantillas: { tipoId: string; nombre: string; version: number; id: string }[];
  parrafos: ParrafoRedactado[];
  resumenes: string[];
  datosExtraidos: RespuestaRedaccion['datos_extraidos'];
  alertas: RespuestaRedaccion['alertas'];
  noUtilizados: RespuestaRedaccion['documentos_no_utilizados'];
  /** Opcional: las redacciones iniciadas antes de este campo no lo traen */
  otorgantes?: Otorgante[];
  noEnviados: string[];
  documentos: number;
  modelo: string;
  versionInstruccion: string | null;
  tokensEntrada: number;
  tokensSalida: number;
  tokensCacheLectura: number;
  duracionMs: number;
}

const progresoDe = (a: { progreso: unknown }) => {
  const p = a.progreso as ProgresoRedaccion | null;
  return p?.clase === 'REDACCION' ? p : null;
};

/** Guarda el avance solo si el turno guardado sigue siendo `turnoEsperado` (por defecto, el de `p`) */
async function guardar(id: string, p: ProgresoRedaccion, turnoEsperado = p.turno): Promise<boolean> {
  const r = await db.analisisIA.updateMany({ where: { id, estado: 'EN_CURSO', progreso: { path: ['turno'], equals: turnoEsperado } }, data: { progreso: p as unknown as Prisma.InputJsonValue } });
  return r.count > 0;
}

/** Redacción en curso del expediente, con su avance (una cortada demasiadas veces se da por fallida) */
export async function redaccionEnCurso(expedienteId: string) {
  const a = await db.analisisIA.findFirst({ where: { expedienteId, proposito: 'REDACCION', estado: 'EN_CURSO' }, orderBy: { creadoEn: 'desc' } });
  if (!a) return null;
  const p = progresoDe(a);
  const quieta = Date.now() - (p ? a.actualizadoEn : a.creadoEn).getTime();
  if (p ? quieta > LIMITE_SIN_LATIDO_MS && p.reanudaciones >= MAX_REANUDACIONES : quieta > LIMITE_REDACCION_MS) {
    await terminarConError(a.id, expedienteId, p?.sesion.usuario.id ?? null, p ? 'La redacción se interrumpió varias veces. Genérela de nuevo.' : 'La redacción se interrumpió antes de terminar. Genérela de nuevo.');
    return null;
  }
  return { ...a, parte: p ? Math.min(p.hechas + 1, p.partes) : null, partes: p?.partes ?? null, armando: !!p && p.hechas >= p.partes };
}

/**
 * Si la redacción dejó de avanzar (la invocación de una parte se cortó), devuelve la etapa con la que
 * se reanuda; la página la programa con after(). La parte cortada se repite; las anteriores no.
 */
export async function redaccionPorReanudar(expedienteId: string): Promise<(() => Promise<void>) | null> {
  const a = await db.analisisIA.findFirst({ where: { expedienteId, proposito: 'REDACCION', estado: 'EN_CURSO' }, orderBy: { creadoEn: 'desc' } });
  const p = a && progresoDe(a);
  if (!a || !p || Date.now() - a.actualizadoEn.getTime() < LIMITE_SIN_LATIDO_MS || p.reanudaciones >= MAX_REANUDACIONES) return null;
  const turno = p.turno;
  if (!(await guardar(a.id, { ...p, turno: turno + 1, reanudaciones: p.reanudaciones + 1 }, turno))) return null;
  return () => ejecutarParteRedaccion(a.id, turno + 1);
}

async function terminarConError(id: string, expedienteId: string, usuarioId: string | null, mensaje: string) {
  const r = await db.analisisIA.updateMany({ where: { id, estado: 'EN_CURSO' }, data: { estado: 'ERROR', error: mensaje } });
  if (!r.count || !usuarioId) return;
  const e = await db.expediente.findUnique({ where: { id: expedienteId }, select: { numeroInterno: true } });
  await notificar(usuarioId, { titulo: `La escritura no se pudo redactar · ${e?.numeroInterno ?? ''}`, mensaje, enlace: `/expedientes/${expedienteId}/borrador` }).catch(() => undefined);
}

/** Última redacción (para mostrar su error si falló) */
export const ultimaRedaccion = (expedienteId: string) =>
  db.analisisIA.findFirst({ where: { expedienteId, proposito: 'REDACCION' }, orderBy: { creadoEn: 'desc' } });

/** ¿El funcionario ya diligenció algo en el expediente? (si no, no se envía el expediente vacío) */
const tieneDatos = (d: DatosExpediente) => d.personas.length > 0 || d.inmuebles.length > 0 || Object.values(d.actos).some((a) => a && Object.keys(a).length > 0);

/** Una respuesta del asistente como texto (personas e inmuebles por su nombre) */
function textoRespuesta(v: unknown, datos: DatosExpediente): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (Array.isArray(v)) return v.map((x) => textoRespuesta(x, datos)).join(', ');
  const p = datos.personas.find((x) => x.id === v);
  if (p) return `${p.nombre} (${p.tipo_documento} ${p.numero_documento})`;
  const i = datos.inmuebles.find((x) => x.id === v);
  if (i) return `inmueble ${i.matricula || i.direccion}`;
  return String(v);
}

interface Plantilla { tipoId: string; nombre: string; version: number; id: string; archivo: Buffer }

/** La plantilla aprobada de cada acto y, si el acto tiene formulario propio, los bloques comunes aprobados */
async function plantillasDe(actos: string[]): Promise<Plantilla[]> {
  const lista: Plantilla[] = [];
  const agregar = async (tipoId: string, obligatoria: boolean) => {
    try {
      const p = await plantillaAprobada(tipoId);
      lista.push({ tipoId, nombre: ESQUEMAS[tipoId]?.titulo ?? ACTOS[tipoId]?.nombre ?? tipoId, version: p.version, id: p.id, archivo: Buffer.from(p.archivo) });
    } catch (e) {
      if (obligatoria || !(e instanceof ErrorPlantilla)) throw e;
    }
  };
  const conBloques = actos.some((a) => ACTOS[a] && !ACTOS[a].porPlantilla);
  if (conBloques) await agregar('caratula', false);
  for (const a of actos) await agregar(a, true);
  if (conBloques) {
    await agregar('cierre', false);
    for (const anexo of new Set(actos.map((a) => ACTOS[a]?.anexo).filter((x): x is string => !!x))) await agregar(anexo, false);
  }
  return lista;
}

/**
 * Valida que se pueda redactar y deja la redacción EN_CURSO. Devuelve `tarea`, la primera etapa, que
 * la acción programa para después de responder (la persona puede salir de la página).
 * `indicaciones`: lo que el funcionario quiere que la IA tenga en cuenta en esta versión.
 * `base`: dirección de la aplicación para encadenar las etapas (urlAplicacion()); sin ella, las
 * partes corren una tras otra en la misma invocación (pruebas).
 */
export async function iniciarRedaccion(s: SesionActiva, expedienteId: string, indicaciones?: string, base?: string) {
  const e = await obtenerExpediente(s, expedienteId);
  if (!puedeEditar(s, e)) throw new ErrorNegocio('La escritura solo se redacta mientras el expediente está en elaboración.');
  if (!process.env.ANTHROPIC_API_KEY) throw new ErrorNegocio('La IA no está configurada: sin ella no se puede redactar la escritura.');
  if (await redaccionEnCurso(expedienteId)) throw new ErrorNegocio('La IA ya está redactando esta escritura. Espere a que termine.');
  if (!(await db.documento.count({ where: { expedienteId, origenId: null } }))) throw new ErrorNegocio('Cargue los documentos del negocio antes de generar la escritura.');
  // Las reglas fijas se ejecutan siempre antes de redactar
  await ejecutarRevision(s, expedienteId, false);
  const criticas = (await bloqueos(expedienteId)).criticas.filter((o) => !NO_BLOQUEAN.has(o.codigo));
  if (criticas.length) throw new ErrorNegocio(`No se puede redactar la escritura: hay ${criticas.length} observación(es) CRÍTICA(S) abiertas.`);

  let plantillas: Plantilla[];
  try {
    plantillas = await plantillasDe(actosDe(e));
  } catch (err) {
    if (err instanceof ErrorPlantilla) throw new ErrorNegocio(err.message);
    throw err;
  }
  const progreso: ProgresoRedaccion = {
    clase: 'REDACCION', hechas: 0, partes: Math.max(actosDe(e).length, 1), turno: 0, reanudaciones: 0, sesion: s, base: base ?? null,
    indicaciones: indicaciones?.trim().slice(0, 4000) || null,
    plantillas: plantillas.map(({ tipoId, nombre, version, id }) => ({ tipoId, nombre, version, id })),
    parrafos: [], resumenes: [], datosExtraidos: [], alertas: [], noUtilizados: [], noEnviados: [], documentos: 0,
    modelo: configuracionModelo('REDACCION').modelo, versionInstruccion: null, tokensEntrada: 0, tokensSalida: 0, tokensCacheLectura: 0, duracionMs: 0,
  };
  const analisis = await db.analisisIA.create({ data: { expedienteId, proposito: 'REDACCION', modelo: progreso.modelo, estado: 'EN_CURSO', progreso: progreso as unknown as Prisma.InputJsonValue } });
  return { tarea: () => ejecutarParteRedaccion(analisis.id, 0), partes: progreso.partes };
}

/** Las plantillas de la redacción, tal como se eligieron al iniciarla */
async function cargarPlantillas(lista: ProgresoRedaccion['plantillas']): Promise<Plantilla[]> {
  const filas = await db.plantilla.findMany({ where: { id: { in: lista.map((p) => p.id) } }, select: { id: true, archivo: true } });
  return lista.map((p) => {
    const f = filas.find((x) => x.id === p.id);
    if (!f) throw new ErrorNegocio(`La plantilla «${p.nombre}» ya no existe. Genere la escritura de nuevo.`);
    return { ...p, archivo: Buffer.from(f.archivo) };
  });
}

/**
 * Los documentos originales del negocio como bloques para la IA (un PDF separado en partes va
 * completo, como se cargó). Lo que no cabe en la solicitud va como el texto que ya se leyó de él, si
 * se analizó; si no, se reporta como no enviado.
 */
async function documentosParaIA(expedienteId: string) {
  const docs = await db.documento.findMany({ where: { expedienteId, origenId: null }, orderBy: { creadoEn: 'asc' } });
  const contenido: Anthropic.Beta.BetaContentBlockParam[] = [];
  const liberar: (() => Promise<void>)[] = [];
  const leidos: { documento: string; datos: unknown }[] = [];
  const noEnviados: string[] = [];
  let paginas = 0, enLinea = 0;
  for (const [i, d] of docs.entries()) {
    const titulo = `D${i + 1} · ${d.nombreOriginal}`;
    const bytes = await leerCifrado(d.rutaCifrada);
    const n = d.mime !== 'application/pdf' ? 1 : (await abrirPdf(bytes))?.getPageCount() ?? 1;
    const pesaEnLinea = bytes.length <= 20 * 1024 * 1024 ? bytes.length : 0;
    let enviado = false;
    if (paginas + n <= MAX_PAGINAS && enLinea + pesaEnLinea <= MAX_BYTES_EN_LINEA) {
      try {
        const p = await prepararDocumento(bytes, d.mime, titulo);
        liberar.push(p.liberar);
        contenido.push({ type: 'text', text: `Documento ${titulo}:` }, p.bloque);
        paginas += n;
        enLinea += pesaEnLinea;
        enviado = true;
      } catch (err) {
        if (!(err instanceof ErrorIA)) throw err;
      }
    }
    if (enviado) continue;
    // Lo que no cabe: el texto ya leído de él (o de sus partes, si se separó)
    const partes = d.estadoAnalisis === 'DIVIDIDO' ? await db.documento.findMany({ where: { origenId: d.id, estadoAnalisis: 'COMPLETADO' } }) : d.estadoAnalisis === 'COMPLETADO' ? [d] : [];
    if (partes.length) for (const x of partes) leidos.push({ documento: `${titulo}${x.id !== d.id ? ` (págs. ${x.paginaDesde}–${x.paginaHasta}, ${TIPOS_DOCUMENTALES[x.tipoDocumental as TipoDocumental] ?? x.tipoDocumental})` : ''}`, datos: compactarHechos(x.hechos) });
    else noEnviados.push(d.nombreOriginal);
  }
  if (leidos.length) contenido.push({ type: 'text', text: `<documento_leido>\n${JSON.stringify(leidos)}\n</documento_leido>` });
  return { contenido, liberar: () => Promise.all(liberar.map((f) => f())), noEnviados, total: docs.length };
}

/** Pide a la aplicación que ejecute la siguiente etapa en una invocación nueva (con su propio límite de tiempo) */
async function encadenar(id: string, p: ProgresoRedaccion) {
  if (!p.base) return ejecutarParteRedaccion(id, p.turno); // pruebas: sigue en la misma invocación
  try {
    const r = await fetch(`${p.base}/api/tareas`, {
      method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, turno: p.turno, firma: firmaEtapa(id, p.turno) }),
    });
    if (!r.ok) throw new Error(`respondió ${r.status}`);
  } catch (e) {
    // La página la reanuda cuando deje de avanzar
    console.error('[redaccion] no se pudo encadenar la siguiente parte; la página la reanudará', e);
  }
}

const ORDINALES = ['PRIMER', 'SEGUNDO', 'TERCER', 'CUARTO', 'QUINTO', 'SEXTO', 'SÉPTIMO', 'OCTAVO', 'NOVENO', 'DÉCIMO'];

/** Qué se redacta en la parte `k` (0…n-1) de una escritura con estos actos */
function instruccionDeParte(k: number, actos: string[], previos: ParrafoRedactado[]): string {
  const n = actos.length;
  if (n <= 1) return 'Redacta la escritura completa de este negocio tomando como referencia la plantilla y los documentos.';
  const nombre = (i: number) => `${ORDINALES[i] ?? `${i + 1}.º`} ACTO («${ESQUEMAS[actos[i]]?.titulo ?? ACTOS[actos[i]]?.nombre ?? actos[i]}»)`;
  const que = k === 0
    ? `la carátula y el encabezado de la escritura (con todos los actos), la comparecencia y el ${nombre(0)} completo`
    : `el ${nombre(k)} completo${k === n - 1 ? ', y después el cierre de toda la escritura (otorgamiento, constancias, autorización, derechos, firmas y anexos, según la plantilla)' : ''}`;
  return [
    `REDACCIÓN POR PARTES: esta escritura tiene ${n} actos y se redacta en ${n} partes, una por solicitud, que luego se unen en un solo documento.`,
    `En esta solicitud redacta ÚNICAMENTE la parte ${k + 1} de ${n}: ${que}.`,
    k < n - 1 ? 'No redactes los actos siguientes ni el cierre de la escritura: van en las partes siguientes.' : '',
    k > 0 ? 'Lo ya redactado en las partes anteriores va en <ya_redactado>: no lo repitas; continúa exactamente donde termina, con la misma numeración de cláusulas, los mismos términos y el mismo estilo.' : '',
    'En "parrafos" van solo los párrafos de esta parte. En "datos_extraidos", "alertas" y "documentos_no_utilizados" reporta solo lo de esta parte, sin repetir lo de las anteriores. En "resumen", una frase sobre lo redactado en esta parte.',
    k > 0 ? `<ya_redactado>\n${previos.map((x) => x.texto).join('\n')}\n</ya_redactado>` : '',
  ].filter(Boolean).join('\n');
}

/**
 * Una etapa de la redacción: la siguiente parte de la escritura o, si ya están todas, el Word. La
 * llaman la acción (primera), /api/tareas y la reanudación; una invocación con un turno viejo no hace nada.
 */
export async function ejecutarParteRedaccion(id: string, turno: number): Promise<void> {
  const a = await db.analisisIA.findUnique({ where: { id } });
  const previo = a && progresoDe(a);
  if (!a || a.estado !== 'EN_CURSO' || !previo || previo.turno !== turno) return;
  const p: ProgresoRedaccion = { ...previo, turno: turno + 1 };
  if (!(await guardar(id, p, turno))) return; // otra invocación ya tomó este turno
  try {
    const usuario = await db.usuario.findUnique({ where: { id: p.sesion.usuario.id }, select: { estado: true } });
    if (usuario?.estado !== 'ACTIVO') throw new ErrorNegocio('El usuario que inició la redacción ya no está activo.');
    const plantillas = await cargarPlantillas(p.plantillas);
    if (p.hechas < p.partes) {
      await redactarParte(a.expedienteId, p, plantillas);
      p.hechas++;
      if (!(await guardar(id, p))) return;
      return encadenar(id, p); // cada parte (y el Word) en su propia invocación
    }
    await armarBorrador(a.expedienteId, id, p, plantillas);
  } catch (err) {
    const mensaje = err instanceof ErrorIA || err instanceof ErrorNegocio ? err.message : 'Error inesperado al redactar la escritura.';
    if (!(err instanceof ErrorIA) && !(err instanceof ErrorNegocio)) console.error('[redaccion]', err);
    await terminarConError(id, a.expedienteId, p.sesion.usuario.id, p.partes > 1 && p.hechas < p.partes ? `Parte ${p.hechas + 1} de ${p.partes}: ${mensaje}` : mensaje);
  }
}

/** Redacta la parte `p.hechas` y acumula su resultado en `p` */
async function redactarParte(expedienteId: string, p: ProgresoRedaccion, plantillas: Plantilla[]) {
  const s = p.sesion;
  const e = await obtenerExpediente(s, expedienteId);
  const datos = datosDe(e);
  const actos = actosDe(e);
  const notaria = await obtenerConfig('notaria');
  const instr = await instruccionesAprobadas('REDACCION', actos);
  const asistente = (await estadoAsistente(expedienteId)).resultado;
  const justificadas = await db.observacion.findMany({ where: { expedienteId, estado: 'JUSTIFICADA' }, select: { mensaje: true, justificacion: true } });
  // Si el funcionario ya diligenció el formulario, también van los datos que calcula el sistema
  let calculados: ContextoEscritura | null = null;
  if (tieneDatos(datos)) { try { calculados = prepararContexto(datos, actos, notaria); } catch { calculados = null; } }

  const caso = {
    tipo_de_escritura: actos.map((id, i) => ({ orden: i + 1, acto: ESQUEMAS[id]?.titulo ?? id })),
    notaria: { ...notaria, ...valoresAutomaticos(datos.escritura ?? datosVacios().escritura, notaria) },
    indicaciones_del_funcionario: [p.indicaciones, ...actos.map((a) => (datos.actos[a] as Record<string, unknown> | undefined)?.[CAMPO_INDICACIONES])].filter((x): x is string => typeof x === 'string' && !!x.trim()),
    ...(tieneDatos(datos) ? { datos_diligenciados_por_el_funcionario: { escritura: datos.escritura, personas: datos.personas, inmuebles: datos.inmuebles, actos: datos.actos } } : {}),
    ...(calculados ? { datos_calculados: { general: calculados.global, por_acto: calculados.actos.map((a) => ({ acto: a.id, ...a.contexto })) } } : {}),
    respuestas_del_funcionario: (asistente?.preguntas ?? []).filter((x) => x.estado === 'RESPONDIDA').map((x) => ({ pregunta: esAdicional(x.ruta) ? x.pregunta : x.etiqueta, respuesta: textoRespuesta(x.respuesta, datos) })),
    situaciones_aceptadas_por_el_funcionario: justificadas.map((o) => ({ situacion: o.mensaje, decision: o.justificacion })),
  };

  const docs = await documentosParaIA(expedienteId);
  let r: ResultadoLlamada<RespuestaRedaccion>;
  try {
    r = await llamarEstructurado<RespuestaRedaccion>({
      proposito: 'REDACCION',
      registro: { usuarioId: s.usuario.id, expedienteId },
      sistema: SISTEMA_REDACCION + (instr.texto ? `\n\nInstrucciones adicionales aprobadas por la notaría:\n${instr.texto}` : ''),
      contenido: [
        ...plantillas.map((m) => ({ type: 'text' as const, text: `<modelo tipo="${m.tipoId}" nombre="${m.nombre}" version="${m.version}">\n${textoDePlantilla(m.archivo).slice(0, LIMITE_MODELO)}\n</modelo>` })),
        ...docs.contenido,
        // Hasta aquí es igual en todas las partes: las siguientes lo leen de la caché
        { type: 'text', text: `<caso>\n${JSON.stringify(caso)}\n</caso>`, ...(p.partes > 1 ? { cache_control: { type: 'ephemeral' as const } } : {}) },
        { type: 'text', text: instruccionDeParte(p.hechas, p.partes > 1 ? actos : [], p.parrafos) },
      ],
      esquema: ESQUEMA_REDACCION as unknown as Record<string, unknown>,
      maxTokens: p.partes > 1 ? 32000 : 64000,
    });
  } finally {
    await docs.liberar();
  }
  const parrafos = (r.datos.parrafos ?? []).filter((x) => typeof x.texto === 'string');
  if (parrafos.filter((x) => x.texto.trim()).length < (p.partes > 1 ? 1 : 5)) throw new ErrorIA('La IA no devolvió el texto de la escritura. Intente de nuevo.', 'FORMATO');

  p.parrafos.push(...parrafos);
  if (r.datos.resumen?.trim()) p.resumenes.push(r.datos.resumen.trim());
  for (const d of r.datos.datos_extraidos ?? []) if (!p.datosExtraidos.some((x) => x.grupo === d.grupo && x.dato === d.dato && x.valor === d.valor)) p.datosExtraidos.push(d);
  p.alertas.push(...(r.datos.alertas ?? []));
  for (const d of r.datos.documentos_no_utilizados ?? []) if (!p.noUtilizados.some((x) => x.documento === d.documento)) p.noUtilizados.push(d);
  p.otorgantes = unirOtorgantes(p.otorgantes ?? [], r.datos.otorgantes);
  p.noEnviados = docs.noEnviados;
  p.documentos = docs.total;
  p.modelo = r.modelo;
  p.versionInstruccion = instr.version ?? null;
  p.tokensEntrada += r.tokensEntrada;
  p.tokensSalida += r.tokensSalida;
  p.tokensCacheLectura += r.tokensCacheLectura;
  p.duracionMs += r.duracionMs;
}

/** Última etapa: arma el Word con todas las partes, guarda la versión y registra las alertas */
async function armarBorrador(expedienteId: string, analisisId: string, p: ProgresoRedaccion, plantillas: Plantilla[]) {
  const s = p.sesion;
  const e = await obtenerExpediente(s, expedienteId);
  const indicaciones = p.indicaciones;
  const parrafos = p.parrafos;
  if (parrafos.filter((x) => x.texto.trim()).length < 5) throw new ErrorIA('La IA no devolvió el texto de la escritura. Intente de nuevo.', 'FORMATO');

  // El paquete de la primera plantilla (estilos, encabezado «Hoja No.», página) es la base del Word
  const resultado = armarEscritura(plantillas[0].archivo, parrafos);
  const alertas = p.alertas.slice(0, 60).map((a) => ({ nivel: (['CRITICA', 'REVISAR', 'INFORMATIVA'].includes(a.nivel) ? a.nivel : 'REVISAR') as NivelAlerta, campo: a.campo.slice(0, 300), detalle: a.detalle.slice(0, 1500) }));
  if (p.noEnviados.length) alertas.push({ nivel: 'REVISAR', campo: 'Documentos', detalle: `No cupieron en la solicitud y no se habían analizado, así que la IA no los leyó: ${p.noEnviados.join(', ')}. Analícelos en «Documentos» o cárguelos divididos y redacte de nuevo.` });
  const info: InfoRedaccion = {
    resumen: p.resumenes.join(' ').slice(0, 2000),
    otorgantes: (p.otorgantes ?? []).slice(0, 40),
    otorgantesTexto: textoOtorgantes((p.otorgantes ?? []).slice(0, 40)),
    datosExtraidos: p.datosExtraidos.slice(0, 40).map((d) => ({ grupo: d.grupo.slice(0, 80), dato: d.dato.slice(0, 200), valor: d.valor.slice(0, 2000), fuente: d.fuente.slice(0, 300) })),
    alertas,
    documentosNoUtilizados: p.noUtilizados.slice(0, 30).map((d) => ({ documento: d.documento.slice(0, 300), motivo: d.motivo.slice(0, 500) })),
    faltantes: resultado.faltantes,
    verificar: resultado.verificar,
    indicaciones,
    modelo: p.modelo,
  };

  let pdf: Buffer | null = null;
  try { pdf = await convertirAPdf(resultado.docx, `${e.numeroInterno}.docx`); } catch (err) { console.error('[redaccion] PDF', err); }
  const ultima = await db.borrador.findFirst({ where: { expedienteId }, orderBy: { version: 'desc' } });
  const usadas = plantillas.map((m) => ({ tipoId: m.tipoId, version: m.version, id: m.id }));
  const borrador = await db.borrador.create({
    data: {
      expedienteId, version: (ultima?.version ?? 0) + 1, plantillasUsadas: usadas, generadoPorId: s.usuario.id,
      rutaDocxCifrada: await guardarCifrado(resultado.docx, 'borradores'),
      rutaPdfCifrada: pdf ? await guardarCifrado(pdf, 'borradores') : null,
      hashSha256: sha256(resultado.docx),
      redaccion: info as unknown as Prisma.InputJsonValue,
    },
  });

  // Las alertas de esta versión reemplazan las de la anterior que nadie resolvió
  await db.observacion.updateMany({ where: { expedienteId, codigo: CODIGO_REDACCION, estado: 'ABIERTA' }, data: { estado: 'CORREGIDA', resueltaEn: new Date(), justificacion: 'Reemplazada por una redacción posterior.' } });
  const NIVEL = { CRITICA: 'CRITICA', REVISAR: 'ADVERTENCIA', INFORMATIVA: 'INFORMATIVA' } as const;
  // Cada [VERIFICAR] del texto también es una observación REVISAR: la IA ya no lo repite en sus alertas
  // (ahorra salida). Los «FALTA» los vigila la regla R12 como observación CRÍTICA.
  const paraObservar = [...alertas, ...resultado.verificar.slice(0, 40).map((v) => ({ nivel: 'REVISAR' as const, campo: 'Verificar', detalle: v }))];
  for (const a of paraObservar) {
    await db.observacion.create({ data: { expedienteId, origen: 'IA', codigo: CODIGO_REDACCION, nivel: NIVEL[a.nivel], mensaje: `${a.campo}: ${a.detalle}`.slice(0, 2000), evidencia: { detalle: `Redacción v${borrador.version}` } } });
  }
  // Las reglas sobre el texto nuevo (las marcas «FALTA» quedan como observación CRÍTICA, R12)
  await ejecutarRevision(s, expedienteId, false).catch((err) => console.error('[redaccion] reglas', err));
  await db.analisisIA.update({ where: { id: analisisId }, data: {
    estado: 'COMPLETADO', modelo: p.modelo, versionInstruccion: p.versionInstruccion, tokensEntrada: p.tokensEntrada, tokensSalida: p.tokensSalida, tokensCacheLectura: p.tokensCacheLectura, duracionMs: p.duracionMs,
    resultado: { borradorId: borrador.id, version: borrador.version, alertas: alertas.length, faltantes: info.faltantes.length, documentos: p.documentos, partes: p.partes },
  } });
  await auditar({ ...datosAuditoria(s), accion: 'BORRADOR_GENERADO', entidad: 'borrador', entidadId: borrador.id, detalle: { expedienteId, version: borrador.version, plantillas: usadas.map((u) => `${u.tipoId}@v${u.version}`), redaccionIA: true, partes: p.partes, alertas: alertas.length, indicaciones: !!indicaciones, pdf: !!pdf } });
  const criticas = alertas.filter((a) => a.nivel === 'CRITICA').length;
  await notificar(s.usuario.id, {
    titulo: `Escritura redactada · ${e.numeroInterno}`,
    mensaje: `La IA redactó la versión ${borrador.version} sobre la plantilla aprobada.${criticas ? ` ${criticas} alerta(s) crítica(s).` : ''}${alertas.length - criticas ? ` ${alertas.length - criticas} punto(s) para revisar.` : ''} Revísela antes de enviarla.`,
    enlace: `/expedientes/${expedienteId}/borrador`,
  });
}
