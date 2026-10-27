'use client';
/**
 * Conversión de plantillas ya cargadas que siguen con datos de un caso real: la IA cambia los
 * datos por variables y cada una queda como una versión nueva (api/plantillas/convertir).
 * Todas las conversiones salen al mismo tiempo, como la carga de varias plantillas.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ResultadoConversion } from '@/lib/servicios/carga-plantillas';

export interface PlantillaConDatos { id: string; nombre: string; version: number }

type Estado = { fase: 'lista' } | { fase: 'cargando' } | { fase: 'hecha'; r: ResultadoConversion } | { fase: 'error'; error: string };

async function convertir(id: string): Promise<Estado> {
  try {
    const respuesta = await fetch('/api/plantillas/convertir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    const cuerpo = await respuesta.json().catch(() => ({ error: 'El servidor no respondió a tiempo. Revise la lista: la versión nueva pudo haber quedado creada.' }));
    return respuesta.ok ? { fase: 'hecha', r: cuerpo as ResultadoConversion } : { fase: 'error', error: (cuerpo as { error?: string }).error ?? 'No se pudo convertir la plantilla.' };
  } catch {
    return { fase: 'error', error: 'Se perdió la conexión con el servidor.' };
  }
}

export function ConvertirDatosReales({ plantillas, compacto }: { plantillas: PlantillaConDatos[]; compacto?: boolean }) {
  const router = useRouter();
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const estado = (id: string) => estados[id] ?? { fase: 'lista' };
  const enCurso = plantillas.some((p) => estado(p.id).fase === 'cargando');
  const pendientes = plantillas.filter((p) => ['lista', 'error'].includes(estado(p.id).fase));

  async function convertirTodas() {
    const lista = pendientes;
    setEstados((e) => ({ ...e, ...Object.fromEntries(lista.map((p) => [p.id, { fase: 'cargando' }])) }));
    await Promise.all(lista.map(async (p) => {
      const r = await convertir(p.id);
      setEstados((e) => ({ ...e, [p.id]: r }));
    }));
    router.refresh();
  }

  return (
    <div>
      {!compacto && (
        <ul className="lista-conversion">
          {plantillas.map((p) => {
            const e = estado(p.id);
            return (
              <li key={p.id} className="fila entre">
                <span><Link href={`/plantillas/${p.id}`}>{p.nombre}</Link> <span className="suave">v{p.version}</span></span>
                <span>
                  {e.fase === 'cargando' && <span className="fila" style={{ gap: '0.4rem' }}><span className="girador pequeno" aria-hidden="true" style={{ color: 'var(--primario)' }} /> Convirtiendo…</span>}
                  {e.fase === 'error' && <span className="texto-peligro">{e.error}</span>}
                  {e.fase === 'hecha' && (e.r.nueva
                    ? <Link className="boton pequeno" href={`/plantillas/${e.r.nueva.id}`}>Abrir v{e.r.nueva.version}</Link>
                    : <span className="suave">{e.r.mensaje}</span>)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {compacto && plantillas.map((p) => {
        const e = estado(p.id);
        if (e.fase === 'error') return <div key={p.id} className="aviso error" role="alert">{e.error}</div>;
        if (e.fase !== 'hecha') return null;
        return e.r.nueva
          ? <div key={p.id} className="aviso exito" role="status">{e.r.mensaje} <Link href={`/plantillas/${e.r.nueva.id}`}>Abrir v{e.r.nueva.version}</Link></div>
          : <div key={p.id} className="aviso alerta" role="status">{e.r.mensaje}</div>;
      })}
      {enCurso && <div className="aviso info" role="status">La IA está cambiando los datos reales por variables y revisando cada versión nueva. Puede tardar unos minutos; no cierre esta página.</div>}
      {pendientes.length > 0 && (
        <button type="button" className="pequeno" disabled={enCurso} aria-busy={enCurso} onClick={convertirTodas}>
          {pendientes.length > 1 ? `Convertir ${pendientes.length} plantillas con IA` : 'Cambiar datos reales por variables con IA'}
        </button>
      )}
    </div>
  );
}
