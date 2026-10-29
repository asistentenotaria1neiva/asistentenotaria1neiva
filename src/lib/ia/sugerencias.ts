/**
 * Convierte los hechos extraídos de un documento en sugerencias para el formulario.
 * El mapeo es determinista (código, no IA): la IA solo lee; aquí se decide qué campo
 * del formulario corresponde a cada dato.
 *
 * Campo de destino:
 *   persona:<documento>.<campo>      → una persona identificada por su número de documento
 *   inmueble:<matrícula>.<campo>     → un inmueble identificado por su matrícula
 *   catastral:<cédula>.<campo>       → un inmueble identificado por su cédula catastral (paz y salvo)
 *   acto:<id>.<campo>                → un campo de un acto
 *
 * Cada sugerencia queda marcada para revisión manual si la confianza es BAJA o si el
 * valor no pasa la validación de formato. Nunca se aplica sola: el usuario la acepta o corrige.
 */
import { cedulasDe, type DatoConFuente, type ResultadoExtraccion, type TipoDocumental } from './documentos';
import { validarCedula, validarMatricula, validarCedulaCatastral, validarNit, validarFecha, validarNuip } from '../validaciones/formatos';

export interface Sugerencia {
  campo: string;
  valor: unknown;
  pagina: number | null;
  fragmento: string | null;
  confianza: 'ALTA' | 'MEDIA' | 'BAJA';
  revisionManual: boolean;
  motivoRevision?: string;
}

const digitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');

function crear(campo: string, d: DatoConFuente | undefined, transformar?: (v: unknown) => unknown, validar?: (v: string) => { ok: boolean; error?: string }): Sugerencia | null {
  if (!d || d.valor === null || d.valor === undefined || d.valor === '') return null;
  const valor = transformar ? transformar(d.valor) : d.valor;
  const r = validar ? validar(String(valor)) : { ok: true };
  const revision = d.confianza === 'BAJA' || !r.ok;
  return {
    campo, valor, pagina: d.pagina, fragmento: d.fragmento, confianza: d.confianza, revisionManual: revision,
    ...(revision ? { motivoRevision: d.confianza === 'BAJA' ? 'Confianza baja: el documento es dudoso o poco legible.' : r.error } : {}),
  };
}

const may = (v: unknown) => String(v).toUpperCase().replace(/\s+/g, ' ').trim();
const fecha10 = (v: unknown) => String(v).slice(0, 10);
const genero = (v: unknown) => (/^F/i.test(String(v)) ? 'F' : /^M/i.test(String(v)) ? 'M' : null);

/**
 * Cédula catastral: si la IA contó mal los dígitos al quitar los guiones (una longitud que no
 * existe), se toman del fragmento literal, que la trae con sus guiones.
 */
export function catastral(d: DatoConFuente | undefined): DatoConFuente | undefined {
  if (!d?.valor || validarCedulaCatastral(String(d.valor)).ok) return d;
  const delFragmento = (d.fragmento?.match(/\d[\d .-]{13,}\d/g) ?? []).map(digitos).find((x) => validarCedulaCatastral(x).ok);
  return delFragmento ? { ...d, valor: delFragmento } : d;
}

function edad(fechaNac: string, hoy: Date): number {
  const [a, m, d] = fechaNac.split('-').map(Number);
  let e = hoy.getFullYear() - a;
  if (hoy.getMonth() + 1 < m || (hoy.getMonth() + 1 === m && hoy.getDate() < d)) e--;
  return e;
}

export function sugerenciasDesdeHechos(tipo: TipoDocumental, r: ResultadoExtraccion, hoy = new Date()): Sugerencia[] {
  const D = (k: string) => r.datos[k] as DatoConFuente | undefined;
  const s: (Sugerencia | null)[] = [];
  const tipoReal = r.tipo_detectado ?? tipo;

  switch (tipoReal) {
    case 'CEDULA': {
      // Una persona por cada cédula del documento (un PDF puede traer varias)
      for (const c of cedulasDe(r.datos)) {
        const num = digitos(c.numero?.valor);
        if (!num) continue;
        const p = `persona:${num}`;
        const nom = c.nombres, ape = c.apellidos;
        if (nom?.valor || ape?.valor) {
          const peor = [nom?.confianza, ape?.confianza].includes('BAJA') ? 'BAJA' : [nom?.confianza, ape?.confianza].includes('MEDIA') ? 'MEDIA' : 'ALTA';
          s.push(crear(`${p}.nombre`, { valor: `${nom?.valor ?? ''} ${ape?.valor ?? ''}`, pagina: nom?.pagina ?? ape?.pagina ?? null, fragmento: [nom?.fragmento, ape?.fragmento].filter(Boolean).join(' / '), confianza: peor }, may));
        }
        s.push({ campo: `${p}.tipo_documento`, valor: 'CC', pagina: c.numero?.pagina ?? null, fragmento: null, confianza: 'ALTA', revisionManual: false });
        s.push(crear(`${p}.numero_documento`, c.numero, (v) => validarCedula(String(v)).normalizado ?? v, validarCedula));
        s.push(crear(`${p}.lugar_expedicion`, c.lugar_expedicion, (v) => String(v).trim()));
        s.push(crear(`${p}.genero`, c.sexo, genero));
      }
      break;
    }
    case 'REGISTRO_CIVIL_NACIMIENTO': {
      const num = digitos(D('nuip')?.valor);
      if (!num) break;
      const p = `persona:${num}`;
      s.push(crear(`${p}.nombre`, D('nombre'), may));
      s.push({ campo: `${p}.tipo_documento`, valor: 'NUIP', pagina: D('nuip')?.pagina ?? null, fragmento: null, confianza: 'ALTA', revisionManual: false });
      s.push(crear(`${p}.numero_documento`, D('nuip'), (v) => validarNuip(String(v)).normalizado ?? v, validarNuip));
      s.push(crear(`${p}.genero`, D('sexo'), genero));
      const fn = D('fecha_nacimiento');
      if (fn?.valor && /^\d{4}-\d{2}-\d{2}/.test(String(fn.valor))) {
        s.push(crear(`${p}.menor_de_edad`, fn, (v) => edad(fecha10(v), hoy) < 18));
      }
      break;
    }
    case 'CERTIFICADO_TRADICION': {
      const mat = D('matricula')?.valor ? String(D('matricula')!.valor).toUpperCase().replace(/\s/g, '') : '';
      if (!mat) break;
      const i = `inmueble:${mat}`;
      s.push(crear(`${i}.matricula`, D('matricula'), () => mat, (v) => validarMatricula(v)));
      s.push(crear(`${i}.cedula_catastral`, catastral(D('cedula_catastral')), digitos, validarCedulaCatastral));
      s.push(crear(`${i}.direccion`, D('direccion'), may));
      s.push(crear(`${i}.municipio`, D('municipio'), (v) => String(v).trim()));
      s.push(crear(`${i}.fecha_certificado_tradicion`, D('fecha_impresion'), fecha10, (v) => validarFecha(v)));
      s.push(crear(`${i}.linderos`, D('linderos'), (v) => String(v).trim()));
      s.push(crear(`${i}.area_terreno`, D('area_terreno'), Number));
      s.push(crear(`${i}.area_construida`, D('area_construida'), Number));
      // Los titulares actuales (quienes venden): su documento y su nombre
      for (const p of (r.datos.propietarios as Record<string, DatoConFuente>[] | undefined) ?? []) {
        const num = digitos(p.documento?.valor);
        if (!num) continue;
        s.push(crear(`persona:${num}.nombre`, p.nombre, may));
        s.push(crear(`persona:${num}.numero_documento`, p.documento, (v) => validarCedula(String(v)).normalizado ?? v));
      }
      const ua = r.datos.ultima_adquisicion as Record<string, DatoConFuente> | undefined;
      if (ua) {
        s.push(crear(`${i}.tradicion.tradente`, ua.de, may));
        s.push(crear(`${i}.tradicion.escritura_numero`, ua.escritura_numero, (v) => digitos(v)));
        s.push(crear(`${i}.tradicion.escritura_fecha`, ua.escritura_fecha, fecha10, (v) => validarFecha(v)));
        s.push(crear(`${i}.tradicion.notaria`, ua.notaria, (v) => String(v).trim()));
      }
      break;
    }
    case 'PAZ_Y_SALVO': {
      const dc = catastral(D('cedula_catastral'));
      const cat = digitos(dc?.valor);
      if (!cat) break;
      const c = `catastral:${cat}`;
      s.push(crear(`${c}.cedula_catastral_paz_salvo`, dc, digitos, validarCedulaCatastral));
      // Vale también como cédula del inmueble si el certificado no la trae (el certificado manda)
      s.push(crear(`${c}.cedula_catastral`, dc, digitos, validarCedulaCatastral));
      s.push(crear(`${c}.paz_salvo.vigencia_hasta`, D('vigencia_hasta'), fecha10, (v) => validarFecha(v)));
      s.push(crear(`${c}.paz_salvo.avaluo`, D('avaluo'), (v) => Number(digitos(v))));
      s.push(crear(`${c}.paz_salvo.entidad`, D('entidad'), (v) => String(v).trim()));
      break;
    }
    case 'ESCRITURA_ANTERIOR': {
      // Cada inmueble descrito, por su matrícula (o su cédula catastral). Solo se llevan los que
      // también tiene el expediente: los demás inmuebles del título no son de esta escritura.
      const lista = Array.isArray(r.datos.inmuebles) ? (r.datos.inmuebles as Record<string, DatoConFuente>[]) : [r.datos as Record<string, DatoConFuente>];
      for (const x of lista) {
        const mat = x.matricula?.valor ? String(x.matricula.valor).toUpperCase().replace(/\s/g, '') : '';
        const cat = digitos(catastral(x.cedula_catastral)?.valor);
        const i = mat ? `inmueble:${mat}` : cat ? `catastral:${cat}` : '';
        if (!i) continue;
        s.push(crear(`${i}.linderos`, x.linderos, (v) => String(v).trim()));
        s.push(crear(`${i}.area_terreno`, x.area_terreno, Number));
        s.push(crear(`${i}.area_construida`, x.area_construida, Number));
      }
      break;
    }
    case 'PODER': {
      const num = digitos(D('apoderado_documento')?.valor);
      if (!num) break;
      const p = `persona:${num}`;
      s.push(crear(`${p}.nombre`, D('apoderado_nombre'), may));
      s.push(crear(`${p}.numero_documento`, D('apoderado_documento'), (v) => validarCedula(String(v)).normalizado ?? v, validarCedula));
      s.push(crear(`${p}.tarjeta_profesional`, D('apoderado_tarjeta_profesional'), digitos));
      break;
    }
    case 'CERTIFICADO_EXISTENCIA': {
      const nit = digitos(D('nit')?.valor);
      if (nit) {
        const p = `persona:${nit}`;
        s.push({ campo: `${p}.tipo_persona`, valor: 'JURIDICA', pagina: D('nit')?.pagina ?? null, fragmento: null, confianza: 'ALTA', revisionManual: false });
        s.push({ campo: `${p}.tipo_documento`, valor: 'NIT', pagina: D('nit')?.pagina ?? null, fragmento: null, confianza: 'ALTA', revisionManual: false });
        s.push(crear(`${p}.nombre`, D('razon_social'), may));
        s.push(crear(`${p}.numero_documento`, D('nit'), (v) => validarNit(String(v)).normalizado ?? v, validarNit));
        s.push(crear(`${p}.constitucion_texto`, D('constitucion'), (v) => String(v).trim()));
      }
      const rep = digitos(D('representante_documento')?.valor);
      if (rep) {
        s.push(crear(`persona:${rep}.nombre`, D('representante_nombre'), may));
        s.push(crear(`persona:${rep}.numero_documento`, D('representante_documento'), (v) => validarCedula(String(v)).normalizado ?? v, validarCedula));
      }
      break;
    }
    default:
      break;
  }
  // Documento ilegible: todo a revisión manual
  return s.filter((x): x is Sugerencia => !!x).map((x) => (r.legible === false ? { ...x, revisionManual: true, motivoRevision: 'El documento no es legible con seguridad.' } : x));
}
