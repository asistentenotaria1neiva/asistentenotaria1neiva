import Link from 'next/link';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { obtenerExpediente, puedeEditar, datosDe } from '@/lib/servicios/expedientes';
import { estadoCorreccion } from '@/lib/servicios/correccion-ia';
import { revisionIAEnCurso } from '@/lib/servicios/revision';
import type { DatosExpediente } from '@/lib/escritura/tipos';
import { accionRevisar, accionResolverObservacion, accionProponerCorrecciones, accionAplicarCorrecciones, accionCorregirDato } from '../../acciones';
import { rutaDesdeCampo } from '@/lib/escritura/rutas';
import { BotonAccion, FormularioResolver, PanelCorreccionIA, RefrescoAutomatico } from '../../formularios';
import { EtiquetaNivel, Tabla, fecha } from '../../../componentes';

// La revisión de la IA continúa en segundo plano (after) tras responder la acción
export const maxDuration = 300;

const ORDEN = { CRITICA: 0, ADVERTENCIA: 1, INFORMATIVA: 2 } as const;

/** Valor de un campo para mostrarlo en una propuesta: personas e inmuebles por su nombre */
function mostrar(v: unknown, datos: DatosExpediente): string {
  if (v === null || v === undefined || v === '') return '(vacío)';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (Array.isArray(v)) return v.map((x) => mostrar(x, datos)).join(', ') || '(vacío)';
  if (typeof v === 'object') return JSON.stringify(v);
  const persona = datos.personas.find((p) => p.id === v);
  if (persona) return persona.nombre;
  const inmueble = datos.inmuebles.find((i) => i.id === v);
  if (inmueble) return inmueble.matricula || inmueble.direccion;
  return String(v);
}

export default async function Observaciones({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requerirSesion();
  const e = await obtenerExpediente(s, id);
  const obs = await db.observacion.findMany({ where: { expedienteId: id }, include: { resueltaPor: { select: { nombreCompleto: true } } }, orderBy: { creadaEn: 'desc' } });
  const abiertas = obs.filter((o) => o.estado === 'ABIERTA').sort((a, b) => ORDEN[a.nivel] - ORDEN[b.nivel]);
  const resueltas = obs.filter((o) => o.estado !== 'ABIERTA');
  const enCurso = await revisionIAEnCurso(id);
  const ultima = await db.analisisIA.findFirst({ where: { expedienteId: id, proposito: 'REVISION' }, orderBy: { creadoEn: 'desc' } });
  const puedeRevisar = puedeEditar(s, e) || (s.usuario.rol !== 'DIGITADOR' && e.estado === 'EN_REVISION');
  const resolver = accionResolverObservacion.bind(null, id);
  const conteo = (n: string) => abiertas.filter((o) => o.nivel === n).length;
  const corregirConIA = puedeEditar(s, e) && !!process.env.ANTHROPIC_API_KEY;
  const correccion = corregirConIA ? await estadoCorreccion(id) : null;
  const propuesta = correccion?.propuesta;
  const datos = datosDe(e);
  const mensajeDe = (observacionId: string) => obs.find((o) => o.id === observacionId)?.mensaje ?? 'Observación ya resuelta';
  return (
    <>
      <section className="tarjeta">
        <div className="fila entre" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 320px' }}>
            <h2 style={{ marginTop: 0 }}>Revisión</h2>
            <p className="suave">Las reglas fijas cruzan lo digitado con los documentos. La IA revisa el conjunto y advierte; la persona decide. {ultima && !enCurso && `Última revisión de IA: ${fecha(ultima.creadoEn)} (${ultima.estado.toLowerCase()}).`}</p>
          </div>
          {puedeRevisar && (
            <div className="fila">
              <BotonAccion accion={accionRevisar.bind(null, id, false)} texto="Ejecutar reglas" clase="secundario" />
              {process.env.ANTHROPIC_API_KEY && (enCurso
                ? <button type="button" disabled aria-busy="true"><span className="girador pequeno" aria-hidden="true" />La IA está revisando…</button>
                : <BotonAccion accion={accionRevisar.bind(null, id, true)} texto="Reglas + revisión de la IA" textoPendiente="Iniciando revisión…" />)}
            </div>
          )}
        </div>
        {enCurso && (
          <div className="aviso info" role="status">
            La IA sigue analizando el expediente (iniciada {fecha(enCurso.creadoEn)}). Puede salir de esta página; los resultados aparecerán aquí al terminar.
            <RefrescoAutomatico />
          </div>
        )}
        {!enCurso && ultima?.estado === 'ERROR' && ultima.error && <div className="aviso error">La última revisión de la IA no se completó: {ultima.error}</div>}
        <div className="rejilla tres conteos" style={{ marginTop: '1rem' }}>
          <div><span className="cifra">{conteo('CRITICA')}</span><div><EtiquetaNivel nivel="CRITICA" /> bloquean el avance</div></div>
          <div><span className="cifra">{conteo('ADVERTENCIA')}</span><div><EtiquetaNivel nivel="ADVERTENCIA" /> exigen corrección o justificación</div></div>
          <div><span className="cifra">{conteo('INFORMATIVA')}</span><div><EtiquetaNivel nivel="INFORMATIVA" /> sugerencias</div></div>
        </div>
      </section>

      {correccion && (propuesta || correccion.enCurso || abiertas.length > 0) && (
        <section className="tarjeta">
          {correccion.enCurso && <RefrescoAutomatico />}
          <PanelCorreccionIA proponer={accionProponerCorrecciones.bind(null, id)}
            observaciones={abiertas.map((o) => ({ id: o.id, nivel: o.nivel, mensaje: o.mensaje }))}
            enCurso={correccion.enCurso ? fecha(correccion.enCurso) : undefined}
            error={correccion.error ?? undefined}
            {...(propuesta ? {
              aplicar: accionAplicarCorrecciones.bind(null, id, propuesta.id),
              propuesta: {
                id: propuesta.id,
                fecha: fecha(propuesta.creadoEn),
                propuestas: propuesta.correcciones.flatMap((c, indice) => (c.estado === 'PENDIENTE' ? [{
                  indice, observacion: mensajeDe(c.observacionId), etiqueta: c.etiqueta, antes: mostrar(c.valorActual, datos), despues: mostrar(c.valorNuevo, datos), explicacion: c.explicacion, fuente: c.fuente,
                }] : [])),
                sinCorreccion: propuesta.sinCorreccion.map((x) => ({ observacion: mensajeDe(x.observacionId), motivo: x.motivo })),
              },
            } : {})} />
        </section>
      )}

      {abiertas.map((o) => {
        const ev = (o.evidencia ?? {}) as { documento?: string; pagina?: number | null; fragmento?: string | null; detalle?: string };
        return (
          <section className="tarjeta" key={o.id}>
            <div className="fila entre">
              <div className="fila"><EtiquetaNivel nivel={o.nivel} /><span className="etiqueta">{o.origen === 'IA' ? 'IA' : `Regla ${o.codigo}`}</span></div>
              <span className="suave">{fecha(o.creadaEn)}</span>
            </div>
            <p><strong>{o.mensaje}</strong></p>
            {(ev.documento || ev.detalle) && (
              <p className="suave">Evidencia: {ev.documento}{ev.pagina ? `, página ${ev.pagina}` : ''}{ev.fragmento ? ` — «${ev.fragmento}»` : ''}{ev.detalle ?? ''}</p>
            )}
            {o.campo && puedeEditar(s, e) && (rutaDesdeCampo(o.campo)
              ? <BotonAccion accion={accionCorregirDato.bind(null, id, rutaDesdeCampo(o.campo)!, o.mensaje.slice(0, 300))} texto="Corregir en el asistente" clase="secundario pequeno" />
              : <p><Link href={`/expedientes/${id}/asistente`}>Ir al asistente para corregir</Link></p>)}
            {puedeRevisar && o.nivel !== 'INFORMATIVA' && <FormularioResolver accion={resolver} observacionId={o.id} nivel={o.nivel} origen={o.origen} puedeDescartarCritica={s.usuario.rol !== 'DIGITADOR'} />}
            {puedeRevisar && o.nivel === 'INFORMATIVA' && <FormularioResolver accion={resolver} observacionId={o.id} nivel={o.nivel} origen={o.origen} puedeDescartarCritica={false} />}
          </section>
        );
      })}
      {!abiertas.length && <div className="aviso exito">No hay observaciones abiertas.</div>}

      {resueltas.length > 0 && (
        <details className="tarjeta"><summary>Observaciones resueltas ({resueltas.length})</summary>
          <Tabla>
            <thead><tr><th>Nivel</th><th>Observación</th><th>Decisión</th><th>Justificación</th><th>Quién / cuándo</th></tr></thead>
            <tbody>{resueltas.map((o) => (
              <tr key={o.id}>
                <td data-etiqueta="Nivel"><EtiquetaNivel nivel={o.nivel} /></td>
                <td data-etiqueta="Observación">{o.mensaje}</td>
                <td data-etiqueta="Decisión">{o.estado.toLowerCase()}{o.falsaAlarma ? ' (falsa alarma)' : ''}</td>
                <td data-etiqueta="Justificación">{o.justificacion}</td>
                <td data-etiqueta="Quién / cuándo" className="suave">{o.resueltaPor?.nombreCompleto ?? 'reglas'} · {fecha(o.resueltaEn)}</td>
              </tr>
            ))}</tbody>
          </Tabla>
        </details>
      )}
    </>
  );
}
