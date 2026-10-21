'use client';
/** Formularios pequeños de cliente para las acciones de los expedientes */
import { useActionState, useState, useTransition } from 'react';
import type { Resultado } from './acciones';

export function Mensaje({ r }: { r?: Resultado }) {
  if (!r) return null;
  return (
    <>
      {r.error && <div className="aviso error" role="alert">{r.error}</div>}
      {r.ok && !r.error && <div className="aviso exito" role="status">{r.ok}</div>}
    </>
  );
}

/** Botón que ejecuta una acción sin formulario (p. ej. analizar, revisar, generar) */
export function BotonAccion({ accion, texto, textoPendiente, clase, confirmar }: {
  accion: () => Promise<Resultado>; texto: string; textoPendiente?: string; clase?: string; confirmar?: string;
}) {
  const [r, setR] = useState<Resultado>();
  const [pendiente, iniciar] = useTransition();
  return (
    <span>
      <button type="button" className={clase} disabled={pendiente} onClick={() => {
        if (confirmar && !window.confirm(confirmar)) return;
        iniciar(async () => setR(await accion()));
      }}>{pendiente ? (textoPendiente ?? 'Procesando…') : texto}</button>
      <Mensaje r={r} />
    </span>
  );
}

export function FormularioNuevo({ accion, actos }: { accion: (r: Resultado, f: FormData) => Promise<Resultado>; actos: { id: string; nombre: string; estadoPlantilla: string }[] }) {
  const [r, enviar, pendiente] = useActionState(accion, {});
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const mover = (i: number, d: -1 | 1) => setSeleccion((s) => { const n = [...s]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });
  return (
    <form action={enviar}>
      <Mensaje r={r} />
      <input type="hidden" name="actos" value={seleccion.join(',')} />
      <div className="rejilla dos">
        <div className="tarjeta">
          <h2 style={{ marginTop: 0 }}>Actos disponibles</h2>
          <p className="suave">Seleccione los actos de la escritura. Si la escritura combina varios (p. ej. cancelación de patrimonio + compraventa), agréguelos en el orden en que deben aparecer.</p>
          {actos.map((a) => (
            <label key={a.id} className="casilla">
              <input type="checkbox" checked={seleccion.includes(a.id)} onChange={(e) => setSeleccion((s) => e.target.checked ? [...s, a.id] : s.filter((x) => x !== a.id))} />
              {a.nombre} {a.estadoPlantilla !== 'APROBADA' && <span className="etiqueta advertencia">plantilla pendiente de aprobación</span>}
            </label>
          ))}
        </div>
        <div className="tarjeta">
          <h2 style={{ marginTop: 0 }}>Orden en la escritura</h2>
          {!seleccion.length && <p className="suave">Aún no ha seleccionado actos.</p>}
          <ol>
            {seleccion.map((id, i) => (
              <li key={id} className="fila" style={{ marginBottom: '0.4rem' }}>
                <span>{actos.find((a) => a.id === id)?.nombre}</span>
                <button type="button" className="secundario pequeno" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Subir">↑</button>
                <button type="button" className="secundario pequeno" disabled={i === seleccion.length - 1} onClick={() => mover(i, 1)} aria-label="Bajar">↓</button>
              </li>
            ))}
          </ol>
          <button type="submit" disabled={pendiente || !seleccion.length}>Crear expediente</button>
        </div>
      </div>
    </form>
  );
}

/**
 * Carga de documentos: se envía un archivo por petición, para no superar el límite de tamaño
 * por petición del servidor (en Vercel, 4,5 MB). Los archivos que superan limiteMb se rechazan
 * antes de enviarlos.
 */
export function FormularioCarga({ accion, tipos, limiteMb }: { accion: (r: Resultado, f: FormData) => Promise<Resultado>; tipos: [string, string][]; limiteMb: number }) {
  const [r, setR] = useState<Resultado>();
  const [pendiente, iniciar] = useTransition();
  return (
    <form onSubmit={(ev) => {
      ev.preventDefault();
      const formulario = ev.currentTarget;
      const datos = new FormData(formulario);
      const tipo = String(datos.get('tipo') ?? 'OTRO');
      const archivos = datos.getAll('archivo').filter((x): x is File => x instanceof File && x.size > 0);
      const grandes = archivos.filter((a) => a.size > limiteMb * 1024 * 1024);
      if (grandes.length) { setR({ error: `Superan ${limiteMb} MB: ${grandes.map((a) => a.name).join(', ')}. Reduzca su tamaño (p. ej. escanee a menor resolución) e intente de nuevo.` }); return; }
      iniciar(async () => {
        let cargados = 0;
        for (const a of archivos) {
          const f = new FormData();
          f.set('tipo', tipo);
          f.set('archivo', a);
          const res = await accion({}, f);
          if (res.error) { setR({ error: cargados ? `${cargados} documento(s) cargado(s). Falló «${a.name}»: ${res.error}` : res.error }); return; }
          cargados++;
        }
        formulario.reset();
        setR({ ok: `${cargados} documento(s) cargado(s) y cifrado(s).` });
      });
    }}>
      <Mensaje r={r} />
      <div className="rejilla tres">
        <div className="campo"><label htmlFor="tipo">Tipo de documento</label>
          <select id="tipo" name="tipo" required>{tipos.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="campo"><label htmlFor="archivo">Archivo(s) PDF o imagen (máx. {limiteMb} MB c/u)</label><input id="archivo" name="archivo" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple required /></div>
        <div className="campo"><label>&nbsp;</label><button type="submit" disabled={pendiente}>{pendiente ? 'Cargando y cifrando…' : 'Cargar'}</button></div>
      </div>
    </form>
  );
}

export function FormularioResolver({ accion, observacionId, nivel, origen, puedeDescartarCritica }: {
  accion: (r: Resultado, f: FormData) => Promise<Resultado>; observacionId: string; nivel: string; origen: string; puedeDescartarCritica: boolean;
}) {
  const [r, enviar, pendiente] = useActionState(accion, {});
  const critica = nivel === 'CRITICA';
  if (critica && origen === 'REGLA') return <p className="suave">Corrija el dato en el formulario y ejecute de nuevo la revisión.</p>;
  return (
    <form action={enviar}>
      <Mensaje r={r} />
      <input type="hidden" name="observacionId" value={observacionId} />
      <div className="campo"><label htmlFor={`j-${observacionId}`}>Justificación</label>
        <textarea id={`j-${observacionId}`} name="justificacion" minLength={0} placeholder="Explique la decisión (obligatorio para justificar o descartar)" /></div>
      <label className="casilla"><input type="checkbox" name="falsaAlarma" /> Fue una falsa alarma</label>
      <div className="fila" style={{ marginTop: '0.5rem' }}>
        {origen === 'IA' && <button type="submit" name="decision" value="CORREGIDA" className="exito pequeno" disabled={pendiente}>Corregí el dato</button>}
        {!critica && <button type="submit" name="decision" value="JUSTIFICADA" className="secundario pequeno" disabled={pendiente}>Justificar</button>}
        {(!critica || puedeDescartarCritica) && <button type="submit" name="decision" value="DESCARTADA" className="secundario pequeno" disabled={pendiente}>Descartar (falsa alarma)</button>}
      </div>
    </form>
  );
}

export function FormularioFlujo({ accion, botones, campos }: {
  accion: (r: Resultado, f: FormData) => Promise<Resultado>;
  botones: { valor: string; texto: string; clase?: string }[];
  campos?: { nombre: string; etiqueta: string; tipo: 'texto' | 'numero' | 'area' | 'select'; opciones?: [string, string][] }[];
}) {
  const [r, enviar, pendiente] = useActionState(accion, {});
  return (
    <form action={enviar}>
      <Mensaje r={r} />
      {campos?.map((c) => (
        <div className="campo" key={c.nombre}><label htmlFor={c.nombre}>{c.etiqueta}</label>
          {c.tipo === 'area' ? <textarea id={c.nombre} name={c.nombre} /> : c.tipo === 'select'
            ? <select id={c.nombre} name={c.nombre}>{c.opciones?.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
            : <input id={c.nombre} name={c.nombre} type={c.tipo === 'numero' ? 'number' : 'text'} />}
        </div>
      ))}
      <div className="fila">{botones.map((b) => <button key={b.valor} type="submit" name="accion" value={b.valor} className={b.clase} disabled={pendiente}>{b.texto}</button>)}</div>
    </form>
  );
}
