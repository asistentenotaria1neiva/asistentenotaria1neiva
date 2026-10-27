/** Presentación del panel de plantillas (servidor) */
import type { Parrafo } from '@/lib/escritura/vista-previa';
import type { RevisionPlantilla, Veredicto } from '@/lib/servicios/revision-plantillas';
import type { Variabilizacion } from '@/lib/servicios/variabilizar-plantilla';
import { EtiquetaNivel } from '../componentes';

export const ESTADO_PLANTILLA: Record<string, [string, string]> = {
  APROBADA: ['ok', 'aprobada'], PENDIENTE_APROBACION: ['advertencia', 'pendiente de aprobación'], RETIRADA: ['', 'retirada'],
};

const VEREDICTO: Record<Veredicto, [string, string]> = {
  APTA: ['ok', 'IA: apta'], APTA_CON_OBSERVACIONES: ['advertencia', 'IA: con observaciones'], NO_APTA: ['critica', 'IA: no apta'],
};

export const CATEGORIA: Record<string, string> = {
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

/** Resultado de convertir un caso real en plantilla: qué dato se cambió por qué variable (sin los datos reales) */
export function PanelConversion({ conversion: c }: { conversion: Variabilizacion }) {
  return (
    <section className="tarjeta">
      <h2 style={{ marginTop: 0 }}>Conversión de caso real</h2>
      {c.error ? <div className="aviso alerta">La IA no pudo convertir el archivo ({c.error}); se cargó tal como venía. Si tiene datos de un caso, la revisión los señala como «Dato fijo».</div>
        : !c.esCasoReal ? <p className="suave">La IA no encontró datos de un caso real: el archivo se cargó tal como venía.{c.resumen ? ` ${c.resumen}` : ''}</p>
        : (
          <>
            <p>{c.resumen}</p>
            {c.reemplazos.length > 0 && (
              <details open={c.reemplazos.length <= 8}>
                <summary>{c.reemplazos.length} dato(s) cambiados por variables</summary>
                <ul className="lista-codigo">{c.reemplazos.map((r) => <li key={r.variable}>{r.dato} → <code>{r.variable}</code>{r.veces > 1 ? <span className="suave"> ({r.veces} veces)</span> : null}{c.nuevas.includes(r.variable.slice(2, -2).split('|')[0].trim()) && <> <span className="etiqueta advertencia">nueva</span></>}</li>)}</ul>
              </details>
            )}
            {c.nuevas.length > 0 && <p className="suave">Las variables marcadas «nueva» aún no las sabe llenar el sistema: en la vista con datos de ejemplo se llenan con los valores ficticios que propuso la IA, pero para generar escrituras hay que incorporarlas.</p>}
            {c.noAplicados.length > 0 && (
              <div className="aviso alerta">
                Siguen escritos en la plantilla (cámbielos en Word):
                <ul>{c.noAplicados.map((x, i) => <li key={i}>{x.dato}: {x.motivo}</li>)}</ul>
              </div>
            )}
          </>
        )}
      {c.advertencias.length > 0 && (
        <>
          <h3>Para revisar</h3>
          <ul>{c.advertencias.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </>
      )}
      {c.reemplazos.length > 0 && <p className="suave">Los datos reales del archivo no se guardan; la plantilla quedó sin datos y la vista «Con datos de ejemplo» la muestra llenada con datos ficticios.</p>}
    </section>
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
            : a.prueba.deMuestra?.length ? <li>Con datos de ejemplo se llenaron todas las variables; {a.prueba.deMuestra.length} con valores genéricos de muestra porque el formulario del expediente aún no las pide: <code>{a.prueba.deMuestra.join(', ')}</code></li>
            : <li>Con datos de ejemplo se llenaron todas las variables.</li>}
        </ul>
      </details>
    </>
  );
}
