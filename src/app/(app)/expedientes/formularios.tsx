'use client';
/** Formularios de cliente de las escrituras */
import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Resultado } from './acciones';
import { Icono, type NombreIcono } from '../../Icono';
import { useConfirmacion } from '../../Confirmar';

export function Mensaje({ r }: { r?: Resultado }) {
  if (!r) return null;
  return (
    <>
      {r.error && <div className="aviso error" role="alert"><Icono nombre="error" /><div>{r.error}</div></div>}
      {r.ok && !r.error && <div className="aviso exito" role="status"><Icono nombre="exito" /><div>{r.ok}</div></div>}
    </>
  );
}

/** Botón que ejecuta una acción sin formulario (p. ej. retirar, leer de nuevo) */
export function BotonAccion({ accion, texto, textoPendiente, clase, confirmar, icono }: {
  accion: () => Promise<Resultado>; texto: string; textoPendiente?: string; clase?: string; confirmar?: string; icono?: NombreIcono;
}) {
  const [r, setR] = useState<Resultado>();
  const [pendiente, iniciar] = useTransition();
  const [pedir, dialogo] = useConfirmacion();
  return (
    <div className="accion">
      <button type="button" className={clase} disabled={pendiente} aria-busy={pendiente} onClick={async () => {
        if (confirmar && !(await pedir({ texto: confirmar, boton: texto }))) return;
        iniciar(async () => setR(await accion()));
      }}>
        {pendiente ? <span className="girador pequeno" aria-hidden="true" /> : icono && <Icono nombre={icono} tamano={16} />}
        {pendiente ? (textoPendiente ?? 'Procesando…') : texto}
      </button>
      {r?.error && <Mensaje r={r} />}
      {dialogo}
    </div>
  );
}

/** Con la pestaña oculta se consulta mucho menos (el servidor sigue trabajando igual) */
const SEGUNDOS_OCULTA = 60;

/**
 * Mientras hay un proceso en segundo plano, consulta cada pocos segundos una huella corta del estado
 * (api/expedientes/[id]/estado) y solo vuelve a pedir la página completa cuando cambia. Antes se pedía
 * la página entera cada 5 segundos, y eso agotaba la transferencia mensual de Vercel.
 */
export function RefrescoAutomatico({ expedienteId, huella, segundos = 5 }: { expedienteId: string; huella: string; segundos?: number }) {
  const router = useRouter();
  const actual = useRef(huella);
  useEffect(() => { actual.current = huella; }, [huella]);
  useEffect(() => {
    let activo = true;
    let t: ReturnType<typeof setTimeout> | undefined;
    const consultar = async () => {
      try {
        const r = await fetch(`/api/expedientes/${encodeURIComponent(expedienteId)}/estado`, { cache: 'no-store' });
        if (!activo) return;
        if (r.status === 401) { router.refresh(); return; } // sesión cerrada: la página lleva al ingreso
        if (r.ok) {
          const { huella: nueva } = (await r.json()) as { huella: string };
          if (activo && nueva !== actual.current) { actual.current = nueva; router.refresh(); }
        }
      } catch {
        // Sin conexión: se intenta en la próxima vuelta
      }
      programar();
    };
    const programar = () => {
      if (!activo) return;
      clearTimeout(t);
      t = setTimeout(consultar, (document.visibilityState === 'visible' ? segundos : SEGUNDOS_OCULTA) * 1000);
    };
    // Al volver a la pestaña se consulta de inmediato
    const alVolver = () => { if (document.visibilityState === 'visible') { clearTimeout(t); void consultar(); } };
    programar();
    document.addEventListener('visibilitychange', alVolver);
    return () => { activo = false; clearTimeout(t); document.removeEventListener('visibilitychange', alVolver); };
  }, [router, expedienteId, segundos]);
  return null;
}

/** Formulario que llama una acción del servidor y muestra su resultado */
export function FormularioAccion({ accion, children, texto, textoPendiente, clase, confirmar, icono, className }: {
  accion: (r: Resultado, f: FormData) => Promise<Resultado>;
  children?: React.ReactNode;
  texto: string;
  textoPendiente?: string;
  clase?: string;
  confirmar?: string;
  icono?: NombreIcono;
  className?: string;
}) {
  const [r, enviar, pendiente] = useActionState(accion, {});
  const [pedir, dialogo] = useConfirmacion();
  const confirmado = useRef(false);
  return (
    <form action={enviar} className={className} onSubmit={(e) => {
      if (!confirmar) return;
      if (confirmado.current) { confirmado.current = false; return; }
      e.preventDefault();
      const formulario = e.currentTarget;
      const boton = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
      pedir({ texto: confirmar, boton: texto }).then((ok) => { if (ok) { confirmado.current = true; formulario.requestSubmit(boton); } });
    }}>
      <Mensaje r={r} />
      {children}
      <button type="submit" className={clase} disabled={pendiente} aria-busy={pendiente}>
        {pendiente ? <span className="girador pequeno" aria-hidden="true" /> : icono && <Icono nombre={icono} tamano={18} />}
        {pendiente ? (textoPendiente ?? 'Procesando…') : texto}
      </button>
      {dialogo}
    </form>
  );
}

/** Tamaño de cada parte: Vercel limita cada petición a 4,5 MB (incluido el sobre del formulario) */
const TAMANO_PARTE = 3 * 1024 * 1024;
/** Partes que se suben a la vez */
const PARTES_EN_PARALELO = 4;

/** Esperas antes de cada reintento (una conexión que se cae unos segundos no tumba la carga) */
const ESPERAS_REINTENTO_MS = [1500, 4000, 8000];

/**
 * Sube una parte (api/documentos/partes); reintenta si se cae la conexión o el servidor falla.
 * Devuelve el error, si lo hay.
 */
async function subirParte(expedienteId: string, carga: string, indice: number, parte: Blob): Promise<string | null> {
  // Se lee antes de enviar: un archivo que el equipo no puede leer (en OneDrive sin descargar, abierto o
  // movido mientras se carga) hacía fallar el envío y se mostraba como si se hubiera caído la conexión
  let datos: ArrayBuffer;
  try {
    datos = await parte.arrayBuffer();
  } catch {
    return 'No se pudo leer el archivo en este equipo: si está en OneDrive, ábralo o descárguelo primero; si está abierto en otro programa, ciérrelo, y cárguelo de nuevo.';
  }
  for (let intento = 0; ; intento++) {
    const ultimo = intento >= ESPERAS_REINTENTO_MS.length;
    const f = new FormData();
    f.set('expedienteId', expedienteId);
    f.set('carga', carga);
    f.set('indice', String(indice));
    f.set('parte', new Blob([datos]));
    try {
      const r = await fetch('/api/documentos/partes', { method: 'POST', body: f });
      if (r.ok) return null;
      if (r.status < 500 || ultimo) return ((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'No se pudo subir el archivo.';
    } catch {
      if (ultimo) return 'Se perdió la conexión con el servidor (se intentó 4 veces). Revise el internet y cargue el archivo de nuevo.';
    }
    await new Promise((listo) => setTimeout(listo, ESPERAS_REINTENTO_MS[intento]));
  }
}

const tamano = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

interface EnCola { nombre: string; tamano: number; estado: 'cola' | 'subiendo' | 'cifrando' | 'listo' | 'error' | 'omitido'; progreso: number; mensaje?: string }

const ESTADO_COLA: Record<EnCola['estado'], { texto: string; clase: string }> = {
  cola: { texto: 'En espera', clase: '' },
  subiendo: { texto: 'Subiendo', clase: 'informativa gira' },
  cifrando: { texto: 'Cifrando', clase: 'informativa gira' },
  listo: { texto: 'Cargado', clase: 'ok' },
  error: { texto: 'No se cargó', clase: 'critica' },
  omitido: { texto: 'Sin cargar', clase: '' },
};

/**
 * Carga de documentos sin límite de tamaño: cada archivo se envía en partes de 3 MB, varias a la vez,
 * y el servidor las une, lo valida y lo cifra al recibir todas. La IA lo lee enseguida.
 * Los archivos se pueden arrastrar a la zona o elegir; la carga empieza en cuanto se eligen.
 */
export function FormularioCarga({ expedienteId, completar }: {
  expedienteId: string;
  completar: (carga: string, partes: number, nombre: string) => Promise<Resultado>;
}) {
  const router = useRouter();
  const [r, setR] = useState<Resultado>();
  const [cola, setCola] = useState<EnCola[]>([]);
  const [sobre, setSobre] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const campo = useRef<HTMLInputElement>(null);
  const actualizar = (i: number, cambio: Partial<EnCola>) => setCola((l) => l.map((x, k) => (k === i ? { ...x, ...cambio } : x)));

  return (
    <form onSubmit={(ev) => {
      ev.preventDefault();
      const formulario = ev.currentTarget;
      const archivos = new FormData(formulario).getAll('archivo').filter((x): x is File => x instanceof File && x.size > 0);
      if (!archivos.length) return;
      setR(undefined);
      setCola(archivos.map((a) => ({ nombre: a.name, tamano: a.size, estado: 'cola', progreso: 0 })));
      iniciar(async () => {
        let cargados = 0;
        for (const [n, a] of archivos.entries()) {
          const carga = crypto.randomUUID();
          const partes = Math.max(1, Math.ceil(a.size / TAMANO_PARTE));
          actualizar(n, { estado: 'subiendo', progreso: 0 });
          let siguiente = 0;
          let hechas = 0;
          let error: string | null = null;
          await Promise.all(Array.from({ length: Math.min(PARTES_EN_PARALELO, partes) }, async () => {
            while (!error && siguiente < partes) {
              const i = siguiente++;
              const e = await subirParte(expedienteId, carga, i, a.slice(i * TAMANO_PARTE, (i + 1) * TAMANO_PARTE));
              if (e) error ??= e;
              else actualizar(n, { progreso: Math.round((++hechas / partes) * 100) });
            }
          }));
          if (!error) {
            actualizar(n, { estado: 'cifrando', progreso: 100 });
            error = (await completar(carga, partes, a.name)).error ?? null;
          }
          if (error) {
            // Igual que antes: la carga se detiene en el primer archivo que falla
            setCola((l) => l.map((x, k) => (k === n ? { ...x, estado: 'error', mensaje: error! } : k > n ? { ...x, estado: 'omitido' } : x)));
            setR({ error: cargados ? `${cargados} documento(s) cargado(s). Falló «${a.name}»: ${error}` : `«${a.name}»: ${error}` });
            formulario.reset();
            router.refresh();
            return;
          }
          actualizar(n, { estado: 'listo' });
          cargados++;
        }
        formulario.reset();
        setCola([]);
        setR({ ok: `${cargados} documento(s) cargado(s). La IA los está leyendo.` });
        router.refresh();
      });
    }}>
      <Mensaje r={r} />
      <label
        className={`zona-carga${sobre ? ' sobre' : ''}${pendiente ? ' ocupada' : ''}`}
        onDragOver={(e) => { e.preventDefault(); if (!sobre) setSobre(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSobre(false); }}
        onDrop={(e) => {
          e.preventDefault();
          setSobre(false);
          if (pendiente || !campo.current || !e.dataTransfer.files.length) return;
          campo.current.files = e.dataTransfer.files;
          campo.current.form?.requestSubmit();
        }}
      >
        <span className="icono-zona"><Icono nombre="subir" tamano={24} /></span>
        <strong>{pendiente ? 'Cargando documentos…' : <>Arrastre aquí los documentos o <span className="elegir">elíjalos</span></>}</strong>
        <span className="tenue">PDF, foto o Word · varios a la vez o un PDF con todos. Cédulas, certificado de tradición, escritura anterior, paz y salvos, poderes, minuta o carta del banco…</span>
        <input ref={campo} id="archivo" name="archivo" type="file" aria-label="Elegir documentos del negocio (PDF, imagen o Word)" disabled={pendiente}
          accept="application/pdf,image/jpeg,image/png,image/webp,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple required
          onChange={(e) => { if (e.currentTarget.files?.length) e.currentTarget.form?.requestSubmit(); }} />
      </label>
      {cola.length > 0 && (
        <ul className="cola-carga" aria-live="polite">
          {cola.map((x, i) => {
            const est = ESTADO_COLA[x.estado];
            return (
              <li key={i} className={x.estado === 'error' ? 'error' : undefined}>
                <span className="nombre">{x.nombre} <span className="tenue">· {tamano(x.tamano)}</span></span>
                <span className={`etiqueta ${est.clase}`}>{est.texto}{x.estado === 'subiendo' && x.progreso > 0 ? ` ${x.progreso} %` : ''}</span>
                {(x.estado === 'subiendo' || x.estado === 'cifrando') && (
                  <span className="barra-progreso" role="progressbar" aria-label={`Avance de «${x.nombre}»`} aria-valuenow={x.progreso} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${x.progreso}%` }} /></span>
                )}
                {x.mensaje && <span className="mensaje">{x.mensaje}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </form>
  );
}
