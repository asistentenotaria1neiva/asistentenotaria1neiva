/**
 * Documentos soporte de la escritura: carga (cifrada), lectura con IA y descarga auditada.
 *
 * Cada documento se lee UNA sola vez con Haiku (muy económico) y lo leído se guarda: generar la
 * escritura otra vez (con otras observaciones u otra plantilla) no vuelve a pagar la lectura. La
 * lectura empieza apenas se carga el documento, en segundo plano, y la generación espera a los que
 * falten. Un PDF de más de 30 páginas se lee por tramos (ver PAGINAS_POR_TRAMO).
 */
import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { Prisma } from '@prisma/client';
import { db } from '../db';
import { auditar } from '../auditoria';
import { datosAuditoria, type SesionActiva } from '../sesion-tipos';
import { guardarCifrado, leerCifrado, borrarCifrado, guardarParte, unirPartes, ARCHIVO_RETIRADO } from '../almacenamiento';
import { sha256 } from '../seguridad/cifrado';
import { consumirLimite } from '../seguridad/limites';
import { abrirPdf, extraerPaginas } from '../pdf';
import { parrafosDocx, ErrorDocx } from '../escritura/docx';
import { compactarUnidades, sinRelleno } from '../escritura/unidades';
import { llamarEstructurado, prepararDocumento, modeloPrecision, ErrorIA } from '../ia/cliente';
import { esDatoCatastral, soloDigitos, problemaDeForma, difierenEnCeros } from '../escritura/catastral';
import { rescatarArreglo } from '../ia/json';
import { SISTEMA_LECTURA, ESQUEMA_LECTURA, type Lectura, type DocumentoLeido } from '../ia/instrucciones';
import { expedienteEditable, obtenerExpediente, ErrorNegocio } from './expedientes';
import { pedirLectura } from './tareas';

/** El navegador envía cada archivo en partes (Vercel limita cada petición a 4,5 MB) */
const TAMANO_MAXIMO_PARTE = 4 * 1024 * 1024;
/**
 * Páginas de PDF por llamada. Cada página cuesta ~1.500-3.000 tokens (texto + imagen) y Haiku 5.5
 * cobra 5 veces más TODA la llamada cuando el prompt pasa de 100.000 tokens: 30 páginas la mantienen
 * por debajo (90 páginas la pasaban casi siempre). También reduce las lecturas cortadas por longitud.
 */
export const PAGINAS_POR_TRAMO = 30;
/**
 * Una lectura «en curso» sin latido en este tiempo se cortó y se puede retomar. Mientras se lee, el
 * latido se renueva cada LATIDO_MS (antes solo al terminar un tramo, y había que esperar 6 minutos).
 */
export const LECTURA_CORTADA_MS = 2 * 60_000;
const LATIDO_MS = 30_000;
/**
 * Salida máxima de una lectura (Haiku 5.5 admite 128.000). Solo se paga lo que se escribe: el límite
 * alto no encarece las lecturas normales y evita que un tramo denso (linderos, textos literales) se corte.
 */
const MAXIMO_SALIDA_LECTURA = 64_000;
/**
 * Texto máximo de un documento de Word que se envía a leer: ~70.000 tokens, bajo los 100.000 donde Haiku
 * cobra 5 veces más. Un reglamento cabe casi siempre, porque sus unidades se quitan antes (compactarUnidades).
 */
const MAXIMO_TEXTO = 240_000;

export const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Tipo real del archivo por su firma (no se confía en la extensión ni en el tipo declarado) */
export function tipoPorFirma(b: Buffer): string | null {
  if (b.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) && b.includes(Buffer.from('word/'))) return MIME_DOCX;
  return null;
}

/** Las partes de una carga quedan atadas al usuario y al expediente: otro no puede completarla */
function claveCarga(s: SesionActiva, expedienteId: string, carga: string): string {
  if (!/^[0-9a-f-]{36}$/.test(carga)) throw new ErrorNegocio('Carga no válida.');
  return sha256(`${s.usuario.id}:${expedienteId}:${carga}`).slice(0, 32);
}

export async function subirParteDocumento(s: SesionActiva, expedienteId: string, carga: string, indice: number, parte: File) {
  await expedienteEditable(s, expedienteId);
  if (!parte.size || parte.size > TAMANO_MAXIMO_PARTE) throw new ErrorNegocio('Parte de archivo no válida.');
  await guardarParte(claveCarga(s, expedienteId, carga), indice, Buffer.from(await parte.arrayBuffer()));
}

/**
 * Une las partes recibidas y registra el documento (pendiente de lectura). Devuelve su id y los bytes,
 * para que la primera lectura use el archivo que ya está en memoria y no lo vuelva a bajar de Supabase.
 */
export async function completarDocumento(s: SesionActiva, expedienteId: string, carga: string, partes: number, nombre: string): Promise<{ id: string; bytes: Buffer }> {
  if (!Number.isInteger(partes) || partes < 1 || partes > 99_999) throw new ErrorNegocio('Carga no válida.');
  await expedienteEditable(s, expedienteId);
  let bytes: Buffer;
  try {
    bytes = await unirPartes(claveCarga(s, expedienteId, carga), partes);
  } catch (e) {
    if (e instanceof ErrorNegocio) throw e;
    console.error('[completarDocumento]', e);
    throw new ErrorNegocio('No llegaron todas las partes del archivo. Cárguelo de nuevo.');
  }
  if (!(await consumirLimite(`carga:${s.usuario.id}`, 120, 3600)).permitido) throw new ErrorNegocio('Demasiadas cargas en la última hora.');
  if (!bytes.length) throw new ErrorNegocio('El archivo está vacío.');
  const mime = tipoPorFirma(bytes);
  if (!mime) throw new ErrorNegocio('Solo se aceptan PDF, imágenes (JPG, PNG, WEBP) o documentos de Word (.docx).');
  const paginas = mime === 'application/pdf' ? (await abrirPdf(bytes))?.getPageCount() ?? null : 1;
  const ruta = await guardarCifrado(bytes, 'documentos');
  const d = await db.documento.create({
    data: {
      expedienteId, nombreOriginal: nombre.replace(/[^\p{L}\p{N} ._()-]/gu, '_').slice(0, 150), mime, tamano: bytes.length, paginas,
      hashSha256: sha256(bytes), rutaCifrada: ruta, subidoPorId: s.usuario.id,
    },
  });
  await auditar({ ...datosAuditoria(s), accion: 'DOCUMENTO_CARGADO', entidad: 'documento', entidadId: d.id, detalle: { expedienteId, tamano: bytes.length, sha256: d.hashSha256 } });
  return { id: d.id, bytes };
}

/** Bloques de contenido de un archivo para la IA (un PDF largo, por tramos de páginas) */
/** `omitir`: tramos (por su página inicial) ya leídos, que no hace falta preparar otra vez */
export async function bloquesDeArchivo(bytes: Buffer, mime: string, titulo: string, omitir: ReadonlySet<number> = new Set()): Promise<{ tramos: { bloque: Anthropic.Beta.BetaContentBlockParam; desde: number }[]; liberar: () => Promise<void> }> {
  if (mime === MIME_DOCX) {
    let parrafos: string[];
    try { parrafos = parrafosDocx(bytes); } catch (e) { if (e instanceof ErrorDocx) throw new ErrorIA('El documento de Word no se pudo abrir.', 'FORMATO'); throw e; }
    // Un reglamento con decenas de unidades: sus descripciones no van a la IA (el sistema copia textual la
    // del negocio al generar); así la lectura ve TODO lo demás y cuesta una fracción
    const compacto = compactarUnidades(parrafos);
    const texto = sinRelleno((compacto?.parrafos ?? parrafos).join('\n'));
    // Un Word más largo (un reglamento de propiedad horizontal) va recortado y se avisa: los párrafos de
    // las unidades del negocio los busca el sistema en el texto completo al generar (escritura/unidades.ts)
    const recorte = texto.length > MAXIMO_TEXTO
      ? `${texto.slice(0, MAXIMO_TEXTO)}\n[… el documento sigue: aquí van solo sus primeros ${MAXIMO_TEXTO.toLocaleString('es-CO')} de ${texto.length.toLocaleString('es-CO')} caracteres]`
      : texto;
    return { tramos: [{ bloque: { type: 'text', text: `<documento nombre="${titulo.replace(/"/g, "'")}">\n${recorte}\n</documento>` }, desde: 1 }], liberar: async () => {} };
  }
  const pdf = mime === 'application/pdf' ? await abrirPdf(bytes) : null;
  const paginas = pdf?.getPageCount() ?? 1;
  const partes = !pdf || paginas <= PAGINAS_POR_TRAMO
    ? [{ bytes, desde: 1 }]
    : await Promise.all(Array.from({ length: Math.ceil(paginas / PAGINAS_POR_TRAMO) }, (_, i) => i * PAGINAS_POR_TRAMO + 1)
      .filter((desde) => !omitir.has(desde))
      .map(async (desde) => ({ bytes: await extraerPaginas(pdf, desde, Math.min(paginas, desde + PAGINAS_POR_TRAMO - 1)), desde })));
  const liberar: (() => Promise<void>)[] = [];
  const tramos = [];
  for (const p of partes) {
    if (omitir.has(p.desde)) continue;
    const d = await prepararDocumento(p.bytes, mime, titulo);
    liberar.push(d.liberar);
    tramos.push({ bloque: d.bloque, desde: p.desde });
  }
  return { tramos, liberar: async () => { await Promise.all(liberar.map((f) => f())); } };
}

const ESQUEMA_CATASTRAL = {
  type: 'object',
  properties: {
    numeros: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          rotulo: { type: 'string' },
          tal_como_aparece: { type: 'string' },
          grupos: { type: 'array', items: { type: 'string' } },
          cantidad_digitos: { type: 'integer' },
        },
        required: ['rotulo', 'tal_como_aparece', 'grupos', 'cantidad_digitos'],
        additionalProperties: false,
      },
    },
  },
  required: ['numeros'],
  additionalProperties: false,
} as const;

const SISTEMA_CATASTRAL = `Transcribes, con exactitud absoluta, las cédulas catastrales (código catastral, número predial, ficha catastral) de UNA página de un documento colombiano (certificado de tradición, paz y salvo predial o de valorización, escritura). Una sola cifra de más o de menos invalida la escritura.
- Transcribe cada cédula catastral VIGENTE de la página (no la «anterior» o «antigua»), con su rótulo.
- «tal_como_aparece»: el número exactamente como está impreso (con sus guiones o puntos, si los tiene).
- «grupos»: el mismo número partido en grupos. Si tiene 30 dígitos (número predial nacional): 2, 3, 2, 2, 2, 2, 4, 4, 1, 2, 2, 4 dígitos (departamento, municipio, zona, sector, comuna, barrio, manzana o vereda, terreno, condición, edificio, piso, unidad). Si tiene 25 (sin departamento ni municipio): 2, 2, 2, 2, 4, 4, 1, 2, 2, 4. Si tiene otra cantidad o guiones, los grupos que trae impresos.
- «cantidad_digitos»: cuántos dígitos tiene, contados uno por uno.
- CUIDADO con las series de ceros: es donde más se equivoca la lectura. Cuenta cada cero mirando su posición; mide el largo del número contra los dígitos distintos de cero que lo rodean. Antes de responder, vuelve a contar los dígitos y verifica que los grupos, unidos, den el número.
- Si la página está girada, léela girada. Si no hay ninguna cédula catastral, devuelve la lista vacía.`;

/**
 * Relectura de las cédulas catastrales: la lectura general (Haiku) cuenta mal las series de ceros de un
 * escaneo. Cada página con una cédula catastral se vuelve a leer solo para ese número con el modelo de
 * la redacción y esfuerzo alto; si la relectura es coherente (sus grupos y su cantidad cuadran) y
 * difiere de lo leído, manda la relectura y queda una alerta. Un fallo aquí no daña la lectura.
 */
async function releerCatastrales(bytes: Buffer, mime: string, nombre: string, documentos: DocumentoLeido[], registro: { usuarioId: string; expedienteId: string }, abierto?: Awaited<ReturnType<typeof abrirPdf>>): Promise<void> {
  if (mime === MIME_DOCX) return; // el texto de un Word es exacto
  const porPagina = new Map<number, { doc: DocumentoLeido; i: number }[]>();
  for (const doc of documentos) doc.datos.forEach((x, i) => {
    if (!esDatoCatastral(x.dato, x.valor)) return;
    const p = x.pagina || 1;
    porPagina.set(p, [...(porPagina.get(p) ?? []), { doc, i }]);
  });
  if (!porPagina.size) return;
  const pdf = mime !== 'application/pdf' ? null : abierto !== undefined ? abierto : await abrirPdf(bytes);
  await Promise.all([...porPagina].slice(0, 6).map(async ([pagina, datos]) => {
    let liberar = async () => {};
    try {
      const pagBytes = pdf && pagina <= pdf.getPageCount() ? await extraerPaginas(pdf, pagina, pagina) : bytes;
      const d = await prepararDocumento(pagBytes, mime, `${nombre} — página ${pagina}`);
      liberar = d.liberar;
      const r = await llamarEstructurado<{ numeros: { rotulo: string; tal_como_aparece: string; grupos: string[]; cantidad_digitos: number }[] }>({
        proposito: 'LECTURA',
        modelo: modeloPrecision(),
        esfuerzo: 'high',
        registro,
        sistema: SISTEMA_CATASTRAL,
        contenido: [d.bloque, { type: 'text', text: 'Transcribe las cédulas catastrales de esta página.' }],
        esquema: ESQUEMA_CATASTRAL as unknown as Record<string, unknown>,
        maxTokens: 8000,
      });
      // Solo las relecturas coherentes: los grupos unidos dan el número y la cantidad cuadra
      const buenas = r.datos.numeros.filter((n) => {
        const dig = soloDigitos(n.tal_como_aparece);
        return dig.length === n.cantidad_digitos && soloDigitos(n.grupos.join('')) === dig && !problemaDeForma(dig);
      });
      for (const { doc, i } of datos) {
        const leido = doc.datos[i];
        if (buenas.some((n) => soloDigitos(n.tal_como_aparece) === soloDigitos(leido.valor))) continue;
        // La que corresponde: la que solo difiere en ceros, o la única de la página
        const candidata = buenas.find((n) => difierenEnCeros(n.tal_como_aparece, leido.valor)) ?? (buenas.length === 1 ? buenas[0] : undefined);
        if (!candidata) {
          (doc.alertas ??= []).push(`Cédula catastral «${leido.valor}» (p${pagina}): no se pudo confirmar en una segunda lectura; verifíquela dígito por dígito contra el documento.`);
          continue;
        }
        (doc.alertas ??= []).push(`Cédula catastral corregida en una segunda lectura (p${pagina}): ${candidata.tal_como_aparece} (la primera lectura decía ${leido.valor}).`);
        doc.datos[i] = { ...leido, valor: candidata.tal_como_aparece };
      }
    } catch (e) {
      console.error('[releerCatastrales]', e);
      for (const { doc, i } of datos) (doc.alertas ??= []).push(`Cédula catastral «${doc.datos[i].valor}» (p${pagina}): no se pudo hacer la segunda lectura; verifíquela dígito por dígito contra el documento.`);
    } finally {
      await liberar();
    }
  }));
}

/**
 * Tramos de un PDF largo que se leen a la vez (cada uno tarda de 1 a 3 minutos: Haiku escribe unos
 * 300 tokens por segundo y un tramo denso escribe 30.000-45.000). Con 3, un PDF de 300 páginas tomaba
 * más de 10 minutos y varias invocaciones. CLAUDE_TRAMOS_A_LA_VEZ lo cambia (1 a 12).
 */
const TRAMOS_A_LA_VEZ = Math.min(Math.max(Math.trunc(Number(process.env.CLAUDE_TRAMOS_A_LA_VEZ)) || 8, 1), 12);
/**
 * Pasado este tiempo de la invocación no se empieza otro tramo: el que empiece termina antes del corte
 * de Vercel (5 minutos) y lo que falte sigue enseguida en una invocación nueva (pedirLectura), en vez
 * de perder los tramos a medio leer y esperar a que la lectura parezca cortada.
 */
const INICIAR_TRAMOS_HASTA_MS = 120_000;

export interface OpcionesLectura {
  /** false: no copia la lectura de otro documento con el mismo archivo («Leer de nuevo») */
  reutilizar?: boolean;
  /** Dirección de la aplicación para seguir en otra invocación; sin ella se lee todo en esta (pruebas) */
  base?: string | null;
  /** Cuándo empezó la invocación (si la lectura no es lo primero que hace) */
  inicio?: number;
  /** El archivo ya en memoria (recién cargado): no se vuelve a bajar del almacenamiento */
  bytes?: Buffer;
}

/** Lo leído de cada tramo (por su página inicial) mientras la lectura sigue EN_CURSO o quedó en ERROR */
type LecturaParcial = { tramos?: Record<string, DocumentoLeido[]> };

/**
 * Lee un documento con la IA y guarda lo leído. Toma el documento solo si nadie lo está leyendo (o si
 * su lectura se cortó); devuelve false si otro ya lo tomó. Un error queda en el documento (ERROR).
 *
 * Un PDF largo se lee por tramos, varios a la vez, y cada tramo terminado se guarda enseguida: en Vercel
 * cada invocación se corta a los 5 minutos y, sin eso, un PDF de 100+ páginas volvía a empezar desde el
 * primer tramo en cada intento y nunca terminaba. Con `base`, lo que no alcanza sigue en otra invocación.
 */
export async function leerDocumento(documentoId: string, usuarioId: string, { reutilizar = true, base = null, inicio = Date.now(), bytes: enMemoria }: OpcionesLectura = {}): Promise<boolean> {
  const tomado = await db.documento.updateMany({
    where: { id: documentoId, OR: [{ estadoLectura: { in: ['PENDIENTE', 'ERROR'] } }, { estadoLectura: 'EN_CURSO', actualizadoEn: { lt: new Date(Date.now() - LECTURA_CORTADA_MS) } }] },
    data: { estadoLectura: 'EN_CURSO', errorLectura: null },
  });
  if (!tomado.count) return false;
  const doc = await db.documento.findUniqueOrThrow({ where: { id: documentoId } });
  // El mismo archivo (mismo SHA-256) ya leído en este u otro expediente: misma lectura, sin pagarla otra
  // vez (un certificado o una escritura de mayor extensión se carga en varios negocios). «Leer de nuevo» no reutiliza.
  const hechos: Record<string, DocumentoLeido[]> = { ...((doc.lectura as LecturaParcial | null)?.tramos ?? {}) };
  // Con tramos ya leídos es la continuación de una lectura (quizá de «Leer de nuevo»): no se copia otra
  if (reutilizar && !Object.keys(hechos).length) {
    const gemelo = await db.documento.findFirst({ where: { hashSha256: doc.hashSha256, id: { not: doc.id }, estadoLectura: 'LEIDO' }, orderBy: { actualizadoEn: 'desc' }, select: { lectura: true } });
    const documentos = (gemelo?.lectura as { documentos?: DocumentoLeido[] } | null)?.documentos;
    if (documentos?.length) {
      await db.documento.update({ where: { id: doc.id }, data: { estadoLectura: 'LEIDO', lectura: { documentos } as unknown as Prisma.InputJsonValue } });
      return true;
    }
  }
  const guardarAvance = () => db.documento.updateMany({ where: { id: doc.id, estadoLectura: 'EN_CURSO' }, data: { lectura: { tramos: hechos } as unknown as Prisma.InputJsonValue } });
  // Latido: mientras esta invocación lee, nadie más toma el documento; si se corta, en 2 minutos se retoma
  const latido = setInterval(() => {
    db.documento.updateMany({ where: { id: doc.id, estadoLectura: 'EN_CURSO' }, data: { actualizadoEn: new Date() } }).catch((e) => console.error('[leerDocumento] latido', e));
  }, LATIDO_MS);
  try {
    const bytes = enMemoria ?? await leerCifrado(doc.rutaCifrada);
    const pdf = doc.mime === 'application/pdf' ? await abrirPdf(bytes) : null;
    const totalPaginas = pdf?.getPageCount() ?? 1;
    // Cada tramo se extrae y se prepara cuando le toca (antes se preparaban todos antes de leer el primero)
    const desdes = pdf && totalPaginas > PAGINAS_POR_TRAMO ? Array.from({ length: Math.ceil(totalPaginas / PAGINAS_POR_TRAMO) }, (_, i) => i * PAGINAS_POR_TRAMO + 1) : [1];
    const porTramos = desdes.length > 1 || Object.keys(hechos).length > 0;
    const prepararTramo = async (desde: number): Promise<{ bloque: Anthropic.Beta.BetaContentBlockParam; liberar: () => Promise<void> }> => {
      if (desdes.length === 1) {
        const a = await bloquesDeArchivo(bytes, doc.mime, doc.nombreOriginal);
        return { bloque: a.tramos[0].bloque, liberar: a.liberar };
      }
      return prepararDocumento(await extraerPaginas(pdf!, desde, Math.min(totalPaginas, desde + PAGINAS_POR_TRAMO - 1)), doc.mime, doc.nombreOriginal);
    };
    /** Páginas del tramo, numeradas dentro del tramo, pasadas a páginas del archivo */
    const desplazar = (desde: number) => (x: DocumentoLeido): DocumentoLeido => (desde === 1 ? x : {
      ...x,
      paginas: x.paginas.replace(/\d+/g, (n) => String(Number(n) + desde - 1)),
      datos: x.datos.map((d) => ({ ...d, pagina: d.pagina ? d.pagina + desde - 1 : d.pagina })),
      textos_literales: x.textos_literales.map((d) => ({ ...d, pagina: d.pagina ? d.pagina + desde - 1 : d.pagina })),
    });
    const leerBloque = async (bloque: Anthropic.Beta.BetaContentBlockParam, desde: number, enTramos: boolean, esfuerzo?: 'low') =>
      (await llamarEstructurado<Lectura>({
        proposito: 'LECTURA',
        registro: { usuarioId, expedienteId: doc.expedienteId },
        sistema: SISTEMA_LECTURA,
        contenido: [bloque, { type: 'text', text: enTramos ? `Este tramo empieza en la página ${desde} del archivo: numera las páginas desde 1 dentro del tramo.` : 'Transcribe los datos de este archivo.' }],
        esquema: ESQUEMA_LECTURA as unknown as Record<string, unknown>,
        maxTokens: MAXIMO_SALIDA_LECTURA,
        esfuerzo,
      })).datos.documentos ?? [];
    /**
     * Lee las páginas desde-hasta (ya en `bloque`) y devuelve lo leído con páginas del archivo. Si la
     * respuesta no cabe en el límite de salida, el tramo se parte por la mitad y se lee cada mitad (así
     * hasta una sola página): nada se pierde. Una sola página (o una imagen o un Word) que aún no cabe se
     * repite razonando menos y, como último recurso, se conservan los documentos que salieron completos.
     */
    const leerRango = async (bloque: Anthropic.Beta.BetaContentBlockParam, desde: number, hasta: number, enTramos: boolean): Promise<DocumentoLeido[]> => {
      try {
        return (await leerBloque(bloque, desde, enTramos)).map(desplazar(desde));
      } catch (e) {
        if (!(e instanceof ErrorIA) || e.codigo !== 'TRUNCADO') throw e;
        if (pdf && hasta > desde) {
          console.warn(`[leerDocumento] lectura de las páginas ${desde}-${hasta} cortada por longitud: se divide`);
          const mitad = Math.floor((desde + hasta) / 2);
          const resultado: DocumentoLeido[] = [];
          for (const [a, b] of [[desde, mitad], [mitad + 1, hasta]]) {
            const parte = await prepararDocumento(await extraerPaginas(pdf, a, b), doc.mime, doc.nombreOriginal);
            try {
              resultado.push(...(await leerRango(parte.bloque, a, b, true)));
            } finally {
              await parte.liberar();
            }
          }
          return resultado;
        }
        console.warn(`[leerDocumento] lectura de la página ${desde} cortada por longitud: se repite razonando menos`);
        try {
          return (await leerBloque(bloque, desde, enTramos, 'low')).map(desplazar(desde));
        } catch (e2) {
          if (!(e2 instanceof ErrorIA) || e2.codigo !== 'TRUNCADO' || !e2.parcial) throw e2;
          const rescatados = rescatarArreglo<DocumentoLeido>(e2.parcial, 'documentos');
          if (!rescatados.length) throw e2;
          return rescatados.map(desplazar(desde));
        }
      }
    };
    const cola = desdes.filter((d) => !(String(d) in hechos));
    const leerTramo = async (desde: number) => {
      const hasta = pdf ? Math.min(totalPaginas, desde + PAGINAS_POR_TRAMO - 1) : desde;
      const t = await prepararTramo(desde);
      try {
        hechos[desde] = await leerRango(t.bloque, desde, hasta, porTramos);
      } finally {
        await t.liberar();
      }
      // Guarda el avance: si la invocación se corta, la siguiente sigue desde aquí
      await guardarAvance();
    };
    // Con `base`, pasado INICIAR_TRAMOS_HASTA_MS no se empiezan más tramos: siguen en otra invocación
    const aTiempo = () => !base || Date.now() - inicio < INICIAR_TRAMOS_HASTA_MS;
    await Promise.all(Array.from({ length: Math.min(TRAMOS_A_LA_VEZ, cola.length) }, async () => {
      while (cola.length && aTiempo()) await leerTramo(cola.shift()!);
    }));
    if (cola.length && base) {
      // Queda «por leer» con su avance: la invocación nueva (o la página, si no se pudo pedir) la retoma
      clearInterval(latido);
      await db.documento.updateMany({ where: { id: doc.id, estadoLectura: 'EN_CURSO' }, data: { estadoLectura: 'PENDIENTE', lectura: { tramos: hechos } as unknown as Prisma.InputJsonValue } });
      console.info(`[leerDocumento] ${Object.keys(hechos).length}/${desdes.length} tramos leídos: sigue en otra invocación`);
      if (!(await pedirLectura(base, doc.id, usuarioId))) console.error('[leerDocumento] no se pudo pedir la continuación: la retoma la página');
      return true;
    }
    const documentos = Object.keys(hechos).map(Number).sort((a, b) => a - b).flatMap((k) => hechos[k]);
    // Las cédulas catastrales, releídas una por una (deben quedar exactas)
    await releerCatastrales(bytes, doc.mime, doc.nombreOriginal, documentos, { usuarioId, expedienteId: doc.expedienteId }, pdf);
    await db.documento.update({ where: { id: doc.id }, data: { estadoLectura: 'LEIDO', lectura: { documentos } as unknown as Prisma.InputJsonValue } });
    return true;
  } catch (e) {
    const mensaje = e instanceof ErrorIA ? e.message : 'Error inesperado al leer el documento.';
    if (!(e instanceof ErrorIA)) console.error('[leerDocumento]', e);
    // Los tramos ya leídos se conservan: un nuevo intento de la generación sigue desde ahí («Leer de nuevo» empieza de cero)
    await db.documento.update({ where: { id: doc.id }, data: { estadoLectura: 'ERROR', errorLectura: mensaje, lectura: { tramos: hechos } as unknown as Prisma.InputJsonValue } });
    return true;
  } finally {
    clearInterval(latido);
  }
}

/** Vuelve a leer un documento (p. ej. si la lectura falló) */
export async function releerDocumento(s: SesionActiva, documentoId: string, base: string | null = null) {
  const doc = await db.documento.findUniqueOrThrow({ where: { id: documentoId }, select: { expedienteId: true, estadoLectura: true, actualizadoEn: true, rutaCifrada: true } });
  await expedienteEditable(s, doc.expedienteId);
  if (doc.rutaCifrada === ARCHIVO_RETIRADO) throw new ErrorNegocio('El archivo original se retiró para liberar espacio: no se puede volver a leer. Cárguelo de nuevo si lo necesita.');
  if (!process.env.ANTHROPIC_API_KEY) throw new ErrorNegocio('La IA no está configurada en el servidor.');
  if (doc.estadoLectura === 'EN_CURSO' && Date.now() - doc.actualizadoEn.getTime() < LECTURA_CORTADA_MS) throw new ErrorNegocio('El documento se está leyendo.');
  if (!(await consumirLimite(`ia:${s.usuario.id}`, 200, 3600)).permitido) throw new ErrorNegocio('Límite de lecturas por hora alcanzado.');
  await db.documento.update({ where: { id: documentoId }, data: { estadoLectura: 'PENDIENTE', lectura: Prisma.DbNull } });
  // Se relee de verdad (si la lectura falló o salió mal, la de una copia del mismo archivo tampoco sirve)
  return () => leerDocumento(documentoId, s.usuario.id, { reutilizar: false, base }).then(() => undefined);
}

export async function eliminarDocumento(s: SesionActiva, documentoId: string) {
  const doc = await db.documento.findUniqueOrThrow({ where: { id: documentoId } });
  await expedienteEditable(s, doc.expedienteId);
  await db.documento.delete({ where: { id: doc.id } });
  await borrarCifrado(doc.rutaCifrada).catch((err) => console.error('[eliminarDocumento]', err));
  await auditar({ ...datosAuditoria(s), accion: 'DOCUMENTO_RETIRADO', entidad: 'documento', entidadId: doc.id, detalle: { expedienteId: doc.expedienteId, sha256: doc.hashSha256 } });
}

/**
 * Descarga individual (siempre auditada); no existe exportación masiva. El archivo no cambia una vez
 * guardado: si el navegador ya tiene esta misma copia (etagCliente coincide con el hash), se responde
 * «sin cambios» sin volver a leerlo ni enviarlo, pero igual se verifica el permiso y se audita.
 */
export async function descargarDocumento(s: SesionActiva, documentoId: string, etagCliente?: string | null) {
  const doc = await db.documento.findUniqueOrThrow({ where: { id: documentoId } });
  await obtenerExpediente(s, doc.expedienteId); // verifica permiso
  if (doc.rutaCifrada === ARCHIVO_RETIRADO) throw new ErrorNegocio('El archivo original se retiró del almacenamiento para liberar espacio. Lo que la IA leyó de él se conserva en la escritura.');
  const etag = `"${doc.hashSha256}"`;
  const noModificado = etagCliente === etag;
  const bytes = noModificado ? null : await leerCifrado(doc.rutaCifrada);
  if (bytes && sha256(bytes) !== doc.hashSha256) throw new ErrorNegocio('El documento no pasó la verificación de integridad.');
  await auditar({ ...datosAuditoria(s), accion: 'DOCUMENTO_DESCARGADO', entidad: 'documento', entidadId: doc.id, detalle: { expedienteId: doc.expedienteId } });
  return { bytes, etag, mime: doc.mime, nombre: doc.nombreOriginal };
}
