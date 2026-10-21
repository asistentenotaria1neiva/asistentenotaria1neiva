import Link from 'next/link';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { obtenerExpediente, puedeEditar } from '@/lib/servicios/expedientes';
import { accionRevisar, accionResolverObservacion } from '../../acciones';
import { BotonAccion, FormularioResolver } from '../../formularios';
import { EtiquetaNivel, fecha } from '../../../componentes';

const ORDEN = { CRITICA: 0, ADVERTENCIA: 1, INFORMATIVA: 2 } as const;

export default async function Observaciones({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requerirSesion();
  const e = await obtenerExpediente(s, id);
  const obs = await db.observacion.findMany({ where: { expedienteId: id }, include: { resueltaPor: { select: { nombreCompleto: true } } }, orderBy: { creadaEn: 'desc' } });
  const abiertas = obs.filter((o) => o.estado === 'ABIERTA').sort((a, b) => ORDEN[a.nivel] - ORDEN[b.nivel]);
  const resueltas = obs.filter((o) => o.estado !== 'ABIERTA');
  const ultima = await db.analisisIA.findFirst({ where: { expedienteId: id, proposito: 'REVISION' }, orderBy: { creadoEn: 'desc' } });
  const puedeRevisar = puedeEditar(s, e) || (s.usuario.rol !== 'DIGITADOR' && e.estado === 'EN_REVISION');
  const resolver = accionResolverObservacion.bind(null, id);
  const conteo = (n: string) => abiertas.filter((o) => o.nivel === n).length;
  return (
    <>
      <section className="tarjeta">
        <div className="fila entre">
          <div>
            <h2 style={{ marginTop: 0 }}>Revisión</h2>
            <p className="suave">Las reglas fijas cruzan lo digitado con los documentos. La IA revisa el conjunto y advierte; la persona decide. {ultima && `Última revisión de IA: ${fecha(ultima.creadoEn)} (${ultima.estado.toLowerCase()}).`}</p>
          </div>
          {puedeRevisar && (
            <div className="fila">
              <BotonAccion accion={accionRevisar.bind(null, id, false)} texto="Ejecutar reglas" clase="secundario" />
              {process.env.ANTHROPIC_API_KEY && <BotonAccion accion={accionRevisar.bind(null, id, true)} texto="Reglas + revisión de la IA" textoPendiente="Revisando… (puede tardar unos minutos)" />}
            </div>
          )}
        </div>
        <div className="rejilla tres">
          <div><span className="cifra">{conteo('CRITICA')}</span><div><EtiquetaNivel nivel="CRITICA" /> bloquean el avance</div></div>
          <div><span className="cifra">{conteo('ADVERTENCIA')}</span><div><EtiquetaNivel nivel="ADVERTENCIA" /> exigen corrección o justificación</div></div>
          <div><span className="cifra">{conteo('INFORMATIVA')}</span><div><EtiquetaNivel nivel="INFORMATIVA" /> sugerencias</div></div>
        </div>
      </section>

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
            {o.campo && puedeEditar(s, e) && <p><Link href={`/expedientes/${id}/formulario`}>Ir al formulario para corregir</Link></p>}
            {puedeRevisar && o.nivel !== 'INFORMATIVA' && <FormularioResolver accion={resolver} observacionId={o.id} nivel={o.nivel} origen={o.origen} puedeDescartarCritica={s.usuario.rol !== 'DIGITADOR'} />}
            {puedeRevisar && o.nivel === 'INFORMATIVA' && <FormularioResolver accion={resolver} observacionId={o.id} nivel={o.nivel} origen={o.origen} puedeDescartarCritica={false} />}
          </section>
        );
      })}
      {!abiertas.length && <div className="aviso exito">No hay observaciones abiertas.</div>}

      {resueltas.length > 0 && (
        <details className="tarjeta"><summary>Observaciones resueltas ({resueltas.length})</summary>
          <table>
            <thead><tr><th>Nivel</th><th>Observación</th><th>Decisión</th><th>Justificación</th><th>Quién / cuándo</th></tr></thead>
            <tbody>{resueltas.map((o) => (
              <tr key={o.id}><td><EtiquetaNivel nivel={o.nivel} /></td><td>{o.mensaje}</td><td>{o.estado.toLowerCase()}{o.falsaAlarma ? ' (falsa alarma)' : ''}</td><td>{o.justificacion}</td><td className="suave">{o.resueltaPor?.nombreCompleto ?? 'reglas'} · {fecha(o.resueltaEn)}</td></tr>
            ))}</tbody>
          </table>
        </details>
      )}
    </>
  );
}
