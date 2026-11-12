/**
 * Generación de la escritura sobre la plantilla elegida, por etapas (cada una en su propia invocación):
 *
 *   1. LECTURA ... los documentos que aún no se leyeron se leen con Haiku (la lectura se guarda y se
 *                  reutiliza: generar otra versión no la repite).
 *   2. REDACCION . Sonnet recibe los párrafos numerados de la plantilla, lo leído de los documentos y las
 *                  observaciones del digitador, y devuelve SOLO los cambios a la plantilla y la revisión
 *                  (advertencias). Salida corta = pocos tokens; la plantilla y lo leído van en caché, así
 *                  que una continuación o una nueva versión (aun con otras observaciones) antes de 5
 *                  minutos los paga al 10 %.
 *   3. FALTANTES . lo que quedó «FALTA» se busca en los documentos originales (Haiku).
 *   4. FINAL ..... los cambios se aplican al Word de la plantilla (su formato se conserva tal cual; solo
 *                  se recalculan los guiones de los párrafos cambiados y se ponen los márgenes de la notaría),
 *                  se suman las verificaciones sin IA y se guarda la versión cifrada.
 *
 * Si una etapa se corta o el encadenamiento falla, la página de la escritura la reanuda.
 */
import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import type { Prisma } from '@prisma/client';
import { db } from '../db';
import { auditar } from '../auditoria';
import { datosAuditoria, type SesionActiva } from '../sesion-tipos';
import { guardarCifrado, leerCifrado } from '../almacenamiento';
import { sha256 } from '../seguridad/cifrado';
import { consumirLimite } from '../seguridad/limites';
import { obtenerConfig } from '../configuracion';
import { plantillaNumerada, aplicarCambios, formatoPagina, textoDocx, textosPorParrafo, faltantesEn, verificarEn, normalizarMarcas, ErrorDocx, type CambioParrafo } from '../escritura/docx';
import { datosDeLaPlantillaAnterior, restosDelNegocioAnterior, valoresEnLetras, medidasEnLetras, medidasPorRevisar, pendientes } from '../escritura/verificaciones';
import { llamarEstructurado, configuracionModelo, ErrorIA, type ResultadoLlamada } from '../ia/cliente';
import { rescatarArreglo, rescatarTexto } from '../ia/json';
import { normalizar } from '../texto/normalizar';
import { SISTEMA_REDACCION, ESQUEMA_REDACCION, INSTRUCCION_CORRECCION, INSTRUCCION_AJUSTE, SISTEMA_FALTANTES, ESQUEMA_FALTANTES, lecturaComoTexto, type Lectura, type Advertencia, type Otorgante } from '../ia/instrucciones';
import { expedienteEditable, obtenerExpediente, bytesPlantilla, ErrorNegocio } from './expedientes';
import { leerDocumento, bloquesDeArchivo, LECTURA_CORTADA_MS, PAGINAS_POR_TRAMO, MIME_DOCX } from './documentos';
import { notificar } from './notificaciones';
import { pedirEtapa, LIMITE_SIN_LATIDO_MS } from './tareas';

type Etapa = 'LECTURA' | 'REDACCION' | 'CORRECCION' | 'AJUSTE' | 'FALTANTES' | 'FINAL';

/** Caracteres máximos de la plantilla que se envían a la IA (~100.000 tokens) */
const MAXIMO_PLANTILLA = 350_000;
/** Veces que una redacción cortada por longitud se continúa */
const MAX_CONTINUACIONES = 4;
const MAX_REANUDACIONES = 3;
/** Documentos que se leen a la vez y tiempo tras el cual no se empieza otro en la etapa */
const CONCURRENCIA = Math.min(Math.max(Math.trunc(Number(process.env.CLAUDE_CONCURRENCIA)) || 5, 1), 8);
const CORTE_MS = 100_000;
/** Salida máxima de la redacción: más no alcanza a terminar en los 5 minutos de una invocación */
const MAXIMO_SALIDA = 20_000;
/** Faltantes que no están en los documentos: se asignan en la notaría al otorgar */
const NO_SE_BUSCA = /fecha de(l)? otorgamiento|n[uú]mero de (la )?escritura|derechos notariales|\biva\b|recaudo|retenci[oó]n|aporte|superintendencia|fondo (cuenta|especial)/i;
/**
 * Avisos de la IA sobre los datos que el digitador llena a mano (van «EN BLANCO»): precio, forma de
 * pago, derechos, IVA, retención, hojas de papel notarial. No se muestran.
 */
const DATO_A_MANO = /\bprecio\b|forma de pago|recibido en su totalidad|derechos notariales|\biva\b|retenci[oó]n|recaudo|papel notarial|\bhojas\b/i;
const AVISO_DE_FALTA = /\bfalta|\bfaltan|no (?:se )?(?:indica|especifica|trae|aparece|est[aá])|sin (?:dato|informaci)|confirme|en blanco/i;
const avisoDeDatoAMano = (a: Advertencia) => a.origen === 'IA' && a.nivel !== 'CRITICA' && DATO_A_MANO.test(a.detalle) && AVISO_DE_FALTA.test(a.detalle);

interface Progreso {
  etapa: Etapa;
  turno: number;
  reanudaciones: number;
  sinEncadenar?: boolean;
  sesion: SesionActiva;
  /** Dirección de la aplicación para encadenar las etapas; sin ella (pruebas) todo corre seguido */
  base: string | null;
  /** Documentos cuya lectura ya se intentó en esta generación (no se repiten aunque fallen) */
  intentados: string[];
  leyendo: string[];
  continuaciones: number;
  /** Redacción cortada: párrafo hasta el que ya hay cambios */
  hasta: number;
  resumen: string;
  otorgantes: Otorgante[];
  cambios: CambioParrafo[];
  advertencias: Advertencia[];
  completados: { dato: string; valor: string; fuente: string }[];
  modelo: string;
  tokensEntrada: number;
  tokensSalida: number;
  tokensCache: number;
  /** Corrección de una versión ya generada: lo que pidió el digitador y la versión que se corrige */
  ajuste?: { pedido: string; version: number };
  /** Párrafos que cambió la corrección (la búsqueda de faltantes se limita a ellos) */
  ajustados?: number[];
}

export interface ResultadoGeneracion {
  resumen: string;
  otorgantes: Otorgante[];
  advertencias: Advertencia[];
  faltantes: string[];
  verificar: string[];
  /** Datos que estaban «FALTA» y se encontraron en los documentos originales */
  completados: Progreso['completados'];
  cambios: { aplicados: number; eliminados: number; insertados: number; noAplicados: number };
  documentos: { total: number; leidos: number; sinLeer: string[] };
  tokens: { entrada: number; salida: number; cache: number };
}

interface RespuestaRedaccion { resumen: string; otorgantes: Otorgante[]; cambios: CambioParrafo[]; advertencias: Advertencia[] }

const progresoDe = (g: { progreso: unknown }) => g.progreso as Progreso | null;

/** Guarda el avance solo si el turno guardado sigue siendo `turnoEsperado` (por defecto, el de `p`) */
async function guardar(id: string, p: Progreso, turnoEsperado = p.turno): Promise<boolean> {
  const r = await db.generacion.updateMany({ where: { id, estado: 'EN_CURSO', progreso: { path: ['turno'], equals: turnoEsperado } }, data: { progreso: p as unknown as Prisma.InputJsonValue } });
  return r.count > 0;
}

const mensajeDe = (e: unknown) => (e instanceof ErrorIA || e instanceof ErrorNegocio ? e.message : 'Error inesperado al generar la escritura.');

async function terminarConError(id: string, p: Progreso | null, mensaje: string) {
  const g = await db.generacion.findUnique({ where: { id }, select: { expedienteId: true, expediente: { select: { numeroInterno: true } } } });
  const r = await db.generacion.updateMany({ where: { id, estado: 'EN_CURSO' }, data: { estado: 'ERROR', error: mensaje } });
  if (!r.count || !g || !p) return;
  await notificar(p.sesion.usuario.id, { titulo: `La escritura no se pudo generar · ${g.expediente.numeroInterno}`, mensaje, enlace: `/expedientes/${g.expedienteId}` }).catch(() => undefined);
}

// ------------------------------------------------------------------ inicio, avance y reanudación

/** Generación en curso de la escritura, con su avance para mostrarlo */
export async function generacionEnCurso(expedienteId: string) {
  const g = await db.generacion.findFirst({ where: { expedienteId, estado: 'EN_CURSO' }, orderBy: { version: 'desc' } });
  const p = g && progresoDe(g);
  if (!g || !p) return null;
  if (Date.now() - g.actualizadaEn.getTime() > LIMITE_SIN_LATIDO_MS && p.reanudaciones >= MAX_REANUDACIONES) {
    await terminarConError(g.id, p, 'La generación se interrumpió varias veces. Genérela de nuevo (los documentos ya leídos no se vuelven a leer).');
    return null;
  }
  const [total, leidos] = await Promise.all([
    db.documento.count({ where: { expedienteId } }),
    db.documento.count({ where: { expedienteId, estadoLectura: 'LEIDO' } }),
  ]);
  const porcentaje = p.etapa === 'LECTURA' ? Math.round((total ? leidos / total : 1) * 30) : p.etapa === 'REDACCION' ? 40 + Math.min(p.continuaciones, 4) * 10 : p.etapa === 'AJUSTE' ? 60 : p.etapa === 'CORRECCION' ? 82 : p.etapa === 'FALTANTES' ? 85 : 95;
  const detalle = p.etapa === 'LECTURA' ? `Leyendo los documentos (${leidos} de ${total})${p.leyendo.length ? `: ${p.leyendo.join(', ')}` : ''}`
    : p.etapa === 'REDACCION' ? `Adaptando la plantilla con los datos de los documentos${p.continuaciones ? ` (continuando desde el párrafo ${p.hasta})` : ''}`
      : p.etapa === 'AJUSTE' ? `Aplicando su corrección a la versión ${p.ajuste?.version ?? ''}`
      : p.etapa === 'CORRECCION' ? 'Revisando que no queden datos del negocio anterior y corrigiéndolos'
      : p.etapa === 'FALTANTES' ? 'Buscando en los documentos originales los datos que faltan'
        : 'Armando el Word y revisando la escritura';
  return { id: g.id, version: g.version, iniciada: g.creadaEn, porcentaje, detalle };
}

/** Si la generación dejó de avanzar, devuelve la etapa con la que se reanuda (la página la programa con after()) */
export async function generacionPorReanudar(expedienteId: string): Promise<(() => Promise<void>) | null> {
  const g = await db.generacion.findFirst({ where: { expedienteId, estado: 'EN_CURSO' }, orderBy: { version: 'desc' } });
  const p = g && progresoDe(g);
  if (!g || !p) return null;
  const quieta = Date.now() - g.actualizadaEn.getTime();
  if (quieta < LIMITE_SIN_LATIDO_MS && !(p.sinEncadenar && quieta > 15_000)) return null;
  if (p.reanudaciones >= MAX_REANUDACIONES) return null; // generacionEnCurso la da por fallida
  const turno = p.turno;
  if (!(await guardar(g.id, { ...p, turno: turno + 1, reanudaciones: p.reanudaciones + 1, sinEncadenar: false, leyendo: [] }, turno))) return null;
  return () => ejecutarEtapa(g.id, turno + 1);
}

/**
 * Valida y deja la generación EN_CURSO. Devuelve la primera etapa, que la acción programa para después
 * de responder (la persona puede salir de la página). `base`: dirección para encadenar las etapas.
 */
export async function iniciarGeneracion(s: SesionActiva, expedienteId: string, base: string | null) {
  const e = await expedienteEditable(s, expedienteId);
  if (!process.env.ANTHROPIC_API_KEY) throw new ErrorNegocio('La IA no está configurada en el servidor: sin ella no se puede generar la escritura.');
  if (await generacionEnCurso(expedienteId)) throw new ErrorNegocio('La IA ya está generando esta escritura. Espere a que termine.');
  const documentos = await db.documento.count({ where: { expedienteId } });
  if (!documentos && !e.observaciones?.trim()) throw new ErrorNegocio('Cargue los documentos del negocio (o escriba los datos en las observaciones) antes de generar.');
  let caracteres: number;
  try {
    caracteres = plantillaNumerada(await bytesPlantilla(e)).caracteres;
  } catch (err) {
    if (err instanceof ErrorDocx) throw new ErrorNegocio(`La plantilla no se pudo abrir: ${err.message}`);
    throw err;
  }
  if (caracteres > MAXIMO_PLANTILLA) throw new ErrorNegocio('La plantilla es demasiado larga para generarla de una vez. Elija una más corta o divídala.');
  if (!(await consumirLimite(`generar:${s.usuario.id}`, 40, 3600)).permitido) throw new ErrorNegocio('Límite de escrituras generadas por hora alcanzado.');
  const g = await crearGeneracion(s, e, progresoInicial(s, base));
  await auditar({ ...datosAuditoria(s), accion: 'ESCRITURA_GENERACION_INICIADA', entidad: 'expediente', entidadId: expedienteId, detalle: { version: g.version, plantilla: e.plantillaNombre, documentos } });
  return { version: g.version, tarea: () => ejecutarEtapa(g.id, 0) };
}

const progresoInicial = (s: SesionActiva, base: string | null): Progreso => ({
  etapa: 'LECTURA', turno: 0, reanudaciones: 0, sesion: s, base, intentados: [], leyendo: [], continuaciones: 0, hasta: 0,
  resumen: '', otorgantes: [], cambios: [], advertencias: [], completados: [], modelo: configuracionModelo('REDACCION').modelo, tokensEntrada: 0, tokensSalida: 0, tokensCache: 0,
});

/** La versión siguiente del expediente, EN_CURSO con el avance inicial */
async function crearGeneracion(s: SesionActiva, e: { id: string; observaciones: string | null; plantillaNombre: string }, progreso: Progreso) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${e.id}))`;
    const ultima = await tx.generacion.findFirst({ where: { expedienteId: e.id }, orderBy: { version: 'desc' }, select: { version: true } });
    return tx.generacion.create({
      data: { expedienteId: e.id, version: (ultima?.version ?? 0) + 1, observaciones: e.observaciones, plantillaNombre: e.plantillaNombre, generadaPorId: s.usuario.id, progreso: progreso as unknown as Prisma.InputJsonValue },
    });
  });
}

/** Largo máximo de lo que se pide corregir */
const MAXIMO_PEDIDO = 3000;

/** Cambios guardados de una versión terminada (las anteriores a la corrección no los guardaban) */
export const cambiosDeVersion = (g: { progreso: unknown }) => {
  const c = (g.progreso as { cambios?: unknown } | null)?.cambios;
  return Array.isArray(c) ? (c as CambioParrafo[]) : null;
};

/**
 * Corrige la última versión sin rehacerla (mucho más barato que generar otra completa): la IA recibe la
 * plantilla y lo leído (en caché), los cambios de esa versión y lo que pide el digitador, y devuelve
 * solo los párrafos que cambian. Queda como una versión nueva. El pedido se suma a las observaciones,
 * para que una generación completa posterior también lo tenga en cuenta.
 */
export async function iniciarAjuste(s: SesionActiva, expedienteId: string, pedidoTexto: string, base: string | null) {
  const e = await expedienteEditable(s, expedienteId);
  const pedido = pedidoTexto.trim().slice(0, MAXIMO_PEDIDO);
  if (!pedido) throw new ErrorNegocio('Escriba qué quiere corregir de la escritura.');
  if (!process.env.ANTHROPIC_API_KEY) throw new ErrorNegocio('La IA no está configurada en el servidor: sin ella no se puede corregir la escritura.');
  if (await generacionEnCurso(expedienteId)) throw new ErrorNegocio('La IA ya está trabajando en esta escritura. Espere a que termine.');
  const anterior = await db.generacion.findFirst({ where: { expedienteId, estado: 'COMPLETADA' }, orderBy: { version: 'desc' } });
  const cambios = anterior && cambiosDeVersion(anterior);
  if (!anterior || !cambios) throw new ErrorNegocio('Esta versión se generó antes de que existiera la corrección: genere una versión completa.');
  if (anterior.plantillaNombre !== e.plantillaNombre) throw new ErrorNegocio('La plantilla cambió desde la última versión: genere una versión completa.');
  if (!(await consumirLimite(`generar:${s.usuario.id}`, 40, 3600)).permitido) throw new ErrorNegocio('Límite de escrituras generadas por hora alcanzado.');
  const r = anterior.resultado as unknown as ResultadoGeneracion | null;
  const nota = `Corrección sobre la versión ${anterior.version}: ${pedido}`;
  const observaciones = e.observaciones?.trim() ? `${e.observaciones.trim()}\n${nota}` : nota;
  if (observaciones.length <= 8000) {
    await db.expediente.update({ where: { id: expedienteId }, data: { observaciones } });
    e.observaciones = observaciones;
  }
  const g = await crearGeneracion(s, e, {
    ...progresoInicial(s, base), cambios, ajuste: { pedido, version: anterior.version },
    resumen: r?.resumen ?? '', otorgantes: r?.otorgantes ?? [], completados: r?.completados ?? [],
    advertencias: (r?.advertencias ?? []).filter((a) => a.origen === 'IA'),
  });
  await auditar({ ...datosAuditoria(s), accion: 'ESCRITURA_CORRECCION_INICIADA', entidad: 'expediente', entidadId: expedienteId, detalle: { version: g.version, sobre: anterior.version } });
  return { version: g.version, tarea: () => ejecutarEtapa(g.id, 0) };
}

/**
 * Cancela la generación en curso. Queda CANCELADA y las etapas siguientes no hacen nada (todas exigen
 * EN_CURSO para guardar o seguir); una llamada a la IA que ya estaba en marcha termina, pero su
 * resultado se descarta. Los documentos ya leídos se conservan para la próxima generación.
 */
export async function cancelarGeneracion(s: SesionActiva, expedienteId: string): Promise<number> {
  await expedienteEditable(s, expedienteId);
  const g = await db.generacion.findFirst({ where: { expedienteId, estado: 'EN_CURSO' }, orderBy: { version: 'desc' }, select: { id: true, version: true } });
  if (!g) throw new ErrorNegocio('No hay una generación en curso para cancelar.');
  const r = await db.generacion.updateMany({ where: { id: g.id, estado: 'EN_CURSO' }, data: { estado: 'CANCELADA', error: `Cancelada por ${s.usuario.nombre}.` } });
  if (!r.count) throw new ErrorNegocio('La generación ya terminó: no se puede cancelar.');
  await auditar({ ...datosAuditoria(s), accion: 'ESCRITURA_GENERACION_CANCELADA', entidad: 'expediente', entidadId: expedienteId, detalle: { version: g.version } });
  return g.version;
}

async function encadenar(id: string, p: Progreso) {
  if (!p.base) return ejecutarEtapa(id, p.turno); // pruebas: sigue en la misma invocación
  if (!(await pedirEtapa(p.base, id, p.turno))) await guardar(id, { ...p, sinEncadenar: true });
}

/** Una etapa de la generación. La llaman la acción (primera), /api/tareas y la reanudación. */
export async function ejecutarEtapa(id: string, turno: number): Promise<void> {
  const g = await db.generacion.findUnique({ where: { id } });
  const previo = g && progresoDe(g);
  if (!g || g.estado !== 'EN_CURSO' || !previo || previo.turno !== turno) return;
  const p: Progreso = { ...previo, turno: turno + 1 };
  if (!(await guardar(id, p, turno))) return; // otra invocación ya tomó este turno
  try {
    const usuario = await db.usuario.findUnique({ where: { id: p.sesion.usuario.id }, select: { estado: true } });
    if (usuario?.estado !== 'ACTIVO') throw new ErrorNegocio('El usuario que inició la generación ya no está activo.');
    if (p.etapa === 'LECTURA') {
      if (await leerPendientes(id, g.expedienteId, p)) return encadenar(id, p);
      p.etapa = p.ajuste ? 'AJUSTE' : 'REDACCION';
    } else if (p.etapa === 'REDACCION') {
      if (await redactar(id, g.expedienteId, p)) p.etapa = 'CORRECCION';
    } else if (p.etapa === 'AJUSTE') {
      await ajustar(id, g.expedienteId, p);
      p.etapa = buscables(p).length ? 'FALTANTES' : 'FINAL';
    } else if (p.etapa === 'CORRECCION') {
      await corregir(id, g.expedienteId, p);
      p.etapa = buscables(p).length ? 'FALTANTES' : 'FINAL';
    } else if (p.etapa === 'FALTANTES') {
      await buscarFaltantes(id, g.expedienteId, p);
      p.etapa = 'FINAL';
    } else {
      return await terminar(id, g.expedienteId, g.version, p);
    }
    if (!(await guardar(id, p))) return;
    return encadenar(id, p);
  } catch (err) {
    if (!(err instanceof ErrorIA) && !(err instanceof ErrorNegocio)) console.error('[generacion]', err);
    await terminarConError(id, p, mensajeDe(err));
  }
}

// ------------------------------------------------------------------ 1. lectura de los documentos

/** Lee los documentos pendientes, varios a la vez, hasta CORTE_MS. true si quedan para otra invocación. */
async function leerPendientes(id: string, expedienteId: string, p: Progreso): Promise<boolean> {
  const inicio = Date.now();
  const pendientes = await db.documento.findMany({
    where: { expedienteId, estadoLectura: { not: 'LEIDO' }, id: { notIn: p.intentados } },
    orderBy: { creadoEn: 'asc' }, select: { id: true, nombreOriginal: true, estadoLectura: true, actualizadoEn: true },
  });
  // Los que se están leyendo desde la carga (otra invocación) se esperan; si su lectura se cortó, se toman
  const ajenos = pendientes.filter((d) => d.estadoLectura === 'EN_CURSO' && Date.now() - d.actualizadoEn.getTime() < LECTURA_CORTADA_MS);
  const cola = pendientes.filter((d) => !ajenos.includes(d));
  const trabajador = async () => {
    while (cola.length && Date.now() - inicio < CORTE_MS) {
      const d = cola.shift()!;
      p.leyendo.push(d.nombreOriginal);
      if (!(await guardar(id, p))) return;
      await leerDocumento(d.id, p.sesion.usuario.id);
      p.intentados.push(d.id);
      p.leyendo = p.leyendo.filter((x) => x !== d.nombreOriginal);
      if (!(await guardar(id, p))) return; // cancelada (o tomada por otra invocación)
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCIA }, trabajador));
  if (cola.length) return true;
  if (!ajenos.length) return false;
  // Espera breve a las lecturas que empezaron al cargar los documentos y vuelve a mirar
  await new Promise((r) => setTimeout(r, 15_000));
  return true;
}

// ------------------------------------------------------------------ 2. redacción

const hoy = () => new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric' });

async function contexto(expedienteId: string, p: Progreso) {
  const e = await obtenerExpediente(p.sesion, expedienteId);
  const plantilla = await bytesPlantilla(e);
  const docs = await db.documento.findMany({ where: { expedienteId }, orderBy: { creadoEn: 'asc' } });
  const leidos = docs.filter((d) => d.estadoLectura === 'LEIDO' && d.lectura);
  const textoDocs = leidos.map((d, i) => lecturaComoTexto(`D${i + 1}`, d.nombreOriginal, d.lectura as unknown as Lectura)).join('\n\n');
  return { e, plantilla, docs, leidos, textoDocs, sinLeer: docs.filter((d) => !leidos.includes(d)).map((d) => d.nombreOriginal) };
}

const sumar = (p: Progreso, r: Pick<ResultadoLlamada<unknown>, 'tokensEntrada' | 'tokensSalida' | 'tokensCacheLectura'>) => {
  p.tokensEntrada += r.tokensEntrada; p.tokensSalida += r.tokensSalida; p.tokensCache += r.tokensCacheLectura;
};

/** Cambios válidos (número de párrafo y acción) */
const validos = (lista: unknown[]): CambioParrafo[] => (lista as CambioParrafo[]).filter((c) => c && Number.isInteger(c.p) && c.p > 0 && ['REEMPLAZAR', 'REESCRIBIR', 'ELIMINAR', 'SOLO_INSERTAR'].includes(c.accion))
  .map((c) => ({ p: c.p, accion: c.accion, reemplazos: Array.isArray(c.reemplazos) ? c.reemplazos.filter((r) => typeof r?.original === 'string' && typeof r?.nuevo === 'string') : [], texto: typeof c.texto === 'string' ? c.texto : '', insertar_despues: Array.isArray(c.insertar_despues) ? c.insertar_despues.filter((t) => typeof t === 'string') : [] }));

/**
 * Inicio del mensaje de la redacción: la plantilla numerada y lo leído (punto de caché: iguales en la
 * redacción, sus continuaciones, la corrección y otra versión) y el caso. Después va la instrucción.
 */
async function inicioRedaccion(c: Awaited<ReturnType<typeof contexto>>): Promise<Anthropic.Beta.BetaContentBlockParam[]> {
  const numerada = plantillaNumerada(c.plantilla);
  const notaria = await obtenerConfig('notaria');
  const caso = {
    fecha_de_hoy: hoy(),
    notaria: { nombre: 'NOTARÍA PRIMERA DEL CÍRCULO DE NEIVA', codigo: notaria.codigo, notario_titular: notaria.titular, resolucion_de_tarifas: notaria.resolucion_tarifas },
    plantilla: c.e.plantillaNombre,
    observaciones_del_digitador: c.e.observaciones?.trim() || '(ninguna)',
    ...(c.sinLeer.length ? { documentos_que_no_se_pudieron_leer: c.sinLeer } : {}),
  };
  return [
    { type: 'text', text: `<plantilla nombre="${c.e.plantillaNombre.replace(/"/g, "'")}">\n${numerada.texto}\n</plantilla>` },
    { type: 'text', text: `<documentos>\n${c.textoDocs || '(no se cargaron documentos: use solo las observaciones)'}\n</documentos>` },
    { type: 'text', text: `<caso>\n${JSON.stringify(caso)}\n</caso>` },
  ];
}

/** Redacta (o continúa) los cambios. true si terminó; false si se cortó y sigue en otra invocación. */
async function redactar(id: string, expedienteId: string, p: Progreso): Promise<boolean> {
  const c = await contexto(expedienteId, p);
  const inicio = await inicioRedaccion(c);
  const continua = p.continuaciones > 0;
  const instruccion = continua
    ? `CONTINUACIÓN: la respuesta anterior se cortó por longitud y ya están los cambios hasta el párrafo ${p.hasta}. Devuelve SOLO los cambios de los párrafos posteriores al ${p.hasta}, y en "advertencias" la revisión de TODA la escritura. "resumen" y "otorgantes" pueden ir vacíos.`
    : 'Adapta la plantilla a este negocio: devuelve los cambios (de menor a mayor número de párrafo) y la revisión.';
  let r: ResultadoLlamada<RespuestaRedaccion>;
  let completa = true;
  try {
    r = await llamarEstructurado<RespuestaRedaccion>({
      proposito: 'REDACCION',
      registro: { usuarioId: p.sesion.usuario.id, expedienteId, generacionId: id },
      sistema: SISTEMA_REDACCION,
      contenido: [...inicio, { type: 'text', text: instruccion }],
      // La plantilla y lo leído son iguales en una continuación y en otra versión aunque cambien las
      // observaciones o la fecha (van en <caso>, después del punto de caché, y son cortos)
      cachearBloques: 2,
      cacheUnaHora: true,
      esquema: ESQUEMA_REDACCION as unknown as Record<string, unknown>,
      maxTokens: MAXIMO_SALIDA,
    });
  } catch (err) {
    if (!(err instanceof ErrorIA) || err.codigo !== 'TRUNCADO' || !err.parcial) throw err;
    const cambios = rescatarArreglo<CambioParrafo>(err.parcial, 'cambios');
    if (!cambios.length && p.continuaciones >= MAX_CONTINUACIONES) throw err;
    r = {
      datos: { resumen: rescatarTexto(err.parcial, 'resumen'), otorgantes: rescatarArreglo(err.parcial, 'otorgantes'), cambios, advertencias: [] },
      ...(err.uso ?? { modelo: p.modelo, tokensEntrada: 0, tokensSalida: 0, tokensCacheLectura: 0, duracionMs: 0 }),
    };
    completa = false;
  }
  sumar(p, r);
  p.modelo = r.modelo;
  const cambios = validos(r.datos.cambios ?? []).filter((x) => x.p > p.hasta);
  p.cambios.push(...cambios);
  if (r.datos.resumen?.trim() && !p.resumen) p.resumen = r.datos.resumen.trim();
  if (r.datos.otorgantes?.length && !p.otorgantes.length) p.otorgantes = r.datos.otorgantes.filter((o) => o?.nombre?.trim()).slice(0, 30);
  if (completa) {
    p.advertencias.push(...(r.datos.advertencias ?? []).filter((a) => a?.detalle?.trim()).map((a) => ({ ...a, p: Number.isInteger(a.p) ? a.p : 0, origen: 'IA' as const })));
    return true;
  }
  p.continuaciones++;
  if (cambios.length) p.hasta = Math.max(p.hasta, ...cambios.map((x) => x.p));
  if (p.continuaciones > MAX_CONTINUACIONES) {
    p.advertencias.push({ nivel: 'CRITICA', origen: 'SISTEMA', p: p.hasta, detalle: `La IA no alcanzó a adaptar la plantilla después del párrafo ${p.hasta} (la plantilla es muy larga). Revise ese tramo a mano o use una plantilla más corta.` });
    return true;
  }
  return false;
}

// ------------------------------------------------------------------ 2b. corrección

/** Párrafos que se revisan en la corrección, como máximo (la respuesta debe caber en una invocación) */
const MAXIMO_CORRECCION = 40;
/** Advertencia de la IA que describe un cambio que ella misma no hizo («hay que cambiar…», «falta actualizar los párrafos…») */
const CAMBIO_PENDIENTE = /\b(?:hay que|se deben?|deben?|debería|falta|faltan|pendiente|quedan?)\b[^.]{0,60}\b(?:cambiar|actualizar|ajustar|reemplazar|corregir|modificar)/i;

/** Números de párrafo que menciona una advertencia («párrafos 68, 73, 75 y 152», «párr. 161») */
function parrafosMencionados(a: Advertencia): number[] {
  const n = new Set<number>(a.p > 0 ? [a.p] : []);
  for (const m of a.detalle.matchAll(/p[áa]rr(?:afos?|s?\.)\s*((?:\d+(?:\s*(?:,|y|e|-|a)\s*)?)+)/gi)) for (const x of m[1].match(/\d+/g) ?? []) n.add(Number(x));
  return [...n];
}

/**
 * Segunda pasada de la redacción: con los cambios ya aplicados, el sistema busca en cada párrafo los
 * datos que siguen siendo del negocio anterior, los cambios que no se aplicaron y los que la IA dejó
 * escritos como advertencia en vez de hacerlos; la IA los corrige (o deja lo que se conserva) y su
 * cambio completo reemplaza al de la primera pasada. Si la corrección falla, queda la primera pasada.
 */
async function corregir(id: string, expedienteId: string, p: Progreso) {
  const c = await contexto(expedienteId, p);
  const r = aplicarCambios(c.plantilla, p.cambios);
  const plantilla = textosPorParrafo(c.plantilla);
  const actuales = new Map(plantilla);
  for (const [n, t] of r.textos) actuales.set(n, t);
  const notaria = await obtenerConfig('notaria');
  const revisar = restosDelNegocioAnterior(plantilla, actuales, `${c.textoDocs}\n${c.e.observaciones ?? ''}`, [notaria.codigo, notaria.resolucion_tarifas]);
  const agregar = (n: number, motivo: string) => { if (plantilla.get(n)) revisar.set(n, [...(revisar.get(n) ?? []), motivo]); };
  // Medidas (linderos, áreas) que quedaron solo en cifras o con letras que no cuadran (sin contar las que la plantilla ya traía así)
  for (const [n, t] of r.textos) {
    for (const m of medidasPorRevisar(plantilla.get(n) ?? '', t)) agregar(n, `${m} Los linderos conservan la estructura y la redacción de la plantilla; solo cambian sus datos.`);
  }
  for (const x of r.noAplicados) agregar(x.p, `Tu cambio no se pudo aplicar (${x.motivo})${x.original ? `: «${x.original}»` : ''}.`);
  const pendientesIA = p.advertencias.filter((a) => a.origen === 'IA' && CAMBIO_PENDIENTE.test(a.detalle));
  for (const a of pendientesIA) for (const n of parrafosMencionados(a)) agregar(n, `Tú advertiste: ${a.detalle}`);
  if (!revisar.size) return;

  const lista = [...revisar].sort((a, b) => a[0] - b[0]).slice(0, MAXIMO_CORRECCION);
  const texto = lista.map(([n, motivos]) => `[${n}] ahora: ${(actuales.get(n) || '(eliminado)').replace(/\n/g, '\n  + ')}\n  revisar:\n${[...new Set(motivos)].map((m) => `  - ${m}`).join('\n')}`).join('\n\n');
  let datos: RespuestaRedaccion;
  let completa = true;
  try {
    const res = await llamarEstructurado<RespuestaRedaccion>({
      proposito: 'REDACCION',
      registro: { usuarioId: p.sesion.usuario.id, expedienteId, generacionId: id },
      // Mismo sistema, esquema e inicio que la redacción: la plantilla y lo leído se pagan al 10 %
      sistema: SISTEMA_REDACCION,
      contenido: [...await inicioRedaccion(c), { type: 'text', text: `<revisar>\n${texto}\n</revisar>` }, { type: 'text', text: INSTRUCCION_CORRECCION }],
      cachearBloques: 2,
      cacheUnaHora: true,
      esquema: ESQUEMA_REDACCION as unknown as Record<string, unknown>,
      maxTokens: MAXIMO_SALIDA,
    });
    sumar(p, res);
    datos = res.datos;
  } catch (err) {
    if (!(err instanceof ErrorIA)) throw err;
    console.error('[generacion] corrección', err.message);
    if (err.codigo !== 'TRUNCADO' || !err.parcial) return; // la corrección es una ayuda: queda la primera pasada
    if (err.uso) sumar(p, err.uso);
    datos = { resumen: '', otorgantes: [], cambios: rescatarArreglo<CambioParrafo>(err.parcial, 'cambios'), advertencias: [] };
    completa = false;
  }
  // Solo los párrafos que se pidieron revisar: su cambio nuevo reemplaza al anterior
  const pedidos = new Set(lista.map(([n]) => n));
  const nuevos = validos(datos.cambios ?? []).filter((x) => pedidos.has(x.p));
  const corregidos = new Set(nuevos.map((x) => x.p));
  p.cambios = [...p.cambios.filter((x) => !corregidos.has(x.p)), ...nuevos].sort((a, b) => a.p - b.p);
  if (completa) {
    // Los cambios que la IA había dejado como advertencia ya se resolvieron o vuelven en su respuesta
    p.advertencias = [
      ...p.advertencias.filter((a) => !pendientesIA.includes(a)),
      ...(datos.advertencias ?? []).filter((a) => a?.detalle?.trim()).map((a) => ({ ...a, p: Number.isInteger(a.p) ? a.p : 0, origen: 'IA' as const })),
    ];
  }
  if (corregidos.size) p.advertencias.push({ nivel: 'INFORMATIVA', origen: 'SISTEMA', p: 0, detalle: `En la revisión final se corrigieron ${corregidos.size} párrafo(s) donde quedaban datos del negocio anterior o cambios sin hacer: ${[...corregidos].slice(0, 20).join(', ')}.` });
}

// ------------------------------------------------------------------ 2c. corrección pedida por el digitador

/** Los cambios de la versión que se corrige, compactos (sin los campos vacíos) */
const cambiosCompactos = (cambios: CambioParrafo[]) => JSON.stringify(cambios.map((c) => ({
  p: c.p, accion: c.accion, ...(c.reemplazos.length ? { reemplazos: c.reemplazos } : {}), ...(c.texto ? { texto: c.texto } : {}), ...(c.insertar_despues.length ? { insertar_despues: c.insertar_despues } : {}),
})));

/** Aplica lo que pidió el digitador sobre los cambios de la versión anterior: solo cambian los párrafos que devuelve la IA */
async function ajustar(id: string, expedienteId: string, p: Progreso) {
  const c = await contexto(expedienteId, p);
  let datos: RespuestaRedaccion;
  let completa = true;
  try {
    const res = await llamarEstructurado<RespuestaRedaccion>({
      proposito: 'REDACCION',
      registro: { usuarioId: p.sesion.usuario.id, expedienteId, generacionId: id },
      // Mismo sistema, esquema e inicio que la redacción: la plantilla y lo leído se pagan al 10 %
      sistema: SISTEMA_REDACCION,
      contenido: [
        ...await inicioRedaccion(c),
        { type: 'text', text: `<cambios_actuales version="${p.ajuste?.version}">\n${cambiosCompactos(p.cambios)}\n</cambios_actuales>` },
        { type: 'text', text: `<pedido>\n${p.ajuste?.pedido ?? ''}\n</pedido>` },
        { type: 'text', text: INSTRUCCION_AJUSTE },
      ],
      cachearBloques: 2,
      cacheUnaHora: true,
      esquema: ESQUEMA_REDACCION as unknown as Record<string, unknown>,
      maxTokens: MAXIMO_SALIDA,
    });
    sumar(p, res);
    p.modelo = res.modelo;
    datos = res.datos;
  } catch (err) {
    if (!(err instanceof ErrorIA) || err.codigo !== 'TRUNCADO' || !err.parcial) throw err;
    if (err.uso) sumar(p, err.uso);
    datos = { resumen: '', otorgantes: [], cambios: rescatarArreglo<CambioParrafo>(err.parcial, 'cambios'), advertencias: [] };
    completa = false;
  }
  const nuevos = validos(datos.cambios ?? []);
  const tocados = new Set(nuevos.map((x) => x.p));
  p.cambios = [...p.cambios.filter((x) => !tocados.has(x.p)), ...nuevos].sort((a, b) => a.p - b.p);
  p.ajustados = [...tocados];
  if (datos.resumen?.trim()) p.resumen = datos.resumen.trim();
  if (datos.otorgantes?.length) p.otorgantes = datos.otorgantes.filter((o) => o?.nombre?.trim()).slice(0, 30);
  p.advertencias.push(...(datos.advertencias ?? []).filter((a) => a?.detalle?.trim()).map((a) => ({ ...a, p: Number.isInteger(a.p) ? a.p : 0, origen: 'IA' as const })));
  if (!completa) p.advertencias.push({ nivel: 'CRITICA', origen: 'SISTEMA', p: 0, detalle: 'La corrección quedó incompleta (la respuesta de la IA fue demasiado larga). Revise que se aplicó todo lo que pidió o genere una versión completa.' });
  if (!tocados.size) p.advertencias.push({ nivel: 'ADVERTENCIA', origen: 'SISTEMA', p: 0, detalle: `La IA no encontró nada que cambiar con su pedido («${(p.ajuste?.pedido ?? '').slice(0, 200)}»). Escríbalo con más detalle o genere una versión completa.` });
  else p.advertencias.push({ nivel: 'INFORMATIVA', origen: 'SISTEMA', p: 0, detalle: `Corrección sobre la versión ${p.ajuste?.version}: se cambiaron ${tocados.size} párrafo(s) (${[...tocados].sort((a, b) => a - b).slice(0, 20).join(', ')}); el resto quedó igual.` });
}

// ------------------------------------------------------------------ 3. búsqueda de lo que falta

/** Textos nuevos de los cambios (donde pueden ir marcas «FALTA») */
const textosDe = (c: CambioParrafo) => [c.texto, ...c.reemplazos.map((r) => r.nuevo), ...c.insertar_despues];

/** Faltantes del documento de identidad de una persona (número, lugar o fecha de expedición); no la cédula catastral */
const DATO_DE_IDENTIDAD = /expedici[oó]n|\bc[eé]dula\b(?!\s+catastral)|identificaci[oó]n|pasaporte/i;

/**
 * Un faltante de identidad solo se busca si dice de quién es («lugar de expedición de la cédula de
 * LAURA MORENO BOLIVAR»): la marca se reemplaza en todos los párrafos donde aparece igual, así que uno
 * genérico («lugar de expedición») le pondría a una persona el dato de otra. Ese queda «FALTA».
 */
function nombraAUnOtorgante(dato: string, otorgantes: Otorgante[]): boolean {
  const d = ` ${normalizar(dato)} `;
  return otorgantes.some((o) => {
    const palabras = normalizar(o.nombre).split(' ').filter((x) => x.length >= 3);
    return palabras.length >= 2 && palabras.filter((x) => d.includes(` ${x} `)).length >= 2;
  });
}

/** Faltantes que vale la pena buscar en los documentos, con el texto donde van */
function buscables(p: Progreso): { dato: string; contexto: string }[] {
  const lista = new Map<string, string>();
  const sePuedeBuscar = (dato: string) => !NO_SE_BUSCA.test(dato) && (!DATO_DE_IDENTIDAD.test(dato) || nombraAUnOtorgante(dato, p.otorgantes));
  for (const c of p.cambios.filter((x) => !p.ajustados || p.ajustados.includes(x.p))) for (const t of textosDe(c)) for (const dato of faltantesEn(t)) if (sePuedeBuscar(dato) && !lista.has(dato)) lista.set(dato, normalizarMarcas(t).replace(/\*\*/g, '').slice(0, 600));
  return [...lista].slice(0, 40).map(([dato, contexto]) => ({ dato, contexto }));
}

/** Pone el valor en lugar de cada «FALTA: dato» encontrado en los textos de los cambios */
function reemplazarFaltante(p: Progreso, dato: string, valor: string) {
  const marca = new RegExp(`«FALTA:\\s*${dato.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}\\s*»`, 'g');
  const cambiar = (t: string) => normalizarMarcas(t).replace(marca, valor);
  for (const c of p.cambios) {
    c.texto = c.texto ? cambiar(c.texto) : c.texto;
    c.reemplazos = c.reemplazos.map((r) => ({ ...r, nuevo: cambiar(r.nuevo) }));
    c.insertar_despues = c.insertar_despues.map(cambiar);
  }
}

/** Un Word de hasta 150.000 caracteres pesa en tokens como unas 15 páginas de PDF */
const PESO_DOCX = 15;

/**
 * Busca los faltantes en los documentos originales, en grupos de hasta PAGINAS_POR_TRAMO páginas por
 * llamada (así cada llamada queda bajo los 100.000 tokens, donde Haiku cuesta 5 veces más). Un PDF más
 * largo se revisa tramo por tramo y se para apenas no quede nada por buscar.
 */
async function buscarFaltantes(id: string, expedienteId: string, p: Progreso) {
  const inicio = Date.now();
  let faltan = buscables(p);
  const docs = await db.documento.findMany({ where: { expedienteId }, orderBy: { creadoEn: 'asc' }, select: { id: true, nombreOriginal: true, mime: true, paginas: true, rutaCifrada: true } });
  const grupos: (typeof docs)[] = [];
  let grupo: typeof docs = [], paginas = 0;
  for (const d of docs) {
    const n = d.mime === MIME_DOCX ? PESO_DOCX : d.paginas ?? 1;
    if (grupo.length && paginas + n > PAGINAS_POR_TRAMO) { grupos.push(grupo); grupo = []; paginas = 0; }
    grupo.push(d);
    paginas += n;
  }
  if (grupo.length) grupos.push(grupo);
  const seAcabo = () => !faltan.length || Date.now() - inicio > 150_000;
  for (const g of grupos) {
    if (seAcabo()) break;
    const liberar: (() => Promise<void>)[] = [];
    try {
      const archivos: { d: (typeof g)[number]; a: Awaited<ReturnType<typeof bloquesDeArchivo>> }[] = [];
      for (const d of g) {
        const a = await bloquesDeArchivo(await leerCifrado(d.rutaCifrada), d.mime, d.nombreOriginal);
        liberar.push(a.liberar);
        archivos.push({ d, a });
      }
      // Un archivo solo (quizá largo) va tramo por tramo; varios cortos, juntos en una llamada
      const llamadas: { contenido: Anthropic.Beta.BetaContentBlockParam[]; desde: number }[] = archivos.length === 1
        ? archivos[0].a.tramos.map((t) => ({ desde: t.desde, contenido: [{ type: 'text', text: `Documento «${archivos[0].d.nombreOriginal}»${archivos[0].a.tramos.length > 1 ? ` (tramo desde la página ${t.desde}; numera las páginas desde 1 dentro del tramo)` : ''}:` }, t.bloque] }))
        : [{ desde: 1, contenido: archivos.flatMap(({ d, a }) => [{ type: 'text', text: `Documento «${d.nombreOriginal}»:` } as const, a.tramos[0].bloque]) }];
      for (const ll of llamadas) {
        if (seAcabo()) break;
        try {
          const ids = new Map(faltan.map((f, i) => [`F${i + 1}`, f]));
          const contenido = [...ll.contenido, { type: 'text' as const, text: `<faltantes>\n${JSON.stringify([...ids].map(([k, f]) => ({ id: k, dato: f.dato, parrafo: f.contexto })))}\n</faltantes>` }];
          const r = await llamarEstructurado<{ encontrados: { id: string; valor: string; documento: string; pagina: number; fragmento: string }[] }>({
            proposito: 'LECTURA', registro: { usuarioId: p.sesion.usuario.id, expedienteId, generacionId: id },
            sistema: SISTEMA_FALTANTES, contenido, esquema: ESQUEMA_FALTANTES as unknown as Record<string, unknown>, maxTokens: 8000,
          });
          sumar(p, r);
          for (const x of r.datos.encontrados ?? []) {
            const f = ids.get(x.id);
            if (!f || !x.valor?.trim() || /FALTA/i.test(x.valor)) continue;
            reemplazarFaltante(p, f.dato, x.valor.trim());
            const pagina = x.pagina ? x.pagina + ll.desde - 1 : 0;
            p.completados.push({ dato: f.dato, valor: x.valor.trim(), fuente: `${x.documento}${pagina ? `, pág. ${pagina}` : ''}` });
          }
          faltan = buscables(p);
          if (!(await guardar(id, p))) return; // cancelada: no se sigue llamando a la IA
        } catch (err) {
          // La búsqueda es una ayuda: si falla, lo que falta sigue marcado «FALTA»
          if (!(err instanceof ErrorIA)) throw err;
          console.error('[generacion] búsqueda de faltantes', err.message);
        }
      }
    } catch (err) {
      if (!(err instanceof ErrorIA)) throw err;
      console.error('[generacion] búsqueda de faltantes', err.message);
    } finally {
      await Promise.all(liberar.map((f) => f()));
    }
  }
}

// ------------------------------------------------------------------ 4. Word y revisión final

const ORDEN_NIVEL = { CRITICA: 0, ADVERTENCIA: 1, INFORMATIVA: 2 } as const;

async function terminar(id: string, expedienteId: string, version: number, p: Progreso) {
  const c = await contexto(expedienteId, p);
  const r = aplicarCambios(c.plantilla, p.cambios);
  const docx = formatoPagina(r.docx);
  const texto = textoDocx(docx);
  const faltantes = faltantesEn(texto);
  const verificar = verificarEn(texto);
  const notaria = await obtenerConfig('notaria');
  const fuentes = `${c.textoDocs}\n${c.e.observaciones ?? ''}`;
  const automaticas: Advertencia[] = [
    ...c.sinLeer.map((n) => ({ nivel: 'ADVERTENCIA' as const, origen: 'SISTEMA' as const, p: 0, detalle: `El documento «${n}» no se pudo leer: sus datos no se usaron. Ábralo en la lista de documentos y léalo de nuevo, o cárguelo con mejor calidad.` })),
    ...pendientes(faltantes, verificar, r.noAplicados),
    ...datosDeLaPlantillaAnterior({ plantilla: textosPorParrafo(c.plantilla), escritura: texto, fuentes, ignorar: [notaria.codigo, notaria.resolucion_tarifas] }),
    ...valoresEnLetras(texto),
    ...medidasEnLetras(textosPorParrafo(c.plantilla), r.textos),
  ];
  const advertencias = [...p.advertencias.filter((a) => !avisoDeDatoAMano(a)), ...automaticas].sort((a, b) => ORDEN_NIVEL[a.nivel] - ORDEN_NIVEL[b.nivel]);
  const resultado: ResultadoGeneracion = {
    resumen: p.resumen, otorgantes: p.otorgantes, advertencias, faltantes, verificar, completados: p.completados,
    cambios: { aplicados: r.aplicados, eliminados: r.eliminados, insertados: r.insertados, noAplicados: r.noAplicados.length },
    documentos: { total: c.docs.length, leidos: c.leidos.length, sinLeer: c.sinLeer },
    tokens: { entrada: p.tokensEntrada, salida: p.tokensSalida, cache: p.tokensCache },
  };
  const ruta = await guardarCifrado(docx, 'escrituras');
  const hecho = await db.generacion.updateMany({
    where: { id, estado: 'EN_CURSO' },
    data: { estado: 'COMPLETADA', rutaDocx: ruta, hashSha256: sha256(docx), modelo: p.modelo, resultado: resultado as unknown as Prisma.InputJsonValue, progreso: { etapa: 'FINAL', turno: p.turno, cambios: p.cambios, ...(p.ajuste ? { ajuste: p.ajuste } : {}) } as unknown as Prisma.InputJsonValue },
  });
  if (!hecho.count) return;
  // La lista de escrituras muestra a los otorgantes si el digitador no le puso título
  if (!c.e.titulo && p.otorgantes.length) await db.expediente.update({ where: { id: expedienteId }, data: { titulo: p.otorgantes.map((o) => o.nombre).slice(0, 4).join(', ').slice(0, 200) } });
  else await db.expediente.update({ where: { id: expedienteId }, data: { actualizadoEn: new Date() } });
  const criticas = advertencias.filter((a) => a.nivel === 'CRITICA').length;
  await auditar({ ...datosAuditoria(p.sesion), accion: 'ESCRITURA_GENERADA', entidad: 'expediente', entidadId: expedienteId, detalle: { version, plantilla: c.e.plantillaNombre, cambios: resultado.cambios, advertencias: advertencias.length, criticas, faltantes: faltantes.length, modelo: p.modelo, tokens: resultado.tokens } });
  await notificar(p.sesion.usuario.id, {
    titulo: `Escritura generada · ${c.e.numeroInterno} (versión ${version})`,
    mensaje: `${criticas ? `${criticas} advertencia(s) crítica(s). ` : ''}${advertencias.length} punto(s) por revisar${faltantes.length ? `, ${faltantes.length} dato(s) «FALTA»` : ''}.`,
    enlace: `/expedientes/${expedienteId}`,
  }).catch(() => undefined);
}

// ------------------------------------------------------------------ consulta y descarga

export async function descargarGeneracion(s: SesionActiva, id: string, vista: boolean) {
  const g = await db.generacion.findUnique({ where: { id }, include: { expediente: { select: { id: true, numeroInterno: true } } } });
  if (!g || !g.rutaDocx) throw new ErrorNegocio('Versión no encontrada.');
  await obtenerExpediente(s, g.expedienteId); // verifica permiso
  const bytes = await leerCifrado(g.rutaDocx);
  if (g.hashSha256 && sha256(bytes) !== g.hashSha256) throw new ErrorNegocio('El archivo no pasó la verificación de integridad.');
  if (!vista) await auditar({ ...datosAuditoria(s), accion: 'ESCRITURA_DESCARGADA', entidad: 'expediente', entidadId: g.expedienteId, detalle: { version: g.version } });
  return { bytes, nombre: `${g.expediente.numeroInterno}-v${g.version}.docx` };
}
