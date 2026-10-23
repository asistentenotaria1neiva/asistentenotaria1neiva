'use client';
/**
 * Preguntas del asistente de IA. El usuario confirma el tipo de escritura y responde; cada
 * respuesta se valida en el servidor contra el campo del formulario al que corresponde.
 */
import { useState, useTransition } from 'react';
import type { Campo } from '@/lib/escritura/esquemas';
import type { RespuestasAsistente } from '@/lib/servicios/asistente';
import type { Resultado } from '../../acciones';
import { Mensaje } from '../../formularios';

export interface PreguntaVista {
  id: string;
  etiqueta: string;
  pregunta: string;
  motivo: string;
  tipo: Campo['tipo'];
  opciones?: { valor: string; etiqueta: string }[];
  obligatoria: boolean;
  /** Valor inicial: el sugerido por la IA o el que ya tiene el expediente */
  inicial: string | string[];
  sugerido: boolean;
  fuente: string | null;
}

type Accion = (r: RespuestasAsistente) => Promise<Resultado & { erroresPreguntas?: Record<string, string> }>;

function Entrada({ p, error }: { p: PreguntaVista; error?: string }) {
  const nombre = `q-${p.id}`;
  const clase = error ? 'invalido' : undefined;
  const opcionesSiNo = [{ valor: 'true', etiqueta: 'Sí' }, { valor: 'false', etiqueta: 'No' }];
  switch (p.tipo) {
    case 'textoLargo':
      return <textarea id={nombre} name={nombre} defaultValue={p.inicial as string} className={clase} rows={4} />;
    case 'fecha':
      return <input id={nombre} name={nombre} type="date" defaultValue={p.inicial as string} className={clase} />;
    case 'booleano':
    case 'opciones':
    case 'persona':
    case 'inmueble':
      return (
        <select id={nombre} name={nombre} defaultValue={p.inicial as string} className={clase}>
          <option value="">— Seleccione —</option>
          {(p.tipo === 'booleano' ? opcionesSiNo : p.opciones ?? []).map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
        </select>
      );
    case 'personas':
    case 'inmuebles':
      return (
        <div role="group" aria-labelledby={`e-${p.id}`}>
          {!p.opciones?.length && <p className="suave">No hay {p.tipo === 'personas' ? 'personas' : 'inmuebles'} registrados: cargue el documento que los acredite.</p>}
          {p.opciones?.map((o) => (
            <label key={o.valor} className="casilla opcion">
              <input type="checkbox" name={nombre} value={o.valor} defaultChecked={(p.inicial as string[]).includes(o.valor)} /> <span>{o.etiqueta}</span>
            </label>
          ))}
        </div>
      );
    default:
      return <input id={nombre} name={nombre} type="text" inputMode={['moneda', 'entero', 'medida'].includes(p.tipo) ? 'decimal' : undefined} defaultValue={p.inicial as string} className={clase} />;
  }
}

export function Cuestionario({ accion, preguntas, actos }: {
  accion: Accion;
  preguntas: PreguntaVista[];
  /** Presente mientras el tipo de escritura no está confirmado */
  actos?: { propuestos: string[]; catalogo: { id: string; titulo: string }[] };
}) {
  const [r, setR] = useState<Resultado>();
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [pendiente, iniciar] = useTransition();
  const [elegidos, setElegidos] = useState<string[]>(actos?.propuestos ?? []);
  return (
    <form onSubmit={(ev) => {
      ev.preventDefault();
      const f = new FormData(ev.currentTarget);
      const omitidas = f.getAll('omitir').map(String);
      const respuestas: RespuestasAsistente['respuestas'] = {};
      for (const p of preguntas) {
        if (omitidas.includes(p.id)) continue;
        respuestas[p.id] = p.tipo === 'personas' || p.tipo === 'inmuebles' ? f.getAll(`q-${p.id}`).map(String) : String(f.get(`q-${p.id}`) ?? '');
      }
      iniciar(async () => {
        const res = await accion({ ...(actos ? { actos: elegidos } : {}), respuestas, omitidas });
        setErrores(res.erroresPreguntas ?? {});
        setR(res);
      });
    }}>
      {actos && (
        <fieldset className="campo">
          <legend><strong>¿Qué actos lleva la escritura?</strong></legend>
          <p className="ayuda">La IA propone los marcados según los documentos. Corrija si es necesario; el orden es el de la escritura.</p>
          {[...actos.catalogo].sort((a, b) => {
            const ia = actos.propuestos.indexOf(a.id), ib = actos.propuestos.indexOf(b.id);
            return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
          }).map((a) => (
            <label key={a.id} className="casilla opcion">
              <input type="checkbox" checked={elegidos.includes(a.id)} disabled={pendiente}
                onChange={(e) => setElegidos((x) => (e.target.checked ? [...x, a.id] : x.filter((y) => y !== a.id)))} />
              <span>{a.titulo}</span>{actos.propuestos.includes(a.id) && <span className="etiqueta informativa">propuesto por la IA</span>}
            </label>
          ))}
        </fieldset>
      )}
      {preguntas.map((p, i) => (
        <div className="campo" key={p.id}>
          <label htmlFor={`q-${p.id}`} id={`e-${p.id}`}>
            <strong>{i + 1}. {p.pregunta}</strong>{p.obligatoria ? <span className="etiqueta advertencia" style={{ marginLeft: '0.4rem' }}>obligatorio</span> : null}
          </label>
          {p.pregunta !== p.etiqueta && <div className="ayuda">{p.etiqueta}</div>}
          <Entrada p={p} error={errores[p.id]} />
          <div className="ayuda">{p.motivo}{p.sugerido && <> · <strong>Sugerido por la IA</strong>{p.fuente ? ` (fuente: ${p.fuente})` : ''}: verifíquelo antes de guardar.</>}</div>
          {errores[p.id] && <div className="error" role="alert">{errores[p.id]}</div>}
          {!p.obligatoria && <label className="casilla"><input type="checkbox" name="omitir" value={p.id} /> Dejar sin respuesta (el dato no aparecerá en la escritura)</label>}
        </div>
      ))}
      <Mensaje r={r} />
      <button type="submit" disabled={pendiente || (!!actos && !elegidos.length)} aria-busy={pendiente}>
        {pendiente && <span className="girador pequeno" aria-hidden="true" />}{pendiente ? 'Guardando…' : actos ? 'Confirmar tipo y guardar respuestas' : 'Guardar respuestas'}
      </button>
    </form>
  );
}
