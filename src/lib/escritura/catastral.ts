/**
 * Cédulas catastrales (número predial): deben quedar EXACTAS. En un escaneo, la IA suele contar mal las
 * series largas de ceros («410010002000000490858000000000» leído como «410010020000004908580000000000»).
 *
 * El número predial nacional (NPN) tiene 30 dígitos: departamento (2), municipio (3), zona (2), sector (2),
 * comuna (2), barrio (2), manzana o vereda (4), terreno (4), condición (1), edificio (2), piso (2) y
 * unidad (4). El paz y salvo predial de Neiva lo trae sin departamento ni municipio (25 dígitos).
 */

export const soloDigitos = (s: string) => s.replace(/\D/g, '');

/** Un dato leído que es una cédula catastral vigente (no la anterior o antigua) */
export function esDatoCatastral(dato: string, valor: string): boolean {
  if (!/catastr|predial|ficha/i.test(dato) || /anterior|antigu/i.test(`${dato} ${valor}`)) return false;
  return soloDigitos(valor).length >= 15;
}

/** Grupos del NPN para leerlo y compararlo («41 001 00 02 00 00 0049 0858 0 00 00 0000») */
export const GRUPOS_NPN = [2, 3, 2, 2, 2, 2, 4, 4, 1, 2, 2, 4];

/** Lo que hay que revisar de la forma de una cédula catastral (null si se ve bien) */
export function problemaDeForma(valor: string): string | null {
  const d = soloDigitos(valor);
  // 30: NPN; 25: NPN sin departamento ni municipio (paz y salvo); 20 y 15: códigos anteriores al NPN
  if ([30, 25, 20, 15].includes(d.length)) return null;
  return `tiene ${d.length} dígitos (el número predial tiene 30, o 25 sin departamento y municipio)`;
}

/** La del certificado (NPN) y la del paz y salvo son la misma, con o sin el departamento y el municipio */
export function mismaCatastral(a: string, b: string): boolean {
  const x = soloDigitos(a), y = soloDigitos(b);
  if (x === y) return true;
  return (x.length === 30 && x.slice(5) === y) || (y.length === 30 && y.slice(5) === x);
}

/** Difieren solo en la cantidad de ceros: casi siempre es un error de lectura, no dos predios distintos */
export function difierenEnCeros(a: string, b: string): boolean {
  const sinCeros = (s: string) => soloDigitos(s).replace(/0+/g, '0');
  const x = soloDigitos(a), y = soloDigitos(b);
  const ajustar = (s: string, otro: string) => (s.length === 30 && otro.length !== 30 ? s.slice(5) : s);
  return !mismaCatastral(a, b) && sinCeros(ajustar(x, y)) === sinCeros(ajustar(y, x));
}

interface Leido { tipo: string; datos: { dato: string; valor: string; pagina: number }[] }

/**
 * Revisión de las cédulas catastrales de la escritura terminada contra lo leído en los documentos:
 *   - cada cédula catastral escrita debe estar, dígito por dígito, en algún documento;
 *   - la del certificado y la del paz y salvo que difieren solo en ceros son un error de lectura;
 *   - una cédula leída con una cantidad de dígitos que no corresponde.
 * Devuelve los avisos (críticos) para el digitador.
 */
export function revisarCatastrales(escritura: string, documentos: Leido[]): string[] {
  const leidas = documentos.flatMap((d) => d.datos.filter((x) => esDatoCatastral(x.dato, x.valor)).map((x) => ({ ...x, tipo: d.tipo })));
  const avisos: string[] = [];
  const todas = new Set(documentos.flatMap((d) => d.datos.map((x) => soloDigitos(x.valor))));
  const enDocumentos = (d: string) => [...todas].some((t) => t.includes(d));
  for (const c of new Set(catastralesEn(escritura))) {
    if (!enDocumentos(soloDigitos(c))) avisos.push(`La cédula catastral «${c}» de la escritura no coincide con ninguna de los documentos: verifíquela dígito por dígito contra el certificado de tradición y el paz y salvo.`);
  }
  const certificado = leidas.filter((x) => /certificado de tradici/i.test(x.tipo));
  const pazYSalvo = leidas.filter((x) => /paz y salvo/i.test(x.tipo));
  for (const a of certificado) for (const b of pazYSalvo) {
    if (difierenEnCeros(a.valor, b.valor)) avisos.push(`La cédula catastral del certificado (${a.valor}) y la del paz y salvo (${b.valor}) son iguales salvo en la cantidad de ceros: casi seguro una se leyó mal. Confírmelas dígito por dígito contra los documentos.`);
  }
  for (const x of leidas) {
    const p = problemaDeForma(x.valor);
    if (p) avisos.push(`La cédula catastral «${x.valor}» (${x.tipo}, p${x.pagina}) ${p}: verifíquela dígito por dígito contra el documento.`);
  }
  return [...new Set(avisos)];
}

/** Cédulas catastrales (15 a 30 dígitos, con o sin guiones) escritas en un texto */
export function catastralesEn(texto: string): string[] {
  const salida: string[] = [];
  for (const m of texto.matchAll(/c[eé]dula\s+catastral[^:\d]{0,60}:?\s*([\d][\d\s.-]{13,45}\d)/gi)) {
    const d = soloDigitos(m[1]);
    if (d.length >= 15 && d.length <= 30) salida.push(m[1].trim());
  }
  return salida;
}
