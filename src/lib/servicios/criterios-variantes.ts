/**
 * Criterios de uso («cuándo usarla») de las variantes de un tipo de escritura, generados por la IA.
 * Al cargar varias plantillas de un mismo tipo como variantes, la IA lee el comienzo de cada modelo
 * (carátula, comparecientes, entidad, actos) y, comparándolas entre sí, escribe para cada una:
 *   - un nombre corto que la distinga (solo si no se le escribió uno: el nombre es el del archivo);
 *   - sus criterios de uso: qué banco o entidad, qué obra o vendedor, qué actos y subsidios la hacen
 *     la indicada, y en qué se diferencia de las demás.
 * Solo se completan las variantes indicadas (`ids`) que no tienen criterios escritos: lo que escribió
 * la notaría nunca se reemplaza. Las demás variantes del tipo se envían como contexto, para que los
 * criterios nuevos no se confundan con los existentes. Los criterios se pueden editar después en la
 * página de cada variante; los usa la elección de plantilla (eleccion-plantilla.ts).
 */
import 'server-only';
import { db } from '../db';
import { auditar } from '../auditoria';
import { datosAuditoria, type SesionActiva } from '../sesion-tipos';
import { llamarEstructurado, ErrorIA } from '../ia/cliente';
import { textoDePlantilla } from './revision-plantillas';
import { nombreVariante, ErrorPlantilla } from './plantillas';

const POR_MODELO = 5000; // caracteres del comienzo de cada modelo
const MAXIMO_VARIANTES = 20;

const SISTEMA_CRITERIOS = `Eres un asistente de la Notaría Primera del Círculo de Neiva (Colombia). Para un tipo de escritura pública la notaría tiene varias plantillas (variantes), porque la estructura y las cláusulas cambian según la entidad que presta (banco, Fondo Nacional del Ahorro, cooperativa, caja de vivienda), la obra o constructora que vende (fideicomiso, proyecto, etapa), los subsidios (caja de compensación, Mi Casa Ya, Caja Honor), el tipo de vendedor o de inmueble y los actos que van juntos (cancelación de patrimonio de familia o afectación, declaración de construcción, constitución de patrimonio, liberación de hipoteca…).

Recibes el comienzo del texto de cada variante (código V1, V2…). Antes de redactar cada escritura, otra IA leerá los documentos del caso y elegirá la variante usando SOLO el nombre y los criterios que escribas. Para cada variante marcada como "completar":
- "nombre": corto (máx. 60 caracteres) y distintivo, con lo que más la identifica, p. ej. «Davivienda · Villa Santa (RDG)» o «Bancolombia · vendedor persona natural». Sin nombres de personas naturales ni números de escritura.
- "criterios": una o tres frases que digan cuándo usarla: la entidad acreedora, la obra, constructora o fideicomiso vendedor (o el tipo de vendedor), los actos acompañantes, el subsidio y el tipo de inmueble, según lo que se vea en el texto. Di también en qué se diferencia de las otras variantes cuando se parezcan (p. ej. «igual que V2 pero con cancelación de patrimonio de familia»; nómbralas por su nombre, no por el código). No inventes: si algo no se ve en el texto, no lo afirmes.
Los nombres de personas naturales, cédulas, matrículas y valores son de otros casos: no los uses como criterio.
Las variantes marcadas como "contexto" ya tienen nombre y criterios: no las devuelvas, solo tenlas en cuenta para que las nuevas se distingan de ellas.`;

export interface CriteriosGenerados { id: string; variante: string; criterios: string; renombrada: boolean }

const clave = (x: string) => x.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Genera nombre y criterios para las variantes `ids` del tipo (las que no tienen criterios). Devuelve
 * lo que se guardó. Si la IA falla, lanza ErrorPlantilla (las plantillas quedan cargadas igual).
 */
export async function generarCriteriosVariantes(s: SesionActiva, tipoId: string, ids: string[]): Promise<CriteriosGenerados[]> {
  const tipo = await db.tipoEscritura.findUnique({ where: { id: tipoId }, select: { id: true, nombre: true, variantes: true } });
  if (!tipo) throw new ErrorPlantilla('Tipo de escritura no válido.');
  if (!tipo.variantes) throw new ErrorPlantilla('Este tipo de escritura no tiene variantes.');
  const todas = await db.plantilla.findMany({
    where: { tipoId, estado: { in: ['APROBADA', 'PENDIENTE_APROBACION'] } }, orderBy: { version: 'desc' },
    select: { id: true, version: true, variante: true, nombreArchivo: true, criterios: true, archivo: true },
  });
  // Una por variante: la más reciente (las pedidas tienen prioridad)
  const porVariante = new Map<string, (typeof todas)[number]>();
  for (const p of [...todas.filter((x) => ids.includes(x.id)), ...todas]) if (!porVariante.has(clave(nombreVariante(p)))) porVariante.set(clave(nombreVariante(p)), p);
  const lista = [...porVariante.values()].slice(0, MAXIMO_VARIANTES);
  const completar = lista.filter((p) => ids.includes(p.id) && !p.criterios?.trim());
  // Con una sola variante también se escribe (no hay con qué compararla, pero sí se ve cuándo usarla)
  if (!completar.length) return [];

  const codigo = (i: number) => `V${i + 1}`;
  const bloques = lista.map((p, i) => {
    const pedida = completar.includes(p);
    return [
      `<variante codigo="${codigo(i)}" ${pedida ? 'completar="si"' : 'contexto="si"'} nombre="${nombreVariante(p).replace(/"/g, "'")}">`,
      pedida ? `Archivo: ${p.nombreArchivo}` : `Cuándo usarla: ${p.criterios ?? '(sin criterios)'}`,
      `Comienzo del modelo:\n${textoDePlantilla(p.archivo).slice(0, POR_MODELO)}`,
      '</variante>',
    ].join('\n');
  }).join('\n\n');
  const codigos = lista.map((p, i) => (completar.includes(p) ? codigo(i) : null)).filter((c): c is string => !!c);

  let respuesta: { variantes: { codigo: string; nombre: string; criterios: string }[] };
  try {
    const r = await llamarEstructurado<typeof respuesta>({
      proposito: 'PLANTILLA',
      esfuerzo: 'low',
      registro: { usuarioId: s.usuario.id, plantillaId: completar[0].id },
      sistema: SISTEMA_CRITERIOS,
      contenido: [{ type: 'text', text: `TIPO DE ESCRITURA: ${tipo.nombre}\n\n<variantes>\n${bloques}\n</variantes>\n\nEscribe el nombre y los criterios de las variantes ${codigos.join(', ')}.` }],
      esquema: {
        type: 'object', additionalProperties: false, required: ['variantes'],
        properties: {
          variantes: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false, required: ['codigo', 'nombre', 'criterios'],
              properties: { codigo: { type: 'string', enum: codigos }, nombre: { type: 'string' }, criterios: { type: 'string' } },
            },
          },
        },
      },
      maxTokens: 8000,
    });
    respuesta = r.datos;
  } catch (e) {
    if (e instanceof ErrorIA) throw new ErrorPlantilla(`La IA no pudo escribir cuándo usar cada variante (${e.message}). Escríbalo en la página de cada variante.`);
    throw e;
  }

  // Nombres ya usados por otras variantes (para no repetir uno al renombrar)
  const usados = new Set(lista.filter((p) => !completar.includes(p)).map((p) => clave(nombreVariante(p))));
  const guardados: CriteriosGenerados[] = [];
  for (const g of respuesta.variantes ?? []) {
    const p = lista[codigos.includes(g.codigo) ? Number(g.codigo.slice(1)) - 1 : -1];
    if (!p || !completar.includes(p) || guardados.some((x) => x.id === p.id)) continue;
    const criterios = g.criterios?.trim().slice(0, 2000);
    if (!criterios) continue;
    // Solo se renombra si la variante tiene el nombre del archivo (nadie le escribió uno)
    const actual = nombreVariante(p);
    const sugerido = g.nombre?.trim().replace(/\s+/g, ' ').slice(0, 120);
    const renombrar = !!sugerido && clave(actual) === clave(p.nombreArchivo.replace(/\.docx$/i, '')) && !usados.has(clave(sugerido));
    const variante = renombrar ? sugerido! : actual;
    usados.add(clave(variante));
    // Todas las versiones de la variante comparten el nombre; los criterios van en la versión cargada
    await db.$transaction([
      ...(renombrar ? [db.plantilla.updateMany({ where: { tipoId, OR: [{ variante: actual }, { variante: null, nombreArchivo: p.nombreArchivo }] }, data: { variante } })] : []),
      db.plantilla.update({ where: { id: p.id }, data: { variante, criterios } }),
    ]);
    await auditar({ ...datosAuditoria(s), accion: 'PLANTILLA_VARIANTE_EDITADA', entidad: 'plantilla', entidadId: p.id, detalle: { tipoId, version: p.version, variante, criterios, generadaPorIA: true } });
    guardados.push({ id: p.id, variante, criterios, renombrada: renombrar });
  }
  return guardados;
}
