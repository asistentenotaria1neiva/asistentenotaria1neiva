/** Avance de un análisis en segundo plano: porcentaje y documentos que se están analizando */
import type { tareaEnCurso } from '@/lib/servicios/tareas';
import { RefrescoAutomatico } from '../formularios';
import { fecha } from '../../componentes';

export function ProgresoAnalisis({ tarea }: { tarea: NonNullable<Awaited<ReturnType<typeof tareaEnCurso>>> }) {
  const detalle = tarea.fase === 'EXPEDIENTE'
    ? 'Documentos listos. La IA está revisando el expediente y preparando las preguntas…'
    : tarea.fase === 'BUSQUEDA'
      ? 'Documentos leídos. La IA está buscando en ellos los datos que aún faltan…'
      : tarea.analizando.length
      ? <>Analizando: <strong>{tarea.analizando.join(', ')}</strong></>
      : tarea.total ? 'Preparando el siguiente documento…' : 'Revisando los documentos…';
  return (
    <div className="aviso info progreso-analisis" role="status">
      <div className="fila entre">
        <span>{detalle}</span>
        <strong>{tarea.porcentaje} %</strong>
      </div>
      <progress max={100} value={tarea.porcentaje} aria-label="Avance del análisis">{tarea.porcentaje} %</progress>
      <div className="suave">
        {tarea.total > 0 && `${tarea.hechos} de ${tarea.total} documento(s) analizado(s) · `}
        Iniciado {fecha(tarea.iniciada)}. Puede salir de esta página: le avisaremos en «Notificaciones» al terminar.
      </div>
      <RefrescoAutomatico />
    </div>
  );
}
