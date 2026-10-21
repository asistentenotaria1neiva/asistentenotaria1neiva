/**
 * Arma el contexto completo de una escritura a partir de los datos del expediente:
 * carátula (intervinientes, especificación, inmuebles), el contexto de cada acto,
 * comprobantes, firmas y oficios.
 */
import type { DatosExpediente } from './tipos';
import { prepararPersonas, type PersonaPreparada, ErrorDatos, type UnidadComparecencia } from './personas';
import { prepararInmueble, type InmueblePreparado } from './inmuebles';
import { ACTOS, type ActoPreparado, type Ayudas, type Oficio, numeroCorto } from './actos';
import { numeroEscrituraEnLetras, fechaEnLetras, fechaComparecencia, fechaCorta } from '../texto/numeros-a-letras';
import { unirNombres, generoGrupo } from '../texto/concordancia';

export interface ConfigNotaria {
  codigo: string; // 410010001
  titular: string; // LUIS IGNACIO VIVAS CEDEÑO
  resolucion_tarifas: string; // "2026-000964-6 del 20 de Enero de 2026"
  encargado_genero?: 'M' | 'F';
}

export const NOTARIA_POR_DEFECTO: ConfigNotaria = {
  codigo: '410010001',
  titular: 'LUIS IGNACIO VIVAS CEDEÑO',
  resolucion_tarifas: '2026-000964-6 del 20 de Enero de 2026',
  encargado_genero: 'F',
};

const ORDINAL_ACTO = ['PRIMER', 'SEGUNDO', 'TERCER', 'CUARTO', 'QUINTO', 'SEXTO', 'SÉPTIMO', 'OCTAVO'];

export interface ContextoEscritura {
  global: Record<string, unknown>;
  actos: { id: string; plantilla: string; anexo?: string; contexto: Record<string, unknown> }[];
}

export function prepararContexto(datos: DatosExpediente, ordenActos: string[], notaria: ConfigNotaria = NOTARIA_POR_DEFECTO): ContextoEscritura {
  if (!ordenActos.length) throw new ErrorDatos(['al menos un acto']);
  const personas = prepararPersonas(datos.personas);
  const inmueblesBase = new Map(datos.inmuebles.map((i) => [i.id, i]));
  const inmueblesCache = new Map<string, InmueblePreparado>();

  const h: Ayudas = {
    datos,
    persona(id, campo) {
      if (typeof id !== 'string' || !id) throw new ErrorDatos([campo]);
      const p = personas.get(id);
      if (!p) throw new ErrorDatos([`${campo}: la persona seleccionada ya no existe`]);
      return p;
    },
    personas(ids, campo) {
      if (!Array.isArray(ids) || !ids.length) throw new ErrorDatos([campo]);
      return ids.map((id) => h.persona(id, campo));
    },
    inmueble(id, campo) {
      if (typeof id !== 'string' || !id) throw new ErrorDatos([campo]);
      if (!inmueblesCache.has(id)) {
        const i = inmueblesBase.get(id);
        if (!i) throw new ErrorDatos([`${campo}: el inmueble seleccionado ya no existe`]);
        inmueblesCache.set(id, prepararInmueble(i));
      }
      return inmueblesCache.get(id)!;
    },
    inmuebles(ids, campo) {
      if (!Array.isArray(ids) || !ids.length) throw new ErrorDatos([campo]);
      return ids.map((id) => h.inmueble(id, campo));
    },
  };

  // Preparar cada acto acumulando todos los datos faltantes (no solo el primero)
  const faltantes: string[] = [];
  const preparados: { id: string; p: ActoPreparado }[] = [];
  for (const id of ordenActos) {
    const def = ACTOS[id];
    if (!def) { faltantes.push(`el acto "${id}" aún no tiene plantilla convertida`); continue; }
    try {
      preparados.push({ id, p: def.preparar(datos.actos[id] ?? {}, h) });
    } catch (e) {
      if (e instanceof ErrorDatos) faltantes.push(...e.faltantes.map((f) => `${def.nombre}: ${f}`));
      else throw e;
    }
  }
  if (faltantes.length) throw new ErrorDatos(faltantes);

  const defs = preparados.map(({ id }) => ACTOS[id]);
  const e = datos.escritura;

  // Intervinientes (carátula)
  const lineas: string[] = [];
  const agregarLinea = (l: string) => { if (!lineas.includes(l)) lineas.push(l); };
  const todasUnidades: UnidadComparecencia[] = preparados.flatMap(({ p }) => p.unidades);
  for (const u of todasUnidades) {
    if (u.tipo === 'PROPIA') agregarLinea(`${u.firmante.nombre} ${u.firmante.numero_documento}`);
    else {
      for (const r of u.representados) agregarLinea(`${r.nombre} ${r.tipo_persona === 'JURIDICA' ? 'NIT. ' : ''}${r.numero_documento}`);
      agregarLinea(`${u.representados.length > 1 ? 'REPRESENTADOS' : 'REPRESENTADO'} POR ${u.firmante.nombre} ${u.firmante.numero_documento}`);
    }
  }
  for (const { p } of preparados) for (const f of p.firmantesAdicionales) agregarLinea(`${f.nombre} ${f.numero_documento}`);

  // Firmantes (sin duplicados; la calidad se acumula)
  const firmantes = new Map<string, { nombre: string; calidades: string[]; abogado: boolean; persona: PersonaPreparada }>();
  const agregarFirmante = (p: PersonaPreparada, calidad?: string) => {
    const f = firmantes.get(p.id) ?? { nombre: p.nombre, calidades: [], abogado: !!p.tarjeta_profesional, persona: p };
    if (calidad && !f.calidades.includes(calidad)) f.calidades.push(calidad);
    firmantes.set(p.id, f);
  };
  for (const u of todasUnidades) {
    if (u.tipo === 'PROPIA') agregarFirmante(u.firmante);
    else if (u.tipo === 'ENTIDAD') agregarFirmante(u.firmante, `EN REPRESENTACION ${u.representados[0].genero_gramatical === 'M' ? 'DEL' : 'DE LA'} ${u.representados[0].nombre}.`);
    else agregarFirmante(u.firmante, `EN REPRESENTACION DE ${unirNombres(u.representados.map((r) => r.nombre)).toUpperCase()}.`);
  }
  for (const { p } of preparados) for (const f of p.firmantesAdicionales) agregarFirmante(f);
  const listaFirmantes = [...firmantes.values()];
  const gFirm = generoGrupo(listaFirmantes.map((f) => f.persona));
  const otorgantesTitulo = listaFirmantes.length > 1
    ? (gFirm === 'F' ? 'LAS OTORGANTES,' : 'LOS OTORGANTES,')
    : (gFirm === 'F' ? 'LA OTORGANTE,' : 'EL OTORGANTE,');

  // Inmuebles de la carátula (sin repetir)
  const inmueblesCaratula = new Map<string, InmueblePreparado>();
  for (const { p } of preparados) for (const i of p.inmuebles) inmueblesCaratula.set(i.id, i);

  // Comprobantes (primero los fiscales)
  const comprobantes: string[] = [];
  for (const { p } of preparados) for (const c of p.comprobantes) if (!comprobantes.includes(c)) comprobantes.push(c);
  comprobantes.sort((x, y) => Number(!x.startsWith('Certificados de paz y salvos')) - Number(!y.startsWith('Certificados de paz y salvos')));

  const encargado = e.autoriza === 'ENCARGADO';
  if (encargado && (!e.encargado_nombre || !e.resolucion_encargo)) {
    throw new ErrorDatos(['nombre y resolución del notario(a) encargado(a)']);
  }
  const fem = (notaria.encargado_genero ?? 'F') === 'F';
  const escritura = {
    numero_letras: e.numero ? numeroEscrituraEnLetras(e.numero) : '',
    fecha_letras: e.fecha_otorgamiento ? `${fechaEnLetras(e.fecha_otorgamiento)}.` : '',
    fecha_comparecencia: e.fecha_otorgamiento ? fechaComparecencia(e.fecha_otorgamiento) : '',
    encabezado_titular: !!e.fecha_otorgamiento && !encargado,
    encabezado_encargado: !!e.fecha_otorgamiento && encargado,
    encargado_cargo: fem ? 'Notaria Encargada' : 'Notario Encargado',
    encargado_nombre: e.encargado_nombre ?? '',
    resolucion_encargo: e.resolucion_encargo ?? '',
    diferentes_momentos: e.diferentes_momentos !== false,
    codigo_minuta: e.codigo_minuta ?? '',
    hojas: e.hojas ?? '',
    derechos: e.derechos ?? '',
    retefuente: e.retefuente ?? '',
    libro_varios: e.libro_varios ?? '',
    firma_notario_titulo: encargado ? (fem ? 'LA NOTARIA E,' : 'EL NOTARIO E,') : 'EL NOTARIO,',
    firma_notario_nombre: encargado ? (e.encargado_nombre ?? '').toUpperCase() : notaria.titular,
  };

  const oficios: Oficio[] = preparados.flatMap(({ p }) => (p.oficios ?? []).map((o) => ({
    ...o,
    numero_escritura: numeroCorto(e.numero),
    fecha_escritura: e.fecha_otorgamiento ? fechaCorta(e.fecha_otorgamiento) : '____ de __________ de ______',
    notario: encargado ? (e.encargado_nombre ?? '').toUpperCase() : notaria.titular,
  })));

  const global = {
    notaria,
    escritura,
    intervinientes: lineas.map((linea) => ({ linea })),
    especificacion: preparados.flatMap(({ p }) => p.especificacion),
    inmuebles_caratula: [...inmueblesCaratula.values()].map((i) => ({
      matricula: i.matricula, catastral: i.catastral, catastral_paz_salvo: i.catastral_paz_salvo,
      involucrada: i.involucrada, nombre_direccion: i.direccion, orip: i.orip,
    })),
    comprobantes: comprobantes.map((texto) => ({ texto })),
    hay_fiscales: comprobantes.some((c) => c.startsWith('Certificados de paz y salvos')),
    hay_art61: defs.some((d) => d.enajenacion),
    hay_retefuente: defs.some((d) => d.enajenacion) && !!e.retefuente,
    advertencia_registro: defs.some((d) => d.registro),
    hay_libro_varios: defs.some((d) => d.libroVarios),
    firmantes: listaFirmantes.map((f) => ({ nombre: f.nombre, calidad: f.calidades.join(' '), abogado: f.abogado })),
    otorgantes_titulo: otorgantesTitulo,
    oficios,
  };

  const varios = preparados.length > 1;
  return {
    global,
    actos: preparados.map(({ id, p }, i) => ({
      id,
      plantilla: ACTOS[id].plantilla,
      anexo: ACTOS[id].anexo,
      contexto: {
        ...global,
        a: p.a,
        titulo_acto: varios ? `${ORDINAL_ACTO[i]} ACTO - ${p.especificacion.map((x) => x.acto).join(' - ')}` : '',
      },
    })),
  };
}
