/**
 * Revisión sin IA de los inmuebles de la escritura (EXP-2026-00171: casa y dos parqueaderos):
 *   - CARÁTULA: cada inmueble es un bloque propio y en orden (MATRICULA → CEDULA CATASTRAL → CEDULA
 *     CATASTRAL PAZ Y SALVO → NOMBRE O DIRECCIÓN). Si la IA inserta los demás inmuebles después del
 *     primer renglón del bloque, los datos quedan revueltos.
 *   - DESCRIPCIÓN: cada matrícula de la carátula tiene también su bloque en la descripción, y al revés.
 *   - LINDEROS: si la plantilla los transcribe y lo leído los trae (la copia de la escritura), no puede
 *     quedar la remisión del certificado («cuyos linderos… obran en ESCRITURA 1484…»), que no es un lindero.
 * Devuelve los párrafos (números de la plantilla) que la corrección debe rehacer y el motivo.
 */
import { normalizar } from '../texto/normalizar';
import type { DocumentoLeido } from '../ia/instrucciones';

type Rotulo = 'MAT' | 'CAT' | 'PYS' | 'DIR';

function rotuloDe(linea: string): Rotulo | null {
  const t = normalizar(linea.replace(/\*\*/g, ''));
  if (/^MATRICULA INMOBILIARIA\b/.test(t)) return 'MAT';
  if (/^CEDULA CATASTRAL PAZ Y SALVO\b/.test(t)) return 'PYS';
  if (/^CEDULA CATASTRAL\b/.test(t)) return 'CAT';
  if (/^NOMBRE O DIRECCION\b/.test(t)) return 'DIR';
  return null;
}

const ORDEN: Record<Rotulo, number> = { MAT: 0, CAT: 1, PYS: 2, DIR: 3 };
const NOMBRE: Record<Rotulo, string> = { MAT: 'MATRICULA INMOBILIARIA', CAT: 'CEDULA CATASTRAL', PYS: 'CEDULA CATASTRAL PAZ Y SALVO', DIR: 'NOMBRE O DIRECCIÓN DEL INMUEBLE' };
const MATRICULA = /\b\d{3}\s*-\s*\d{3,8}\b/;
const matriculaDe = (linea: string) => linea.match(MATRICULA)?.[0].replace(/\s+/g, '') ?? null;

/** Primer párrafo de la plantilla después de la carátula (el encabezado del notario o la comparecencia) */
export function finCaratula(plantilla: Map<number, string>): number {
  for (const [n, t] of [...plantilla].sort((a, b) => a[0] - b[0])) if (/^En la ciudad de /i.test(t.trim()) || /Compareci/i.test(t)) return n;
  return Number.MAX_SAFE_INTEGER;
}

interface Renglon { n: number; rotulo: Rotulo; texto: string }

function renglones(textos: Map<number, string>, desde: number, hasta: number): Renglon[] {
  return [...textos].filter(([n]) => n >= desde && n < hasta).sort((a, b) => a[0] - b[0])
    .flatMap(([n, t]) => t.split('\n').map((l) => ({ n, rotulo: rotuloDe(l), texto: l.trim() })))
    .filter((r): r is Renglon => r.rotulo !== null);
}

/** Bloques que empiezan en cada «MATRICULA INMOBILIARIA»; null si hay rótulos antes de la primera */
function bloques(rs: Renglon[]): Renglon[][] | null {
  if (!rs.length) return [];
  if (rs[0].rotulo !== 'MAT') return null;
  const out: Renglon[][] = [];
  for (const r of rs) if (r.rotulo === 'MAT') out.push([r]); else out[out.length - 1].push(r);
  return out;
}

/** Un bloque en desorden: un rótulo repetido, fuera de orden o sin uno que la plantilla siempre trae */
function bloqueMalo(b: Renglon[], obligatorios: Rotulo[]): boolean {
  const vistos = new Set<Rotulo>();
  let previo = -1;
  for (const r of b) {
    if (vistos.has(r.rotulo) || ORDEN[r.rotulo] < previo) return true;
    vistos.add(r.rotulo);
    previo = ORDEN[r.rotulo];
  }
  return obligatorios.some((o) => !vistos.has(o));
}

export interface ProblemaInmuebles { parrafos: number[]; motivo: string; detalle: string }

/**
 * Bloques de los inmuebles en la carátula y en la descripción. `actuales`: el texto de cada párrafo de la
 * plantilla ya adaptado (con sus insertados, uno por renglón; '' si se eliminó).
 */
export function revisarBloquesDeInmuebles(plantilla: Map<number, string>, actuales: Map<number, string>): ProblemaInmuebles[] {
  const fin = finCaratula(plantilla);
  const problemas: ProblemaInmuebles[] = [];

  // ---- carátula
  const enPlantilla = renglones(plantilla, 0, fin);
  const enEscritura = renglones(actuales, 0, fin);
  const parrafosCaratula = [...new Set(enPlantilla.map((r) => r.n))];
  const ultimoCaratula = Math.max(0, ...parrafosCaratula);
  // Lo que la plantilla trae en cada bloque y siempre debe ir (la catastral del paz y salvo puede irse si coincide)
  const obligCaratula = (['MAT', 'CAT', 'DIR'] as Rotulo[]).filter((x) => enPlantilla.some((r) => r.rotulo === x));
  const bc = bloques(enEscritura);
  const matCaratula = enEscritura.filter((r) => r.rotulo === 'MAT').map((r) => matriculaDe(r.texto)).filter((m): m is string => !!m);
  if (parrafosCaratula.length && (bc === null || bc.some((b) => bloqueMalo(b, obligCaratula)))) {
    const orden = obligCaratula.concat(enPlantilla.some((r) => r.rotulo === 'PYS') ? ['PYS'] : []).sort((a, b) => ORDEN[a] - ORDEN[b]).map((x) => `«${NOMBRE[x]}:»`).join(', ');
    problemas.push({
      parrafos: parrafosCaratula,
      motivo: `CARÁTULA REVUELTA: los datos de los inmuebles quedaron mezclados (${enEscritura.map((r) => NOMBRE[r.rotulo].split(' ')[0] + (r.rotulo === 'MAT' ? ` ${matriculaDe(r.texto) ?? ''}` : '')).join(' → ')}). Cada inmueble lleva su bloque completo y seguido, en este orden: ${orden}. El primer inmueble ocupa los renglones de la plantilla (párrafos ${parrafosCaratula.join(', ')}) SIN insertados en medio; los demás inmuebles van, cada uno con su bloque completo, con "insertar_despues" del ÚLTIMO renglón del bloque (párrafo ${ultimoCaratula}). Devuelve el cambio completo de cada uno de estos párrafos (los que no llevan insertados, con "insertar_despues" vacío).`,
      detalle: 'En la carátula los datos de los inmuebles quedaron mezclados (cada matrícula debe ir seguida de su propia cédula catastral, la del paz y salvo y su dirección).',
    });
  }

  // ---- descripción (solo si la plantilla trae el bloque de matrícula después de describir el inmueble)
  const cuerpoPlantilla = renglones(plantilla, fin, Number.MAX_SAFE_INTEGER).filter((r) => r.rotulo !== 'DIR');
  if (!cuerpoPlantilla.length || !matCaratula.length) return problemas;
  const cuerpo = renglones(actuales, fin, Number.MAX_SAFE_INTEGER).filter((r) => r.rotulo !== 'DIR');
  const matCuerpo = cuerpo.filter((r) => r.rotulo === 'MAT').map((r) => matriculaDe(r.texto)).filter((m): m is string => !!m);
  const sinCuerpo = matCaratula.filter((m) => !matCuerpo.includes(m));
  const sinCaratula = matCuerpo.filter((m) => !matCaratula.includes(m));
  const bd = bloques(cuerpo);
  const malos = bd === null || bd.some((b) => bloqueMalo(b, ['MAT']));
  if (sinCuerpo.length || sinCaratula.length || malos) {
    // La descripción: desde el párrafo que sigue al de la comparecencia u objeto hasta el último bloque
    const primero = Math.min(...cuerpoPlantilla.map((r) => r.n));
    const ultimo = Math.max(...cuerpoPlantilla.map((r) => r.n));
    const orden = [...plantilla.keys()].sort((a, b) => a - b);
    let desde = primero;
    for (let i = orden.indexOf(primero) - 1, k = 0; i >= 0 && k < 10; i--, k++) {
      if (/Compareci|OBJETO\s*:/i.test(plantilla.get(orden[i]) ?? '')) break;
      desde = orden[i];
    }
    const parrafos = orden.filter((n) => n >= desde && n <= ultimo && (plantilla.get(n) ?? '').trim());
    const partes = [
      sinCuerpo.length ? `la descripción no trae el bloque de matrícula y cédula catastral de ${sinCuerpo.join(', ')} (sí está en la carátula)` : '',
      sinCaratula.length ? `la carátula no trae ${sinCaratula.join(', ')} (sí está en la descripción)` : '',
      malos ? 'los renglones de matrícula y cédula catastral de la descripción quedaron mezclados' : '',
    ].filter(Boolean);
    problemas.push({
      parrafos,
      motivo: `INMUEBLES INCOMPLETOS EN LA DESCRIPCIÓN: ${partes.join('; ')}. Cada inmueble lleva, en el mismo orden que en la carátula, su descripción (nombre, ubicación, áreas, dependencias), sus linderos con la estructura de la plantilla y, enseguida, su propio bloque de renglones «MATRICULA INMOBILIARIA:», «CEDULA CATASTRAL:» (y «CEDULA CATASTRAL PAZ Y SALVO:» si difiere). El primero ocupa los párrafos de la plantilla; cada uno de los demás va completo con "insertar_despues" del último renglón del bloque anterior.`,
      detalle: `En la descripción de los inmuebles ${partes.join('; ')}.`,
    });
  }
  return problemas;
}

// ------------------------------------------------------------------ linderos

const COSTADO = /\b(?:POR\s+EL\s+)?(NORTE|SUR|ORIENTE|OCCIDENTE|NORORIENTE|NOROCCIDENTE|SURORIENTE|SUROCCIDENTE|NORESTE|NOROESTE|SURESTE|SUROESTE)\b\s*[:,.\-–]/g;
const MEDIDA = /\d+(?:[.,]\d+)?\s*(?:m|mts?|metros|ml|mtrs)\b|\bmetros?\b/i;

/** ¿El texto transcribe linderos (al menos `minimo` costados distintos y alguna medida)? */
export function traeLinderos(texto: string, minimo = 1): boolean {
  const t = normalizar(texto);
  const costados = new Set([...t.matchAll(COSTADO)].map((m) => m[1]));
  return costados.size >= minimo && MEDIDA.test(texto);
}

/** La fórmula que remite los linderos a otra escritura («cuyos linderos… obran en ESCRITURA 1484…») */
export function esRemisionDeLinderos(texto: string): boolean {
  const t = normalizar(texto);
  return /(LINDEROS|ESPECIFICACIONES)[^.]{0,120}\b(OBRAN|CONTENID[OA]S?|CONSIGNAD[OA]S?|SE ENCUENTRAN|ESTAN|DESCRIT[OA]S|PROTOCOLIZAD[OA]S?|CONSTAN)\b[^.]{0,100}\bESCRITURA/.test(t)
    || /ARTICULO 11 (DEL )?DECRETO 1711/.test(t);
}

/**
 * Si la plantilla transcribe los linderos, los documentos leídos los traen y la escritura dejó la
 * remisión (o borró los costados), la corrección debe transcribirlos. Devuelve los párrafos y el motivo.
 */
export function revisarRemisionDeLinderos(plantilla: Map<number, string>, actuales: Map<number, string>, lecturas: DocumentoLeido[]): ProblemaInmuebles | null {
  const fin = finCaratula(plantilla);
  const costadosPlantilla = [...plantilla].filter(([n, t]) => n >= fin && traeLinderos(t) && !esRemisionDeLinderos(t)).map(([n]) => n);
  if (!costadosPlantilla.length) return null; // la plantilla remite: se deja su fórmula
  const remisiones = [...actuales].filter(([n, t]) => n >= fin && esRemisionDeLinderos(t) && !traeLinderos(t, 2) && !esRemisionDeLinderos(plantilla.get(n) ?? '')).map(([n]) => n);
  if (!remisiones.length) return null;
  const fuentes = lecturas.flatMap((d) => (d.textos_literales ?? [])
    .filter((x) => /linder/i.test(`${x.titulo} ${x.texto}`) && traeLinderos(x.texto, 2))
    .map((x) => `«${x.titulo}» (${d.tipo.slice(0, 90)}, p${x.pagina})`));
  if (!fuentes.length) return null;
  const borrados = costadosPlantilla.filter((n) => actuales.get(n) === '');
  const parrafos = [...new Set([...remisiones, ...borrados, ...costadosPlantilla])].sort((a, b) => a - b);
  return {
    parrafos,
    motivo: `LINDEROS SIN TRANSCRIBIR: quedó la remisión del certificado («…obran en la escritura…»), que NO es un lindero, y la plantilla sí los transcribe. Lo leído trae los linderos: ${fuentes.slice(0, 8).join('; ')}. Transcribe los de CADA inmueble (los que correspondan a su matrícula o nombre) con la estructura de la plantilla (un párrafo por costado, su redacción, medidas en letras y cifras, nadir y cenit si los trae), con sus áreas (privada, construida, libre) y su coeficiente; los costados que la plantilla trae se reutilizan para el primer inmueble y los demás van con "insertar_despues". Si hay propiedad horizontal y la escritura trae los linderos generales del lote o del conjunto, van después de los inmuebles con su redacción.`,
    detalle: `Los linderos quedaron como remisión a otra escritura (párrafos ${remisiones.join(', ')}) aunque la plantilla los transcribe y la copia de la escritura cargada los trae. Transcríbalos antes de imprimir.`,
  };
}
