/**
 * Registro de los actos con plantilla convertida (Fase 1).
 *
 * Para cada acto se define:
 *   - la plantilla (.docx) y, si aplica, el anexo (oficios);
 *   - cómo se prepara su contexto a partir de los datos del formulario;
 *   - su línea en la ESPECIFICACIÓN de la carátula;
 *   - los comprobantes que se relacionan en el cierre;
 *   - quiénes comparecen (para la lista de intervinientes y las firmas).
 *
 * Los textos derivados (p. ej. "dos (2) años", "su extinto padre") reproducen
 * la redacción de las escrituras fuente citadas en cada plantilla.
 */
import type { DatosActo, DatosExpediente } from './tipos';
import {
  type PersonaPreparada, type UnidadComparecencia, ErrorDatos,
  comparecencia, identificacionGrupo, aceptacion, unidadesComparecencia,
} from './personas';
import { type InmueblePreparado } from './inmuebles';
import { articuloSustantivo, flexionar, generoGrupo, unirNombres, estadoCivilConGenero } from '../texto/concordancia';
import { pesosEnLetras, formatoPesos, fechaCorta, enteroALetras, formatoMiles } from '../texto/numeros-a-letras';

export interface Ayudas {
  persona(id: unknown, campo: string): PersonaPreparada;
  personas(ids: unknown, campo: string): PersonaPreparada[];
  inmueble(id: unknown, campo: string): InmueblePreparado;
  inmuebles(ids: unknown, campo: string): InmueblePreparado[];
  datos: DatosExpediente;
}

export interface Oficio {
  destinatario: string;
  numero_escritura: string;
  fecha_escritura: string;
  acto_texto: string;
  personas: string;
  registro_texto: string;
  notario: string;
}

export interface ActoPreparado {
  a: Record<string, unknown>;
  especificacion: { acto: string; valor: string }[];
  unidades: UnidadComparecencia[];
  /** Personas que firman sin estar en una unidad de comparecencia (p. ej. coadyuvante) */
  firmantesAdicionales: PersonaPreparada[];
  inmuebles: InmueblePreparado[];
  comprobantes: string[];
  oficios?: Omit<Oficio, 'numero_escritura' | 'fecha_escritura' | 'notario'>[];
}

export interface DefinicionActo {
  id: string;
  nombre: string;
  plantilla: string;
  anexo?: string;
  /** Enajenación: lleva advertencia del art. 61 de la Ley 2010 de 2019 y REDAM */
  enajenacion: boolean;
  /** Debe inscribirse en la oficina de registro (advertencia de los dos meses) */
  registro: boolean;
  /** Se anota en el Libro de Varios (actos del estado civil) */
  libroVarios: boolean;
  preparar(d: DatosActo, h: Ayudas): ActoPreparado;
}

// ------------------------------------------------------------------ utilidades

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const requerido = (d: DatosActo, campo: string, etiqueta: string): string => {
  const v = d[campo];
  if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) throw new ErrorDatos([etiqueta]);
  return String(v).trim();
};
const numeroRequerido = (d: DatosActo, campo: string, etiqueta: string): number => {
  const n = Number(d[campo]);
  if (!Number.isFinite(n) || n <= 0) throw new ErrorDatos([etiqueta]);
  return n;
};
const cantidadTexto = (n: number) => `${enteroALetras(n, { apocope: true }).toLowerCase()} (${n})`;

function comprobantesPersonas(grupo: PersonaPreparada[]): string[] {
  const c: string[] = [];
  for (const p of grupo) {
    if (p.tipo_persona === 'JURIDICA') c.push(`Certificado de Existencia y Representación Legal ${p.genero_gramatical === 'M' ? 'del' : 'de la'} ${p.nombre}.`);
    if (p.tipo_persona === 'JURIDICA' && p.representacion === 'PODER' && p.representante) c.push(`Escritura de poder otorgado a ${p.representante.nombre}.`);
    if (p.apoderado) c.push(`Poder ${p.poder_tipo === 'GENERAL' ? 'general' : 'especial'} otorgado a ${p.apoderado.nombre}.`);
    if (p.menor_de_edad) c.push(`Registro civil de nacimiento de ${p.nombre}.`);
  }
  return c;
}

function certificadosTexto(inmuebles: InmueblePreparado[]): string {
  if (inmuebles.length === 1) {
    const i = inmuebles[0];
    return `el Certificado de Tradición y Libertad del folio de matrícula inmobiliaria número ${i.matricula} de fecha ${i.fecha_certificado}`;
  }
  return `los Certificados de Tradición y Libertad de los folios de matrícula inmobiliaria números ${unirNombres(inmuebles.map((i) => `${i.matricula} de fecha ${i.fecha_certificado}`))}`;
}

/** Estado civil de un grupo: "SOLTERA, SIN UNION…" o "SOLTEROS, SIN UNION…" cuando todos comparten el mismo */
function estadoCivilGrupo(grupo: PersonaPreparada[]): string {
  const bases = [...new Set(grupo.map((p) => p.estado_civil?.replace(/^([A-Z]+?)(O|A)\b/, '$1(A)')))];
  if (grupo.length === 1) return grupo[0].estado_civil;
  if (bases.length === 1 && bases[0]) {
    const g = generoGrupo(grupo);
    return bases[0].replace(/^([A-Z]+?)\(A\)/, (_, raiz) => raiz + (g === 'F' ? 'AS' : 'OS'));
  }
  return unirNombres(grupo.map((p) => `${p.nombre} de estado civil ${p.estado_civil}`));
}

const trato = (p: PersonaPreparada) => articuloSustantivo(p, 'señor'); // "el señor" | "la señora"

const ORIGEN_ESCRITURA = (i: InmueblePreparado) => i.titulo_adquisicion_texto;

// ------------------------------------------------------------------ actos

const compraventa: DefinicionActo = {
  id: 'compraventa', nombre: 'Compraventa de inmueble', plantilla: 'compraventa',
  enajenacion: true, registro: true, libroVarios: false,
  preparar(d, h) {
    const vendedores = h.personas(d.vendedores, 'vendedor(es)');
    const compradores = h.personas(d.compradores, 'comprador(es)');
    const inmuebles = h.inmuebles(d.inmuebles, 'inmueble(s) objeto de venta');
    const precio = numeroRequerido(d, 'precio', 'precio de la venta');
    const esCuota = d.es_cuota === true;
    if (esCuota) requerido(d, 'cuota_texto', 'fracción o porcentaje del derecho de cuota');
    const afectacion = requerido(d, 'afectacion', 'decisión sobre afectación a vivienda familiar') as 'NO_APLICA' | 'SI' | 'NO';
    const coadyuvante = d.coadyuvante_id ? h.persona(d.coadyuvante_id, 'cónyuge o compañero(a) que coadyuva') : undefined;
    const vinculo = d.vinculo === 'COMPANEROS' ? 'COMPANEROS' : 'CASADOS';
    if (afectacion !== 'NO_APLICA' && !coadyuvante && compradores.length < 2) {
      throw new ErrorDatos(['para decidir sobre la afectación se requieren ambos cónyuges/compañeros (como compradores o uno como coadyuvante)']);
    }
    const cv = comparecencia(vendedores);
    const gVend = generoGrupo(vendedores);
    for (const i of inmuebles) {
      (i as InmueblePreparado & { ec_adquirente?: string }).ec_adquirente = estadoCivilConGenero(i.tradicion.estado_civil_adquirente, gVend);
    }
    const formaPago = texto(d.forma_pago_texto) ||
      `suma que ${articuloSustantivo(vendedores, 'vendedor')} ${vendedores.length > 1 ? 'manifiestan' : 'manifiesta'} haber recibido en su totalidad a entera satisfacción de manos de ${articuloSustantivo(compradores, 'comprador')}.`;
    const representadosSinFacultad = [...vendedores, ...compradores].some((p) => p.apoderado && !p.poder_incluye_estado_civil);
    const uComp = unidadesComparecencia(compradores);
    const especificacion = [{ acto: esCuota ? 'COMPRAVENTA DERECHO DE CUOTA' : 'COMPRAVENTA', valor: formatoPesos(precio) }];
    if (afectacion === 'SI') especificacion.push({ acto: 'AFECTACION A VIVIENDA FAMILIAR', valor: 'SIN CUANTIA' });
    return {
      a: {
        vendedores, compradores, inmuebles,
        otorgantes: [...vendedores, ...compradores],
        comparecencia_vendedores: cv.texto,
        manifesto_vendedores: cv.manifesto,
        constancia_poder: representadosSinFacultad,
        compradores_identificacion: identificacionGrupo(compradores),
        es_cuota: esCuota,
        cuota_texto: texto(d.cuota_texto),
        objeto_inmuebles: inmuebles.length > 1 ? 'los siguientes inmuebles' : 'el siguiente inmueble',
        precio_letras: pesosEnLetras(precio),
        forma_pago_texto: formaPago.endsWith('.') ? formaPago : formaPago + '.',
        excepcion_gravamen: texto(d.excepcion_gravamen),
        certificados_texto: certificadosTexto(inmuebles),
        aceptacion_compradores: aceptacion(compradores),
        afecta_no_aplica: afectacion === 'NO_APLICA',
        afecta_conyuges_compran: afectacion !== 'NO_APLICA' && !coadyuvante,
        afecta_con_coadyuvante: afectacion !== 'NO_APLICA' && !!coadyuvante,
        afecta_si: afectacion === 'SI',
        estado_civil_compradores: estadoCivilGrupo(compradores),
        vinculo_compradores: vinculo === 'CASADOS' ? 'CASADOS ENTRE SI, CON SOCIEDAD CONYUGAL VIGENTE' : 'SOLTEROS, CON UNION MARITAL DE HECHO ENTRE SI',
        vinculo_plural: vinculo === 'CASADOS' ? 'cónyuges' : 'compañeros permanentes',
        coadyuvante,
        coadyuvante_trato: coadyuvante ? trato(coadyuvante) : '',
      },
      especificacion,
      unidades: [...cv.unidades, ...uComp],
      firmantesAdicionales: coadyuvante ? [coadyuvante] : [],
      inmuebles,
      comprobantes: [
        ...inmuebles.map((i) => i.comprobante_paz_salvo).filter((x): x is string => !!x),
        'Fotocopias de las cédulas de ciudadanía correspondientes.',
        ...comprobantesPersonas([...vendedores, ...compradores]),
        ...inmuebles.filter((i) => i.ph).length ? ['Fotocopia simple paz y salvo de administración.'] : [],
      ],
    };
  },
};

const cancelacionHipoteca: DefinicionActo = {
  id: 'cancelacion_hipoteca', nombre: 'Cancelación de hipoteca', plantilla: 'cancelacion_hipoteca',
  enajenacion: false, registro: true, libroVarios: false,
  preparar(d, h) {
    const acreedor = h.persona(d.acreedor_id, 'entidad acreedora');
    if (acreedor.tipo_persona !== 'JURIDICA') throw new ErrorDatos(['el acreedor debe registrarse como persona jurídica (entidad)']);
    const deudores = h.personas(d.deudores, 'deudor(es) que constituyeron la hipoteca');
    const inmueble = h.inmueble(d.inmueble_id, 'inmueble hipotecado');
    const numero = requerido(d, 'escritura_hipoteca_numero', 'número de la escritura de hipoteca');
    const fecha = requerido(d, 'escritura_hipoteca_fecha', 'fecha de la escritura de hipoteca');
    const notaria = requerido(d, 'escritura_hipoteca_notaria', 'notaría de la escritura de hipoteca');
    const valor = numeroRequerido(d, 'valor_hipoteca', 'valor garantizado por la hipoteca');
    const sinCuantia = d.sin_cuantia !== false;
    const c = comparecencia([acreedor]);
    const m = acreedor.genero_gramatical === 'M';
    const deudoresDe = deudores.length > 1
      ? `de los señores ${unirNombres(deudores.map((x) => x.nombre))}`
      : `${deudores[0].genero === 'F' ? 'de la señora' : 'del señor'} ${deudores[0].nombre}`;
    return {
      a: {
        acreedor, inmueble,
        comparecencia_acreedor: c.texto,
        acreedor_del: m ? 'del' : 'de la', acreedor_al: m ? 'al' : 'a la', acreedor_el: m ? 'el' : 'la', acreedor_El: m ? 'El' : 'La',
        deudores_texto: unirNombres(deudores.map((x) => `${trato(x)} ${x.nombre}, ${x.identificacion_corta}`)),
        deudores_de_cargo: deudoresDe,
        escritura_hipoteca_texto: `${numero} del ${fechaCorta(fecha)}, otorgada en ${notaria}`,
        valor_hipoteca_letras: pesosEnLetras(valor),
        sin_cuantia: sinCuantia,
        minuta_presentada: d.minuta_presentada !== false,
      },
      especificacion: [{ acto: 'CANCELACION HIPOTECA', valor: sinCuantia ? 'SIN CUANTIA' : formatoPesos(valor) }],
      unidades: c.unidades,
      firmantesAdicionales: [],
      inmuebles: [inmueble],
      comprobantes: comprobantesPersonas([acreedor]),
    };
  },
};

const constitucionAfectacion: DefinicionActo = {
  id: 'constitucion_afectacion', nombre: 'Constitución de afectación a vivienda familiar', plantilla: 'constitucion_afectacion',
  enajenacion: false, registro: true, libroVarios: false,
  preparar(d, h) {
    const propietario = h.persona(d.propietario_id, 'propietario(a)');
    const conyuge = h.persona(d.conyuge_id, 'cónyuge o compañero(a) permanente');
    const inmueble = h.inmueble(d.inmueble_id, 'inmueble');
    const conyuges = [propietario, conyuge];
    const c = comparecencia(conyuges);
    return {
      a: { propietario, conyuge, conyuges, inmueble, comparecencia: c.texto, manifesto: c.manifesto },
      especificacion: [{ acto: 'AFECTACION A VIVIENDA FAMILIAR', valor: 'SIN CUANTIA' }],
      unidades: c.unidades, firmantesAdicionales: [], inmuebles: [inmueble],
      comprobantes: [inmueble.comprobante_paz_salvo, 'Fotocopias de las cédulas de ciudadanía correspondientes.', ...comprobantesPersonas(conyuges)].filter((x): x is string => !!x),
    };
  },
};

const cancelacionAfectacion: DefinicionActo = {
  id: 'cancelacion_afectacion', nombre: 'Cancelación de afectación a vivienda familiar', plantilla: 'cancelacion_afectacion',
  enajenacion: false, registro: true, libroVarios: false,
  preparar(d, h) {
    const propietario = h.persona(d.propietario_id, 'propietario(a)');
    const conyuge = h.persona(d.conyuge_id, 'cónyuge o compañero(a) permanente');
    const inmueble = h.inmueble(d.inmueble_id, 'inmueble');
    const conyuges = [propietario, conyuge];
    const c = comparecencia(conyuges);
    const forma = d.forma_afectacion === 'VOLUNTARIA' ? 'VOLUNTARIA' : 'LEY';
    return {
      a: {
        propietario, conyuge, conyuges, inmueble, comparecencia: c.texto, manifesto: c.manifesto,
        escritura_afectacion_texto: ORIGEN_ESCRITURA(inmueble),
        escritura_afectacion_corta: texto(d.escritura_afectacion_texto) || ORIGEN_ESCRITURA(inmueble),
        forma_afectacion_texto: forma === 'LEY' ? 'POR MINISTERIO DE LA LEY (ART. 6 INCISO 2 LEY 258 DE 1996)' : '',
      },
      especificacion: [{ acto: 'CANCELACION AFECTACION A VIVIENDA FAMILIAR', valor: 'SIN CUANTIA' }],
      unidades: c.unidades, firmantesAdicionales: [], inmuebles: [inmueble],
      comprobantes: ['Fotocopias de las cédulas de ciudadanía correspondientes.', ...comprobantesPersonas(conyuges)],
    };
  },
};

interface Hijo { nombre: string; genero?: 'M' | 'F'; mayor_de_edad?: boolean }

const cancelacionPatrimonio: DefinicionActo = {
  id: 'cancelacion_patrimonio', nombre: 'Cancelación de patrimonio de familia inembargable', plantilla: 'cancelacion_patrimonio',
  enajenacion: false, registro: true, libroVarios: false,
  preparar(d, h) {
    const propietario = h.persona(d.propietario_id, 'propietario(a) que constituyó el patrimonio');
    const inmueble = h.inmueble(d.inmueble_id, 'inmueble');
    const hijos = (Array.isArray(d.hijos) ? d.hijos : []) as Hijo[];
    if (!hijos.length) throw new ErrorDatos(['hijos beneficiarios del patrimonio de familia']);
    const cita = requerido(d, 'beneficiarios_cita', 'beneficiarios según la escritura de constitución (cita textual)');
    const c = comparecencia([propietario]);
    const genero = hijos.every((x) => x.genero === 'F') ? 'F' : 'M';
    const plural = hijos.length > 1;
    const hijosTexto = `${cantidadTexto(hijos.length)} ${flexionar('hijo', genero, plural)} de ${plural ? 'nombres' : 'nombre'} ${unirNombres(hijos.map((x) => x.nombre.toUpperCase()))}, actualmente ${plural ? 'mayores' : 'mayor'} de edad`;
    return {
      a: {
        propietario, inmueble, hijos, comparecencia: c.texto, manifesto: c.manifesto,
        escritura_constitucion_corta: texto(d.escritura_constitucion_texto) || ORIGEN_ESCRITURA(inmueble),
        beneficiarios_cita: cita,
        hijos_texto: hijosTexto,
      },
      especificacion: [{ acto: 'CANCELACION PATRIMONIO DE FAMILIA', valor: 'SIN CUANTIA' }],
      unidades: c.unidades, firmantesAdicionales: [], inmuebles: [inmueble],
      comprobantes: ['Fotocopias de las cédulas de ciudadanía correspondientes.', `Registros civiles de nacimiento de ${unirNombres(hijos.map((x) => x.nombre.toUpperCase()))}.`, ...comprobantesPersonas([propietario])],
    };
  },
};

const cancelacionCondicion: DefinicionActo = {
  id: 'cancelacion_condicion', nombre: 'Cancelación de condición resolutoria', plantilla: 'cancelacion_condicion',
  enajenacion: false, registro: true, libroVarios: false,
  preparar(d, h) {
    const propietario = h.persona(d.propietario_id, 'propietario(a) actual');
    const inmueble = h.inmueble(d.inmueble_id, 'inmueble');
    const plazo = Number(d.plazo_anios);
    if (plazo !== 2 && plazo !== 5) throw new ErrorDatos(['plazo de la condición resolutoria (2 o 5 años)']);
    const clausula = requerido(d, 'clausula', 'cláusula de la escritura donde se pactó la condición');
    const anotacion = requerido(d, 'anotacion', 'número de anotación en el certificado de tradición');
    const origen = texto(d.escritura_origen_texto) || ORIGEN_ESCRITURA(inmueble);
    const c = comparecencia([propietario]);
    const plazoTexto = plazo === 2 ? 'dos (2) años' : 'cinco (5) años';
    let conteo: string;
    if (plazo === 2) conteo = `contados a partir del otorgamiento de la escritura pública número ${origen}`;
    else conteo = `contados a partir de la asignación del subsidio realizado mediante ${requerido(d, 'acto_asignacion_subsidio', 'oficio o acta de asignación del subsidio')}`;
    return {
      a: {
        propietario, inmueble, comparecencia: c.texto, manifesto: c.manifesto,
        escritura_origen_texto: origen, escritura_origen_corta: origen, clausula: clausula.toLowerCase(), anotacion,
        causal_texto: plazo === 2
          ? 'la enajenación, durante los dos (2) años siguientes a la fecha de otorgamiento de la escritura pública o la falsedad o imprecisión de los documentos que acreditaron los requisitos de dicha asignación'
          : 'la enajenación o el dejar de residir sin permiso en la vivienda, durante los cinco (5) años siguientes a la asignación del subsidio o la falsedad o imprecisión de los documentos que acreditaron los requisitos de dicha asignación',
        inscripcion_texto: texto(d.inscripcion_texto) || (plazo === 2 ? 'PROHIBICION DE TRANSFERENCIA POR EL TERMINO DE DOS AÑOS' : 'CONDICION RESOLUTORIA EXPRESA PROHIBICION DE ENAJENAR EL INMUEBLE POR ESPACIO DE 5 AÑOS'),
        plazo_texto: plazoTexto,
        conteo_texto: conteo,
      },
      especificacion: [{ acto: 'CANCELACION CONDICION RESOLUTORIA', valor: 'SIN CUANTIA' }],
      unidades: c.unidades, firmantesAdicionales: [], inmuebles: [inmueble],
      comprobantes: ['Fotocopia de la cédula de ciudadanía correspondiente.', ...comprobantesPersonas([propietario])],
    };
  },
};

const derechosHerenciales: DefinicionActo = {
  id: 'derechos_herenciales', nombre: 'Compraventa de derechos herenciales (título universal)', plantilla: 'derechos_herenciales',
  enajenacion: true, registro: false, libroVarios: false,
  preparar(d, h) {
    const vendedores = h.personas(d.vendedores, 'heredero(s) vendedor(es)');
    const compradores = h.personas(d.compradores, 'comprador(es)');
    const precio = numeroRequerido(d, 'precio', 'precio de la venta');
    const causante = {
      nombre: requerido(d, 'causante_nombre', 'nombre del causante').toUpperCase(),
      documento: requerido(d, 'causante_documento', 'cédula del causante'),
      fecha_defuncion: fechaCorta(requerido(d, 'causante_fecha_defuncion', 'fecha de defunción')),
      lugar_defuncion: requerido(d, 'causante_lugar_defuncion', 'lugar de defunción'),
    };
    const parentesco = requerido(d, 'parentesco', 'parentesco del vendedor con el causante');
    const generoCausante = d.causante_genero === 'F' ? 'F' : 'M';
    const cv = comparecencia(vendedores);
    const plural = vendedores.length > 1;
    const formaPago = texto(d.forma_pago_texto) ||
      `suma que ${articuloSustantivo(vendedores, 'vendedor')} ${plural ? 'manifiestan' : 'manifiesta'} haber recibido en su totalidad a entera satisfacción de manos ${generoGrupo(compradores) === 'F' && compradores.length === 1 ? 'de la compradora' : compradores.length > 1 ? 'de los compradores' : 'del comprador'}.`;
    const porcentaje = texto(d.porcentaje);
    return {
      a: {
        vendedores, compradores, otorgantes: [...vendedores, ...compradores], causante,
        comparecencia_vendedores: cv.texto, manifesto_vendedores: cv.manifesto,
        compradores_identificacion: identificacionGrupo(compradores),
        objeto_texto: porcentaje
          ? `el ${porcentaje} de los derechos y acciones que a título universal ${plural ? 'les' : 'le'} corresponda o pueda corresponder`
          : `todos los derechos y acciones que a título universal ${plural ? 'les' : 'le'} corresponda o pueda corresponder`,
        parentesco_causante: `su ${generoCausante === 'F' ? 'extinta' : 'extinto'} ${parentesco}`,
        precio_letras: pesosEnLetras(precio),
        forma_pago_texto: formaPago,
        aceptacion_compradores: aceptacion(compradores),
      },
      especificacion: [{ acto: 'COMPRAVENTA DERECHOS HERENCIALES TITULO UNIVERSAL', valor: formatoPesos(precio) }],
      unidades: [...cv.unidades, ...unidadesComparecencia(compradores)],
      firmantesAdicionales: [], inmuebles: [],
      comprobantes: ['Fotocopias de las cédulas de ciudadanía correspondientes.', `Registro civil de defunción de ${causante.nombre}.`, 'Registros civiles de nacimiento que acreditan el parentesco.', ...comprobantesPersonas([...vendedores, ...compradores])],
    };
  },
};

const salidaPaisMenor: DefinicionActo = {
  id: 'salida_pais_menor', nombre: 'Autorización de salida del país de menor de edad', plantilla: 'salida_pais_menor',
  enajenacion: false, registro: false, libroVarios: false,
  preparar(d, h) {
    const otorgante = h.persona(d.otorgante_id, 'padre o madre que autoriza');
    const menor = h.persona(d.menor_id, 'menor de edad');
    const acompanante = h.persona(d.acompanante_id, 'persona que acompaña al menor');
    if (!menor.menor_de_edad) throw new ErrorDatos(['la persona autorizada a viajar debe registrarse como menor de edad']);
    const conAceptacion = d.con_aceptacion !== false;
    const c = comparecencia([otorgante]);
    return {
      a: {
        otorgante, menor, acompanante, comparecencia: c.texto,
        parentesco_otorgante: otorgante.genero === 'F' ? 'madre' : 'padre',
        parentesco_acompanante: texto(d.parentesco_acompanante) || (acompanante.genero === 'F' ? 'madre' : 'padre'),
        paises_texto: requerido(d, 'paises_texto', 'países de destino'),
        proposito: requerido(d, 'proposito', 'propósito del viaje').toUpperCase(),
        fecha_inicio: fechaCorta(requerido(d, 'fecha_inicio', 'fecha desde la cual se autoriza')),
        vigencia_hasta: fechaCorta(requerido(d, 'vigencia_hasta', 'fecha hasta la cual se autoriza')),
        con_aceptacion: conAceptacion,
        facultades_adicionales: texto(d.facultades_adicionales),
      },
      especificacion: [{ acto: 'AUTORIZACION SALIDA DEL PAIS A MENOR DE EDAD', valor: 'SIN CUANTIA' }],
      unidades: c.unidades,
      firmantesAdicionales: conAceptacion ? [acompanante] : [],
      inmuebles: [],
      comprobantes: ['Fotocopias de las cédulas de ciudadanía correspondientes.', `Registro civil de nacimiento de ${menor.nombre}.`],
    };
  },
};

interface OficioDatos { destinatario: string; registro: 'NACIMIENTO' | 'MATRIMONIO'; persona?: string; oficina: 'NOTARIA' | 'REGISTRADURIA'; ubicacion: string; fecha: string }

const divorcioCivil: DefinicionActo = {
  id: 'divorcio_civil', nombre: 'Divorcio de matrimonio civil y liquidación de la sociedad conyugal (en ceros)', plantilla: 'divorcio_civil', anexo: 'oficios_registro',
  enajenacion: false, registro: false, libroVarios: true,
  preparar(d, h) {
    const conyuges = h.personas(d.conyuges, 'cónyuges');
    if (conyuges.length !== 2) throw new ErrorDatos(['deben registrarse los dos cónyuges']);
    const apoderado = h.persona(d.apoderado_id, 'apoderado(a) abogado(a)');
    if (!apoderado.tarjeta_profesional) throw new ErrorDatos(['tarjeta profesional del apoderado']);
    const [x, y] = conyuges;
    const comparecenciaTexto = `Compareció quien dijo ser, ${apoderado.nombre}, ${apoderado.identificacion_apoderado}, quien obra en nombre y en representación de ${x.nombre}, ${x.identificacion_apoderado} y ${y.nombre}, ${y.identificacion_apoderado}, estado civil CASADOS ENTRE SI, CON SOCIEDAD CONYUGAL VIGENTE, en virtud del poder especial otorgado, de cuya vigencia y términos se hace plenamente responsable, documento que se adjunta para su protocolización`;
    const hijos = d.hijos === 'MAYORES' ? 'MAYORES' : d.hijos === 'MENORES' ? 'MENORES' : 'NINGUNO';
    const hijosTexto = hijos === 'NINGUNO' ? 'En dicho matrimonio no hubo procreación de hijos.' : requerido(d, 'hijos_texto', 'descripción de los hijos del matrimonio');
    const personasTexto = unirNombres(conyuges.map((p) => p.nombre));
    const oficiosDatos = (Array.isArray(d.oficios) ? d.oficios : []) as OficioDatos[];
    return {
      a: {
        conyuges, apoderado, comparecencia: comparecenciaTexto,
        matrimonio_fecha: fechaCorta(requerido(d, 'matrimonio_fecha', 'fecha del matrimonio')),
        matrimonio_lugar: requerido(d, 'matrimonio_lugar', 'lugar de celebración del matrimonio'),
        matrimonio_inscripcion: fechaCorta(requerido(d, 'matrimonio_inscripcion', 'fecha de inscripción del matrimonio')),
        matrimonio_serial: requerido(d, 'matrimonio_serial', 'indicativo serial del registro de matrimonio'),
        matrimonio_registro: requerido(d, 'matrimonio_registro', 'oficina donde está inscrito el matrimonio'),
        hijos_texto: hijosTexto,
        acuerdo: requerido(d, 'acuerdo', 'texto del acuerdo firmado por los cónyuges'),
        alimentos: d.alimentos === true,
      },
      especificacion: [
        { acto: 'DIVORCIO MATRIMONIO CIVIL', valor: 'SIN CUANTIA' },
        { acto: 'DISOLUCION Y LIQUIDACIÓN DE LA SOCIEDAD CONYUGAL', valor: 'SIN CUANTIA' },
      ],
      unidades: [{ firmante: apoderado, representados: conyuges, tipo: 'APODERADO' }],
      firmantesAdicionales: [], inmuebles: [],
      comprobantes: [
        'Fotocopias de las cédulas de ciudadanía correspondientes.',
        `Registros civiles de nacimiento de ${personasTexto}.`,
        `Registro civil de matrimonio de ${personasTexto}.`,
        'La respectiva petición.', 'Acuerdo correspondiente.',
        `Poder especial otorgado a ${apoderado.nombre}.`,
      ],
      oficios: oficiosDatos.map((o) => ({
        destinatario: o.destinatario.toUpperCase(),
        acto_texto: 'el DIVORCIO DE MATRIMONIO CIVIL Y DISOLUCION Y LIQUIDACION DE LA SOCIEDAD CONYUGAL',
        personas: personasTexto,
        registro_texto: `${o.registro === 'MATRIMONIO' ? 'registro civil de matrimonio' : `registro civil de nacimiento de ${(o.persona ?? '').toUpperCase()}`}, se encuentra inscrito en ${o.oficina === 'NOTARIA' ? 'esa Notaria' : 'esa Registraduría'}, ${o.ubicacion} de fecha ${fechaCorta(o.fecha)}`,
      })),
    };
  },
};

export const ACTOS: Record<string, DefinicionActo> = Object.fromEntries(
  [compraventa, cancelacionHipoteca, constitucionAfectacion, cancelacionAfectacion, cancelacionPatrimonio,
    cancelacionCondicion, derechosHerenciales, salidaPaisMenor, divorcioCivil].map((a) => [a.id, a]),
);

/** Ids de plantilla de los bloques comunes */
export const BLOQUES_COMUNES = ['caratula', 'cierre'] as const;

/** Formato del número de escritura en los oficios */
export const numeroCorto = (n?: number) => (n ? formatoMiles(n) : '______');
