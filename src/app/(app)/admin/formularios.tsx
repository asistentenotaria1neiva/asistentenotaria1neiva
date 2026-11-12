'use client';
/** Formularios de cliente del panel del administrador */
import { useActionState, useRef, useState, useTransition } from 'react';
import type { ResultadoAdmin } from './acciones';
import { Icono } from '../../Icono';
import { useConfirmacion } from '../../Confirmar';

type Accion = (r: ResultadoAdmin, f: FormData) => Promise<ResultadoAdmin>;

function Mensaje({ r }: { r?: ResultadoAdmin }) {
  if (!r) return null;
  return (
    <>
      {r.error && <div className="aviso error" role="alert"><Icono nombre="error" /><div>{r.error}</div></div>}
      {r.ok && <div className="aviso exito" role="status"><Icono nombre="exito" /><div>{r.ok}</div></div>}
      {r.secreto && <div className="aviso alerta"><Icono nombre="candado" /><div>Contraseña temporal (se muestra una sola vez; entréguela personalmente): <code>{r.secreto}</code></div></div>}
    </>
  );
}

/** Formulario genérico: campos ocultos fijos + campos visibles + botones de operación */
export function FormAdmin({ accion, ocultos = {}, campos = [], botones, confirmar, mensajePendiente, columnas }: {
  accion: Accion;
  /** Distribuye los campos en columnas cuando hay espacio (en móvil queda una sola) */
  columnas?: boolean;
  ocultos?: Record<string, string>;
  campos?: { nombre: string; etiqueta: string; tipo?: 'texto' | 'area' | 'select' | 'archivo'; opciones?: [string, string][]; valor?: string; ayuda?: string }[];
  botones: { operacion?: string; texto: string; clase?: string }[];
  confirmar?: Record<string, string>;
  /** Aviso mientras la acción está en curso (p. ej. revisiones de la IA, que tardan) */
  mensajePendiente?: string;
}) {
  const [r, enviar, pendiente] = useActionState(accion, {});
  const [pedir, dialogo] = useConfirmacion();
  const confirmado = useRef(false);
  return (
    <form action={enviar} onSubmit={(e) => {
      if (confirmado.current) { confirmado.current = false; return; }
      const boton = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
      const op = boton?.value ?? '';
      if (!confirmar?.[op]) return;
      e.preventDefault();
      const formulario = e.currentTarget;
      pedir({ texto: confirmar[op], boton: boton?.textContent ?? undefined }).then((ok) => { if (ok) { confirmado.current = true; formulario.requestSubmit(boton); } });
    }}>
      {pendiente && mensajePendiente ? <div className="aviso info" role="status"><span className="girador pequeno" aria-hidden="true" /><div>{mensajePendiente}</div></div> : <Mensaje r={r} />}
      {Object.entries(ocultos).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div className={columnas ? 'campos-columnas' : undefined}>{campos.map((c) => (
        <div className="campo" key={c.nombre}>
          <label htmlFor={`f-${c.nombre}-${ocultos.id ?? ''}`}>{c.etiqueta}</label>
          {c.tipo === 'area' ? <textarea id={`f-${c.nombre}-${ocultos.id ?? ''}`} name={c.nombre} defaultValue={c.valor} />
            : c.tipo === 'select' ? <select id={`f-${c.nombre}-${ocultos.id ?? ''}`} name={c.nombre} defaultValue={c.valor}>{c.opciones?.map(([v, txt]) => <option key={v} value={v}>{txt}</option>)}</select>
            : c.tipo === 'archivo' ? <input id={`f-${c.nombre}-${ocultos.id ?? ''}`} name={c.nombre} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
            : <input id={`f-${c.nombre}-${ocultos.id ?? ''}`} name={c.nombre} type="text" defaultValue={c.valor} />}
          {c.ayuda && <div className="ayuda">{c.ayuda}</div>}
        </div>
      ))}</div>
      <div className="fila chica">
        {botones.map((b) => <button key={b.texto} type="submit" name="operacion" value={b.operacion ?? ''} className={`pequeno ${b.clase ?? ''}`} disabled={pendiente} aria-busy={pendiente}>{b.texto}</button>)}
        {pendiente && !mensajePendiente && <span className="girador pequeno" aria-hidden="true" />}
      </div>
      {dialogo}
    </form>
  );
}

/** Abre el cuadro de impresión del navegador (desde ahí se guarda como PDF) */
export function BotonImprimir() {
  return <button type="button" className="secundario no-imprimir" onClick={() => window.print()}><Icono nombre="imprimir" tamano={18} />Imprimir o guardar como PDF</button>;
}

export function BotonVerificar({ accion }: { accion: () => Promise<ResultadoAdmin> }) {
  const [r, setR] = useState<ResultadoAdmin>();
  const [pendiente, iniciar] = useTransition();
  return (
    <div>
      <button type="button" className="secundario" disabled={pendiente} aria-busy={pendiente} onClick={() => iniciar(async () => setR(await accion()))}>
        {pendiente ? <span className="girador pequeno" aria-hidden="true" /> : <Icono nombre="auditoria" tamano={18} />}{pendiente ? 'Verificando…' : 'Verificar integridad de la cadena'}
      </button>
      {r && <div className="mt-chico"><Mensaje r={r} /></div>}
    </div>
  );
}
