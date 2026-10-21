'use client';
/** Formularios de cliente del panel del administrador */
import { useActionState, useState, useTransition } from 'react';
import type { ResultadoAdmin } from './acciones';

type Accion = (r: ResultadoAdmin, f: FormData) => Promise<ResultadoAdmin>;

function Mensaje({ r }: { r?: ResultadoAdmin }) {
  if (!r) return null;
  return (
    <>
      {r.error && <div className="aviso error" role="alert">{r.error}</div>}
      {r.ok && <div className="aviso exito" role="status">{r.ok}</div>}
      {r.secreto && <div className="aviso alerta">Contraseña temporal (se muestra una sola vez): <code>{r.secreto}</code></div>}
    </>
  );
}

/** Formulario genérico: campos ocultos fijos + campos visibles + botones de operación */
export function FormAdmin({ accion, ocultos = {}, campos = [], botones, confirmar }: {
  accion: Accion;
  ocultos?: Record<string, string>;
  campos?: { nombre: string; etiqueta: string; tipo?: 'texto' | 'area' | 'select' | 'archivo'; opciones?: [string, string][]; valor?: string; ayuda?: string }[];
  botones: { operacion?: string; texto: string; clase?: string }[];
  confirmar?: Record<string, string>;
}) {
  const [r, enviar, pendiente] = useActionState(accion, {});
  return (
    <form action={enviar} onSubmit={(e) => {
      const op = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value ?? '';
      if (confirmar?.[op] && !window.confirm(confirmar[op])) e.preventDefault();
    }}>
      <Mensaje r={r} />
      {Object.entries(ocultos).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {campos.map((c) => (
        <div className="campo" key={c.nombre}>
          <label htmlFor={`f-${c.nombre}-${ocultos.id ?? ''}`}>{c.etiqueta}</label>
          {c.tipo === 'area' ? <textarea id={`f-${c.nombre}-${ocultos.id ?? ''}`} name={c.nombre} defaultValue={c.valor} />
            : c.tipo === 'select' ? <select id={`f-${c.nombre}-${ocultos.id ?? ''}`} name={c.nombre} defaultValue={c.valor}>{c.opciones?.map(([v, txt]) => <option key={v} value={v}>{txt}</option>)}</select>
            : c.tipo === 'archivo' ? <input id={`f-${c.nombre}-${ocultos.id ?? ''}`} name={c.nombre} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
            : <input id={`f-${c.nombre}-${ocultos.id ?? ''}`} name={c.nombre} type="text" defaultValue={c.valor} />}
          {c.ayuda && <div className="ayuda">{c.ayuda}</div>}
        </div>
      ))}
      <div className="fila">
        {botones.map((b) => <button key={b.texto} type="submit" name="operacion" value={b.operacion ?? ''} className={`pequeno ${b.clase ?? ''}`} disabled={pendiente}>{b.texto}</button>)}
      </div>
    </form>
  );
}

export function BotonVerificar({ accion }: { accion: () => Promise<ResultadoAdmin> }) {
  const [r, setR] = useState<ResultadoAdmin>();
  const [pendiente, iniciar] = useTransition();
  return (
    <div>
      <button type="button" disabled={pendiente} onClick={() => iniciar(async () => setR(await accion()))}>{pendiente ? 'Verificando…' : 'Verificar integridad de la cadena'}</button>
      <Mensaje r={r} />
    </div>
  );
}
