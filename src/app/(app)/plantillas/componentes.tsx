/** Presentación del panel de plantillas (servidor) */
import type { Parrafo } from '@/lib/escritura/vista-previa';
import { enRevision, type RevisionPlantilla, type Veredicto } from '@/lib/servicios/revision-plantillas';
import { EtiquetaNivel } from '../componentes';

export const ESTADO_PLANTILLA: Record<string, [string, string]> = {
  APROBADA: ['ok', 'aprobada'], PENDIENTE_APROBACION: ['advertencia', 'pendiente de aprobación'], RETIRADA: ['', 'retirada'],
};

const VEREDICTO: Record<Veredicto, [string, string]> = {
  APTA: ['ok', 'IA: apta'], APTA_CON_OBSERVACIONES: ['advertencia', 'IA: con observaciones'], NO_APTA: ['critica', 'IA: no apta'],
};

export const CATEGORIA: Record<string, string> = {
  TIPO: 'Tipo de escritura', VARIABLES: 'Variables', DATO_FIJO: 'Dato fijo', REDACCION: 'Redacción', CONTENIDO: 'Contenido del acto', CAMBIO: 'Cambio', FORMATO: 'Formato',
};

export function EtiquetaVeredicto({ revision }: { revision: RevisionPlantilla | null }) {
  if (enRevision(revision)) return <span className="etiqueta informativa fila" style={{ gap: '0.5rem', display: 'inline-flex' }}><span className="girador pequeno" aria-hidden="true" /> Analizando con IA…</span>;
  if (!revision) return <span className="etiqueta">sin revisar</span>;
  if (!revision.ia) return <span className="etiqueta">{revision.errorIA ? 'IA sin respuesta' : 'sin revisión IA'}</span>;
  const [clase, texto] = VEREDICTO[revision.ia.veredicto];
  return <span className={`etiqueta ${clase}`}>{texto}</span>;
}

/** El documento como se ve en papel (si una plantilla antigua tiene etiquetas {{…}}, se resaltan) */
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

/** Hallazgos ordenados por nivel, con su índice original (el que usa la corrección con IA) */
export function hallazgosOrdenados(revision: RevisionPlantilla | null) {
  const orden = { CRITICA: 0, ADVERTENCIA: 1, INFORMATIVA: 2 };
  return (revision?.ia?.hallazgos ?? []).map((h, indice) => ({ ...h, indice })).sort((x, y) => orden[x.nivel] - orden[y.nivel]);
}

/** ocultarHallazgos: el panel «Arreglar con IA» ya los muestra con casillas para elegirlos */
export function PanelRevision({ revision, revisadaEn, ocultarHallazgos }: { revision: RevisionPlantilla | null; revisadaEn: string; ocultarHallazgos?: boolean }) {
  if (!revision) return <p className="suave">Esta versión aún no ha sido revisada.</p>;
  const a = revision.automatica;
  return (
    <>
      <p className="suave">Revisada por {revision.revisadaPor} · {revisadaEn}{revision.ia ? ` · ${revision.ia.modelo}` : ''}</p>
      {revision.errorIA && <div className="aviso error">La IA no respondió: {revision.errorIA}</div>}
      {revision.ia && (
        <>
          <p><EtiquetaVeredicto revision={revision} /></p>
          <p>{revision.ia.resumen}</p>
          {revision.ia.hallazgos.length > 0 && ocultarHallazgos && <p className="suave">{revision.ia.hallazgos.length} hallazgo(s): revíselos y elija cuáles arreglar en «Arreglar con IA».</p>}
          {revision.ia.hallazgos.length > 0 && !ocultarHallazgos && (
            <ul className="hallazgos">
              {hallazgosOrdenados(revision).map((h) => (
                <li key={h.indice}>
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
      <details>
        <summary>Verificación automática</summary>
        <ul>
          {a.parrafos !== undefined && <li>{a.parrafos} párrafos y {a.palabras} palabras.</li>}
          {a.comparadaCon
            ? <li>Frente a la versión aprobada {a.comparadaCon}{a.parrafosCambiados !== undefined ? `: ${a.parrafosCambiados} párrafo(s) cambiaron` : ''}.</li>
            : <li>No hay versión aprobada con la cual comparar.</li>}
        </ul>
      </details>
    </>
  );
}
