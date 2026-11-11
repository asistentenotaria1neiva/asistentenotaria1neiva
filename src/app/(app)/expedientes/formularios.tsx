'use client';
/** Formularios de cliente de las escrituras */
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

/** Botón que ejecuta una acción sin formulario (p. ej. retirar, leer de nuevo) */
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
      {r?.error && <Mensaje r={r} />}
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

/** Formulario que llama una acción del servidor y muestra su resultado */
export function FormularioAccion({ accion, children, texto, textoPendiente, clase, confirmar }: {
  accion: (r: Resultado, f: FormData) => Promise<Resultado>;
  children?: React.ReactNode;
  texto: string;
  textoPendiente?: string;
  clase?: string;
  confirmar?: string;
}) {
  const [r, enviar, pendiente] = useActionState(accion, {});
  return (
    <form action={enviar} onSubmit={(e) => { if (confirmar && !window.confirm(confirmar)) e.preventDefault(); }}>
      <Mensaje r={r} />
      {children}
      <button type="submit" className={clase} disabled={pendiente} aria-busy={pendiente}>
        {pendiente && <span className="girador pequeno" aria-hidden="true" />}{pendiente ? (textoPendiente ?? 'Procesando…') : texto}
      </button>
    </form>
  );
}

/** Tamaño de cada parte: Vercel limita cada petición a 4,5 MB (incluido el sobre del formulario) */
const TAMANO_PARTE = 3 * 1024 * 1024;
/** Partes que se suben a la vez */
const PARTES_EN_PARALELO = 4;

/** Sube una parte (api/documentos/partes); reintenta una vez si se cae la conexión. Devuelve el error, si lo hay. */
async function subirParte(expedienteId: string, carga: string, indice: number, parte: Blob): Promise<string | null> {
  for (let intento = 0; ; intento++) {
    const f = new FormData();
    f.set('expedienteId', expedienteId);
    f.set('carga', carga);
    f.set('indice', String(indice));
    f.set('parte', parte);
    try {
      const r = await fetch('/api/documentos/partes', { method: 'POST', body: f });
      if (r.ok) return null;
      if (r.status < 500 || intento) return ((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'No se pudo subir el archivo.';
    } catch {
      if (intento) return 'Se perdió la conexión con el servidor.';
    }
  }
}

/**
 * Carga de documentos sin límite de tamaño: cada archivo se envía en partes de 3 MB, varias a la vez,
 * y el servidor las une, lo valida y lo cifra al recibir todas. La IA lo lee enseguida.
 */
export function FormularioCarga({ expedienteId, completar }: {
  expedienteId: string;
  completar: (carga: string, partes: number, nombre: string) => Promise<Resultado>;
}) {
  const router = useRouter();
  const [r, setR] = useState<Resultado>();
  const [avance, setAvance] = useState<string>();
  const [pendiente, iniciar] = useTransition();
  return (
    <form onSubmit={(ev) => {
      ev.preventDefault();
      const formulario = ev.currentTarget;
      const archivos = new FormData(formulario).getAll('archivo').filter((x): x is File => x instanceof File && x.size > 0);
      iniciar(async () => {
        let cargados = 0;
        const fallo = (a: File, error: string) => setR({ error: cargados ? `${cargados} documento(s) cargado(s). Falló «${a.name}»: ${error}` : `«${a.name}»: ${error}` });
        for (const [n, a] of archivos.entries()) {
          const carga = crypto.randomUUID();
          const partes = Math.max(1, Math.ceil(a.size / TAMANO_PARTE));
          const mostrar = (hechas: number) => setAvance(`Cargando «${a.name}» (${n + 1} de ${archivos.length})${partes > 1 ? ` · ${Math.round((hechas / partes) * 100)} %` : ''}`);
          mostrar(0);
          let siguiente = 0;
          let hechas = 0;
          let error: string | null = null;
          await Promise.all(Array.from({ length: Math.min(PARTES_EN_PARALELO, partes) }, async () => {
            while (!error && siguiente < partes) {
              const i = siguiente++;
              const e = await subirParte(expedienteId, carga, i, a.slice(i * TAMANO_PARTE, (i + 1) * TAMANO_PARTE));
              if (e) error ??= e;
              else mostrar(++hechas);
            }
          }));
          if (error) { setAvance(undefined); return fallo(a, error); }
          setAvance(`Cifrando «${a.name}» (${n + 1} de ${archivos.length})…`);
          const res = await completar(carga, partes, a.name);
          if (res.error) { setAvance(undefined); return fallo(a, res.error); }
          cargados++;
        }
        setAvance(undefined);
        formulario.reset();
        setR({ ok: `${cargados} documento(s) cargado(s). La IA los está leyendo.` });
        router.refresh();
      });
    }}>
      {pendiente && avance ? <div className="aviso info" role="status">{avance}</div> : <Mensaje r={r} />}
      <div className="filtros">
        <div className="ancho">
          <label htmlFor="archivo">Documentos (PDF, imagen o Word)</label>
          <input id="archivo" name="archivo" type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple required />
          <div className="ayuda">Cédulas, certificado de tradición, escritura anterior, paz y salvos, poderes, minuta o carta del banco… Puede cargar varios a la vez, o un PDF con todos.</div>
        </div>
        <div className="acciones-filtro"><button type="submit" disabled={pendiente} aria-busy={pendiente}>{pendiente && <span className="girador pequeno" aria-hidden="true" />}{pendiente ? 'Cargando…' : 'Cargar'}</button></div>
      </div>
    </form>
  );
}
