/**
 * Biblioteca de plantillas: las escrituras modelo de la notaría, con su categoría y su fecha.
 * Todos los usuarios buscan y ven las plantillas; el revisor (y el administrador) las alimenta:
 * agrega nuevas, corrige sus datos y las retira. Solo el administrador las elimina.
 */
import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from '../db';
import { auditar } from '../auditoria';
import { datosAuditoria, type SesionActiva } from '../sesion-tipos';
import { guardarCifrado, leerCifrado, borrarCifrado } from '../almacenamiento';
import { sha256 } from '../seguridad/cifrado';
import { ErrorDocx } from '../escritura/docx';
import { prepararPlantilla, nombreCategoria, textoBusqueda, textoDeBusqueda } from '../escritura/biblioteca';
import { terminosBusqueda } from '../texto/normalizar';

export class ErrorPlantilla extends Error {}

export const POR_PAGINA = 25;
const MAXIMO_ARCHIVO = 4 * 1024 * 1024;

export const puedeAdministrar = (s: SesionActiva) => s.usuario.rol === 'REVISOR' || s.usuario.rol === 'ADMINISTRADOR';

function exigirAdministrar(s: SesionActiva) {
  if (!puedeAdministrar(s)) throw new ErrorPlantilla('Solo el revisor o el administrador pueden modificar la biblioteca.');
}

export interface FiltroPlantillas {
  q?: string;
  categoria?: string;
  subcategoria?: string;
  anio?: number;
  desde?: Date;
  hasta?: Date;
  /** Incluir las retiradas (solo revisor y administrador) */
  retiradas?: boolean;
  pagina?: number;
}

/** Filtro de la URL (?q=&categoria=&subcategoria=&anio=&desde=&hasta=&pagina=) */
export function filtroDesdeParametros(p: Record<string, string | string[] | undefined>): FiltroPlantillas {
  const uno = (k: string) => { const v = p[k]; return (Array.isArray(v) ? v[0] : v)?.trim() || undefined; };
  const fecha = (k: string, fin = false) => { const v = uno(k); if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined; const d = new Date(`${v}T${fin ? '23:59:59' : '00:00:00'}-05:00`); return Number.isNaN(d.getTime()) ? undefined : d; };
  const anio = Number(uno('anio'));
  return {
    q: uno('q')?.slice(0, 200), categoria: uno('categoria'), subcategoria: uno('subcategoria'),
    anio: Number.isInteger(anio) && anio > 1990 && anio < 2100 ? anio : undefined,
    desde: fecha('desde'), hasta: fecha('hasta', true),
    retiradas: uno('retiradas') === '1',
    pagina: Math.max(1, Math.trunc(Number(uno('pagina'))) || 1),
  };
}

export async function buscarPlantillas(s: SesionActiva, f: FiltroPlantillas) {
  const terminos = terminosBusqueda(f.q ?? '');
  const where: Prisma.PlantillaWhereInput = {
    ...(f.retiradas && puedeAdministrar(s) ? {} : { activa: true }),
    ...(f.categoria ? { categoria: f.categoria } : {}),
    ...(f.subcategoria ? { subcategoria: f.subcategoria } : {}),
    ...(f.anio ? { anio: f.anio } : {}),
    ...(f.desde || f.hasta ? { fecha: { ...(f.desde ? { gte: f.desde } : {}), ...(f.hasta ? { lte: f.hasta } : {}) } } : {}),
    ...(terminos.length ? { AND: terminos.map((t) => ({ busqueda: { contains: t } })) } : {}),
  };
  const pagina = f.pagina ?? 1;
  const [total, filas] = await Promise.all([
    db.plantilla.count({ where }),
    db.plantilla.findMany({
      where, orderBy: [{ fecha: 'desc' }, { nombre: 'asc' }], skip: (pagina - 1) * POR_PAGINA, take: POR_PAGINA,
      select: { id: true, nombre: true, categoria: true, subcategoria: true, anio: true, fecha: true, activa: true, origen: true, caracteres: true },
    }),
  ]);
  return { total, filas, pagina, paginas: Math.max(1, Math.ceil(total / POR_PAGINA)) };
}

/** Categorías (con sus subcategorías y cuántas plantillas tiene cada una) y años, para los filtros */
export async function opcionesFiltro() {
  const [grupos, anios] = await Promise.all([
    db.plantilla.groupBy({ by: ['categoria', 'subcategoria'], where: { activa: true }, _count: true }),
    db.plantilla.groupBy({ by: ['anio'], where: { activa: true }, _count: true, orderBy: { anio: 'desc' } }),
  ]);
  const categorias = new Map<string, { nombre: string; total: number; subcategorias: { nombre: string; total: number }[] }>();
  for (const g of grupos) {
    const c = categorias.get(g.categoria) ?? { nombre: g.categoria, total: 0, subcategorias: [] };
    c.total += g._count;
    if (g.subcategoria) c.subcategorias.push({ nombre: g.subcategoria, total: g._count });
    categorias.set(g.categoria, c);
  }
  return {
    categorias: [...categorias.values()].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((c) => ({ ...c, subcategorias: c.subcategorias.sort((a, b) => a.nombre.localeCompare(b.nombre)) })),
    anios: anios.map((a) => ({ anio: a.anio, total: a._count })),
  };
}

export const obtenerPlantilla = (id: string) => db.plantilla.findUnique({ where: { id }, include: { cargadaPor: { select: { nombreCompleto: true } } } });

/** El .docx de una plantilla de la biblioteca (verifica su integridad) */
export async function archivoPlantilla(id: string): Promise<Buffer> {
  const p = await db.plantilla.findUnique({ where: { id }, select: { rutaCifrada: true, hashSha256: true } });
  if (!p) throw new ErrorPlantilla('La plantilla no existe.');
  const bytes = await leerCifrado(p.rutaCifrada);
  if (sha256(bytes) !== p.hashSha256) throw new ErrorPlantilla('La plantilla no pasó la verificación de integridad.');
  return bytes;
}

export interface DatosPlantilla { nombre?: string; categoria: string; subcategoria?: string | null; fecha?: Date | null }

/** El revisor agrega una plantilla a la biblioteca */
export async function agregarPlantilla(s: SesionActiva, bytes: Buffer, nombreArchivo: string, datos: DatosPlantilla) {
  exigirAdministrar(s);
  if (!/\.docx$/i.test(nombreArchivo)) throw new ErrorPlantilla('Solo se aceptan documentos de Word .docx (los .doc antiguos se abren en Word y se guardan como .docx).');
  if (!bytes.length || bytes.length > MAXIMO_ARCHIVO) throw new ErrorPlantilla('El archivo está vacío o pesa más de 4 MB.');
  if (!nombreCategoria(datos.categoria)) throw new ErrorPlantilla('Indique la categoría de la plantilla.');
  let p;
  try {
    p = prepararPlantilla(bytes, { nombreArchivo, nombre: datos.nombre, categoria: datos.categoria, subcategoria: datos.subcategoria, fecha: datos.fecha ?? new Date() });
  } catch (e) {
    if (e instanceof ErrorDocx) throw new ErrorPlantilla(e.message);
    throw e;
  }
  if (p.caracteres < 200) throw new ErrorPlantilla('El documento casi no tiene texto: cargue la escritura modelo completa.');
  const existente = await db.plantilla.findUnique({ where: { hashSha256: p.hashSha256 }, select: { nombre: true, categoria: true } });
  if (existente) throw new ErrorPlantilla(`Ese archivo ya está en la biblioteca: «${existente.nombre}» (${existente.categoria}).`);
  const rutaCifrada = await guardarCifrado(bytes, 'plantillas');
  const creada = await db.plantilla.create({ data: { ...p, rutaCifrada, origen: 'REVISOR', cargadaPorId: s.usuario.id } });
  await auditar({ ...datosAuditoria(s), accion: 'PLANTILLA_AGREGADA', entidad: 'plantilla', entidadId: creada.id, detalle: { nombre: p.nombre, categoria: p.categoria, subcategoria: p.subcategoria, sha256: p.hashSha256 } });
  return creada;
}

export async function editarPlantilla(s: SesionActiva, id: string, datos: DatosPlantilla & { activa?: boolean }) {
  exigirAdministrar(s);
  const actual = await db.plantilla.findUnique({ where: { id } });
  if (!actual) throw new ErrorPlantilla('La plantilla no existe.');
  const nombre = datos.nombre?.trim().slice(0, 200) || actual.nombre;
  const categoria = nombreCategoria(datos.categoria) || actual.categoria;
  const subcategoria = datos.subcategoria === undefined ? actual.subcategoria : (datos.subcategoria ? nombreCategoria(datos.subcategoria) || null : null);
  const fecha = datos.fecha ?? actual.fecha;
  // La búsqueda conserva el comienzo de la escritura; cambian el nombre y las categorías
  await db.plantilla.update({
    where: { id },
    data: { nombre, categoria, subcategoria, fecha, anio: datos.fecha ? fecha.getFullYear() : actual.anio, ...(datos.activa !== undefined ? { activa: datos.activa } : {}), busqueda: textoBusqueda(nombre, categoria, subcategoria, textoDeBusqueda(actual.busqueda)) },
  });
  await auditar({ ...datosAuditoria(s), accion: datos.activa === false ? 'PLANTILLA_RETIRADA' : datos.activa === true && !actual.activa ? 'PLANTILLA_REACTIVADA' : 'PLANTILLA_EDITADA', entidad: 'plantilla', entidadId: id, detalle: { nombre, categoria, subcategoria } });
}

/** Solo el administrador: elimina la plantilla y su archivo. Las escrituras que la usaban conservan su nombre y deben elegir otra. */
export async function eliminarPlantilla(s: SesionActiva, id: string) {
  if (s.usuario.rol !== 'ADMINISTRADOR') throw new ErrorPlantilla('Solo el administrador puede eliminar plantillas de la biblioteca. Puede retirarla para que deje de aparecer.');
  const p = await db.plantilla.findUnique({ where: { id }, select: { nombre: true, rutaCifrada: true, hashSha256: true, _count: { select: { expedientes: true } } } });
  if (!p) throw new ErrorPlantilla('La plantilla no existe.');
  await db.plantilla.delete({ where: { id } });
  await borrarCifrado(p.rutaCifrada).catch((e) => console.error('[eliminarPlantilla]', e));
  await auditar({ ...datosAuditoria(s), accion: 'PLANTILLA_ELIMINADA', entidad: 'plantilla', entidadId: id, detalle: { nombre: p.nombre, sha256: p.hashSha256, escriturasQueLaUsaban: p._count.expedientes } });
}
