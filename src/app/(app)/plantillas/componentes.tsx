/** Presentación del panel de plantillas (servidor) */
import type { Parrafo } from '@/lib/escritura/vista-previa';
import type { RevisionPlantilla, Veredicto } from '@/lib/servicios/revision-plantillas';
import { EtiquetaNivel } from '../componentes';

export const ESTADO_PLANTILLA: Record<string, [string, string]> = {
  APROBADA: ['ok', 'aprobada'], PENDIENTE_APROBACION: ['advertencia', 'pendiente de aprobación'], RETIRADA: ['', 'retirada'],
};

const VEREDICTO: Record<Veredicto, [string, string]> = {
  APTA: ['ok', 'IA: apta'], APTA_CON_OBSERVACIONES: ['advertencia', 'IA: con observaciones'], NO_APTA: ['critica', 'IA: no apta'],
};

const CATEGORIA: Record<string, string> = {
  VARIABLES: 'Variables', DATO_FIJO: 'Dato fijo', REDACCION: 'Redacción', CONTENIDO: 'Contenido del acto', CAMBIO: 'Cambio', FORMATO: 'Formato',
};

export function EtiquetaVeredicto({ revision }: { revision: RevisionPlantilla | null }) {
  if (!revision) return <span className="etiqueta">sin revisar</span>;
  if (!revision.ia) return <span className="etiqueta">IA sin respuesta</span>;
  const [clase, texto] = VEREDICTO[revision.ia.veredicto];
  return <span className={`etiqueta ${clase}`}>{texto}</span>;
}

/** El documento como se ve en papel, con las variables y condiciones resaltadas */
export function VistaDocumento({ parrafos }: { parrafos: Parrafo[] }) {
  return (
    <div className="documento">
      {parrafos.map((p, i) => (
        <p key={i} className={p.alineacion}>
          {p.segmentos.length ? p.segmentos.map((s, j) => {
            let n: React.ReactNode = s.texto;
            if (s.subrayado) n = <u>{n}</u>;
            if (s.cursiva) n = <em>{n}</em>;
            if (s.negrita) n = <strong>{n}</strong>;
            return s.clase === 'texto' ? <span key={j}>{n}</span> : <span key={j} className={`marca-${s.clase}`}>{n}</span>;
          }) : ' '}
        </p>
      ))}
    </div>
  );
}

export function LeyendaPlantilla() {
  return (
    <div className="fila suave leyenda">
      <span><span className="marca-variable">{'{{variable}}'}</span> dato del expediente</span>
      <span><span className="marca-condicion">{'{{#condición}}'}</span> inicio de texto condicional</span>
      <span><span className="marca-cierre">{'{{/condición}}'}</span> fin del texto condicional</span>
    </div>
  );
}

export function PanelRevision({ revision, revisadaEn }: { revision: RevisionPlantilla | null; revisadaEn: string }) {
  if (!revision) return <p className="suave">Esta versión aún no ha sido revisada.</p>;
  const a = revision.automatica;
  const nivelesOrden = { CRITICA: 0, ADVERTENCIA: 1, INFORMATIVA: 2 };
  return (
    <>
      <p className="suave">Revisada por {revision.revisadaPor} · {revisadaEn}{revision.ia ? ` · ${revision.ia.modelo}` : ''}</p>
      {revision.errorIA && <div className="aviso error">La IA no respondió: {revision.errorIA}</div>}
      {revision.ia && (
        <>
          <p><EtiquetaVeredicto revision={revision} /></p>
          <p>{revision.ia.resumen}</p>
          {revision.ia.hallazgos.length > 0 && (
            <ul className="hallazgos">
              {[...revision.ia.hallazgos].sort((x, y) => nivelesOrden[x.nivel] - nivelesOrden[y.nivel]).map((h, i) => (
                <li key={i}>
                  <div className="fila"><EtiquetaNivel nivel={h.nivel} /><span className="suave">{CATEGORIA[h.categoria] ?? h.categoria}</span></div>
                  <div>{h.mensaje}</div>
                  {h.fragmento && <blockquote>{h.fragmento}</blockquote>}
                </li>
              ))}
            </ul>
          )}
          {revision.ia.cambios.length > 0 && (
            <details><summary>Cambios frente a la versión aprobada ({revision.ia.cambios.length})</summary>
              <ul>{revision.ia.cambios.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </details>
          )}
        </>
      )}
      <details open={!!a.prueba?.faltantes.length || !!a.prueba?.error}>
        <summary>Verificación automática</summary>
        <ul>
          <li>{a.etiquetas.variables.length} variables y {a.etiquetas.condiciones.length} condiciones distintas.</li>
          {a.comparadaCon
            ? <li>Frente a la versión aprobada {a.comparadaCon}: {a.nuevas.length ? <>nuevas <code>{a.nuevas.join(', ')}</code></> : 'sin etiquetas nuevas'}; {a.eliminadas.length ? <>ya no aparecen <code>{a.eliminadas.join(', ')}</code></> : 'no se retiró ninguna'}.</li>
            : <li>No hay versión aprobada con la cual comparar.</li>}
          {!a.prueba ? <li>No hay caso de datos de ejemplo para este tipo: no se probó el llenado.</li>
            : a.prueba.error ? <li className="texto-peligro">Prueba con datos de ejemplo: {a.prueba.error}</li>
            : a.prueba.faltantes.length ? <li className="texto-peligro">Con datos de ejemplo, el sistema no supo llenar: <code>{a.prueba.faltantes.join(', ')}</code></li>
            : <li>Con datos de ejemplo se llenaron todas las variables.</li>}
        </ul>
      </details>
    </>
  );
}
