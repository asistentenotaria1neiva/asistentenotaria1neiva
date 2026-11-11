/**
 * La plantilla LLENADA por el sistema, para que la IA copie la redacción exacta.
 *
 * Las plantillas aprobadas conservan etiquetas {{…}} cuyo texto arma el sistema con fórmulas fijas de la
 * notaría (comparecencia, descripción del inmueble, tradición, forma de pago, aceptación, comprobantes…):
 * src/lib/escritura/actos.ts, personas.ts, inmuebles.ts y contexto.ts. La IA solo ve el nombre de la
 * etiqueta y la redactaba a su manera. Aquí se llena cada plantilla con el motor de plantillas
 * (docxtemplater + los filtros de concordancia) usando:
 *   - los datos del expediente, si el funcionario ya los diligenció (el texto queda casi listo), o
 *   - un caso FICTICIO de ejemplo (datos_prueba/casos.json), para que la IA vea cómo queda cada fórmula.
 * Lo que no tenga valor queda como «FALTA: etiqueta».
 */
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import expressionParser from 'docxtemplater/expressions.js';
import { filtrosConcordancia } from '../texto/concordancia';
import { prepararContexto, type ContextoEscritura, type ConfigNotaria } from './contexto';
import { MARCA_FALTANTE } from './marcas';
import { vistaPreviaDocx, textoDeParrafos } from './vista-previa';
import type { DatosExpediente } from './tipos';
import casos from '../../../datos_prueba/casos.json';

const parser = expressionParser.configure({ filters: filtrosConcordancia });
const ORDINALES = ['PRIMERO', 'SEGUNDO', 'TERCERO', 'CUARTO', 'QUINTO', 'SEXTO', 'SÉPTIMO', 'OCTAVO', 'NOVENO', 'DÉCIMO', 'DÉCIMO PRIMERO', 'DÉCIMO SEGUNDO', 'DÉCIMO TERCERO', 'DÉCIMO CUARTO', 'DÉCIMO QUINTO'];

/** Llena una plantilla .docx con un contexto y devuelve su texto (un párrafo por línea) */
export function llenarPlantilla(plantilla: Buffer, contexto: Record<string, unknown>): string {
  const zip = new PizZip(plantilla);
  let n = 0;
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
    parser,
    nullGetter(part) {
      if (part.module) return ''; // un bloque {{#x}} sin valor no se imprime
      return `${MARCA_FALTANTE} ${part.value ?? ''}»`;
    },
  });
  doc.render({ ...contexto, ord: () => ORDINALES[n++] ?? `CLÁUSULA ${n}` });
  return textoDeParrafos(vistaPreviaDocx(doc.getZip().generate({ type: 'nodebuffer' }) as Buffer));
}

/** El caso ficticio de ejemplo con esos actos (o el primero que los contenga) */
function casoDeEjemplo(actos: string[]): { actos: string[]; datos: DatosExpediente } | null {
  const lista = (casos as unknown as { casos: { actos: string[]; datos: DatosExpediente }[] }).casos;
  return lista.find((c) => c.actos.join() === actos.join()) ?? lista.find((c) => actos.every((a) => c.actos.includes(a))) ?? null;
}

const tieneEtiquetas = (texto: string) => /\{\{[\s\S]*?\}\}/.test(texto);

export interface PlantillaLlenada { tipoId: string; texto: string; origen: 'EXPEDIENTE' | 'EJEMPLO' }

/**
 * Cada plantilla con etiquetas, llenada con los datos del expediente (si se pueden preparar) o con el caso
 * de ejemplo. Las que no tienen etiquetas no se devuelven (su texto ya es el que se copia). Si una no se
 * puede llenar, se omite: la IA sigue teniendo el modelo y la guía de etiquetas.
 */
export function plantillasLlenadas(
  plantillas: { tipoId: string; archivo: Buffer; texto: string }[],
  actos: string[],
  notaria: ConfigNotaria,
  calculados: ContextoEscritura | null,
): PlantillaLlenada[] {
  const conEtiquetas = plantillas.filter((p) => tieneEtiquetas(p.texto));
  if (!conEtiquetas.length) return [];
  let ctx = calculados;
  let origen: PlantillaLlenada['origen'] = 'EXPEDIENTE';
  if (!ctx) {
    const caso = casoDeEjemplo(actos);
    if (!caso) return [];
    try { ctx = prepararContexto(caso.datos, caso.actos, notaria); } catch { return []; }
    origen = 'EJEMPLO';
  }
  const resultado: PlantillaLlenada[] = [];
  for (const p of conEtiquetas) {
    const acto = ctx.actos.find((a) => a.plantilla === p.tipoId || a.id === p.tipoId);
    const contexto = acto ? acto.contexto : ctx.global;
    try { resultado.push({ tipoId: p.tipoId, texto: llenarPlantilla(p.archivo, contexto), origen }); } catch { /* se omite */ }
  }
  return resultado;
}
