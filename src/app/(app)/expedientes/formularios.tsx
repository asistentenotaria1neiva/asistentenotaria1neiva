'use client';
/** Formularios pequeños de cliente para las acciones de los expedientes */
import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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
    <div className="accion">
      <button type="button" className={clase} disabled={pendiente} aria-busy={pendiente} onClick={() => {
        if (confirmar && !window.confirm(confirmar)) return;
        iniciar(async () => setR(await accion()));
      }}>{pendiente && <span className="girador pequeno" aria-hidden="true" />}{pendiente ? (textoPendiente ?? 'Procesando…') : texto}</button>
      <Mensaje r={r} />
    </div>
  );
}

/** Vuelve a pedir la página cada cierto tiempo mientras hay un proceso en segundo plano */
export function RefrescoAutomatico({ segundos = 5 }: { segundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), segundos * 1000);
    return () => clearInterval(t);
  }, [router, segundos]);
  return null;
}

const sinTildes =(x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function FormularioNuevo({ accion, actos }: { accion: (r: Resultado, f: FormData) => Promise<Resultado>; actos: { id: string; nombre: string; estadoPlantilla: string }[] }) {
  const [r, enviar, pendiente] = useActionState(accion, {});
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const mover = (i: number, d: -1 | 1) => setSeleccion((s) => { const n = [...s]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });
  const [busqueda, setBusqueda] = useState('');
  const terminos = sinTildes(busqueda).split(/\s+/).filter(Boolean);
  // Cada palabra escrita debe aparecer en el nombre, en cualquier orden
  const visibles = actos.filter((a) => terminos.every((t) => sinTildes(a.nombre).includes(t)));
  return (
    <form action={enviar}>
      <Mensaje r={r} />
      <input type="hidden" name="actos" value={seleccion.join(',')} />
      <div className="rejilla dos">
        <div className="tarjeta">
          <h2>1. Actos disponibles</h2>
          <p className="suave">Seleccione los actos de la escritura. Si la escritura combina varios (p. ej. cancelación de patrimonio + compraventa), agréguelos en el orden en que deben aparecer.</p>
          <div className="campo buscar-actos">
            <label htmlFor="buscar-acto">Buscar acto</label>
            <div className="fila" style={{ gap: '0.5rem', flexWrap: 'nowrap' }}>
              <input id="buscar-acto" type="search" value={busqueda} placeholder="Escriba parte del nombre (p. ej. hipoteca)" autoComplete="off"
                onChange={(e) => setBusqueda(e.target.value)}
                // Enter no envía el formulario: si hay un solo resultado, lo selecciona
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  if (visibles.length === 1 && !seleccion.includes(visibles[0].id)) { setSeleccion((s) => [...s, visibles[0].id]); setBusqueda(''); }
                }} />
              {busqueda && <button type="button" className="secundario" onClick={() => setBusqueda('')}>Limpiar</button>}
            </div>
            <div className="ayuda" aria-live="polite">{busqueda ? `${visibles.length} de ${actos.length} actos` : `${actos.length} actos disponibles`}{seleccion.length ? ` · ${seleccion.length} seleccionado(s)` : ''}</div>
          </div>
          {!visibles.length && <p className="suave vacio">Ningún acto coincide con «{busqueda}».</p>}
          {visibles.map((a) => (
            <label key={a.id} className="casilla opcion">
              <input type="checkbox" checked={seleccion.includes(a.id)} onChange={(e) => setSeleccion((s) => e.target.checked ? [...s, a.id] : s.filter((x) => x !== a.id))} />
              <span>{a.nombre}</span> {a.estadoPlantilla !== 'APROBADA' && <span className="etiqueta advertencia">plantilla pendiente de aprobación</span>}
            </label>
          ))}
        </div>
        <div className="tarjeta" style={{ alignSelf: 'start', position: 'sticky', top: '1rem' }}>
          <h2>2. Orden en la escritura</h2>
          {!seleccion.length && <p className="suave">Aún no ha seleccionado actos.</p>}
          <ol className="lista-orden">
            {seleccion.map((id, i) => (
              <li key={id}>
                <div className="fila">
                  <span>{actos.find((a) => a.id === id)?.nombre}</span>
                  <span className="botones-orden">
                    <button type="button" className="secundario pequeno" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Subir" title="Subir">↑</button>
                    <button type="button" className="secundario pequeno" disabled={i === seleccion.length - 1} onClick={() => mover(i, 1)} aria-label="Bajar" title="Bajar">↓</button>
                  </span>
                </div>
              </li>
            ))}
          </ol>
          <button type="submit" disabled={pendiente || !seleccion.length} style={{ width: '100%' }}>{pendiente ? 'Creando…' : 'Crear expediente'}</button>
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
      <div className="filtros">
        <div><label htmlFor="tipo">Tipo de documento</label>
          <select id="tipo" name="tipo" required>{tipos.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="ancho"><label htmlFor="archivo">Archivo(s) PDF o imagen (máx. {limiteMb} MB c/u)</label><input id="archivo" name="archivo" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple required /></div>
        <div className="acciones-filtro"><button type="submit" disabled={pendiente} aria-busy={pendiente}>{pendiente && <span className="girador pequeno" aria-hidden="true" />}{pendiente ? 'Cargando y cifrando…' : 'Cargar'}</button></div>
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

const NIVELES: Record<string, string> = { CRITICA: 'Crítica', ADVERTENCIA: 'Advertencia', INFORMATIVA: 'Informativa' };
const CLASE_NIVEL: Record<string, string> = { CRITICA: 'critica', ADVERTENCIA: 'advertencia', INFORMATIVA: 'informativa' };

export interface PropuestaVista { indice: number; observacion: string; etiqueta: string; antes: string; despues: string; explicacion: string; fuente: string }

/**
 * Corrección con IA de las observaciones: primero se eligen las observaciones y, cuando la IA
 * responde, se eligen las propuestas que se aplican. El mensaje de resultado vive aquí para que
 * no se pierda al pasar de un paso al otro (la página se vuelve a renderizar en el servidor).
 */
export function PanelCorreccionIA({ proponer, aplicar, observaciones, propuesta, enCurso, error }: {
  proponer: (ids: string[]) => Promise<Resultado>;
  aplicar?: (indices: number[]) => Promise<Resultado>;
  observaciones: { id: string; nivel: string; mensaje: string }[];
  propuesta?: { id: string; fecha: string; propuestas: PropuestaVista[]; sinCorreccion: { observacion: string; motivo: string }[] };
  /** Fecha de inicio si la IA está preparando una propuesta en segundo plano */
  enCurso?: string;
  /** Error del último intento, si falló */
  error?: string;
}) {
  const [r, setR] = useState<Resultado>();
  return (
    <>
      <h2 style={{ marginTop: 0 }}>{propuesta ? 'Correcciones propuestas por la IA' : 'Arreglar con IA'}</h2>
      <p className="suave">{propuesta
        ? `Revise cada cambio antes de aplicarlo (propuesta del ${propuesta.fecha}): la IA puede equivocarse. Al aplicar, los datos se guardan en el formulario y las reglas se ejecutan de nuevo.`
        : 'Elija las observaciones que quiere arreglar. La IA propone los cambios de datos con su fuente; usted decide cuáles aplicar.'}</p>
      <Mensaje r={r} />
      {enCurso ? (
        <div className="aviso info" role="status">
          <span className="girador pequeno" aria-hidden="true" /> La IA está preparando las correcciones (iniciada {enCurso}). Puede salir de esta página; la propuesta aparecerá aquí al terminar.
        </div>
      ) : propuesta && aplicar ? (
        <PropuestasCorreccion key={propuesta.id} accion={aplicar} propuestas={propuesta.propuestas} sinCorreccion={propuesta.sinCorreccion} alResultado={setR} />
      ) : observaciones.length > 0 && (
        <>
          {error && !r && <div className="aviso error">El último intento no se completó: {error}</div>}
          <SeleccionCorreccionIA accion={proponer} observaciones={observaciones} alResultado={setR} />
        </>
      )}
    </>
  );
}

/** Elige las observaciones abiertas que la IA intentará corregir (por defecto, todas las advertencias) */
function SeleccionCorreccionIA({ accion, observaciones, alResultado }: {
  accion: (ids: string[]) => Promise<Resultado>; observaciones: { id: string; nivel: string; mensaje: string }[]; alResultado: (r?: Resultado) => void;
}) {
  const [marcadas, setElegidas] = useState<string[]>(() => observaciones.filter((o) => o.nivel === 'ADVERTENCIA').map((o) => o.id));
  // Solo cuentan las que siguen abiertas (la lista cambia al ejecutar las reglas)
  const elegidas = marcadas.filter((id) => observaciones.some((o) => o.id === id));
  const [pendiente, iniciar] = useTransition();
  const marcar = (nivel?: string) => setElegidas(observaciones.filter((o) => !nivel || o.nivel === nivel).map((o) => o.id));
  const advertencias = observaciones.filter((o) => o.nivel === 'ADVERTENCIA').length;
  return (
    <div>
      <div className="fila" style={{ gap: '0.4rem', marginBottom: '0.6rem' }}>
        {advertencias > 0 && <button type="button" className="secundario pequeno" onClick={() => marcar('ADVERTENCIA')} disabled={pendiente}>Todas las advertencias ({advertencias})</button>}
        <button type="button" className="secundario pequeno" onClick={() => marcar()} disabled={pendiente}>Todas ({observaciones.length})</button>
        <button type="button" className="secundario pequeno" onClick={() => setElegidas([])} disabled={pendiente}>Ninguna</button>
      </div>
      <ul className="lista-seleccion">
        {observaciones.map((o) => (
          <li key={o.id}>
            <label className="casilla">
              <input type="checkbox" checked={elegidas.includes(o.id)} disabled={pendiente}
                onChange={(e) => setElegidas((x) => (e.target.checked ? [...x, o.id] : x.filter((y) => y !== o.id)))} />
              <span><span className={`etiqueta ${CLASE_NIVEL[o.nivel]}`}>{NIVELES[o.nivel]}</span> {o.mensaje}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="accion">
        <button type="button" disabled={pendiente || !elegidas.length} aria-busy={pendiente} onClick={() => {
          alResultado(undefined);
          // Si se inicia bien, la página pasa a mostrar el avance; solo se informa el error
          iniciar(async () => { const res = await accion(elegidas); if (res.error) alResultado(res); });
        }}>
          {pendiente && <span className="girador pequeno" aria-hidden="true" />}
          {pendiente ? 'Enviando a la IA…' : `Arreglar con IA (${elegidas.length})`}
        </button>
      </div>
    </div>
  );
}

/** Propuestas de la IA: el usuario elige cuáles aplicar (todas marcadas al inicio) */
function PropuestasCorreccion({ accion, propuestas, sinCorreccion, alResultado }: {
  accion: (indices: number[]) => Promise<Resultado>; propuestas: PropuestaVista[]; sinCorreccion: { observacion: string; motivo: string }[]; alResultado: (r: Resultado) => void;
}) {
  const [elegidas, setElegidas] = useState<number[]>(() => propuestas.map((p) => p.indice));
  const [pendiente, iniciar] = useTransition();
  const enviar = (indices: number[]) => iniciar(async () => alResultado(await accion(indices)));
  return (
    <div>
      {propuestas.length > 0 && (
        <>
          <ul className="lista-seleccion propuestas">
            {propuestas.map((p) => (
              <li key={p.indice}>
                <label className="casilla">
                  <input type="checkbox" checked={elegidas.includes(p.indice)} disabled={pendiente}
                    onChange={(e) => setElegidas((x) => (e.target.checked ? [...x, p.indice] : x.filter((y) => y !== p.indice)))} />
                  <span>
                    <strong>{p.etiqueta}</strong>
                    <span className="cambio"><del>{p.antes}</del> <span aria-hidden="true">→</span><span className="solo-lectores"> cambia a </span> <ins>{p.despues}</ins></span>
                    <span className="suave">{p.explicacion} Fuente: {p.fuente}</span>
                    <span className="suave">Observación: {p.observacion}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="fila">
            <button type="button" className="exito" disabled={pendiente || !elegidas.length} aria-busy={pendiente} onClick={() => enviar(elegidas)}>
              {pendiente && <span className="girador pequeno" aria-hidden="true" />}
              {elegidas.length === propuestas.length ? `Aplicar todas (${propuestas.length})` : `Aplicar ${elegidas.length} de ${propuestas.length}`}
            </button>
            <button type="button" className="secundario" disabled={pendiente} onClick={() => { if (window.confirm('¿Descartar todas las propuestas? No se cambiará ningún dato.')) enviar([]); }}>Descartar propuesta</button>
          </div>
        </>
      )}
      {sinCorreccion.length > 0 && (
        <details className="sin-correccion" open={!propuestas.length}>
          <summary>No se corrigen con datos ({sinCorreccion.length})</summary>
          <ul>{sinCorreccion.map((x, i) => <li key={i}><strong>{x.observacion}</strong><div className="suave">{x.motivo}</div></li>)}</ul>
          {!propuestas.length && <button type="button" className="secundario pequeno" disabled={pendiente} onClick={() => enviar([])}>Entendido</button>}
        </details>
      )}
    </div>
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
