/**
 * Reglas fijas de validación y cruce (secciones 6.2 y 6.3).
 *
 * Son deterministas: se ejecutan siempre, antes y después de la revisión de la IA,
 * y no dependen del modelo. Cada hallazgo tiene un código estable (para medir en el
 * panel de entrenamiento cuáles se repiten y cuáles resultan falsas alarmas).
 *
 * Niveles:
 *   CRITICA ....... bloquea el avance hasta corregir el dato (no se puede justificar)
 *   ADVERTENCIA ... exige corrección o justificación escrita
 *   INFORMATIVA ... sugerencia
 */
import type { DatosExpediente, Persona, Inmueble } from '../escritura/tipos';
import { cedulasDe, type ResultadoExtraccion, type TipoDocumental, type DatoConFuente } from '../ia/documentos';
import {
  validarDocumento, validarMatricula, validarCedulaCatastral, validarFecha,
} from '../validaciones/formatos';
import { MARCA_FALTANTE } from '../escritura/marcas';

export type Nivel = 'CRITICA' | 'ADVERTENCIA' | 'INFORMATIVA';

export interface Hallazgo {
  codigo: string;
  nivel: Nivel;
  mensaje: string;
  campo?: string;
  evidencia?: { documentoId?: string; documento?: string; pagina?: number | null; fragmento?: string | null; detalle?: string };
}

export interface DocumentoAnalizado {
  id: string;
  nombre: string;
  tipo: TipoDocumental;
  hechos?: ResultadoExtraccion | null;
}

export interface EntradaReglas {
  datos: DatosExpediente;
  actos: string[];
  documentos: DocumentoAnalizado[];
  /** Datos extraídos por la IA que siguen pendientes de revisión manual (confianza baja) */
  pendientesConfianzaBaja?: number;
  borradorTexto?: string;
  hoy?: Date;
  config?: { diasVigenciaCertificado?: number; diasAvisoPazSalvo?: number; diasVigenciaCertificadoExistencia?: number };
}

// ------------------------------------------------------------------ utilidades

export const soloDigitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');
export const normalizarNombre = (s: unknown) => String(s ?? '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-ZÑ ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Igualdad de nombres tolerante al orden y a una partícula faltante ("DE", "DEL") */
export function nombresCoinciden(a: unknown, b: unknown): boolean {
  const ta = normalizarNombre(a).split(' ').filter((w) => !['DE', 'DEL', 'LA', 'LOS'].includes(w));
  const tb = normalizarNombre(b).split(' ').filter((w) => !['DE', 'DEL', 'LA', 'LOS'].includes(w));
  if (!ta.length || !tb.length) return false;
  const [corto, largo] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return corto.every((w) => largo.includes(w)) && largo.length - corto.length <= 1;
}

const v = <T = unknown>(h: ResultadoExtraccion | null | undefined, campo: string): DatoConFuente<T> | undefined => {
  const d = h?.datos?.[campo] as DatoConFuente<T> | undefined;
  return d && typeof d === 'object' && 'valor' in d ? d : undefined;
};

const evid = (doc: DocumentoAnalizado, d?: DatoConFuente) => ({
  documentoId: doc.id, documento: doc.nombre, pagina: d?.pagina ?? null, fragmento: d?.fragmento ?? null,
});

const isoHoy = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000);

/** Personas e inmuebles que intervienen en cada acto */
function idsDeActo(acto: string, d: Record<string, unknown>) {
  const arr = (x: unknown) => (Array.isArray(x) ? (x as string[]) : typeof x === 'string' && x ? [x] : []);
  const titulares: string[] = []; // quienes deben figurar como propietarios inscritos
  const inmuebles: string[] = [...arr(d.inmuebles), ...arr(d.inmueble_id)];
  if (acto === 'compraventa') titulares.push(...arr(d.vendedores));
  return { titulares, inmuebles };
}

const ETIQUETA_ANOTACION: Record<string, string> = {
  HIPOTECA: 'una hipoteca', EMBARGO: 'un embargo', AFECTACION_VIVIENDA_FAMILIAR: 'afectación a vivienda familiar',
  PATRIMONIO_FAMILIA: 'patrimonio de familia', CONDICION_RESOLUTORIA: 'una condición resolutoria',
  PROHIBICION_ENAJENAR: 'una prohibición de enajenar', DEMANDA: 'una demanda', USUFRUCTO: 'un usufructo',
};

// ------------------------------------------------------------------ reglas

export function evaluarReglas(e: EntradaReglas): Hallazgo[] {
  const h: Hallazgo[] = [];
  const hoy = isoHoy(e.hoy ?? new Date());
  const fechaRef = e.datos.escritura.fecha_otorgamiento || hoy;
  const cfg = { diasVigenciaCertificado: 30, diasAvisoPazSalvo: 5, diasVigenciaCertificadoExistencia: 30, ...e.config };
  const personas = new Map(e.datos.personas.map((p) => [p.id, p]));
  const inmuebles = new Map(e.datos.inmuebles.map((i) => [i.id, i]));
  const docs = (t: TipoDocumental) => e.documentos.filter((d) => d.hechos && (d.hechos.tipo_detectado ?? d.tipo) === t);
  const enajena = e.actos.includes('compraventa');

  // R01 – Formatos de identificación y duplicados
  const vistos = new Map<string, Persona>();
  for (const p of e.datos.personas) {
    const r = validarDocumento(p.tipo_documento, p.numero_documento);
    if (!r.ok) h.push({ codigo: 'R01-DOCUMENTO', nivel: 'CRITICA', mensaje: `${p.nombre || 'Una persona'}: ${r.error}`, campo: `personas.${p.id}.numero_documento` });
    const k = soloDigitos(p.numero_documento);
    if (k && vistos.has(k)) h.push({ codigo: 'R01-DUPLICADO', nivel: 'CRITICA', mensaje: `${p.nombre} y ${vistos.get(k)!.nombre} tienen el mismo número de documento (${p.numero_documento}).`, campo: `personas.${p.id}.numero_documento` });
    if (k) vistos.set(k, p);
    if (p.tipo_persona === 'NATURAL' && !p.menor_de_edad && !p.estado_civil && personaComparecePropio(p, e)) {
      h.push({ codigo: 'R01-ESTADO-CIVIL', nivel: 'CRITICA', mensaje: `Falta el estado civil de ${p.nombre}.`, campo: `personas.${p.id}.estado_civil` });
    }
  }

  // R02 – Formatos del inmueble
  for (const i of e.datos.inmuebles) {
    const m = validarMatricula(i.matricula);
    if (!m.ok) h.push({ codigo: 'R02-MATRICULA', nivel: 'CRITICA', mensaje: `Inmueble ${i.direccion}: ${m.error}`, campo: `inmuebles.${i.id}.matricula` });
    const c = validarCedulaCatastral(i.cedula_catastral);
    if (!c.ok) h.push({ codigo: 'R02-CATASTRAL', nivel: 'CRITICA', mensaje: `Inmueble ${i.direccion}: ${c.error}`, campo: `inmuebles.${i.id}.cedula_catastral` });
    if (i.cedula_catastral_paz_salvo) {
      const cp = validarCedulaCatastral(i.cedula_catastral_paz_salvo);
      if (!cp.ok) h.push({ codigo: 'R02-CATASTRAL', nivel: 'CRITICA', mensaje: `Cédula catastral del paz y salvo: ${cp.error}`, campo: `inmuebles.${i.id}.cedula_catastral_paz_salvo` });
    }
    for (const [campo, valor] of [['fecha_certificado_tradicion', i.fecha_certificado_tradicion], ['tradicion.escritura_fecha', i.tradicion?.escritura_fecha]] as const) {
      if (valor && !validarFecha(valor, { noFutura: true, hoy: e.hoy }).ok) h.push({ codigo: 'R02-FECHA', nivel: 'CRITICA', mensaje: `Fecha no válida o futura en ${campo} (${valor}).`, campo: `inmuebles.${i.id}.${campo}` });
    }
  }

  // R03 – Certificado de tradición: existencia, titulares, matrícula, antigüedad y gravámenes
  const certs = docs('CERTIFICADO_TRADICION');
  for (const acto of e.actos) {
    const { titulares, inmuebles: idsInm } = idsDeActo(acto, e.datos.actos[acto] ?? {});
    for (const idI of idsInm) {
      const inm = inmuebles.get(idI);
      if (!inm) continue;
      const cert = certs.find((d) => soloDigitos(v(d.hechos, 'matricula')?.valor) === soloDigitos(inm.matricula));
      if (!cert) {
        const otraMatricula = certs.length && certs.every((d) => soloDigitos(v(d.hechos, 'matricula')?.valor) !== soloDigitos(inm.matricula));
        h.push(otraMatricula
          ? { codigo: 'R03-MATRICULA', nivel: 'CRITICA', mensaje: `La matrícula ${inm.matricula} del formulario no coincide con la de ningún certificado de tradición cargado (${certs.map((d) => v(d.hechos, 'matricula')?.valor).join(', ')}).`, campo: `inmuebles.${idI}.matricula` }
          : { codigo: 'R03-SIN-CERTIFICADO', nivel: 'ADVERTENCIA', mensaje: `No se ha cargado el certificado de tradición de la matrícula ${inm.matricula}.`, campo: `inmuebles.${idI}.matricula` });
        continue;
      }
      // Titulares
      const propietarios = (cert.hechos!.datos.propietarios as { nombre: DatoConFuente<string>; documento: DatoConFuente<string> }[] | undefined) ?? [];
      for (const idP of titulares) {
        const p = personas.get(idP);
        if (!p) continue;
        const porDoc = propietarios.find((x) => soloDigitos(x.documento?.valor) && soloDigitos(x.documento.valor) === soloDigitos(p.numero_documento));
        if (!porDoc) {
          const porNombre = propietarios.find((x) => nombresCoinciden(x.nombre?.valor, p.nombre));
          h.push(porNombre
            ? { codigo: 'R03-TITULAR-DOCUMENTO', nivel: 'CRITICA', mensaje: `El documento de ${p.nombre} (${p.numero_documento}) no coincide con el del titular inscrito en el certificado (${porNombre.documento?.valor ?? 'sin documento'}).`, campo: `personas.${idP}.numero_documento`, evidencia: evid(cert, porNombre.documento) }
            : { codigo: 'R03-TITULAR', nivel: 'CRITICA', mensaje: `${p.nombre} no figura como titular inscrito del inmueble ${inm.matricula} en el certificado de tradición.`, campo: `personas.${idP}.nombre`, evidencia: evid(cert, propietarios[0]?.nombre) });
        } else if (!nombresCoinciden(porDoc.nombre?.valor, p.nombre)) {
          h.push({ codigo: 'R03-TITULAR-NOMBRE', nivel: 'ADVERTENCIA', mensaje: `El nombre de ${p.nombre} difiere del inscrito en el certificado ("${porDoc.nombre?.valor}"). Verifique si requiere aclaración.`, campo: `personas.${idP}.nombre`, evidencia: evid(cert, porDoc.nombre) });
        }
      }
      // Antigüedad y fecha del certificado
      const fImp = v<string>(cert.hechos, 'fecha_impresion');
      if (fImp?.valor && /^\d{4}-\d{2}-\d{2}/.test(fImp.valor)) {
        const dias = diasEntre(fImp.valor.slice(0, 10), fechaRef);
        if (dias > cfg.diasVigenciaCertificado) h.push({ codigo: 'R03-CERT-ANTIGUO', nivel: 'ADVERTENCIA', mensaje: `El certificado de tradición de ${inm.matricula} tiene ${dias} días (umbral configurado: ${cfg.diasVigenciaCertificado}).`, evidencia: evid(cert, fImp) });
        if (inm.fecha_certificado_tradicion && inm.fecha_certificado_tradicion !== fImp.valor.slice(0, 10)) {
          h.push({ codigo: 'R03-CERT-FECHA', nivel: 'ADVERTENCIA', mensaje: `La fecha del certificado en el formulario (${inm.fecha_certificado_tradicion}) no coincide con la del documento (${fImp.valor.slice(0, 10)}).`, campo: `inmuebles.${idI}.fecha_certificado_tradicion`, evidencia: evid(cert, fImp) });
        }
      }
      // Cédula catastral del certificado
      const catCert = soloDigitos(v(cert.hechos, 'cedula_catastral')?.valor);
      if (catCert && ![soloDigitos(inm.cedula_catastral), soloDigitos(inm.cedula_catastral_paz_salvo)].some((x) => x && (x.endsWith(catCert) || catCert.endsWith(x)))) {
        h.push({ codigo: 'R03-CATASTRAL', nivel: 'ADVERTENCIA', mensaje: `La cédula catastral del certificado (${catCert}) no corresponde a la del formulario (${inm.cedula_catastral}).`, campo: `inmuebles.${idI}.cedula_catastral`, evidencia: evid(cert, v(cert.hechos, 'cedula_catastral')) });
      }
      // Gravámenes y limitaciones vigentes
      const anotaciones = (cert.hechos!.datos.anotaciones_vigentes as { numero: DatoConFuente<string>; tipo: string; especificacion: DatoConFuente<string> }[] | undefined) ?? [];
      for (const an of anotaciones) {
        if (an.tipo === 'CONDICION_RESOLUTORIA' || an.tipo === 'PROHIBICION_ENAJENAR' || an.tipo === 'EMBARGO' || an.tipo === 'DEMANDA') {
          if (enajena) h.push({ codigo: 'R03-LIMITACION-VIGENTE', nivel: 'CRITICA', mensaje: `El certificado muestra ${ETIQUETA_ANOTACION[an.tipo]} vigente (anotación ${an.numero?.valor ?? '?'}) que la escritura no cancela. Verificar con el notario antes de continuar.`, evidencia: evid(cert, an.especificacion) });
          continue;
        }
        if (['HIPOTECA', 'AFECTACION_VIVIENDA_FAMILIAR', 'PATRIMONIO_FAMILIA', 'USUFRUCTO'].includes(an.tipo)) {
          const mencionada = acto === 'compraventa' && String((e.datos.actos.compraventa ?? {}).excepcion_gravamen ?? '').length > 0;
          if (!mencionada && enajena) {
            h.push({ codigo: 'R03-GRAVAMEN-VIGENTE', nivel: 'ADVERTENCIA', mensaje: `El certificado muestra ${ETIQUETA_ANOTACION[an.tipo]} vigente (anotación ${an.numero?.valor ?? '?'}) que no se cancela ni se menciona en la escritura.`, evidencia: evid(cert, an.especificacion) });
          }
        }
      }
    }
  }

  // R04 – Paz y salvo: vigencia, catastral y avalúo
  for (const i of e.datos.inmuebles) {
    if (!i.paz_salvo) continue;
    const vence = i.paz_salvo.vigencia_hasta;
    if (vence && /^\d{4}-\d{2}-\d{2}$/.test(vence)) {
      const dias = diasEntre(fechaRef, vence);
      if (dias < 0) h.push({ codigo: 'R04-PAZ-SALVO-VENCIDO', nivel: 'CRITICA', mensaje: `El paz y salvo del inmueble ${i.matricula} venció el ${vence}.`, campo: `inmuebles.${i.id}.paz_salvo.vigencia_hasta` });
      else if (dias <= cfg.diasAvisoPazSalvo) h.push({ codigo: 'R04-PAZ-SALVO-POR-VENCER', nivel: 'INFORMATIVA', mensaje: `El paz y salvo del inmueble ${i.matricula} vence en ${dias} día(s) (${vence}).`, campo: `inmuebles.${i.id}.paz_salvo.vigencia_hasta` });
    }
  }
  for (const ps of docs('PAZ_Y_SALVO')) {
    const cat = soloDigitos(v(ps.hechos, 'cedula_catastral')?.valor);
    const inm = e.datos.inmuebles.find((i) => [i.cedula_catastral, i.cedula_catastral_paz_salvo].some((x) => soloDigitos(x) && cat && (soloDigitos(x).endsWith(cat) || cat.endsWith(soloDigitos(x)))));
    if (!inm) {
      if (cat) h.push({ codigo: 'R04-PAZ-SALVO-PREDIO', nivel: 'ADVERTENCIA', mensaje: `El paz y salvo "${ps.nombre}" (catastral ${cat}) no corresponde a ningún inmueble del formulario.`, evidencia: evid(ps, v(ps.hechos, 'cedula_catastral')) });
      continue;
    }
    const venceDoc = v<string>(ps.hechos, 'vigencia_hasta')?.valor;
    if (venceDoc && inm.paz_salvo?.vigencia_hasta && venceDoc.slice(0, 10) !== inm.paz_salvo.vigencia_hasta) {
      h.push({ codigo: 'R04-PAZ-SALVO-VIGENCIA', nivel: 'ADVERTENCIA', mensaje: `La vigencia del paz y salvo en el formulario (${inm.paz_salvo.vigencia_hasta}) difiere de la del documento (${venceDoc}).`, campo: `inmuebles.${inm.id}.paz_salvo.vigencia_hasta`, evidencia: evid(ps, v(ps.hechos, 'vigencia_hasta')) });
    }
    const avDoc = Number(v(ps.hechos, 'avaluo')?.valor);
    if (avDoc && inm.paz_salvo?.avaluo && avDoc !== Number(inm.paz_salvo.avaluo)) {
      h.push({ codigo: 'R04-AVALUO', nivel: 'ADVERTENCIA', mensaje: `El avalúo del formulario ($${inm.paz_salvo.avaluo}) difiere del paz y salvo ($${avDoc}).`, campo: `inmuebles.${inm.id}.paz_salvo.avaluo`, evidencia: evid(ps, v(ps.hechos, 'avaluo')) });
    }
  }

  // R05 – Compraventa: precio vs. avalúo y afectación a vivienda familiar
  const cv = e.datos.actos.compraventa;
  if (e.actos.includes('compraventa') && cv) {
    const precio = Number(cv.precio);
    const avaluo = ((cv.inmuebles as string[]) ?? []).reduce((s, id) => s + Number(inmuebles.get(id)?.paz_salvo?.avaluo ?? 0), 0);
    if (precio && avaluo && precio < avaluo) h.push({ codigo: 'R05-PRECIO-AVALUO', nivel: 'ADVERTENCIA', mensaje: `El precio ($${precio}) es inferior al avalúo catastral ($${avaluo}). Verifique la declaración del art. 61 de la Ley 2010 de 2019 con el notario.`, campo: 'actos.compraventa.precio' });
    const compradores = ((cv.compradores as string[]) ?? []).map((id) => personas.get(id)).filter((p): p is Persona => !!p);
    const conVinculo = compradores.some((p) => /CASADO\(A\), CON SOCIEDAD CONYUGAL VIGENTE|CON UNION MARITAL/.test(p.estado_civil ?? ''));
    if (cv.afectacion === 'NO_APLICA' && conVinculo) {
      h.push({ codigo: 'R05-AFECTACION', nivel: 'CRITICA', mensaje: 'Un comprador es casado o tiene unión marital: debe indicarse si el inmueble se afecta o no a vivienda familiar (con indagación y constancia).', campo: 'actos.compraventa.afectacion' });
    }
    if ((cv.afectacion === 'SI' || cv.afectacion === 'NO') && !conVinculo && !cv.coadyuvante_id) {
      h.push({ codigo: 'R05-AFECTACION', nivel: 'CRITICA', mensaje: 'Se indicó decisión sobre afectación, pero ningún comprador es casado ni tiene unión marital según su estado civil.', campo: 'actos.compraventa.afectacion' });
    }
  }

  // R08 – Cédulas cargadas vs. personas del formulario
  for (const ced of docs('CEDULA').flatMap((d) => cedulasDe(d.hechos?.datos).map((datos) => ({ ...d, hechos: { ...d.hechos!, datos } })))) {
    const num = soloDigitos(v(ced.hechos, 'numero')?.valor);
    if (!num) continue;
    const p = e.datos.personas.find((x) => soloDigitos(x.numero_documento) === num);
    if (!p) {
      const nombreDoc = `${v(ced.hechos, 'nombres')?.valor ?? ''} ${v(ced.hechos, 'apellidos')?.valor ?? ''}`;
      const parecido = e.datos.personas.find((x) => nombresCoinciden(x.nombre, nombreDoc));
      if (parecido) h.push({ codigo: 'R08-CEDULA-NUMERO', nivel: 'CRITICA', mensaje: `El número de cédula de ${parecido.nombre} en el formulario (${parecido.numero_documento}) no coincide con el de su documento (${v(ced.hechos, 'numero')?.valor}).`, campo: `personas.${parecido.id}.numero_documento`, evidencia: evid(ced, v(ced.hechos, 'numero')) });
      continue;
    }
    const nombreDoc = `${v(ced.hechos, 'nombres')?.valor ?? ''} ${v(ced.hechos, 'apellidos')?.valor ?? ''}`.trim();
    if (nombreDoc && !nombresCoinciden(nombreDoc, p.nombre)) h.push({ codigo: 'R08-CEDULA-NOMBRE', nivel: 'ADVERTENCIA', mensaje: `El nombre "${p.nombre}" no coincide con el de la cédula ("${nombreDoc}").`, campo: `personas.${p.id}.nombre`, evidencia: evid(ced, v(ced.hechos, 'nombres')) });
    const lugar = v<string>(ced.hechos, 'lugar_expedicion')?.valor;
    if (lugar && p.lugar_expedicion && normalizarNombre(lugar) !== normalizarNombre(p.lugar_expedicion)) {
      h.push({ codigo: 'R08-CEDULA-EXPEDICION', nivel: 'ADVERTENCIA', mensaje: `Lugar de expedición de ${p.nombre}: formulario "${p.lugar_expedicion}", cédula "${lugar}".`, campo: `personas.${p.id}.lugar_expedicion`, evidencia: evid(ced, v(ced.hechos, 'lugar_expedicion')) });
    }
  }

  // R09 – Poderes y representación de entidades
  const poderes = docs('PODER');
  for (const p of e.datos.personas.filter((x) => x.apoderado_id)) {
    const apo = personas.get(p.apoderado_id!);
    const poder = poderes.find((d) => soloDigitos(v(d.hechos, 'apoderado_documento')?.valor) === soloDigitos(apo?.numero_documento));
    if (!poder) { h.push({ codigo: 'R09-SIN-PODER', nivel: 'ADVERTENCIA', mensaje: `${p.nombre} comparece por apoderado(a) (${apo?.nombre ?? '?'}), pero no se ha cargado un poder a su nombre.`, campo: `personas.${p.id}.apoderado_id` }); continue; }
    const poderdantes = String(v(poder.hechos, 'poderdantes')?.valor ?? '');
    if (!soloDigitos(poderdantes).includes(soloDigitos(p.numero_documento))) {
      h.push({ codigo: 'R09-PODERDANTE', nivel: 'CRITICA', mensaje: `El poder cargado no identifica a ${p.nombre} (${p.numero_documento}) como poderdante.`, evidencia: evid(poder, v(poder.hechos, 'poderdantes')) });
    }
    const matPoder = soloDigitos(v(poder.hechos, 'inmueble_matricula')?.valor);
    if (matPoder && !e.datos.inmuebles.some((i) => soloDigitos(i.matricula) === matPoder)) {
      h.push({ codigo: 'R09-PODER-INMUEBLE', nivel: 'CRITICA', mensaje: `El poder se refiere a la matrícula ${v(poder.hechos, 'inmueble_matricula')?.valor}, que no es la del inmueble de la escritura.`, evidencia: evid(poder, v(poder.hechos, 'inmueble_matricula')) });
    }
    if (v(poder.hechos, 'faculta_declarar_estado_civil')?.valor === false && !p.poder_incluye_estado_civil) {
      h.push({ codigo: 'R09-PODER-ESTADO-CIVIL', nivel: 'INFORMATIVA', mensaje: `El poder de ${p.nombre} no faculta expresamente para declarar el estado civil: se incluirá la constancia del notario.` });
    }
    h.push({ codigo: 'R09-FACULTADES', nivel: 'INFORMATIVA', mensaje: `Verifique que las facultades del poder de ${p.nombre} cubran el acto: "${String(v(poder.hechos, 'actos_autorizados')?.valor ?? 'no extraídas').slice(0, 200)}".`, evidencia: evid(poder, v(poder.hechos, 'actos_autorizados')) });
  }
  const certExist = docs('CERTIFICADO_EXISTENCIA');
  for (const ent of e.datos.personas.filter((x) => x.tipo_persona === 'JURIDICA')) {
    const c = certExist.find((d) => soloDigitos(v(d.hechos, 'nit')?.valor).slice(0, 9) === soloDigitos(ent.numero_documento).slice(0, 9));
    if (!c) { h.push({ codigo: 'R09-SIN-CERT-EXISTENCIA', nivel: 'ADVERTENCIA', mensaje: `No se ha cargado el certificado de existencia y representación de ${ent.nombre}.`, campo: `personas.${ent.id}.numero_documento` }); continue; }
    const rep = ent.representante_id ? personas.get(ent.representante_id) : undefined;
    if (ent.representacion !== 'PODER' && rep && soloDigitos(v(c.hechos, 'representante_documento')?.valor) !== soloDigitos(rep.numero_documento)) {
      h.push({ codigo: 'R09-REPRESENTANTE', nivel: 'CRITICA', mensaje: `${rep.nombre} no figura como representante legal de ${ent.nombre} en el certificado de existencia.`, evidencia: evid(c, v(c.hechos, 'representante_nombre')) });
    }
    const lim = v<string>(c.hechos, 'limitaciones')?.valor;
    if (lim) h.push({ codigo: 'R09-LIMITACIONES', nivel: 'ADVERTENCIA', mensaje: `El certificado de ${ent.nombre} registra limitaciones a la representación: "${lim.slice(0, 200)}". Verifique si requiere autorización.`, evidencia: evid(c, v(c.hechos, 'limitaciones')) });
    const fexp = v<string>(c.hechos, 'fecha_expedicion')?.valor;
    if (fexp && diasEntre(fexp.slice(0, 10), fechaRef) > cfg.diasVigenciaCertificadoExistencia) {
      h.push({ codigo: 'R09-CERT-EXISTENCIA-ANTIGUO', nivel: 'ADVERTENCIA', mensaje: `El certificado de existencia de ${ent.nombre} tiene más de ${cfg.diasVigenciaCertificadoExistencia} días.`, evidencia: evid(c, v(c.hechos, 'fecha_expedicion')) });
    }
  }

  // R11 – Documentos ilegibles o con observaciones de la IA
  for (const d of e.documentos) {
    if (d.hechos && d.hechos.legible === false) h.push({ codigo: 'R11-ILEGIBLE', nivel: 'ADVERTENCIA', mensaje: `El documento "${d.nombre}" no es legible con seguridad: sus datos deben verificarse manualmente.`, evidencia: { documentoId: d.id, documento: d.nombre } });
    if (d.hechos && d.hechos.tipo_detectado && d.hechos.tipo_detectado !== d.tipo) h.push({ codigo: 'R11-TIPO', nivel: 'ADVERTENCIA', mensaje: `El documento "${d.nombre}" se cargó como ${d.tipo} pero parece ser ${d.hechos.tipo_detectado}.`, evidencia: { documentoId: d.id, documento: d.nombre } });
  }
  if (e.pendientesConfianzaBaja) {
    h.push({ codigo: 'R11-CONFIANZA-BAJA', nivel: 'ADVERTENCIA', mensaje: `${e.pendientesConfianzaBaja} dato(s) extraído(s) con confianza baja siguen pendientes de revisión manual.` });
  }

  // R12 – Borrador con variables sin diligenciar
  if (e.borradorTexto?.includes(MARCA_FALTANTE)) {
    const faltan = [...new Set([...e.borradorTexto.matchAll(/«FALTA: ([^»]+)»/g)].map((m) => m[1]))];
    h.push({ codigo: 'R12-BORRADOR-INCOMPLETO', nivel: 'CRITICA', mensaje: `El borrador tiene datos sin diligenciar: ${faltan.join(', ')}.` });
  }

  return h;
}

/** ¿La persona comparece por sí misma en algún acto? (para exigir su estado civil) */
function personaComparecePropio(p: Persona, e: EntradaReglas): boolean {
  if (p.apoderado_id || p.menor_de_edad) return !!p.apoderado_id; // el apoderado declara el estado civil del poderdante
  return JSON.stringify(e.datos.actos).includes(`"${p.id}"`);
}

export type { Inmueble };
