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
import { CAMPOS_PERSONA, CAMPOS_INMUEBLE, type Campo } from '../escritura/esquemas';
import { RECOMENDADOS_PERSONA } from '../escritura/rutas';
import { campoVisible, leerRuta } from '../escritura/validar-formulario';
import { VALIDADORES } from '../validaciones/formatos';
import { TIPOS_DOCUMENTALES, type TipoDocumental } from '../ia/documentos';
import { catastral } from '../ia/sugerencias';
import { SISTEMA_BUSQUEDA, esquemaBusqueda } from '../ia/instrucciones';
import { llamarEstructurado, configuracionModelo, prepararDocumento } from '../ia/cliente';
import { leerCifrado } from '../almacenamiento';
import { abrirPdf } from '../pdf';
import { obtenerExpediente, puedeEditar, datosDe, referenciadosEnActos } from './expedientes';

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
  'tradicion.modo': 'Cómo lo adquirió el titular actual',
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

const DOCS_INMUEBLE: TipoDocumental[] = ['CERTIFICADO_TRADICION', 'ESCRITURA_ANTERIOR', 'PAZ_Y_SALVO', 'OTRO'];
const DOCS_PERSONA: TipoDocumental[] = ['CEDULA', 'ESCRITURA_ANTERIOR', 'PODER', 'CERTIFICADO_EXISTENCIA', 'REGISTRO_CIVIL_NACIMIENTO', 'REGISTRO_CIVIL_MATRIMONIO', 'OTRO'];
/** Primero los que más datos traen: si no caben todos, se dejan los últimos */
const PRIORIDAD: TipoDocumental[] = ['CERTIFICADO_TRADICION', 'ESCRITURA_ANTERIOR', 'PAZ_Y_SALVO', 'PODER', 'CERTIFICADO_EXISTENCIA', 'CEDULA', 'REGISTRO_CIVIL_MATRIMONIO', 'REGISTRO_CIVIL_NACIMIENTO', 'OTRO'];
/** Límites de una solicitud con varios documentos (la API admite 100 páginas y 32 MB) */
const MAX_PAGINAS = 100;
const MAX_BYTES_EN_LINEA = 22 * 1024 * 1024;
const MAX_FALTANTES = 60;

interface Faltante { clave: string; entidad: 'persona' | 'inmueble'; ref: string; campo: Campo; de: string }
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

/** Los datos vacíos que se pueden buscar en los documentos: de los inmuebles y de los comparecientes */
export function faltantesBuscables(datos: ReturnType<typeof datosDe>): Faltante[] {
  const usados = referenciadosEnActos(datos);
  const faltantes: Faltante[] = [];
  const agregar = (f: Omit<Faltante, 'clave'>) => faltantes.push({ ...f, clave: `f${faltantes.length + 1}` });
  // Si ya se eligieron los inmuebles (o las personas) de los actos, solo esos
  const inmuebles = datos.inmuebles.some((i) => usados.has(i.id)) ? datos.inmuebles.filter((i) => usados.has(i.id)) : datos.inmuebles;
  for (const i of inmuebles) {
    if (!i.matricula) continue;
    const de = `Inmueble de matrícula ${i.matricula}${i.nombre_corto ? `, ${i.nombre_corto}` : ''}${i.direccion ? `, ${i.direccion}` : ''}`;
    for (const c of CAMPOS_INMUEBLE) {
      if (!(c.id in BUSCAR_INMUEBLE) || !campoVisible(c, i as unknown as Record<string, unknown>) || !vacio(leerRuta(i, c.id))) continue;
      agregar({ entidad: 'inmueble', ref: i.matricula, campo: { ...c, ayuda: BUSCAR_INMUEBLE[c.id] }, de });
    }
  }
  const personas = datos.personas.some((p) => usados.has(p.id)) ? datos.personas.filter((p) => usados.has(p.id)) : datos.personas;
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
export async function buscarFaltantesEnDocumentos(s: SesionActiva, expedienteId: string): Promise<number> {
  const e = await obtenerExpediente(s, expedienteId);
  if (!puedeEditar(s, e)) return 0;
  const faltantes = faltantesBuscables(datosDe(e));
  if (!faltantes.length) return 0;
  const tipos = new Set([...(faltantes.some((f) => f.entidad === 'inmueble') ? DOCS_INMUEBLE : []), ...(faltantes.some((f) => f.entidad === 'persona') ? DOCS_PERSONA : [])]);
  const docs = (await db.documento.findMany({ where: { expedienteId, estadoAnalisis: 'COMPLETADO' }, orderBy: { creadoEn: 'asc' } }))
    .filter((d) => tipos.has(d.tipoDocumental as TipoDocumental))
    .sort((a, b) => PRIORIDAD.indexOf(a.tipoDocumental as TipoDocumental) - PRIORIDAD.indexOf(b.tipoDocumental as TipoDocumental));
  if (!docs.length) return 0;

  const analisis = await db.analisisIA.create({ data: { expedienteId, proposito: 'EXTRACCION', modelo: configuracionModelo('EXTRACCION').modelo, estado: 'EN_CURSO', resultado: { busqueda: true } } });
  const liberar: (() => Promise<void>)[] = [];
  try {
    const contenido: Anthropic.Beta.BetaContentBlockParam[] = [];
    const enviados: { codigo: string; id: string }[] = [];
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
      enviados.push({ codigo, id: d.id });
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
      sistema: SISTEMA_BUSQUEDA,
      contenido,
      esquema: esquemaBusqueda(faltantes.map((f) => f.clave), enviados.map((x) => x.codigo)),
      maxTokens: 16000,
    });

    const filas: Prisma.DatoExtraidoCreateManyInput[] = [];
    for (const h of Array.isArray(r.datos.encontrados) ? r.datos.encontrados : []) {
      const f = faltantes.find((x) => x.clave === h.clave);
      const documentoId = enviados.find((x) => x.codigo === h.documento)?.id ?? null;
      if (!f || filas.some((x) => x.campo === `${f.entidad}:${f.ref}.${f.campo.id}`)) continue;
      const valor = convertirHallazgo(f.campo, h);
      if (valor === null) continue;
      const valido = !f.campo.validacion || typeof valor === 'boolean' || (VALIDADORES[f.campo.validacion] as (x: string) => { ok: boolean })(String(valor)).ok;
      const confianza = ['ALTA', 'MEDIA', 'BAJA'].includes(h.confianza) ? h.confianza : 'BAJA';
      filas.push({
        expedienteId, analisisId: analisis.id, documentoId, campo: `${f.entidad}:${f.ref}.${f.campo.id}`, valor: valor as Prisma.InputJsonValue,
        pagina: Number.isInteger(h.pagina) && h.pagina > 0 ? h.pagina : null, fragmento: String(h.fragmento ?? '').slice(0, 1000) || null, confianza,
        revisionManual: confianza === 'BAJA' || !valido || (f.entidad === 'persona' && DECLARACIONES.has(f.campo.id)),
      });
    }
    await db.$transaction([
      // Lo que encontró una búsqueda anterior y nadie decidió se reemplaza
      db.datoExtraido.deleteMany({ where: { expedienteId, estado: 'PENDIENTE', analisis: { proposito: 'EXTRACCION', documentoId: null } } }),
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
