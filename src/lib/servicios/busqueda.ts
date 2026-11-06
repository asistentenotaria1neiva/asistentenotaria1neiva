/**
 * Búsqueda dirigida, antes de preguntar. Cada documento se lee una vez con el esquema de su tipo, y
 * algunos datos quedan vacíos: los linderos del lote que corresponde dentro de un título que describe
 * veinte, la tradición, el paz y salvo de un predio en mayor extensión… Esos datos se buscan en los
 * documentos con una sola llamada que dice exactamente qué falta y de qué persona o inmueble.
 *
 * Lo encontrado queda como sugerencia del documento donde está (datos_extraidos), y sigue el camino
 * de siempre (aplicarSugerenciasConfiables): con confianza alta o media se aplica sin preguntar; lo
 * dudoso, y lo que declara el compareciente (estado civil, actividad), se pregunta con la lectura de
 * la IA como valor sugerido.
 */
import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import type { Prisma } from '@prisma/client';
import { db } from '../db';
import { auditar } from '../auditoria';
import { datosAuditoria, type SesionActiva } from '../sesion-tipos';
import { CAMPOS_PERSONA, CAMPOS_INMUEBLE, ESQUEMAS, type Campo } from '../escritura/esquemas';
import { CAMPO_INDICACIONES } from '../escritura/actos-plantilla';
/** Personas con un mismo papel que se buscan en la segunda pasada (actos con varias personas por papel) */
const MAX_PERSONAS = 8;
import { esHistorico, fechaReferencia } from '../escritura/paz-salvo';
import { mencionadosEnActos, esDeLaEscritura, quienesEnajenan } from '../escritura/relevantes';
import { RECOMENDADOS_PERSONA } from '../escritura/rutas';
import { campoVisible, leerRuta } from '../escritura/validar-formulario';
import { VALIDADORES } from '../validaciones/formatos';
import { TIPOS_DOCUMENTALES, type TipoDocumental } from '../ia/documentos';
import { catastral } from '../ia/sugerencias';
import { SISTEMA_BUSQUEDA, esquemaBusqueda } from '../ia/instrucciones';
import { llamarEstructurado, configuracionModelo, prepararDocumento } from '../ia/cliente';
import { leerCifrado } from '../almacenamiento';
import { abrirPdf } from '../pdf';
import { obtenerExpediente, puedeEditar, datosDe, actosDe, referenciadosEnActos } from './expedientes';
/** Datos del inmueble que se buscan si están vacíos, con lo que la IA debe tomar */
const BUSCAR_INMUEBLE: Record<string, string> = {
  direccion: 'Dirección o nomenclatura del inmueble',
  nombre_corto: 'Identificación corta, p. ej. «LOTE 9 MANZANA C» o «APARTAMENTO 301 TORRE B»',
  municipio: 'Municipio donde queda el inmueble',
  area_terreno: 'Área del terreno en metros cuadrados; si viene por partes (hectáreas, metros y centímetros cuadrados), conviértela: «0 HA, 115 M2, 2800 CM2» = 115.28',
  area_construida: 'Área construida en metros cuadrados',
  linderos: 'Linderos completos y literales del inmueble',
  cedula_catastral: 'Cédula catastral o número predial, tal como aparece, con sus guiones',
  cedula_catastral_paz_salvo: 'Número catastral del paz y salvo vigente, tal como aparece, con sus guiones',
  involucrada_mayor_extension: 'true si algún documento dice que la cédula catastral está en mayor extensión o la marca «(INV.)»',
  matricula_matriz: 'Folio de matrícula matriz o de mayor extensión, si se menciona',
  fecha_certificado_tradicion: 'Fecha de expedición del certificado de tradición',
  'tradicion.modo': 'Cómo lo adquirió el titular actual (en un folio con varios titulares de cuota, quien enajena en esta escritura)',
  'tradicion.tradente': 'De quién lo adquirió el titular actual (nombre completo)',
  'tradicion.escritura_numero': 'Número de la escritura por la que lo adquirió el titular actual',
  'tradicion.escritura_fecha': 'Fecha de esa escritura',
  'tradicion.notaria': 'Notaría de esa escritura, como se cita en una escritura: «la Notaria Primera de Neiva»',
  'paz_salvo.entidad': 'Dependencia que expide el paz y salvo vigente, como se cita en una escritura: «la Secretaría de Hacienda de Algeciras (H)»',
  'paz_salvo.vigencia_hasta': 'Fecha hasta la que es válido el paz y salvo vigente',
  'paz_salvo.avaluo': 'Avalúo catastral del paz y salvo vigente, en pesos',
};

/** Lo que declara el compareciente: aunque un documento lo diga, se confirma */
const DECLARACIONES = new Set(['estado_civil', 'actividad_economica']);
/** Variables de una plantilla que son declaraciones del compareciente (estado civil, ocupación…): se confirman */
const DECLARACION_EN_ACTO = /estado_civil|actividad|ocupacion|profesion|oficio/i;

const DOCS_INMUEBLE: TipoDocumental[] = ['CERTIFICADO_TRADICION', 'ESCRITURA_ANTERIOR', 'PAZ_Y_SALVO', 'OTRO'];
// El título de adquisición no: quienes intervinieron en él no son comparecientes y lo que declararon
// entonces (estado civil, actividad) no vale para esta escritura
const DOCS_PERSONA: TipoDocumental[] = ['CEDULA', 'PODER', 'CERTIFICADO_EXISTENCIA', 'REGISTRO_CIVIL_NACIMIENTO', 'REGISTRO_CIVIL_MATRIMONIO', 'OTRO'];
/** Tipos de documento donde puede estar un dato que falta */
function documentosDelDato(f: { entidad: Entidad; campo: Campo }): TipoDocumental[] {
  // Una variable de plantilla puede estar en cualquiera: la escritura de la hipoteca que se cancela, el registro civil del matrimonio que se liquida…
  if (f.entidad === 'acto') return Object.keys(TIPOS_DOCUMENTALES) as TipoDocumental[];
  if (f.entidad === 'persona') return DOCS_PERSONA;
  const id = f.campo.id;
  if (id.startsWith('paz_salvo.') || id === 'cedula_catastral_paz_salvo') return ['PAZ_Y_SALVO', 'OTRO'];
  if (id === 'fecha_certificado_tradicion') return ['CERTIFICADO_TRADICION', 'OTRO'];
  return DOCS_INMUEBLE;
}
/** Primero los que más datos traen: si no caben todos, se dejan los últimos */
const PRIORIDAD: TipoDocumental[] = ['CERTIFICADO_TRADICION', 'ESCRITURA_ANTERIOR', 'PAZ_Y_SALVO', 'PODER', 'CERTIFICADO_EXISTENCIA', 'CEDULA', 'REGISTRO_CIVIL_MATRIMONIO', 'REGISTRO_CIVIL_NACIMIENTO', 'REGISTRO_CIVIL_DEFUNCION', 'OTRO'];
/** Límites de una solicitud con varios documentos (la API admite 100 páginas y 32 MB) */
const MAX_PAGINAS = 100;
const MAX_BYTES_EN_LINEA = 22 * 1024 * 1024;
const MAX_FALTANTES = 100;

type Entidad = 'persona' | 'inmueble' | 'acto';
/** Datos de la 2.ª, 3.ª… persona con un mismo papel (actos-plantilla.ts): «nombre_usufructuario__2» */
const DE_OTRA_PERSONA = /__\d+$/;
interface OpcionesBusqueda {
  /** Solo las variables de estos actos (un acto recién confirmado) */
  soloActos?: string[];
  /** Solo los datos de las demás personas de un papel: la búsqueda anterior dijo cuántas son */
  soloVariasPersonas?: boolean;
}
interface Faltante { clave: string; entidad: Entidad; ref: string; campo: Campo; de: string }
interface Hallazgo { clave: string; valor: string; documento: string; pagina: number; fragmento: string; confianza: 'ALTA' | 'MEDIA' | 'BAJA' }

const vacio = (v: unknown) => v === undefined || v === null || v === '';
const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');

function formato(c: Campo): string {
  switch (c.tipo) {
    case 'fecha': return 'fecha AAAA-MM-DD';
    case 'medida': return 'número con punto decimal, p. ej. 115.28';
    case 'moneda': case 'entero': return 'número entero, sin puntos de miles';
    case 'booleano': return 'true o false';
    case 'opciones': return `exactamente uno de: ${c.opciones!.map((o) => o.valor).join(' | ')}`;
    case 'textoLargo': return 'texto literal completo';
    default: return 'texto';
  }
}

/** Convierte lo que encontró la IA al tipo del campo; null si no se puede */
export function convertirHallazgo(c: Campo, h: Pick<Hallazgo, 'valor' | 'fragmento' | 'confianza'>): unknown {
  const t = String(h.valor ?? '').trim();
  if (!t || /^null$/i.test(t)) return null;
  if (c.id === 'cedula_catastral' || c.id === 'cedula_catastral_paz_salvo') return digitos(catastral({ valor: t, fragmento: h.fragmento, pagina: null, confianza: h.confianza })?.valor) || null;
  switch (c.tipo) {
    case 'medida': { const n = Number(/\d+(?:[.,]\d+)?/.exec(t)?.[0].replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null; }
    case 'moneda': case 'entero': { const d = digitos(t); return d ? Number(d) : null; }
    case 'booleano': return /^(true|s[ií])/i.test(t) ? true : /^(false|no)/i.test(t) ? false : null;
    case 'fecha': return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
    case 'opciones': return c.opciones!.find((o) => o.valor.toUpperCase() === t.toUpperCase() || o.etiqueta.toUpperCase() === t.toUpperCase())?.valor ?? null;
    default: return c.id === 'nombre' || c.id === 'tradicion.tradente' ? t.toUpperCase().replace(/\s+/g, ' ') : t;
  }
}

/**
 * Los datos vacíos que se pueden buscar en los documentos: las variables de los actos por plantilla
 * (todas las escrituras menos la compraventa, cuyo formulario propio toma esos datos de las personas
 * y los inmuebles), los de los inmuebles y los de los comparecientes. Las variables van primero: sin
 * ellas no se genera la escritura. `soloActos`: solo las variables de esos actos (un acto recién confirmado).
 */
export function faltantesBuscables(datos: ReturnType<typeof datosDe>, actos: string[] = [], { soloActos, soloVariasPersonas }: OpcionesBusqueda = {}): Faltante[] {
  const usados = referenciadosEnActos(datos);
  const faltantes: Faltante[] = [];
  const agregar = (f: Omit<Faltante, 'clave'>) => faltantes.push({ ...f, clave: `f${faltantes.length + 1}` });
  for (const a of soloActos ?? actos) {
    const esq = ESQUEMAS[a];
    if (!esq?.porPlantilla) continue;
    const valores = (datos.actos[a] ?? {}) as Record<string, unknown>;
    const campos = esq.pasos.flatMap((p) => p.campos);
    for (const c of campos) {
      // Las indicaciones para la redacción las escribe el funcionario: no se buscan
      if (c.id === CAMPO_INDICACIONES || ['lista', 'persona', 'personas', 'inmueble', 'inmuebles'].includes(c.tipo) || !campoVisible(c, valores, campos) || !vacio(leerRuta(valores, c.id))) continue;
      if (soloVariasPersonas && !DE_OTRA_PERSONA.test(c.id)) continue;
      agregar({ entidad: 'acto', ref: a, campo: c, de: `Escritura de ${esq.titulo}: dato «${c.id}» de la plantilla` });
    }
  }
  if (soloActos || soloVariasPersonas) return faltantes.slice(0, MAX_FALTANTES);
  // Si los actos ya dicen cuáles son los inmuebles y las personas de la escritura (por id o, en los
  // actos por plantilla, por su matrícula, documento o nombre), solo esos
  const m = mencionadosEnActos(datos, actos.length ? actos : undefined);
  for (const id of usados) { if (datos.inmuebles.some((i) => i.id === id)) m.inmuebles.add(id); else if (datos.personas.some((p) => p.id === id)) m.personas.add(id); }
  const inmuebles = datos.inmuebles.filter((i) => esDeLaEscritura(m, 'inmueble', i.id));
  // La tradición que importa es la de quien enajena: en un folio con muchos titulares de cuota no hay una sola «última adquisición»
  const enajenan = quienesEnajenan(datos, actos.length ? actos : undefined);
  for (const i of inmuebles) {
    if (!i.matricula) continue;
    const de = `Inmueble de matrícula ${i.matricula}${i.nombre_corto ? `, ${i.nombre_corto}` : ''}${i.direccion ? `, ${i.direccion}` : ''}`;
    for (const c of CAMPOS_INMUEBLE) {
      if (!(c.id in BUSCAR_INMUEBLE) || !campoVisible(c, i as unknown as Record<string, unknown>) || !vacio(leerRuta(i, c.id))) continue;
      const deQuien = c.id.startsWith('tradicion.') && enajenan.length ? `${de}. Adquisición de: ${enajenan.join(', ')}` : de;
      agregar({ entidad: 'inmueble', ref: i.matricula, campo: { ...c, ayuda: BUSCAR_INMUEBLE[c.id] }, de: deQuien });
    }
  }
  const personas = datos.personas.filter((p) => esDeLaEscritura(m, 'persona', p.id));
  for (const p of personas) {
    const doc = digitos(p.numero_documento);
    if (!doc || p.menor_de_edad) continue;
    const de = `Persona ${p.nombre || '(sin nombre)'}, documento ${p.numero_documento}`;
    for (const c of CAMPOS_PERSONA) {
      if (!(c.obligatorio || RECOMENDADOS_PERSONA.includes(c.id)) || c.tipo === 'persona' || !campoVisible(c, p as unknown as Record<string, unknown>) || !vacio(leerRuta(p, c.id))) continue;
      agregar({ entidad: 'persona', ref: doc, campo: c, de });
    }
  }
  return faltantes.slice(0, MAX_FALTANTES);
}

/**
 * Busca en los documentos los datos que siguen vacíos y los deja como sugerencias. Devuelve cuántos
 * encontró. Sin datos vacíos o sin documentos, no llama a la IA.
 */
/**
 * ¿La búsqueda dejó dicho que un papel tiene varias personas (cantidad_usufructuario = 2) y faltan
 * los datos de las demás? Entonces se buscan en una segunda pasada.
 */
export async function faltanOtrasPersonas(s: SesionActiva, expedienteId: string): Promise<boolean> {
  const e = await obtenerExpediente(s, expedienteId);
  return faltantesBuscables(datosDe(e), actosDe(e), { soloVariasPersonas: true }).length > 0;
}

export async function buscarFaltantesEnDocumentos(s: SesionActiva, expedienteId: string, opciones: OpcionesBusqueda = {}): Promise<number> {
  const e = await obtenerExpediente(s, expedienteId);
  if (!puedeEditar(s, e)) return 0;
  const faltantes = faltantesBuscables(datosDe(e), actosDe(e), opciones);
  const fechaRef = fechaReferencia(datosDe(e).escritura.fecha_otorgamiento);
  if (!faltantes.length) return 0;
  // Solo los documentos donde puede estar algún dato que falta: si solo falta el paz y salvo, no se
  // reenvía el título de adquisición completo (decenas de páginas)
  const tipos = new Set(faltantes.flatMap(documentosDelDato));
  const docs = (await db.documento.findMany({ where: { expedienteId, estadoAnalisis: 'COMPLETADO' }, orderBy: { creadoEn: 'asc' } }))
    .filter((d) => tipos.has(d.tipoDocumental as TipoDocumental))
    .sort((a, b) => PRIORIDAD.indexOf(a.tipoDocumental as TipoDocumental) - PRIORIDAD.indexOf(b.tipoDocumental as TipoDocumental));
  if (!docs.length) return 0;

  const analisis = await db.analisisIA.create({ data: { expedienteId, proposito: 'EXTRACCION', modelo: configuracionModelo('EXTRACCION').modelo, estado: 'EN_CURSO', resultado: { busqueda: true } } });
  const liberar: (() => Promise<void>)[] = [];
  try {
    const contenido: Anthropic.Beta.BetaContentBlockParam[] = [];
    const enviados: { codigo: string; id: string; tipo: TipoDocumental }[] = [];
    let paginas = 0, enLinea = 0;
    for (const d of docs) {
      const bytes = await leerCifrado(d.rutaCifrada);
      const n = d.mime !== 'application/pdf' ? 1 : d.paginaDesde && d.paginaHasta ? d.paginaHasta - d.paginaDesde + 1 : (await abrirPdf(bytes))?.getPageCount() ?? 1;
      const pesaEnLinea = bytes.length <= 20 * 1024 * 1024 ? bytes.length : 0;
      if (paginas + n > MAX_PAGINAS || enLinea + pesaEnLinea > MAX_BYTES_EN_LINEA) continue;
      const codigo = `D${enviados.length + 1}`;
      const titulo = `${codigo} · ${TIPOS_DOCUMENTALES[d.tipoDocumental as TipoDocumental] ?? d.tipoDocumental}`;
      const preparado = await prepararDocumento(bytes, d.mime, titulo);
      liberar.push(preparado.liberar);
      contenido.push({ type: 'text', text: `Documento ${titulo} (${d.nombreOriginal}):` }, preparado.bloque);
      enviados.push({ codigo, id: d.id, tipo: d.tipoDocumental as TipoDocumental });
      paginas += n;
      enLinea += pesaEnLinea;
    }
    if (!enviados.length) {
      await db.analisisIA.update({ where: { id: analisis.id }, data: { estado: 'COMPLETADO', resultado: { busqueda: true, faltantes: faltantes.length, encontrados: 0 } } });
      return 0;
    }
    const lista = faltantes.map((f) => ({ clave: f.clave, dato: f.campo.etiqueta, de: f.de, formato: formato(f.campo), ...(f.campo.ayuda ? { indicacion: f.campo.ayuda } : {}) }));
    contenido.push({ type: 'text', text: `<faltantes>\n${JSON.stringify(lista)}\n</faltantes>\nBusca cada uno de estos datos en los documentos.` });
    const r = await llamarEstructurado<{ encontrados: Hallazgo[] }>({
      proposito: 'EXTRACCION',
      registro: { usuarioId: s.usuario.id, expedienteId, analisisId: analisis.id },
      sistema: SISTEMA_BUSQUEDA,
      contenido,
      esquema: esquemaBusqueda(faltantes.map((f) => f.clave), enviados.map((x) => x.codigo)),
      maxTokens: 16000,
    });

    const filas: Prisma.DatoExtraidoCreateManyInput[] = [];
    for (const h of Array.isArray(r.datos.encontrados) ? r.datos.encontrados : []) {
      const f = faltantes.find((x) => x.clave === h.clave);
      const enviado = enviados.find((x) => x.codigo === h.documento);
      const documentoId = enviado?.id ?? null;
      if (!f || filas.some((x) => x.campo === `${f.entidad}:${f.ref}.${f.campo.id}`)) continue;
      // Cada dato solo de los documentos donde puede estar: el paz y salvo, del paz y salvo (no del
      // protocolizado dentro de la escritura de la hipoteca o del título)
      if (enviado && !documentosDelDato(f).includes(enviado.tipo)) continue;
      const valor = convertirHallazgo(f.campo, h);
      if (valor === null) continue;
      // Un paz y salvo vencido hace más de un año es histórico: no es el de esta escritura
      if (f.campo.id === 'paz_salvo.vigencia_hasta' && esHistorico(String(valor), fechaRef)) continue;
      const valido = !f.campo.validacion || typeof valor === 'boolean' || (VALIDADORES[f.campo.validacion] as (x: string) => { ok: boolean })(String(valor)).ok;
      const confianza = ['ALTA', 'MEDIA', 'BAJA'].includes(h.confianza) ? h.confianza : 'BAJA';
      filas.push({
        expedienteId, analisisId: analisis.id, documentoId, campo: `${f.entidad}:${f.ref}.${f.campo.id}`, valor: valor as Prisma.InputJsonValue,
        pagina: Number.isInteger(h.pagina) && h.pagina > 0 ? h.pagina : null, fragmento: String(h.fragmento ?? '').slice(0, 1000) || null, confianza,
        revisionManual: confianza === 'BAJA' || !valido || (f.entidad === 'persona' && DECLARACIONES.has(f.campo.id)) || (f.entidad === 'acto' && DECLARACION_EN_ACTO.test(f.campo.id)),
      });
    }
    await db.$transaction([
      // Lo que encontró una búsqueda anterior y nadie decidió se reemplaza (con `soloActos`, solo lo de esos actos)
      db.datoExtraido.deleteMany({ where: {
        expedienteId, estado: 'PENDIENTE', analisis: { proposito: 'EXTRACCION', documentoId: null },
        ...(opciones.soloVariasPersonas ? { OR: Array.from({ length: MAX_PERSONAS - 1 }, (_, i) => ({ campo: { endsWith: `__${i + 2}` } })) }
          : opciones.soloActos ? { OR: opciones.soloActos.map((a) => ({ campo: { startsWith: `acto:${a}.` } })) } : {}),
      } }),
      db.datoExtraido.createMany({ data: filas }),
      db.analisisIA.update({ where: { id: analisis.id }, data: { estado: 'COMPLETADO', modelo: r.modelo, tokensEntrada: r.tokensEntrada, tokensSalida: r.tokensSalida, tokensCacheLectura: r.tokensCacheLectura, duracionMs: r.duracionMs, resultado: { busqueda: true, faltantes: faltantes.length, encontrados: filas.length } } }),
    ]);
    await auditar({ ...datosAuditoria(s), accion: 'ASISTENTE_BUSQUEDA_DOCUMENTOS', entidad: 'expediente', entidadId: expedienteId, detalle: { faltantes: faltantes.length, encontrados: filas.length, documentos: enviados.length, modelo: r.modelo } });
    return filas.length;
  } catch (err) {
    await db.analisisIA.update({ where: { id: analisis.id }, data: { estado: 'ERROR', error: err instanceof Error ? err.message.slice(0, 500) : 'Error en la búsqueda' } });
    throw err;
  } finally {
    await Promise.all(liberar.map((l) => l()));
  }
}
