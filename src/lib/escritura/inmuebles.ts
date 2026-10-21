/**
 * Fórmulas de descripción, tradición y soportes de los inmuebles, tomadas de las escrituras:
 *   descripción y linderos ... F52 (410)   "Lote de terreno ubicado en la …, con área de …, determinado por los siguientes linderos:"
 *   propiedad horizontal ..... F11 (2 - BIFAMILIAR) / F18 (255)
 *   tradición ................ F52 "por compra hecha a …, mediante escritura pública número … del …, otorgada en …"
 *   paz y salvo .............. F52 y F11 (cédula catastral involucrada en mayor extensión)
 */
import type { Inmueble } from './tipos';
import { medidaEnLetras, fechaCorta, formatoPesos } from '../texto/numeros-a-letras';

export interface InmueblePreparado extends Inmueble {
  municipio_texto: string;
  descripcion_completa: string;
  nombre_corto_mayus: string;
  nombre_corto: string;
  identificado_como: string;
  orip_ciudad: string;
  catastral: string;
  catastral_paz_salvo?: string;
  catastral_tradicion: string;
  tradicion_texto: string;
  modo_y_tradente: string;
  titulo_adquisicion_texto: string;
  fecha_certificado: string;
  ph_texto?: string;
  ph: Inmueble['ph'];
  involucrada: boolean;
  comprobante_paz_salvo?: string;
}

const CIUDADES = new Set(['NEIVA', 'BOGOTÁ D.C.', 'BOGOTA D.C.', 'BOGOTÁ', 'BOGOTA']);
const titulo = (s: string) => s.toLowerCase().replace(/(^|\s|-)(\p{L})/gu, (m) => m.toUpperCase());

const TIPO_TEXTO: Record<Inmueble['tipo_inmueble'], string> = {
  LOTE: 'Lote de terreno', CASA: 'Lote de terreno', APARTAMENTO: 'Apartamento', LOCAL: 'Local comercial',
  BODEGA: 'Bodega', PARQUEADERO: 'Parqueadero', DEPOSITO: 'Depósito', 'PREDIO RURAL': 'Predio rural', MEJORAS: 'Mejoras consistentes en construcción',
};

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
/** "31 de Diciembre de 2026" (formato de vigencia de los paz y salvos) */
export function fechaVigencia(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2, '0')} de ${MESES[m - 1]} de ${a}`;
}

export function municipioTexto(municipio: string, departamento: string): string {
  const m = municipio.trim();
  return CIUDADES.has(m.toUpperCase())
    ? `la ciudad de ${titulo(m)}, Departamento del ${titulo(departamento)}`
    : `el Municipio de ${titulo(m)}, Departamento del ${titulo(departamento)}`;
}

export function textoTradicion(t: Inmueble['tradicion']): { completo: string; modo: string } {
  const escritura = `mediante escritura pública número ${t.escritura_numero} del ${fechaCorta(t.escritura_fecha)}, otorgada en ${t.notaria}`;
  const modo = {
    COMPRA: `compra hecha a ${t.tradente}`,
    ADJUDICACION_SUCESION: `adjudicación en la sucesión de ${t.tradente}`,
    ADJUDICACION_LIQUIDACION: `adjudicación en la liquidación de ${t.tradente}`,
    DONACION: `donación que le hiciera ${t.tradente}`,
    OTRO: `${t.modo_texto_libre ?? ''} ${t.tradente}`.trim(),
  }[t.modo];
  return { completo: `${modo}, ${escritura}`, modo };
}

export function prepararInmueble(i: Inmueble): InmueblePreparado {
  const municipio_texto = municipioTexto(i.municipio, i.departamento);
  const partes = [`${TIPO_TEXTO[i.tipo_inmueble]} ubicado en la ${i.direccion}, en ${municipio_texto}`];
  if (i.area_terreno) partes.push(`con área de ${medidaEnLetras(i.area_terreno, 'METROS CUADRADOS', 'M2')}`);
  if (i.area_construida) {
    const construccion = i.tipo_inmueble === 'CASA' ? 'la casa de habitación' : 'la construcción';
    partes.push(`junto con ${construccion} que allí existe con área de construcción de ${medidaEnLetras(i.area_construida, 'METROS CUADRADOS', 'M2')}`);
  }
  if (i.descripcion) partes.push(i.descripcion);
  const descripcion_completa = `${partes.join(', ')}, determinado por los siguientes linderos: ${i.linderos.trim()}`;
  const trad = textoTradicion(i.tradicion);
  const orip_ciudad = titulo(i.orip.split('-')[0].trim());
  const catastral_tradicion = i.cedula_catastral_paz_salvo || i.cedula_catastral;
  const nombre_corto = i.nombre_corto?.trim() ?? '';

  let comprobante_paz_salvo: string | undefined;
  if (i.paz_salvo) {
    comprobante_paz_salvo = `Certificados de paz y salvos por concepto de predial unificado${i.paz_salvo.paz_salvo_valorizacion === false ? '' : ' y valorización'} del predio inscrito en el catastro vigente bajo el número ${catastral_tradicion} expedidos por ${i.paz_salvo.entidad}, con vigencia hasta el ${fechaVigencia(i.paz_salvo.vigencia_hasta)}, en el cual consta que el referido inmueble tiene un avalúo de ${formatoPesos(i.paz_salvo.avaluo)}` +
      (i.involucrada_mayor_extension ? '; cuya cédula catastral actualmente se encuentra involucrada en mayor extensión (Inciso 2 Art. 27 de la Ley 14 de 1983, Instrucción Administrativa 4 del 16 de Mayo de 2007 y Circular CIR-2025-000186-4 del 27 de Mayo 2025 de la SNR)' : '') + '.';
  }

  return {
    ...i,
    municipio_texto,
    descripcion_completa,
    nombre_corto,
    nombre_corto_mayus: (nombre_corto || TIPO_TEXTO[i.tipo_inmueble]).toUpperCase(),
    identificado_como: nombre_corto ? `identificado como ${nombre_corto.toUpperCase()}, ` : '',
    orip_ciudad,
    catastral: i.cedula_catastral,
    catastral_paz_salvo: i.cedula_catastral_paz_salvo,
    catastral_tradicion,
    tradicion_texto: trad.completo,
    modo_y_tradente: trad.modo,
    titulo_adquisicion_texto: `${i.tradicion.escritura_numero} del ${fechaCorta(i.tradicion.escritura_fecha)}, otorgada en ${i.tradicion.notaria}`,
    fecha_certificado: fechaCorta(i.fecha_certificado_tradicion),
    ph: i.ph,
    involucrada: !!i.involucrada_mayor_extension,
    ph_texto: i.ph
      ? `El ${i.ph.nombre_copropiedad}, se encuentra sometido al Régimen de Propiedad Horizontal mediante escritura pública número ${i.ph.escritura_numero} del ${fechaCorta(i.ph.escritura_fecha)}, otorgada en ${i.ph.notaria}, inscrita al folio de matrícula inmobiliaria número ${i.matricula_matriz || i.matricula} en la Oficina de Registro de Instrumentos Públicos de ${orip_ciudad}.`
      : undefined,
    comprobante_paz_salvo,
  };
}
