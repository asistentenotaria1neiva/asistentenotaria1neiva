/**
 * Generación de la escritura sobre la plantilla elegida, por etapas (cada una en su propia invocación):
 *
 *   1. LECTURA ... los documentos que aún no se leyeron se leen con Haiku (la lectura se guarda y se
 *                  reutiliza: generar otra versión no la repite).
 *   2. REDACCION . Sonnet recibe los párrafos numerados de la plantilla, lo leído de los documentos y las
 *                  observaciones del digitador, y devuelve SOLO los cambios a la plantilla y la revisión
 *                  (advertencias). Salida corta = pocos tokens; la plantilla y lo leído van en caché, así
 *                  que una continuación o una nueva versión con otras observaciones los paga al 10 %.
 *   3. FALTANTES . lo que quedó «FALTA» se busca en los documentos originales (Haiku).
 *   4. FINAL ..... los cambios se aplican al Word de la plantilla (su formato se conserva), se aplica el
 *                  formato de la notaría, se suman las verificaciones sin IA y se guarda la versión cifrada.
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
import { plantillaNumerada, aplicarCambios, formatoNotaria, textoDocx, textosPorParrafo, faltantesEn, verificarEn, normalizarMarcas, ErrorDocx, type CambioParrafo } from '../escritura/docx';
import { datosDeLaPlantillaAnterior, valoresEnLetras, pendientes } from '../escritura/verificaciones';
import { llamarEstructurado, configuracionModelo, ErrorIA, type ResultadoLlamada } from '../ia/cliente';
import { rescatarArreglo, rescatarTexto } from '../ia/json';
import { SISTEMA_REDACCION, ESQUEMA_REDACCION, SISTEMA_FALTANTES, ESQUEMA_FALTANTES, lecturaComoTexto, type Lectura, type Advertencia, type Otorgante } from '../ia/instrucciones';
import { expedienteEditable, obtenerExpediente, bytesPlantilla, ErrorNegocio } from './expedientes';
import { leerDocumento, bloquesDeArchivo, LECTURA_CORTADA_MS } from './documentos';
import { notificar } from './notificaciones';
import { pedirEtapa, LIMITE_SIN_LATIDO_MS } from './tareas';

type Etapa = 'LECTURA' | 'REDACCION' | 'FALTANTES' | 'FINAL';

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
  const porcentaje = p.etapa === 'LECTURA' ? Math.round((total ? leidos / total : 1) * 30) : p.etapa === 'REDACCION' ? 40 + Math.min(p.continuaciones, 4) * 10 : p.etapa === 'FALTANTES' ? 85 : 95;
  const detalle = p.etapa === 'LECTURA' ? `Leyendo los documentos (${leidos} de ${total})${p.leyendo.length ? `: ${p.leyendo.join(', ')}` : ''}`
    : p.etapa === 'REDACCION' ? `Adaptando la plantilla con los datos de los documentos${p.continuaciones ? ` (continuando desde el párrafo ${p.hasta})` : ''}`
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
  const progreso: Progreso = {
    etapa: 'LECTURA', turno: 0, reanudaciones: 0, sesion: s, base, intentados: [], leyendo: [], continuaciones: 0, hasta: 0,
    resumen: '', otorgantes: [], cambios: [], advertencias: [], completados: [], modelo: configuracionModelo('REDACCION').modelo, tokensEntrada: 0, tokensSalida: 0, tokensCache: 0,
  };
  const g = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${expedienteId}))`;
    const ultima = await tx.generacion.findFirst({ where: { expedienteId }, orderBy: { version: 'desc' }, select: { version: true } });
    return tx.generacion.create({
      data: { expedienteId, version: (ultima?.version ?? 0) + 1, observaciones: e.observaciones, plantillaNombre: e.plantillaNombre, generadaPorId: s.usuario.id, progreso: progreso as unknown as Prisma.InputJsonValue },
    });
  });
  await auditar({ ...datosAuditoria(s), accion: 'ESCRITURA_GENERACION_INICIADA', entidad: 'expediente', entidadId: expedienteId, detalle: { version: g.version, plantilla: e.plantillaNombre, documentos } });
  return { version: g.version, tarea: () => ejecutarEtapa(g.id, 0) };
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
      p.etapa = 'REDACCION';
    } else if (p.etapa === 'REDACCION') {
      if (await redactar(id, g.expedienteId, p)) p.etapa = buscables(p).length ? 'FALTANTES' : 'FINAL';
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
      await guardar(id, p);
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

/** Redacta (o continúa) los cambios. true si terminó; false si se cortó y sigue en otra invocación. */
async function redactar(id: string, expedienteId: string, p: Progreso): Promise<boolean> {
  const c = await contexto(expedienteId, p);
  const numerada = plantillaNumerada(c.plantilla);
  const notaria = await obtenerConfig('notaria');
  const caso = {
    fecha_de_hoy: hoy(),
    notaria: { nombre: 'NOTARÍA PRIMERA DEL CÍRCULO DE NEIVA', codigo: notaria.codigo, notario_titular: notaria.titular, resolucion_de_tarifas: notaria.resolucion_tarifas },
    plantilla: c.e.plantillaNombre,
    observaciones_del_digitador: c.e.observaciones?.trim() || '(ninguna)',
    ...(c.sinLeer.length ? { documentos_que_no_se_pudieron_leer: c.sinLeer } : {}),
  };
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
      contenido: [
        { type: 'text', text: `<plantilla nombre="${c.e.plantillaNombre.replace(/"/g, "'")}">\n${numerada.texto}\n</plantilla>` },
        { type: 'text', text: `<documentos>\n${c.textoDocs || '(no se cargaron documentos: use solo las observaciones)'}\n</documentos>` },
        { type: 'text', text: `<caso>\n${JSON.stringify(caso)}\n</caso>` },
        { type: 'text', text: instruccion },
      ],
      // La plantilla, lo leído y el caso son iguales en una continuación (y en otra versión con las mismas observaciones)
      cachearBloques: 3,
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

// ------------------------------------------------------------------ 3. búsqueda de lo que falta

/** Textos nuevos de los cambios (donde pueden ir marcas «FALTA») */
const textosDe = (c: CambioParrafo) => [c.texto, ...c.reemplazos.map((r) => r.nuevo), ...c.insertar_despues];

/** Faltantes que vale la pena buscar en los documentos, con el texto donde van */
function buscables(p: Progreso): { dato: string; contexto: string }[] {
  const lista = new Map<string, string>();
  for (const c of p.cambios) for (const t of textosDe(c)) for (const dato of faltantesEn(t)) if (!NO_SE_BUSCA.test(dato) && !lista.has(dato)) lista.set(dato, normalizarMarcas(t).replace(/\*\*/g, '').slice(0, 600));
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

/** Busca los faltantes en los documentos originales, en grupos de hasta ~90 páginas por llamada */
async function buscarFaltantes(id: string, expedienteId: string, p: Progreso) {
  const inicio = Date.now();
  let faltan = buscables(p);
  const docs = await db.documento.findMany({ where: { expedienteId }, orderBy: { creadoEn: 'asc' }, select: { id: true, nombreOriginal: true, mime: true, paginas: true, rutaCifrada: true } });
  const grupos: (typeof docs)[] = [];
  let grupo: typeof docs = [], paginas = 0;
  for (const d of docs) {
    const n = Math.min(d.paginas ?? 1, 90);
    if (grupo.length && paginas + n > 90) { grupos.push(grupo); grupo = []; paginas = 0; }
    grupo.push(d);
    paginas += n;
  }
  if (grupo.length) grupos.push(grupo);
  for (const g of grupos) {
    if (!faltan.length || Date.now() - inicio > 150_000) break;
    const liberar: (() => Promise<void>)[] = [];
    try {
      const contenido: Anthropic.Beta.BetaContentBlockParam[] = [];
      for (const d of g) {
        const a = await bloquesDeArchivo(await leerCifrado(d.rutaCifrada), d.mime, d.nombreOriginal);
        liberar.push(a.liberar);
        // Un archivo de más de 90 páginas solo entra con su primer tramo
        contenido.push({ type: 'text', text: `Documento «${d.nombreOriginal}»:` }, a.tramos[0].bloque);
      }
      const ids = new Map(faltan.map((f, i) => [`F${i + 1}`, f]));
      contenido.push({ type: 'text', text: `<faltantes>\n${JSON.stringify([...ids].map(([k, f]) => ({ id: k, dato: f.dato, parrafo: f.contexto })))}\n</faltantes>` });
      const r = await llamarEstructurado<{ encontrados: { id: string; valor: string; documento: string; pagina: number; fragmento: string }[] }>({
        proposito: 'LECTURA', registro: { usuarioId: p.sesion.usuario.id, expedienteId, generacionId: id },
        sistema: SISTEMA_FALTANTES, contenido, esquema: ESQUEMA_FALTANTES as unknown as Record<string, unknown>, maxTokens: 8000,
      });
      sumar(p, r);
      for (const x of r.datos.encontrados ?? []) {
        const f = ids.get(x.id);
        if (!f || !x.valor?.trim() || /FALTA/i.test(x.valor)) continue;
        reemplazarFaltante(p, f.dato, x.valor.trim());
        p.completados.push({ dato: f.dato, valor: x.valor.trim(), fuente: `${x.documento}${x.pagina ? `, pág. ${x.pagina}` : ''}` });
      }
      faltan = buscables(p);
      await guardar(id, p);
    } catch (err) {
      // La búsqueda es una ayuda: si falla, lo que falta sigue marcado «FALTA»
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
  const docx = formatoNotaria(r.docx);
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
  ];
  const advertencias = [...p.advertencias, ...automaticas].sort((a, b) => ORDEN_NIVEL[a.nivel] - ORDEN_NIVEL[b.nivel]);
  const resultado: ResultadoGeneracion = {
    resumen: p.resumen, otorgantes: p.otorgantes, advertencias, faltantes, verificar, completados: p.completados,
    cambios: { aplicados: r.aplicados, eliminados: r.eliminados, insertados: r.insertados, noAplicados: r.noAplicados.length },
    documentos: { total: c.docs.length, leidos: c.leidos.length, sinLeer: c.sinLeer },
    tokens: { entrada: p.tokensEntrada, salida: p.tokensSalida, cache: p.tokensCache },
  };
  const ruta = await guardarCifrado(docx, 'escrituras');
  const hecho = await db.generacion.updateMany({
    where: { id, estado: 'EN_CURSO' },
    data: { estado: 'COMPLETADA', rutaDocx: ruta, hashSha256: sha256(docx), modelo: p.modelo, resultado: resultado as unknown as Prisma.InputJsonValue, progreso: { etapa: 'FINAL', turno: p.turno } },
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
