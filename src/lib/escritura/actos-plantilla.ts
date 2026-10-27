/**
 * Actos por plantilla: cada tipo de escritura sin formulario propio (hoy, todos menos la
 * compraventa) se vuelve un acto en cuanto tiene una plantilla APROBADA. Su formulario se arma
 * con las variables de la plantilla:
 *   - un campo por variable ({{nombre_propietario}}), en el orden en que aparece, con el fragmento
 *     del texto donde va como ayuda (así la IA y el digitador saben qué dato y en qué forma);
 *   - una pregunta de sí o no por cada condición ({{#hay_hipoteca}} … {{/hay_hipoteca}});
 *   - los datos de la notaría y de la terminación (notario, resolución de tarifas, número, fecha,
 *     hojas, derechos…) no se preguntan: los pone el sistema o quedan en blanco para la terminación.
 * La escritura se genera solo con esa plantilla, que es la escritura completa (con su encabezado,
 * comparecencia y cierre); si se combina con un acto de formulario propio, va después de este.
 */
import { vistaPreviaDocx, etiquetasDe, type Parrafo } from './vista-previa';
import type { Campo, EsquemaActo } from './esquemas';
import type { DefinicionActo, ActoPreparado } from './actos';
import type { DatosActo, DatosEscritura } from './tipos';
import type { ConfigNotaria } from './contexto';
import { ErrorDatos } from './personas';
import { numeroEscrituraEnLetras, fechaEnLetras, fechaCorta, enteroALetras } from '../texto/numeros-a-letras';

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

/**
 * Variables que llena el sistema (datos de la notaría) o que quedan para la terminación de la
 * escritura (número, fecha, hojas, derechos…): no se preguntan.
 */
export function valoresAutomaticos(e: Partial<DatosEscritura>, notaria: ConfigNotaria): Record<string, string> {
  const encargado = e.autoriza === 'ENCARGADO';
  const notario = encargado ? (e.encargado_nombre ?? '').toUpperCase() : notaria.titular;
  const f = typeof e.fecha_otorgamiento === 'string' && /^\d{4}-\d{2}-\d{2}/.test(e.fecha_otorgamiento) ? e.fecha_otorgamiento.slice(0, 10) : '';
  const [a, m, d] = f ? f.split('-').map(Number) : [0, 0, 0];
  const n = typeof e.numero === 'number' ? e.numero : Number(e.numero) || 0;
  return {
    nombre_notario: notario, notario, notario_titular: notaria.titular, codigo_notaria: notaria.codigo, resolucion_tarifas: notaria.resolucion_tarifas,
    numero_escritura: n ? String(n) : '', numero_escritura_letras: n ? numeroEscrituraEnLetras(n) : '',
    fecha_otorgamiento: f ? fechaCorta(f) : '', fecha_otorgamiento_letras: f ? fechaEnLetras(f) : '', fecha_escritura: f ? fechaCorta(f) : '',
    dia_otorgamiento: f ? String(d).padStart(2, '0') : '', dia_otorgamiento_letras: f ? (d === 1 ? 'PRIMERO' : enteroALetras(d)) : '',
    mes_otorgamiento: f ? MESES[m - 1] : '', anio_otorgamiento: f ? String(a) : '', anio_otorgamiento_letras: f ? enteroALetras(a) : '',
    hojas_papel_notarial: String(e.hojas ?? ''), hojas: String(e.hojas ?? ''),
    derechos_notariales: String(e.derechos ?? ''), derechos: String(e.derechos ?? ''),
    retencion_fuente: String(e.retefuente ?? ''), retefuente: String(e.retefuente ?? ''),
    codigo_minuta: e.codigo_minuta ?? '',
  };
}
const AUTOMATICAS = new Set(Object.keys(valoresAutomaticos({}, { codigo: '', titular: '', resolucion_tarifas: '' })));

/** Raíces del contexto general de la escritura: las variables que empiezan así no se preguntan */
const RAICES_SISTEMA = new Set(['notaria', 'escritura', 'intervinientes', 'especificacion', 'inmuebles_caratula', 'comprobantes', 'firmantes', 'oficios', 'a', 'ord()', 'titulo_acto', 'otorgantes_titulo']);

const base = (etiqueta: string) => etiqueta.split('|')[0].trim();

const etiquetaDe = (variable: string) => {
  const t = variable.replace(/[._]+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Fragmento del texto donde aparece la variable, para orientar a quien la llena */
function fragmento(texto: string, marca: string): string | undefined {
  const i = texto.indexOf(marca);
  if (i < 0) return undefined;
  const a = Math.max(0, texto.lastIndexOf(' ', Math.max(0, i - 70)));
  const b = texto.indexOf(' ', Math.min(texto.length, i + marca.length + 70));
  return `${a > 0 ? '…' : ''}${texto.slice(a, b < 0 ? undefined : b).trim()}${b > 0 ? '…' : ''}`;
}

const LARGOS = /lindero|descripcion|forma_pago|clausula|comparecencia|observacion|alinderacion|historia|tradicion_completa/;

/** Campos del formulario de un acto por plantilla, en el orden en que aparecen en ella */
export function camposDePlantilla(parrafos: Parrafo[]): Campo[] {
  const lineas = parrafos.map((p) => p.segmentos.map((s) => s.texto).join(''));
  const texto = lineas.join('\n');
  const campos: Campo[] = [];
  const vistos = new Set<string>();
  // Primera aparición de cada etiqueta, en orden
  for (const m of texto.matchAll(/\{\{\s*([#^]?)\s*([^{}]+?)\s*\}\}/g)) {
    const [marca, signo, cuerpo] = m;
    if (cuerpo.startsWith('/')) continue;
    const id = base(cuerpo);
    if (vistos.has(id) || !/^[a-z0-9_]+(\.[a-z0-9_]+)?$/i.test(id)) continue;
    vistos.add(id);
    if (AUTOMATICAS.has(id) || RAICES_SISTEMA.has(id.split('.')[0])) continue;
    const ayuda = fragmento(texto, marca);
    campos.push(signo
      ? { id, etiqueta: `¿${etiquetaDe(id)}?`, tipo: 'booleano', ayuda: ayuda && `Si es «Sí», se imprime el texto que empieza en: ${ayuda}` }
      : { id, etiqueta: etiquetaDe(id), tipo: LARGOS.test(id) ? 'textoLargo' : 'texto', obligatorio: true, ayuda: ayuda && `Va en la escritura así: ${ayuda}` });
  }
  return campos;
}

export interface TipoParaActo { id: string; nombre: string; categoria: string }

/** Formulario y definición del acto a partir de su plantilla aprobada */
export function actoDesdePlantilla(tipo: TipoParaActo, archivo: Buffer, plantilla: { id: string; version: number }): { esquema: EsquemaActo; acto: DefinicionActo } {
  const parrafos = vistaPreviaDocx(archivo);
  const campos = camposDePlantilla(parrafos);
  const sobreInmuebles = /inmueble/i.test(tipo.categoria);
  const esquema: EsquemaActo = {
    tipo: tipo.id, version: plantilla.version, titulo: tipo.nombre, plantillaFuente: `Plantilla aprobada v${plantilla.version}`,
    porPlantilla: { plantillaId: plantilla.id, version: plantilla.version },
    pasos: [{ id: tipo.id, titulo: tipo.nombre, descripcion: 'Formulario armado con las variables de la plantilla aprobada.', campos }],
    documentosSoporte: [
      { tipo: 'CEDULA', etiqueta: 'Cédulas de los comparecientes', obligatorio: true },
      { tipo: 'CERTIFICADO_TRADICION', etiqueta: 'Certificado de tradición y libertad', obligatorio: sobreInmuebles },
      { tipo: 'ESCRITURA_ANTERIOR', etiqueta: 'Escritura anterior relacionada', obligatorio: false },
      { tipo: 'PODER', etiqueta: 'Poder (si hay apoderado)', obligatorio: false },
    ],
    reglas: [],
  };
  const acto: DefinicionActo = {
    id: tipo.id, nombre: tipo.nombre, plantilla: tipo.id, porPlantilla: true,
    enajenacion: false, registro: sobreInmuebles, libroVarios: false,
    preparar(d: DatosActo): ActoPreparado {
      const vacio = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && !v.trim());
      const faltan = campos.filter((c) => c.obligatorio && vacio(d[c.id])).map((c) => c.etiqueta);
      if (faltan.length) throw new ErrorDatos(faltan);
      const plano: Record<string, unknown> = {};
      for (const c of campos) {
        const v = d[c.id];
        const valor = c.tipo === 'booleano' ? v === true || v === 'true' : typeof v === 'string' ? v.trim() : v;
        // Las variables con punto («inmueble.matricula») se guardan como objeto para la plantilla
        const [raiz, sub] = c.id.split('.');
        if (sub) plano[raiz] = { ...((plano[raiz] as object) ?? {}), [sub]: valor };
        else plano[raiz] = valor;
      }
      return { a: {}, plano, especificacion: [{ acto: tipo.nombre.toUpperCase(), valor: '' }], unidades: [], firmantesAdicionales: [], inmuebles: [], comprobantes: [] };
    },
  };
  return { esquema, acto };
}

/** Variables de la plantilla que el formulario pide (para la revisión de la plantilla) */
export function variablesDelFormulario(archivo: Buffer): string[] {
  return camposDePlantilla(vistaPreviaDocx(archivo)).map((c) => c.id);
}

export { etiquetasDe };
