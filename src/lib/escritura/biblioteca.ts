/**
 * Datos de una plantilla de la biblioteca a partir de su archivo (lo usan la carga inicial,
 * scripts/cargar-biblioteca.ts, y la carga del revisor). Sin base de datos ni almacenamiento.
 */
import crypto from 'node:crypto';
import { documentoXml, textoDocx } from './docx';
import { normalizar } from '../texto/normalizar';

/** Caracteres del comienzo de la escritura que entran en la búsqueda (carátula, comparecientes, acto, inmueble) */
const INICIO_BUSQUEDA = 4000;

/**
 * Nombres distintos de la misma carpeta en años distintos: se unifican para que el filtro por
 * categoría las reúna (p. ej. «CANCELACION AFECTACION VIVIENDA FAMILIAR» de 2026).
 */
const SINONIMOS: Record<string, string> = {
  'CANCELACION AFECTACION VIVIENDA FAMILIAR': 'CANCELACION AFECTACION A VIVIENDA FAMILIAR',
  'CANCELACION ANOTACION PACTO DE RETROVENTA': 'CANCELACION PACTO DE RETROVENTA',
  'CANCELACION PACTO RETROVENTA': 'CANCELACION PACTO DE RETROVENTA',
  'PACTO RETROVENTA': 'PACTO DE RETROVENTA',
  'TERMINACION ACUERDOS DE APOYO': 'TERMINACION ACUERDO DE APOYO',
  'DIRECTIVA ANTICIPADA': 'DIRECTIVAS ANTICIPADAS',
};

/** Categoría o subcategoría en su forma única: mayúsculas, sin tildes, sin espacios repetidos */
export function nombreCategoria(t: string): string {
  const n = normalizar(t).replace(/[^A-ZÑ0-9 &.,()-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return SINONIMOS[n] ?? n;
}

const SEPARADOR = ' § ';

/** Texto en que se busca: nombre, categoría, subcategoría y el comienzo de la escritura */
export const textoBusqueda = (nombre: string, categoria: string, subcategoria: string | null, texto: string) =>
  [nombre, categoria, subcategoria || '-', texto].map(normalizar).join(SEPARADOR);

/** El comienzo de la escritura guardado en el texto de búsqueda (para rehacerlo al cambiar el nombre) */
export const textoDeBusqueda = (busqueda: string) => busqueda.split(SEPARADOR).slice(3).join(SEPARADOR);

/** Nombre de la plantilla: el del archivo, sin la extensión */
export const nombreDesdeArchivo = (archivo: string) => archivo.replace(/\.docx$/i, '').replace(/\s+/g, ' ').trim().slice(0, 200);

export interface PlantillaPreparada {
  nombre: string;
  categoria: string;
  subcategoria: string | null;
  anio: number;
  fecha: Date;
  nombreArchivo: string;
  tamano: number;
  hashSha256: string;
  busqueda: string;
  caracteres: number;
}

/** Valida el .docx y arma sus datos; lanza ErrorDocx si no es un Word válido */
export function prepararPlantilla(bytes: Buffer, datos: { nombreArchivo: string; nombre?: string; categoria: string; subcategoria?: string | null; fecha: Date; anio?: number }): PlantillaPreparada {
  documentoXml(bytes);
  const texto = textoDocx(bytes);
  const nombre = (datos.nombre?.trim() || nombreDesdeArchivo(datos.nombreArchivo)).slice(0, 200);
  const categoria = nombreCategoria(datos.categoria);
  const subcategoria = datos.subcategoria ? nombreCategoria(datos.subcategoria) || null : null;
  return {
    nombre, categoria, subcategoria,
    anio: datos.anio ?? datos.fecha.getFullYear(),
    fecha: datos.fecha,
    nombreArchivo: datos.nombreArchivo.slice(0, 250),
    tamano: bytes.length,
    hashSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    busqueda: textoBusqueda(nombre, categoria, subcategoria, texto.slice(0, INICIO_BUSQUEDA)),
    caracteres: texto.length,
  };
}
