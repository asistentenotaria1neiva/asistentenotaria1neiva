/**
 * Actos por plantilla: cada tipo de escritura sin formulario propio (hoy, todos menos la
 * compraventa) se vuelve un acto en cuanto tiene una plantilla APROBADA.
 *
 * La plantilla NO se llena: es el modelo de redacción de ese tipo de escritura (una escritura de la
 * notaría, con su estructura, sus cláusulas y su forma de decir las cosas). La IA la toma como base
 * y redacta la escritura del caso con los datos de los documentos, del expediente y las respuestas
 * del asistente (src/lib/servicios/redaccion.ts). Por eso el formulario del acto es mínimo:
 *   - quiénes comparecen y, si el acto recae sobre inmuebles, cuáles (así las preguntas de datos de
 *     personas e inmuebles se limitan a los de esta escritura);
 *   - indicaciones libres para la redacción (opcional).
 * Lo demás que el caso necesite lo pregunta el asistente en texto libre, después de leer el modelo.
 */
import type { EsquemaActo } from './esquemas';
import type { DefinicionActo, ActoPreparado, Ayudas } from './actos';
import type { DatosActo, DatosEscritura } from './tipos';
import type { ConfigNotaria } from './contexto';
import { unidadesComparecencia, ErrorDatos } from './personas';
import { numeroEscrituraEnLetras, fechaEnLetras, fechaCorta, enteroALetras } from '../texto/numeros-a-letras';

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

/**
 * Datos que pone el sistema (notaría) o que quedan para la terminación de la escritura (número,
 * fecha, hojas, derechos…). La redacción los recibe ya escritos; los vacíos quedan en blanco.
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
/** Nombres de los datos que pone el sistema (notaría y terminación) */
export const VARIABLES_AUTOMATICAS = Object.keys(valoresAutomaticos({}, { codigo: '', titular: '', resolucion_tarifas: '' }));

/** Campo libre del acto con indicaciones del funcionario para la redacción */
export const CAMPO_INDICACIONES = 'indicaciones_redaccion';

export interface TipoParaActo { id: string; nombre: string; categoria: string }

/** Formulario y definición del acto a partir de su plantilla aprobada (el modelo de redacción) */
export function actoDesdePlantilla(tipo: TipoParaActo, plantilla: { id: string; version: number }): { esquema: EsquemaActo; acto: DefinicionActo } {
  const sobreInmuebles = /inmueble/i.test(tipo.categoria);
  const esquema: EsquemaActo = {
    tipo: tipo.id, version: plantilla.version, titulo: tipo.nombre, plantillaFuente: `Plantilla aprobada v${plantilla.version} (modelo de redacción)`,
    porPlantilla: { plantillaId: plantilla.id, version: plantilla.version },
    pasos: [{
      id: tipo.id, titulo: tipo.nombre,
      descripcion: 'La IA redacta esta escritura tomando como base la plantilla aprobada por el notario, con los datos de los documentos, del expediente y de las respuestas del asistente.',
      campos: [
        { id: 'comparecientes', etiqueta: 'Personas que comparecen u otorgan en este acto', tipo: 'personas', obligatorio: true, ayuda: 'Todas las que intervienen en la escritura (por sí o representadas). Su papel en el acto (vendedor, deudor, cónyuge…) lo precisa el asistente.' },
        ...(sobreInmuebles ? [{ id: 'inmuebles', etiqueta: 'Inmuebles objeto del acto', tipo: 'inmuebles' as const, obligatorio: true }] : []),
        { id: CAMPO_INDICACIONES, etiqueta: 'Indicaciones para la redacción (opcional)', tipo: 'textoLargo', ayuda: 'Lo que la IA debe tener en cuenta al redactar y que no está en los documentos: una cláusula especial, una aclaración, cómo comparece alguien…' },
      ],
    }],
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
    preparar(d: DatosActo, h: Ayudas): ActoPreparado {
      const personas = h.personas(d.comparecientes, 'Personas que comparecen');
      // Los inmuebles solo se identifican: la IA redacta con todos sus datos (no se exige la ficha completa de la compraventa)
      if (sobreInmuebles) {
        const ids = Array.isArray(d.inmuebles) ? d.inmuebles : [];
        if (!ids.length) throw new ErrorDatos(['Inmuebles objeto del acto'], ['inmuebles']);
        if (ids.some((id) => !h.datos.inmuebles.some((i) => i.id === id))) throw new ErrorDatos(['Inmuebles objeto del acto: el inmueble seleccionado ya no existe'], ['inmuebles']);
      }
      return {
        a: {}, especificacion: [{ acto: tipo.nombre.toUpperCase(), valor: '' }],
        unidades: unidadesComparecencia(personas),
        firmantesAdicionales: [], inmuebles: [], comprobantes: [],
      };
    },
  };
  return { esquema, acto };
}
