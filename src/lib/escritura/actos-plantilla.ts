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
import { leerRuta, campoVisible } from './validar-formulario';
import type { GrupoRepetido } from './repetir';
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
/** Nombres de las variables que pone el sistema (notaría y terminación) */
export const VARIABLES_AUTOMATICAS = Object.keys(valoresAutomaticos({}, { codigo: '', titular: '', resolucion_tarifas: '' }));
const AUTOMATICAS = new Set(VARIABLES_AUTOMATICAS);

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

/** Condición de un bloque: {{#x}} se imprime si x es verdadero; {{^x}}, si es falso */
interface Condicion { id: string; si: boolean }

const SI = [true, 'true'];
const NO = [false, 'false', undefined, null, ''];
/** Valor de una variable: las que llevan punto («inmueble.matricula») se guardan anidadas, como las escribe el formulario */
const valorDe = (d: DatosActo, id: string): unknown => (id in d ? d[id] : leerRuta(d, id));
const cumple = (c: Condicion, d: DatosActo) => { const v = valorDe(d, c.id); return (v === true || v === 'true') === c.si; };

/** Bloques que encierran cada aparición de las variables: una lista de condiciones por aparición */
const condicionesPorVariable = new WeakMap<Campo[], Map<string, Condicion[][]>>();

/**
 * Campos del formulario de un acto por plantilla, en el orden en que aparecen en ella. Una variable
 * que solo aparece dentro de un bloque condicional ({{#hay_hijos}} … {{/hay_hijos}}) solo se muestra
 * y se exige cuando ese bloque se imprime.
 */
export function camposDePlantilla(parrafos: Parrafo[]): Campo[] {
  const lineas = parrafos.map((p) => p.segmentos.map((s) => s.texto).join(''));
  const texto = lineas.join('\n');
  const campos: Campo[] = [];
  const apariciones = new Map<string, Condicion[][]>();
  const pila: Condicion[] = [];
  // Primera aparición de cada etiqueta, en orden
  for (const m of texto.matchAll(/\{\{\s*([#^/]?)\s*([^{}]+?)\s*\}\}/g)) {
    const [marca, signo, cuerpo] = m;
    const id = base(cuerpo);
    if (signo === '/') {
      const i = pila.map((c) => c.id).lastIndexOf(id);
      if (i >= 0) pila.splice(i);
      continue;
    }
    const valido = /^[a-z0-9_]+(\.[a-z0-9_]+)?$/i.test(id);
    const delSistema = !valido || AUTOMATICAS.has(id) || RAICES_SISTEMA.has(id.split('.')[0]);
    if (!delSistema) {
      const previas = apariciones.get(id);
      apariciones.set(id, [...(previas ?? []), [...pila]]);
      if (!previas) {
        const ayuda = fragmento(texto, marca);
        campos.push(signo
          ? { id, etiqueta: `¿${etiquetaDe(id)}?`, tipo: 'booleano', ayuda: ayuda && `Si es «Sí», se imprime el texto que empieza en: ${ayuda}` }
          : { id, etiqueta: etiquetaDe(id), tipo: LARGOS.test(id) ? 'textoLargo' : 'texto', obligatorio: true, ayuda: ayuda && `Va en la escritura así: ${ayuda}` });
      }
    }
    if (signo) pila.push({ id, si: signo === '#' });
  }
  // Solo visible (y exigido) si el bloque que la encierra se imprime; si aparece también fuera de bloques, siempre
  for (const c of campos) {
    const lista = apariciones.get(c.id)!;
    if (lista.some((conds) => !conds.length)) continue;
    // Todas sus apariciones dentro del mismo bloque: se muestra con él; si está en bloques distintos, siempre
    const interiores = lista.map((conds) => conds[conds.length - 1]);
    const interior = interiores[0];
    if (interiores.some((x) => x.id !== interior.id || x.si !== interior.si)) continue;
    c.visibleSi = { campo: interior.id, valores: interior.si ? SI : NO };
  }
  const { campos: todos, grupos } = conVariasPersonas(campos);
  condicionesPorVariable.set(todos, apariciones);
  gruposPorCampos.set(todos, grupos);
  return todos;
}

// ------------------------------------------------------------------ varias personas con el mismo papel

/** Personas con el mismo papel que admite la escritura (la plantilla se hizo con una) */
export const MAX_PERSONAS = 8;
/** Datos de una persona en el nombre de una variable: «nombre_usufructuario», «cedula_nudo_propietario», «usufructuario_estado_civil» */
const ATRIBUTOS = ['nombre_completo', 'nombres', 'nombre', 'apellidos', 'numero_cedula', 'numero_documento', 'tipo_documento', 'cedula', 'cc', 'documento', 'identificacion', 'nit',
  'lugar_expedicion', 'ciudad_expedicion', 'expedicion', 'estado_civil', 'domicilio', 'ciudad_domicilio', 'residencia', 'direccion', 'telefono', 'celular', 'correo', 'email',
  'actividad_economica', 'actividad', 'ocupacion', 'profesion', 'nacionalidad', 'edad', 'genero', 'sexo', 'firma', 'huella'].sort((a, b) => b.length - a.length);
const NOMBRE = new Set(['nombre_completo', 'nombres', 'nombre']);
const IDENTIFICACION = new Set(['numero_cedula', 'numero_documento', 'cedula', 'cc', 'documento', 'identificacion', 'nit']);

/** Papel y dato de una variable de persona; null si no lo es */
export function papelDe(id: string): { papel: string; atributo: string } | null {
  if (id.includes('.') || id.includes('__')) return null;
  for (const a of ATRIBUTOS) {
    if (id.startsWith(`${a}_`) && id.length > a.length + 1) return { papel: id.slice(a.length + 1), atributo: a };
    if (id.endsWith(`_${a}`) && id.length > a.length + 1) return { papel: id.slice(0, -a.length - 1), atributo: a };
  }
  return null;
}

interface GrupoPersona { papel: string; cantidad: string; grupo: string; variables: string[] }
const gruposPorCampos = new WeakMap<Campo[], GrupoPersona[]>();
/** Campo de la k-ésima persona → variable de la plantilla */
const instancia = (variable: string, k: number) => (k === 1 ? variable : `${variable}__${k}`);
const ORDINAL = ['', 'primera', 'segunda', 'tercera', 'cuarta', 'quinta', 'sexta', 'séptima', 'octava'];

/**
 * Cada grupo de variables de una persona con un papel (nombre e identificación de un mismo papel)
 * admite varias personas: un campo «cantidad_<papel>» y los datos de la 2.ª, 3.ª… persona
 * («nombre_usufructuario__2»), que se muestran según la cantidad.
 */
function conVariasPersonas(campos: Campo[]): { campos: Campo[]; grupos: GrupoPersona[] } {
  const porPapel = new Map<string, { campo: Campo; atributo: string }[]>();
  for (const c of campos) {
    if (c.tipo !== 'texto' && c.tipo !== 'textoLargo') continue;
    const p = papelDe(c.id);
    if (p) porPapel.set(p.papel, [...(porPapel.get(p.papel) ?? []), { campo: c, atributo: p.atributo }]);
  }
  const grupos: GrupoPersona[] = [];
  let resultado = [...campos];
  for (const [papel, vars] of porPapel) {
    if (!vars.some((v) => NOMBRE.has(v.atributo)) || !vars.some((v) => IDENTIFICACION.has(v.atributo))) continue;
    const cantidad = `cantidad_${papel}`;
    if (campos.some((c) => c.id === cantidad)) continue;
    const nombre = vars.find((v) => NOMBRE.has(v.atributo))!.campo;
    const etiquetaPapel = papel.replace(/_/g, ' ');
    const campoCantidad: Campo = {
      id: cantidad, etiqueta: `Cantidad de personas: ${etiquetaPapel}`, tipo: 'entero',
      ayuda: `Cuántas personas tienen el papel de ${etiquetaPapel} en esta escritura (p. ej. dos usufructuarios). Si son varias, la escritura repite sus datos para cada una. Vacío = una.`,
      ...(nombre.visibleSi ? { visibleSi: nombre.visibleSi } : {}),
    };
    const extra: Campo[] = [];
    for (let k = 2; k <= MAX_PERSONAS; k++) {
      const desde = Array.from({ length: MAX_PERSONAS - k + 1 }, (_, i) => k + i);
      for (const { campo } of vars) {
        extra.push({
          ...campo, id: instancia(campo.id, k), etiqueta: `${campo.etiqueta} (${k}.ª persona)`,
          ayuda: `Dato de la ${ORDINAL[k]} persona con el papel de ${etiquetaPapel}. ${campo.ayuda ?? ''}`.trim(),
          visibleSi: { campo: cantidad, valores: [...desde, ...desde.map(String)] },
        });
      }
    }
    const primero = resultado.indexOf(vars[0].campo);
    resultado.splice(primero, 0, campoCantidad);
    const ultimo = Math.max(...vars.map((v) => resultado.indexOf(v.campo)));
    resultado.splice(ultimo + 1, 0, ...extra);
    grupos.push({ papel, cantidad, grupo: `__g_${papel}`, variables: vars.map((v) => v.campo.id) });
  }
  resultado = resultado.filter(Boolean);
  return { campos: resultado, grupos };
}

/** Cuántas personas tiene el papel (1 si no se dijo) */
const cantidadDe = (d: DatosActo, g: GrupoPersona) => Math.min(Math.max(Math.trunc(Number(valorDe(d, g.cantidad))) || 1, 1), MAX_PERSONAS);

/** Variable de la plantilla de la que sale un campo de la 2.ª, 3.ª… persona */
const baseDe = (id: string) => id.replace(/__\d+$/, '');

/** ¿El campo se imprime con estos datos? (alguna de sus apariciones queda fuera de bloques que no aplican) */
function seImprime(campos: Campo[], c: Campo, d: DatosActo): boolean {
  if (!campoVisible(c, d as Record<string, unknown>, campos)) return false;
  const lista = condicionesPorVariable.get(campos)?.get(baseDe(c.id));
  return !lista || lista.some((conds) => conds.every((x) => cumple(x, d)));
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
      const faltan = campos.filter((c) => c.obligatorio && seImprime(campos, c, d) && vacio(valorDe(d, c.id))).map((c) => c.etiqueta);
      if (faltan.length) throw new ErrorDatos(faltan);
      const plano: Record<string, unknown> = {};
      for (const c of campos) {
        const v = valorDe(d, c.id);
        const valor = c.tipo === 'booleano' ? v === true || v === 'true' : typeof v === 'string' ? v.trim() : v;
        // Las variables con punto («inmueble.matricula») se guardan como objeto para la plantilla
        const [raiz, sub] = c.id.split('.');
        if (sub) plano[raiz] = { ...((plano[raiz] as object) ?? {}), [sub]: valor };
        else plano[raiz] = valor;
      }
      // Varias personas con el mismo papel: una lista con los datos de cada una, y la plantilla repite su texto (repetir.ts)
      const repetir: GrupoRepetido[] = [];
      for (const g of gruposPorCampos.get(campos) ?? []) {
        const n = cantidadDe(d, g);
        if (n < 2) continue;
        plano[g.grupo] = Array.from({ length: n }, (_, i) => ({
          __sep: i === 0 ? '' : i === n - 1 ? ' y ' : ', ',
          ...Object.fromEntries(g.variables.map((v) => { const x = valorDe(d, instancia(v, i + 1)); return [v, typeof x === 'string' ? x.trim() : x]; })),
        }));
        repetir.push({ grupo: g.grupo, variables: g.variables });
      }
      return { a: {}, plano, repetir, especificacion: [{ acto: tipo.nombre.toUpperCase(), valor: '' }], unidades: [], firmantesAdicionales: [], inmuebles: [], comprobantes: [] };
    },
  };
  return { esquema, acto };
}

/** Variables de la plantilla que el formulario pide (para la revisión de la plantilla) */
export function variablesDelFormulario(archivo: Buffer): string[] {
  // Sin los que agrega el sistema para varias personas con el mismo papel
  const campos = camposDePlantilla(vistaPreviaDocx(archivo));
  const agregados = new Set((gruposPorCampos.get(campos) ?? []).map((g) => g.cantidad));
  return campos.map((c) => c.id).filter((id) => !agregados.has(id) && !/__\d+$/.test(id));
}

export { etiquetasDe };
