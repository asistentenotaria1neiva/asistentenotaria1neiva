'use client';
/**
 * Cambios recomendados por la IA que se pueden aplicar: el usuario marca cuáles y se rehace la copia
 * corregida desde el original con esa selección (puede cambiarla cuantas veces quiera).
 */
import { useState, useTransition } from 'react';
import { EtiquetaNivel } from '../../componentes';
import { Mensaje } from '../../expedientes/formularios';
import type { ResultadoRevision } from '../acciones';

export interface CambioVista {
  indice: number;
  nivel: string;
  categoria: string;
  mensaje: string;
  original: string;
  corregido: string;
  veces?: number;
  aplicada: boolean;
}

export function SeleccionCambios({ cambios, aplicar, hayCorregida }: {
  cambios: CambioVista[];
  aplicar: (indices: number[]) => Promise<ResultadoRevision>;
  hayCorregida: boolean;
}) {
  // Al inicio: lo ya aplicado, o todo si aún no se ha aplicado nada
  const [elegidas, setElegidas] = useState<number[]>(() => (hayCorregida ? cambios.filter((c) => c.aplicada) : cambios).map((c) => c.indice));
  const [r, setR] = useState<ResultadoRevision>();
  const [pendiente, iniciar] = useTransition();
  const enviar = (indices: number[]) => iniciar(async () => setR(await aplicar(indices)));
  const marcar = (filtro: (c: CambioVista) => boolean) => setElegidas(cambios.filter(filtro).map((c) => c.indice));
  const importantes = cambios.filter((c) => c.nivel !== 'INFORMATIVA').length;
  const igualQueAplicada = hayCorregida && elegidas.length === cambios.filter((c) => c.aplicada).length && elegidas.every((i) => cambios.find((c) => c.indice === i)?.aplicada);

  return (
    <div>
      <Mensaje r={r} />
      <div className="fila" style={{ gap: '0.5rem', marginBottom: '0.5rem' }}>
        <button type="button" className="secundario pequeno" onClick={() => marcar(() => true)} disabled={pendiente}>Todos ({cambios.length})</button>
        {importantes > 0 && importantes < cambios.length && <button type="button" className="secundario pequeno" onClick={() => marcar((c) => c.nivel !== 'INFORMATIVA')} disabled={pendiente}>Críticos y advertencias ({importantes})</button>}
        <button type="button" className="secundario pequeno" onClick={() => setElegidas([])} disabled={pendiente}>Ninguno</button>
      </div>
      <ul className="lista-seleccion propuestas">
        {cambios.map((c) => (
          <li key={c.indice}>
            <label className="casilla">
              <input type="checkbox" checked={elegidas.includes(c.indice)} disabled={pendiente}
                onChange={(e) => setElegidas((x) => (e.target.checked ? [...x, c.indice] : x.filter((y) => y !== c.indice)))} />
              <span>
                <span className="fila" style={{ gap: '0.4rem' }}>
                  <EtiquetaNivel nivel={c.nivel} /><span className="suave">{c.categoria}</span>
                  {c.aplicada && <span className="etiqueta ok">Aplicado</span>}
                </span>
                <span>{c.mensaje}</span>
                <span className="cambio"><del>{c.original}</del> <span aria-hidden="true">→</span><span className="solo-lectores"> cambia a </span> <ins>{c.corregido || '(se elimina)'}</ins></span>
                {c.veces !== undefined && c.veces > 1 && <span className="suave">Se cambia en {c.veces} lugares de la escritura.</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="fila">
        <button type="button" className="exito" disabled={pendiente || !elegidas.length || igualQueAplicada} aria-busy={pendiente} onClick={() => enviar(elegidas)}>
          {pendiente && <span className="girador pequeno" aria-hidden="true" />}
          {pendiente ? 'Aplicando…' : `Aplicar ${elegidas.length} cambio(s) seleccionado(s)`}
        </button>
        {hayCorregida && (
          <button type="button" className="secundario" disabled={pendiente} onClick={() => { if (window.confirm('¿Descartar la versión corregida? Se conserva el original.')) enviar([]); }}>Descartar la versión corregida</button>
        )}
      </div>
      <p className="suave" style={{ marginTop: '0.5rem' }}>Los cambios se aplican sobre una copia del original, conservando el formato de Word. Puede cambiar la selección y aplicar de nuevo cuantas veces quiera.</p>
    </div>
  );
}
