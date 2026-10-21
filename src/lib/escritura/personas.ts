/**
 * Fórmulas de identificación y comparecencia de las personas, tomadas de las
 * escrituras de la notaría:
 *   persona natural ......... F52 (410)  "mayor de edad, domiciliada en …, identificada con …"
 *   apoderado ............... F42 (399)  "quien obra en nombre y en representación de …"
 *   persona jurídica ........ F17 (237) y F16 (23)
 *   menor de edad ........... F24 (292) y F04 (12)
 *   abogado (actos de familia) F59 (5)   "Abogado en ejercicio con tarjeta profesional …"
 */
import type { Persona } from './tipos';
import { flexionar, estadoCivilConGenero, unirNombres } from '../texto/concordancia';

export interface PersonaPreparada extends Persona {
  documento_texto: string;
  /** Identificación completa (con estado civil y actividad económica) */
  identificacion: string;
  /** "mayor de edad, identificado con cédula …" */
  identificacion_corta: string;
  /** Sin estado civil (apoderados y representantes) */
  identificacion_apoderado: string;
  estado_civil: string;
  genero_gramatical?: 'M' | 'F';
  apoderado?: PersonaPreparada;
  representante?: PersonaPreparada;
  representante_legal?: PersonaPreparada;
}

export class ErrorDatos extends Error {
  constructor(public faltantes: string[]) {
    super(`Faltan datos para generar la escritura: ${faltantes.join('; ')}`);
  }
}

export function documentoTexto(p: Persona): string {
  const n = p.numero_documento;
  switch (p.tipo_documento) {
    case 'CC': return `cédula de ciudadanía número ${n}${p.lugar_expedicion ? ` expedida en ${p.lugar_expedicion}` : ''}`;
    case 'CE': return `cédula de extranjería número ${n}`;
    case 'NUIP': return `registro civil de nacimiento NUIP. ${n}`;
    case 'TI': return `tarjeta de identidad número ${n}`;
    case 'PASAPORTE': return `pasaporte número ${n}`;
    case 'NIT': return `NIT. ${n}`;
  }
}

/** Género gramatical de una entidad: "el BANCO…" / "la SOCIEDAD…" */
const generoEntidad = (p: Persona): 'M' | 'F' =>
  p.genero ?? (/^(BANCO|FONDO|INSTITUTO|MUNICIPIO|CONSORCIO|PATRIMONIO)/i.test(p.nombre) ? 'M' : 'F');

/** Prepara las personas: resuelve referencias (apoderado, representante) y arma las fórmulas */
export function prepararPersonas(personas: Persona[]): Map<string, PersonaPreparada> {
  const base = new Map(personas.map((p) => [p.id, p]));
  const cache = new Map<string, PersonaPreparada>();

  const preparar = (id: string, cadena: string[] = []): PersonaPreparada => {
    if (cache.has(id)) return cache.get(id)!;
    const p = base.get(id);
    if (!p) throw new ErrorDatos([`persona ${id} no registrada`]);
    if (cadena.includes(id)) throw new ErrorDatos([`referencia circular de representación (${p.nombre})`]);
    const g = p.genero ?? 'M';
    const gf = (palabra: string) => flexionar(palabra, g, false);
    const doc = documentoTexto(p);
    const ec = estadoCivilConGenero(p.estado_civil, g);
    let identificacion: string;
    let identificacion_corta: string;
    let identificacion_apoderado: string;

    if (p.tipo_persona === 'JURIDICA') {
      const partes = [`con NIT. ${p.numero_documento}`, p.descripcion_entidad, p.constitucion_texto].filter(Boolean);
      identificacion = identificacion_corta = identificacion_apoderado = partes.join(', ');
    } else {
      const edad = p.menor_de_edad ? 'menor de edad' : 'mayor de edad';
      const dom = p.domicilio ? `, ${gf('domiciliado')} en ${p.domicilio}` : '';
      identificacion_apoderado = `${edad}${dom}, ${gf('identificado')} con ${doc}`;
      if (p.tarjeta_profesional) {
        identificacion_apoderado += `, ${g === 'F' ? 'Abogada' : 'Abogado'} en ejercicio con tarjeta profesional número ${p.tarjeta_profesional} del Consejo Superior de la Judicatura`;
      }
      identificacion_corta = `${edad}, ${gf('identificado')} con ${doc}`;
      identificacion = p.menor_de_edad
        ? `${edad}${dom}, ${gf('identificado')} con ${doc}`
        : `${edad}${dom}, ${gf('identificado')} con ${doc}${ec ? `, estado civil ${ec}` : ''}${p.actividad_economica ? `, actividad económica ${p.actividad_economica}` : ''}`;
    }
    const prep: PersonaPreparada = {
      ...p,
      genero: p.tipo_persona === 'JURIDICA' ? generoEntidad(p) : g,
      genero_gramatical: p.tipo_persona === 'JURIDICA' ? generoEntidad(p) : undefined,
      documento_texto: doc,
      identificacion,
      identificacion_corta,
      identificacion_apoderado,
      estado_civil: ec,
    };
    cache.set(id, prep);
    if (p.apoderado_id) prep.apoderado = preparar(p.apoderado_id, [...cadena, id]);
    if (p.representante_id) prep.representante = preparar(p.representante_id, [...cadena, id]);
    if (p.representante_legal_id) {
      prep.representante_legal = preparar(p.representante_legal_id, [...cadena, id]);
      const rl = prep.representante_legal;
      prep.identificacion += `, ${flexionar('representado', g, false)} por ${p.parentesco_representante ?? (rl.genero === 'F' ? 'su progenitora' : 'su progenitor')} ${rl.nombre}, ${rl.identificacion}, cuya patria potestad se acredita con el respectivo registro civil de nacimiento, documento que se adjunta para su protocolización`;
    }
    return prep;
  };

  for (const p of personas) preparar(p.id);
  return cache;
}

/** Unidad de comparecencia: quien firma (la persona, su apoderado o el representante de la entidad) */
export interface UnidadComparecencia {
  firmante: PersonaPreparada;
  representados: PersonaPreparada[];
  tipo: 'PROPIA' | 'APODERADO' | 'ENTIDAD' | 'PATRIA_POTESTAD';
}

export function unidadesComparecencia(grupo: PersonaPreparada[]): UnidadComparecencia[] {
  const unidades: UnidadComparecencia[] = [];
  const agregar = (firmante: PersonaPreparada, representado: PersonaPreparada | null, tipo: UnidadComparecencia['tipo']) => {
    let u = unidades.find((x) => x.firmante.id === firmante.id && x.tipo === tipo);
    if (!u) { u = { firmante, representados: [], tipo }; unidades.push(u); }
    if (representado) u.representados.push(representado);
  };
  for (const p of grupo) {
    if (p.tipo_persona === 'JURIDICA') {
      if (!p.representante) throw new ErrorDatos([`la entidad ${p.nombre} no tiene representante o apoderado`]);
      agregar(p.representante, p, 'ENTIDAD');
    } else if (p.apoderado) agregar(p.apoderado, p, 'APODERADO');
    else if (p.menor_de_edad) {
      if (!p.representante_legal) throw new ErrorDatos([`el menor ${p.nombre} no tiene representante legal`]);
      agregar(p.representante_legal, p, 'PATRIA_POTESTAD');
    } else agregar(p, null, 'PROPIA');
  }
  return unidades;
}

/** Texto de cada unidad de comparecencia (lo que sigue a "Compareció quien dijo ser,") */
export function textoUnidad(u: UnidadComparecencia): string {
  const f = u.firmante;
  switch (u.tipo) {
    case 'PROPIA':
      return `${f.nombre}, ${f.identificacion}`;
    case 'APODERADO': {
      const poder = u.representados[0]?.poder_tipo === 'GENERAL' ? 'general' : 'especial';
      if (u.representados.length === 1) {
        const r = u.representados[0];
        const declaracion = r.estado_civil
          ? `, ${f.genero === 'F' ? 'la apoderada' : 'el apoderado'} bajo la gravedad de juramento manifiesta que el estado civil de su poderdante es ${r.estado_civil}${r.actividad_economica ? `, actividad económica ${r.actividad_economica}` : ''}`
          : '';
        return `${f.nombre}, ${f.identificacion_apoderado}, quien obra en nombre y en representación de ${r.nombre}, ${r.identificacion_apoderado}${declaracion}, en virtud del poder ${poder} otorgado, de cuya vigencia y términos se hace plenamente responsable, documento que se adjunta para su protocolización`;
      }
      const reps = unirNombres(u.representados.map((r) => `${r.nombre}, ${r.identificacion}`));
      return `${f.nombre}, ${f.identificacion_apoderado}, quien obra en nombre y en representación de ${reps}, en virtud del poder ${poder} otorgado, de cuya vigencia y términos se hace plenamente responsable, documento que se adjunta para su protocolización`;
    }
    case 'ENTIDAD': {
      const e = u.representados[0];
      const de = e.genero_gramatical === 'M' ? 'del' : 'de la';
      const soporte = e.representacion === 'PODER'
        ? `en virtud del poder especial otorgado mediante ${e.poder_entidad_soporte ?? '[SOPORTE DEL PODER]'}, junto con el certificado de vigencia, documentos que se adjuntan para su protocolización con esta escritura para que forme parte de ella y se inserte en las copias de que de la misma se expidan`
        : `en su condición de Representante Legal, todo lo cual se acredita con el Certificado de Existencia y Representación Legal, documento que se adjunta para su protocolización`;
      return `${f.nombre}, ${f.identificacion_apoderado}, quien obra en nombre y en representación ${de} ${e.nombre}, ${e.identificacion}, ${soporte}`;
    }
    case 'PATRIA_POTESTAD': {
      const m = u.representados[0];
      return `${f.nombre}, ${f.identificacion}, quien obra en nombre y en representación de su menor ${flexionar('hijo', m.genero ?? 'M', false)} ${m.nombre}, menor de edad, ${flexionar('identificado', m.genero ?? 'M', false)} con ${m.documento_texto}, cuya patria potestad se acredita con el respectivo registro civil de nacimiento, documento que se adjunta para su protocolización`;
    }
  }
}

/** "Compareció quien dijo ser, …" / "Comparecieron quienes dijeron ser, … y …" */
export function comparecencia(grupo: PersonaPreparada[]): { texto: string; manifesto: string; unidades: UnidadComparecencia[] } {
  const unidades = unidadesComparecencia(grupo);
  const textos = unidades.map(textoUnidad);
  const texto = unidades.length === 1
    ? `Compareció quien dijo ser, ${textos[0]}`
    : `Comparecieron quienes dijeron ser, ${unirNombres(textos)}`;
  return { texto, manifesto: unidades.length === 1 ? 'manifestó' : 'manifestaron', unidades };
}

/** Identificación de personas que no comparecen en ese momento (p. ej. compradores dentro de la cláusula de venta) */
export function identificacionGrupo(grupo: PersonaPreparada[]): string {
  return unirNombres(grupo.map((p) => `${p.nombre}, ${p.identificacion}`));
}

/** "Presente, X, de las condiciones civiles y personales ya enunciadas, y manifestó:" */
export function aceptacion(grupo: PersonaPreparada[]): string {
  const unidades = unidadesComparecencia(grupo);
  const plural = unidades.length > 1;
  const textos = unidades.map((u) => {
    if (u.tipo === 'PROPIA') return u.firmante.nombre;
    if (u.tipo === 'PATRIA_POTESTAD') {
      const m = u.representados[0];
      return `${u.firmante.nombre}, de las condiciones civiles y personales ya enunciadas, quien obra en representación de su menor ${flexionar('hijo', m.genero ?? 'M', false)} ${m.nombre}`;
    }
    return textoUnidad(u);
  });
  const todasPropias = unidades.every((u) => u.tipo === 'PROPIA');
  return `${plural ? 'Presentes' : 'Presente'}, ${unirNombres(textos)}${todasPropias ? ', de las condiciones civiles y personales ya enunciadas' : ''}, y ${plural ? 'manifestaron' : 'manifestó'}:`;
}
