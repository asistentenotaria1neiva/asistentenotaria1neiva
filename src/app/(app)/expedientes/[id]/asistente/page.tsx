import Link from 'next/link';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { obtenerExpediente, puedeEditar, datosDe, actosDe, bloqueos } from '@/lib/servicios/expedientes';
import { after } from 'next/server';
import { estadoAsistente, esAdicional, CODIGO_INCONSISTENCIA } from '@/lib/servicios/asistente';
import { tareaEnCurso, tareaPorReanudar } from '@/lib/servicios/tareas';
import { ProgresoAnalisis } from '../progreso';
import { ESQUEMAS, PASOS_COMUNES, CAMPOS_PERSONA, CAMPOS_INMUEBLE, type Campo } from '@/lib/escritura/esquemas';
import { resolverRuta, CAMPOS_TERMINACION } from '@/lib/escritura/rutas';
import { leerRuta, campoVisible } from '@/lib/escritura/validar-formulario';
import type { DatosExpediente } from '@/lib/escritura/tipos';
import { accionIniciarAsistente, accionResponderAsistente, accionContinuarConDatos, accionGenerarBorrador, accionCorregirDato } from '../../acciones';
import { BotonAccion } from '../../formularios';
import { EtiquetaNivel, Tabla, fecha } from '../../../componentes';
import { Cuestionario, type PreguntaVista } from './Cuestionario';

// El análisis de los documentos y del expediente continúa en segundo plano (after) tras responder la acción
export const maxDuration = 300;

/** Valor inicial de una pregunta como lo espera su control */
function comoEntrada(v: unknown, multiple: boolean): string | string[] {
  if (multiple) return Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : [];
  if (v === null || v === undefined) return '';
  return String(v);
}

/** Respuesta guardada, para mostrarla: personas e inmuebles por su nombre */
function mostrar(v: unknown, datos: DatosExpediente): string {
  if (v === null || v === undefined || v === '') return '(vacío)';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (Array.isArray(v)) return v.map((x) => mostrar(x, datos)).join(', ');
  const persona = datos.personas.find((p) => p.id === v);
  if (persona) return persona.nombre || `Persona ${persona.numero_documento}`;
  const inmueble = datos.inmuebles.find((i) => i.id === v);
  if (inmueble) return inmueble.matricula || inmueble.direccion;
  return String(v);
}

/** Lo que queda en blanco en el Word para el funcionario que hace la terminación */
const TERMINACION = [
  'Número de la escritura y fecha de otorgamiento (carátula)',
  'Hojas de papel notarial',
  'Derechos notariales y retención en la fuente',
  'Datos de firma de cada otorgante: teléfono, dirección, correo, huella y declaración PEP',
];

export default async function Asistente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requerirSesion();
  const e = await obtenerExpediente(s, id);
  const editable = puedeEditar(s, e);
  const datos = datosDe(e);
  const actos = actosDe(e);
  // Un análisis que dejó de avanzar (la etapa se cortó) se reanuda en segundo plano
  const reanudar = editable ? await tareaPorReanudar(id) : null;
  if (reanudar) after(reanudar);
  const tarea = await tareaEnCurso(id);
  const [estado, nDocs, inconsistencias, b, ultimoBorrador, nombresLeidos] = await Promise.all([
    estadoAsistente(id),
    db.documento.count({ where: { expedienteId: id } }),
    db.observacion.findMany({ where: { expedienteId: id, codigo: CODIGO_INCONSISTENCIA, estado: 'ABIERTA' }, orderBy: { creadaEn: 'asc' } }),
    bloqueos(id),
    db.borrador.findFirst({ where: { expedienteId: id }, orderBy: { version: 'desc' } }),
    db.datoExtraido.findMany({ where: { expedienteId: id, estado: 'PENDIENTE', campo: { startsWith: 'persona:', endsWith: '.nombre' } }, select: { campo: true, valor: true } }),
  ]);
  const iaDisponible = !!process.env.ANTHROPIC_API_KEY;
  const r = estado.resultado;
  const documentos = inconsistencias.length ? await db.documento.findMany({ where: { expedienteId: id }, select: { id: true, nombreOriginal: true } }) : [];

  // Preguntas pendientes con el control que corresponde a su campo
  const actosRuta = r && !r.actosConfirmados ? r.actosPropuestos : actos;
  // Persona sin nombre guardado (el nombre quedó por confirmar): se muestra el que leyó la IA de los documentos
  const dig = (x: unknown) => String(x ?? '').replace(/\D/g, '');
  const nombreLeido = (p: DatosExpediente['personas'][number]) => {
    const v = nombresLeidos.find((d) => dig(d.campo.split(':')[1].split('.')[0]) === dig(p.numero_documento))?.valor;
    return typeof v === 'string' && v.trim() ? `${v.trim().toUpperCase()} (nombre por confirmar)` : '';
  };
  const nombreDe = (p: DatosExpediente['personas'][number]) => p.nombre || nombreLeido(p) || '(sin nombre)';
  const personas = datos.personas.map((p) => ({ valor: p.id, etiqueta: `${nombreDe(p)} · ${p.numero_documento}` }));
  const inmuebles = datos.inmuebles.map((i) => ({ valor: i.id, etiqueta: `${i.matricula || 'sin matrícula'} · ${i.direccion || i.nombre_corto || ''}` }));
  const pendientes: PreguntaVista[] = (r?.preguntas ?? []).filter((p) => p.estado === 'PENDIENTE').flatMap<PreguntaVista>((p) => {
    // Pregunta adicional de un caso especial: texto libre
    if (esAdicional(p.ruta)) return [{ id: p.id, etiqueta: p.etiqueta, pregunta: p.pregunta, motivo: p.motivo, tipo: 'textoLargo', obligatoria: p.obligatoria, inicial: '', sugerido: false, fuente: null }];
    const destino = resolverRuta(datos, actosRuta, p.ruta);
    if (!destino) return [];
    const c = destino.campo;
    const multiple = c.tipo === 'personas' || c.tipo === 'inmuebles';
    const actual = leerRuta(datos, destino.rutaDatos);
    return [{
      id: p.id, etiqueta: destino.etiqueta, pregunta: p.pregunta, motivo: p.motivo, tipo: c.tipo, obligatoria: p.obligatoria,
      opciones: c.tipo === 'persona' || c.tipo === 'personas' ? personas : c.tipo === 'inmueble' || c.tipo === 'inmuebles' ? inmuebles : c.opciones,
      inicial: comoEntrada(p.valorSugerido ?? actual, multiple), sugerido: p.valorSugerido !== null && p.valorSugerido !== undefined, fuente: p.fuente,
    }];
  });
  const respondidas = (r?.preguntas ?? []).filter((p) => p.estado !== 'PENDIENTE');
  const obligatoriasPendientes = pendientes.filter((p) => p.obligatoria).length;
  const listo = !!r && r.actosConfirmados && !obligatoriasPendientes && actos.length > 0;
  const titulo = (a: string) => ESQUEMAS[a]?.titulo ?? a;

  // Revisión de todos los datos que irán en la escritura, cada uno con su ruta para corregirlo
  const filas = (campos: Campo[], valores: Record<string, unknown>, prefijo: string) => campos
    .filter((c) => c.tipo !== 'lista' && campoVisible(c, valores))
    .flatMap((c) => {
      const v = leerRuta(valores, c.id);
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return [];
      const opcion = c.opciones?.find((o) => o.valor === v || o.valor === String(v));
      return [{ ruta: `${prefijo}.${c.id}`, etiqueta: c.etiqueta, valor: opcion && c.tipo === 'opciones' ? opcion.etiqueta : mostrar(v, datos) }];
    });
  const grupos = [
    { titulo: 'Escritura', filas: filas(PASOS_COMUNES[0].campos.filter((c) => !CAMPOS_TERMINACION.includes(c.id)), datos.escritura as unknown as Record<string, unknown>, 'escritura') },
    ...actos.filter((a) => ESQUEMAS[a]).map((a) => ({ titulo: titulo(a), filas: filas(ESQUEMAS[a].pasos.flatMap((p) => p.campos), (datos.actos[a] ?? {}) as Record<string, unknown>, `acto:${a}`) })),
    ...datos.personas.map((p) => ({ titulo: `${p.nombre || nombreLeido(p) || 'Persona sin nombre'} · ${p.numero_documento}`, filas: filas(CAMPOS_PERSONA, p as unknown as Record<string, unknown>, `persona:${p.id}`) })),
    ...datos.inmuebles.map((i) => ({ titulo: `Inmueble ${i.matricula || i.nombre_corto || i.direccion}`, filas: filas(CAMPOS_INMUEBLE, i as unknown as Record<string, unknown>, `inmueble:${i.id}`) })),
  ].filter((g) => g.filas.length);

  return (
    <>
      <section className="tarjeta">
        <div className="fila entre" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 320px' }}>
            <h2 style={{ marginTop: 0 }}>Asistente de escrituración</h2>
            <p className="suave">La IA lee los documentos cargados, identifica el tipo de escritura, advierte las inconsistencias y le hace las preguntas necesarias para completarla. {r && !tarea && `Último análisis: ${fecha(r.creadoEn)}.`}</p>
          </div>
          {editable && iaDisponible && nDocs > 0 && (tarea
            ? <button type="button" disabled aria-busy="true"><span className="girador pequeno" aria-hidden="true" />Analizando…</button>
            : <BotonAccion accion={accionIniciarAsistente.bind(null, id)} texto={r ? 'Analizar de nuevo' : 'Analizar documentos y preparar preguntas'} textoPendiente="Iniciando…"
              confirmar={r ? 'Se analizarán de nuevo los documentos y se prepararán preguntas nuevas. Las respuestas ya guardadas se conservan en el expediente. ¿Continuar?' : undefined} />)}
        </div>
        {!nDocs && <div className="aviso info">Primero <Link href={`/expedientes/${id}/documentos`}>cargue los documentos soporte</Link> (cédulas, certificado de tradición, paz y salvo, título anterior…).</div>}
        {!iaDisponible && <div className="aviso alerta">El asistente no está disponible: falta configurar la clave de la API en el servidor.</div>}
        {tarea && <ProgresoAnalisis tarea={tarea} />}
        {!tarea && estado.error && <div className="aviso error">El último análisis no se completó: {estado.error} Pulse «{r ? 'Analizar de nuevo' : 'Analizar documentos y preparar preguntas'}»: los documentos ya analizados no se repiten.</div>}
      </section>

      {r && (
        <section className="tarjeta">
          <h2 style={{ marginTop: 0 }}>Tipo de escritura</h2>
          <p><strong>{(r.actosConfirmados ? actos : r.actosPropuestos).map(titulo).join(' + ') || 'No se pudo determinar'}</strong>{' '}
            {r.actosConfirmados ? <span className="etiqueta ok">confirmado</span> : <span className="etiqueta advertencia">por confirmar</span>}</p>
          <p className="suave">{r.explicacionTipo}</p>
          {r.tipoSinPlantilla && <div className="aviso alerta">Los documentos indican además: <strong>{r.tipoSinPlantilla}</strong>. La notaría aún no tiene plantilla aprobada para ese acto.</div>}
          <h3>Documentos</h3>
          <p className="suave">{r.resumenDocumentos}</p>
          {r.aplicadasAutomaticamente > 0 && <p className="suave">Se llevaron al expediente {r.aplicadasAutomaticamente} dato(s) leídos con confianza de los documentos. Puede revisarlos y corregirlos en «Datos de la escritura», más abajo.</p>}
          {!!r.completadosDesdeDocumentos?.length && (
            <details><summary>Datos que la IA llenó desde los documentos sin preguntar ({r.completadosDesdeDocumentos.length})</summary>
              <ul>{r.completadosDesdeDocumentos.map((c, i) => <li key={i}><strong>{c.etiqueta}</strong>: {c.valor.length > 120 ? `${c.valor.slice(0, 120)}…` : c.valor} <span className="suave">({c.fuente})</span></li>)}</ul>
            </details>
          )}
          {r.erroresDocumentos.length > 0 && <div className="aviso error">No se pudieron analizar: {r.erroresDocumentos.join(' · ')}</div>}
          {r.documentosFaltantes.length > 0 && (
            <div className="aviso alerta">
              <strong>Documentos que faltan:</strong>
              <ul>{r.documentosFaltantes.map((d, i) => <li key={i}><strong>{d.documento}</strong>: {d.motivo}</li>)}</ul>
              {editable && <Link href={`/expedientes/${id}/documentos`}>Cargar documentos</Link>}
            </div>
          )}
        </section>
      )}

      {inconsistencias.length > 0 && (
        <section className="tarjeta">
          <div className="fila entre">
            <h2 style={{ margin: 0 }}>Inconsistencias encontradas ({inconsistencias.length})</h2>
            {editable && inconsistencias.length > 1 && (
              <BotonAccion accion={accionContinuarConDatos.bind(null, id, inconsistencias.map((o) => o.id))} texto="Continuar con los datos actuales (todas)" clase="secundario pequeno"
                confirmar="Las inconsistencias quedarán registradas como aceptadas y el revisor las verá. ¿Continuar con los datos actuales?" />
            )}
          </div>
          <p className="suave">Puede recargar el documento correcto y analizar de nuevo, o continuar con los datos que tiene. Si continúa, queda registrado para el revisor.</p>
          {inconsistencias.map((o) => {
            const ev = (o.evidencia ?? {}) as { detalle?: string; documentoId?: string | null };
            const doc = documentos.find((d) => d.id === ev.documentoId);
            return (
              <div key={o.id} className="sugerencia">
                <p style={{ marginTop: 0 }}><EtiquetaNivel nivel={o.nivel} /> <strong>{o.mensaje}</strong></p>
                {ev.detalle && <p className="suave">Evidencia: {ev.detalle}</p>}
                {editable && (
                  <div className="fila" style={{ gap: '0.4rem' }}>
                    <Link className="boton secundario pequeno" href={`/expedientes/${id}/documentos${doc ? `#doc-${doc.id}` : ''}`}>{doc ? `Recargar «${doc.nombreOriginal}»` : 'Recargar documentos'}</Link>
                    <BotonAccion accion={accionContinuarConDatos.bind(null, id, [o.id])} texto="Continuar con los datos actuales" clase="secundario pequeno" />
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {r && (
        <section className="tarjeta" id="preguntas">
          <h2 style={{ marginTop: 0 }}>Preguntas {pendientes.length > 0 && <span className="suave">({pendientes.length} pendiente{pendientes.length === 1 ? '' : 's'})</span>}</h2>
          {!pendientes.length && !r.actosConfirmados && editable && <p className="suave">Confirme el tipo de escritura para continuar.</p>}
          {!pendientes.length && r.actosConfirmados && <div className="aviso exito">No hay preguntas pendientes.</div>}
          {editable && (pendientes.length > 0 || !r.actosConfirmados) && (
            <Cuestionario key={`${r.id}-${r.preguntas.length}-${respondidas.length}-${r.actosConfirmados}`} accion={accionResponderAsistente.bind(null, id, r.id)} preguntas={pendientes}
              actos={r.actosConfirmados ? undefined : { propuestos: r.actosPropuestos, catalogo: Object.values(ESQUEMAS).map((x) => ({ id: x.tipo, titulo: x.titulo })) }} />
          )}
          {respondidas.length > 0 && (
            <details style={{ marginTop: '1rem' }}>
              <summary>Respuestas guardadas ({respondidas.length})</summary>
              <Tabla>
                <tbody>{respondidas.map((p) => (
                  <tr key={p.id}>
                    <td className="principal-celda"><strong>{esAdicional(p.ruta) ? p.pregunta : p.etiqueta}</strong></td>
                    <td data-etiqueta="Respuesta">{p.estado === 'OMITIDA' ? <span className="suave">sin respuesta</span> : mostrar(p.respuesta, datos)}</td>
                    <td>{editable && !esAdicional(p.ruta) && <BotonAccion accion={accionCorregirDato.bind(null, id, p.ruta, 'Cambio de una respuesta anterior.')} texto="Cambiar" clase="secundario pequeno" />}</td>
                  </tr>
                ))}</tbody>
              </Tabla>
            </details>
          )}
        </section>
      )}

      {r && grupos.length > 0 && (
        <section className="tarjeta">
          <h2 style={{ marginTop: 0 }}>Datos de la escritura</h2>
          <p className="suave">Todo lo que irá en la escritura: lo leído de los documentos y lo respondido. Si algo no es correcto, pulse «Corregir» y el asistente le hará la pregunta.</p>
          {grupos.map((g) => (
            <details key={g.titulo}>
              <summary><strong>{g.titulo}</strong> <span className="suave">({g.filas.length} dato{g.filas.length === 1 ? '' : 's'})</span></summary>
              <Tabla>
                <tbody>{g.filas.map((f) => (
                  <tr key={f.ruta}>
                    <td className="principal-celda">{f.etiqueta}</td>
                    <td data-etiqueta="Valor" style={{ whiteSpace: 'pre-line' }}>{f.valor}</td>
                    <td>{editable && <BotonAccion accion={accionCorregirDato.bind(null, id, f.ruta, undefined)} texto="Corregir" clase="secundario pequeno" />}</td>
                  </tr>
                ))}</tbody>
              </Tabla>
            </details>
          ))}
        </section>
      )}

      {r && (
        <section className="tarjeta">
          <h2 style={{ marginTop: 0 }}>Escritura en Word</h2>
          <p className="suave">El Word se arma con las plantillas aprobadas por el notario, con el formato de las escrituras de la notaría. Quedan en blanco, para el funcionario que hace la terminación:</p>
          <ul className="suave">{TERMINACION.map((t) => <li key={t}>{t}</li>)}</ul>
          {!listo && <div className="aviso info">{!r.actosConfirmados ? 'Confirme el tipo de escritura' : `Responda ${obligatoriasPendientes} pregunta(s) obligatoria(s)`} para generar la escritura.</div>}
          {b.criticas.length > 0 && <div className="aviso error">Hay {b.criticas.length} observación(es) crítica(s) de las reglas: <Link href={`/expedientes/${id}/observaciones`}>revíselas</Link> antes de generar.</div>}
          <div className="fila" style={{ gap: '0.5rem' }}>
            {editable && listo && <BotonAccion accion={accionGenerarBorrador.bind(null, id)} texto={ultimoBorrador ? 'Generar nueva versión del Word' : 'Generar escritura en Word'} textoPendiente="Generando…" />}
            {ultimoBorrador && <a className="boton secundario" href={`/api/borradores/${ultimoBorrador.id}?formato=docx`}>Descargar Word (v{ultimoBorrador.version})</a>}
            {ultimoBorrador && <Link className="boton secundario" href={`/expedientes/${id}/borrador`}>Ver versiones</Link>}
          </div>
        </section>
      )}
    </>
  );
}
