/**
 * Personas e inmuebles de ESTA escritura. En la compraventa (formulario propio) los actos guardan
 * los ids; en los actos por plantilla solo hay texto («nombre_vendedor», «matricula_inmobiliaria»):
 * se reconocen por el número de documento, el nombre o la matrícula que aparecen en esos valores.
 * Lo demás del expediente (el inmueble y las personas de una escritura de otro caso cargada por
 * error, los de un título que describe otros lotes) no se busca ni se pregunta.
 */
import type { DatosExpediente } from './tipos';
import { ESQUEMAS } from './esquemas';
import { claveMatricula } from './comparar';

const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const palabras = (v: unknown) => String(v ?? '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-ZÑ ]/g, ' ').split(/\s+/).filter((w) => w.length > 2);

export interface Mencionados { personas: Set<string>; inmuebles: Set<string>; hay: boolean }

/** Ids referenciados en los actos y los que los actos por plantilla mencionan en su texto */
export function mencionadosEnActos(datos: DatosExpediente, actos: string[] = Object.keys(datos.actos)): Mencionados {
  const personas = new Set<string>(), inmuebles = new Set<string>();
  const textos: string[] = [];
  for (const a of actos) {
    for (const v of Object.values(datos.actos[a] ?? {})) {
      for (const x of Array.isArray(v) ? v : [v]) {
        if (typeof x !== 'string' && typeof x !== 'number') continue;
        const t = String(x);
        if (datos.personas.some((p) => p.id === t)) personas.add(t);
        else if (datos.inmuebles.some((i) => i.id === t)) inmuebles.add(t);
        else if (ESQUEMAS[a]?.porPlantilla) textos.push(t);
      }
    }
  }
  if (textos.length) {
    const nums = new Set(textos.flatMap((t) => (t.match(/\d[\d.\s-]{3,}\d/g) ?? []).map(digitos)));
    const mats = new Set(textos.flatMap((t) => t.match(/\d{2,3}[A-Z]?\s*-\s*\d{2,}/gi) ?? []).map(claveMatricula));
    const texto = ` ${textos.flatMap(palabras).join(' ')} `;
    for (const p of datos.personas) {
      const doc = digitos(p.numero_documento);
      const nombre = palabras(p.nombre);
      if ((doc.length >= 5 && nums.has(doc)) || (nombre.length >= 2 && nombre.every((w) => texto.includes(` ${w} `)))) personas.add(p.id);
    }
    for (const i of datos.inmuebles) {
      if ((i.matricula && mats.has(claveMatricula(i.matricula))) || [i.cedula_catastral, i.cedula_catastral_paz_salvo].some((c) => digitos(c).length >= 10 && nums.has(digitos(c)))) inmuebles.add(i.id);
    }
  }
  // Quienes comparecen por ellas: apoderados y representantes
  for (const p of datos.personas.filter((x) => personas.has(x.id))) {
    for (const id of [p.apoderado_id, p.representante_id, p.representante_legal_id]) if (id) personas.add(id);
  }
  return { personas, inmuebles, hay: personas.size > 0 || inmuebles.size > 0 };
}

/** ¿Este dato es de la escritura? Si los actos no mencionan a nadie aún, todo cuenta */
export function esDeLaEscritura(m: Mencionados, base: 'persona' | 'inmueble', id: string): boolean {
  const conjunto = base === 'persona' ? m.personas : m.inmuebles;
  return !conjunto.size || conjunto.has(id);
}

/**
 * Quienes enajenan o gravan en esta escritura (vendedores, cedentes, propietarios, deudores): en un
 * folio con muchos titulares de cuota, la tradición que importa es la de ellos.
 */
export function quienesEnajenan(datos: DatosExpediente, actos: string[] = Object.keys(datos.actos)): string[] {
  const nombres = new Set<string>();
  for (const a of actos) {
    const d = (datos.actos[a] ?? {}) as Record<string, unknown>;
    for (const id of [d.vendedores, d.deudores].flat()) {
      const p = datos.personas.find((x) => x.id === id);
      if (p?.nombre) nombres.add(p.nombre);
    }
    for (const [k, v] of Object.entries(d)) {
      if (typeof v === 'string' && v.trim() && /^nombres?(_completo)?_(vendedor|vendedora|vendedores|cedente|tradente|propietari[oa]|otorgante|deudor|hipotecante|donante|causante)(__\d+)?$/.test(k)) nombres.add(v.trim().toUpperCase());
    }
  }
  return [...nombres];
}
