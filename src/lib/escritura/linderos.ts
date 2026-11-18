/**
 * Revisión sin IA de los linderos de la escritura. Un lindero mal leído no se nota al leer la escritura
 * (la frase queda bien escrita), así que cada medida dudosa debe quedar resaltada en amarillo:
 *   - si la lectura advirtió que los linderos o sus medidas están borrosos, de baja resolución o poco
 *     legibles, cada costado lleva [VERIFICAR] aunque la redacción no lo haya marcado;
 *   - si el lote tiene los cuatro costados (norte, sur, oriente, occidente) con una medida cada uno y
 *     el área que dan esas medidas no se parece al área de la escritura, una cifra está mal leída.
 */
import type { Advertencia } from '../ia/instrucciones';
import type { CambioParrafo } from './docx';

const COSTADO = /\b(?:POR\s+EL\s+)?(NORTE|SUR|ORIENTE|OCCIDENTE|NORORIENTE|NOROCCIDENTE|SURORIENTE|SUROCCIDENTE|NORESTE|NOROESTE|SURESTE|SUROESTE)\s*:/gi;
const MEDIDA = /(\d{1,5}(?:[.,]\d{1,3})?)\s*(?:m|mts|mt|metros|ml)\b/i;
const AREA = /\(?\s*(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)\s*(?:M2|m2|mts2|mt2|m²|metros cuadrados)\s*\)?/i;
/** Alerta de la lectura sobre linderos o medidas que no se leen bien */
const SOBRE_LINDEROS = /linder|medida|longitud|cabida|costado/i;
const POCO_LEGIBLE = /baja resoluci|ilegib|borros|poco (?:legible|clar|visible|nítid)|no se (?:lee|ve|distingue)|dif[ií]cil de leer|verificar (?:las|cada|la) medidas?|medidas? (?:dudos|inciert)|\[VERIFICAR/i;

export const MARCA_LINDERO = '[VERIFICAR: medida poco legible en el documento; confírmela contra el original]';
const MARCA_AREA = '[VERIFICAR: las medidas de los linderos no cuadran con el área; una cifra puede estar mal leída]';

const numero = (s: string) => Number(/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(',', '.'));

/** Las alertas de la lectura que dicen que los linderos o sus medidas no se leen bien */
export function alertasDeLinderosDudosos(alertas: string[]): string[] {
  return alertas.filter((a) => SOBRE_LINDEROS.test(a) && POCO_LEGIBLE.test(a));
}

/** Medida de cada costado nombrado en un texto («NORTE: … 52.09 m …») */
function costadosDe(texto: string): { costado: string; medida: number | null }[] {
  const marcas = [...texto.matchAll(COSTADO)];
  return marcas.map((m, i) => {
    const tramo = texto.slice(m.index! + m[0].length, marcas[i + 1]?.index ?? texto.length);
    const med = tramo.match(MEDIDA);
    return { costado: m[1].toUpperCase(), medida: med ? numero(med[1]) : null };
  });
}

/** Textos nuevos de un cambio, con la forma de escribir en cada uno */
function textos(c: CambioParrafo): { texto: string; poner: (t: string) => void }[] {
  return [
    ...(c.texto ? [{ texto: c.texto, poner: (t: string) => { c.texto = t; } }] : []),
    ...c.reemplazos.map((r) => ({ texto: r.nuevo, poner: (t: string) => { r.nuevo = t; } })),
    ...c.insertar_despues.map((x, i) => ({ texto: x, poner: (t: string) => { c.insertar_despues[i] = t; } })),
  ];
}

/**
 * Marca con [VERIFICAR] los costados de los linderos cuando la lectura los dio por poco legibles o
 * cuando sus medidas no cuadran con el área. Devuelve los cambios marcados y las advertencias.
 */
export function revisarLinderos(cambios: CambioParrafo[], alertasLectura: string[]): { cambios: CambioParrafo[]; advertencias: Advertencia[] } {
  const copia: CambioParrafo[] = cambios.map((c) => ({ ...c, reemplazos: c.reemplazos.map((r) => ({ ...r })), insertar_despues: [...c.insertar_despues] }));
  const conCostados = copia.flatMap((c) => textos(c).map((t) => ({ c, ...t, costados: costadosDe(t.texto) }))).filter((t) => t.costados.some((x) => x.medida !== null));
  if (!conCostados.length) return { cambios, advertencias: [] };
  const advertencias: Advertencia[] = [];

  // ¿Cuadran con el área? Solo un lote de cuatro costados, una medida cada uno (sin tramos ni mojones)
  const todos = conCostados.flatMap((t) => t.costados);
  const de = (k: string) => todos.filter((x) => x.costado === k);
  let noCuadra = false;
  // El área, del párrafo que presenta los linderos (o del primero que la diga)
  const area = [...conCostados, ...copia.flatMap((c) => textos(c))].map((t) => t.texto.match(AREA)).find(Boolean);
  if (area && ['NORTE', 'SUR', 'ORIENTE', 'OCCIDENTE'].every((k) => de(k).length === 1 && de(k)[0].medida) && todos.length === 4) {
    const [n, s, o, w] = ['NORTE', 'SUR', 'ORIENTE', 'OCCIDENTE'].map((k) => de(k)[0].medida!);
    const estimada = ((n + s) / 2) * ((o + w) / 2);
    const declarada = numero(area[1]);
    if (declarada > 0 && (estimada / declarada > 1.6 || estimada / declarada < 0.6)) {
      noCuadra = true;
      advertencias.push({ nivel: 'CRITICA', origen: 'SISTEMA', p: conCostados[0].c.p, detalle: `Los linderos (norte ${n}, sur ${s}, oriente ${o}, occidente ${w}) dan un lote de unos ${Math.round(estimada)} m² y la escritura dice ${declarada} m²: probablemente una cifra está mal leída. Compare cada medida con el documento original; quedaron resaltadas en amarillo.` });
    }
  }

  const dudosas = alertasDeLinderosDudosos(alertasLectura);
  if (dudosas.length) advertencias.push({ nivel: 'CRITICA', origen: 'SISTEMA', p: conCostados[0].c.p, detalle: `La lectura advirtió que los linderos no se leen con claridad («${dudosas[0].slice(0, 160)}»): cada medida quedó resaltada en amarillo. Confírmelas contra el documento original antes de imprimir.` });
  if (!dudosas.length && !noCuadra) return { cambios, advertencias: [] };

  const marca = noCuadra && !dudosas.length ? MARCA_AREA : MARCA_LINDERO;
  for (const t of conCostados) if (!/\[VERIFICAR/i.test(t.texto)) t.poner(`${t.texto.replace(/\s+$/, '')} ${marca}`);
  return { cambios: copia, advertencias };
}
