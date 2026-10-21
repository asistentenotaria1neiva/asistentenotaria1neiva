import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { ESQUEMAS } from '@/lib/escritura/esquemas';
import { accionCargarPlantilla, accionPlantilla } from '../acciones';
import { FormAdmin } from '../formularios';
import { fecha } from '../../componentes';

const ESTADO: Record<string, [string, string]> = {
  APROBADA: ['ok', 'aprobada'], PENDIENTE_APROBACION: ['advertencia', 'pendiente de aprobación'], RETIRADA: ['', 'retirada'],
};

export default async function Plantillas({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  await requerirSesion({ roles: ['ADMINISTRADOR'] });
  const { tipo } = await searchParams;
  const tipos = await db.tipoEscritura.findMany({ orderBy: [{ esBloque: 'desc' }, { categoria: 'asc' }, { nombre: 'asc' }], include: { plantillas: { select: { id: true, version: true, estado: true, creadaEn: true, aprobadaEn: true, nombreArchivo: true, notas: true, hashSha256: true }, orderBy: { version: 'desc' } } } });
  const conPlantilla = tipos.filter((t) => !t.esBloque && t.plantillas.length);
  const sinPlantilla = tipos.filter((t) => !t.esBloque && !t.plantillas.length);
  const detalle = tipo ? tipos.find((t) => t.id === tipo) : undefined;
  const PRIORIDAD = { Alta: 0, Media: 1, Baja: 2 } as Record<string, number>;
  return (
    <>
      <h1>Plantillas</h1>
      <div className="aviso info">Toda plantilla cargada queda <strong>pendiente de aprobación del notario</strong>. Solo las versiones aprobadas se usan para generar borradores; al aprobar una versión, la anterior queda retirada. Variables con <code>{'{{variable}}'}</code> y bloques condicionales <code>{'{{#condicion}} … {{/condicion}}'}</code>.</div>

      <section className="tarjeta">
        <h2 style={{ marginTop: 0 }}>Checklist de plantillas (Fase 0, actualizada)</h2>
        <div className="rejilla tres">
          <div><span className="cifra">{conPlantilla.filter((t) => t.plantillas.some((p) => p.estado === 'APROBADA')).length}</span><div className="suave">tipos con plantilla aprobada</div></div>
          <div><span className="cifra">{conPlantilla.filter((t) => !t.plantillas.some((p) => p.estado === 'APROBADA')).length}</span><div className="suave">con plantilla pendiente de aprobación</div></div>
          <div><span className="cifra">{sinPlantilla.length}</span><div className="suave">tipos sin plantilla (la notaría debe entregarlas)</div></div>
        </div>
        <details><summary>Faltantes por prioridad ({sinPlantilla.length})</summary>
          <ul>{[...sinPlantilla].sort((a, b) => PRIORIDAD[a.prioridad] - PRIORIDAD[b.prioridad]).map((t) => <li key={t.id}><span className={`etiqueta ${t.prioridad === 'Alta' ? 'critica' : t.prioridad === 'Media' ? 'advertencia' : ''}`}>{t.prioridad}</span> {t.nombre} <span className="suave">· {t.categoria}</span></li>)}</ul>
        </details>
        <p className="suave">Detalle completo en docs/plantillas/CHECKLIST_PLANTILLAS.xlsx y en las fichas por tipo.</p>
      </section>

      <section className="tarjeta">
        <h2 style={{ marginTop: 0 }}>Cargar nueva versión</h2>
        <FormAdmin accion={accionCargarPlantilla} campos={[
          { nombre: 'tipoId', etiqueta: 'Tipo de escritura o bloque', tipo: 'select', opciones: tipos.map((t) => [t.id, `${t.esBloque ? '[Bloque] ' : ''}${t.nombre}`]), valor: tipo },
          { nombre: 'archivo', etiqueta: 'Archivo .docx con variables', tipo: 'archivo' },
          { nombre: 'notas', etiqueta: 'Notas de la versión', tipo: 'area' },
        ]} botones={[{ texto: 'Cargar (queda pendiente de aprobación)' }]} />
      </section>

      <table>
        <thead><tr><th>Tipo</th><th>Prioridad</th><th>Versiones</th><th>Formulario</th></tr></thead>
        <tbody>{tipos.filter((t) => t.esBloque || t.plantillas.length).map((t) => (
          <tr key={t.id}>
            <td><a href={`/admin/plantillas?tipo=${t.id}`}>{t.nombre}</a><div className="suave">{t.esBloque ? 'Bloque común' : t.categoria}</div></td>
            <td>{t.prioridad}</td>
            <td>{t.plantillas.map((p) => <div key={p.id}><span className={`etiqueta ${ESTADO[p.estado][0]}`}>v{p.version} {ESTADO[p.estado][1]}</span></div>)}</td>
            <td>{ESQUEMAS[t.id] ? `${ESQUEMAS[t.id].pasos.reduce((n, p) => n + p.campos.length, 0)} campos` : t.esBloque ? '—' : 'sin esquema'}</td>
          </tr>
        ))}</tbody>
      </table>

      {detalle && (
        <section className="tarjeta" style={{ marginTop: '1rem' }}>
          <h2 style={{ marginTop: 0 }}>{detalle.nombre}</h2>
          <p className="suave">{detalle.descripcion}</p>
          <p className="suave">{detalle.normas}</p>
          {ESQUEMAS[detalle.id] && <p>Fuente: {ESQUEMAS[detalle.id].plantillaFuente} · Reglas de cruce: {ESQUEMAS[detalle.id].reglas.join(', ')}</p>}
          {detalle.plantillas.map((p) => (
            <div className="tarjeta" key={p.id}>
              <div className="fila entre"><strong>Versión {p.version} · {p.nombreArchivo}</strong><span className={`etiqueta ${ESTADO[p.estado][0]}`}>{ESTADO[p.estado][1]}</span></div>
              <p className="suave">Cargada {fecha(p.creadaEn)}{p.aprobadaEn ? ` · aprobada ${fecha(p.aprobadaEn)}` : ''} · SHA-256 {p.hashSha256.slice(0, 16)}…</p>
              {p.notas && <p>{p.notas}</p>}
              <a className="boton secundario pequeno" href={`/api/plantillas/${p.id}`}>Descargar para revisar</a>
              {p.estado === 'PENDIENTE_APROBACION' && (
                <FormAdmin accion={accionPlantilla} ocultos={{ id: p.id }} campos={[{ nombre: 'confirmacion', etiqueta: 'Para aprobar escriba: APROBADA POR EL NOTARIO', ayuda: 'Apruebe solo después de que el notario haya revisado el texto de la plantilla.' }]}
                  botones={[{ operacion: 'aprobar', texto: 'Aprobar', clase: 'exito' }, { operacion: 'retirar', texto: 'Retirar', clase: 'secundario' }]} />
              )}
              {p.estado === 'APROBADA' && <FormAdmin accion={accionPlantilla} ocultos={{ id: p.id }} botones={[{ operacion: 'retirar', texto: 'Retirar', clase: 'peligro' }]} confirmar={{ retirar: 'Sin una versión aprobada no se podrán generar borradores de este tipo. ¿Retirar?' }} />}
            </div>
          ))}
        </section>
      )}
    </>
  );
}
