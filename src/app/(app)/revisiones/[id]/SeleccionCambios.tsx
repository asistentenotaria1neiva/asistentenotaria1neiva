'use client';
/**
 * Cambios recomendados por la IA que se pueden aplicar: el usuario marca cuáles y se genera la
 * escritura con esa selección (puede cambiarla y generarla de nuevo cuantas veces quiera).
 */
import { useState, useTransition } from 'react';
import { EtiquetaNivel } from '../../componentes';
import { Mensaje } from '../../expedientes/formularios';
import type { ResultadoRevision } from '../acciones';

export interface CambioVista {
  numero: number;
  nivel: string;
  categoria: string;
  ubicacion: string;
  original: string;
  corregido: string;
  motivo: string;
  fuente: string;
  veces?: number;
  aplicado: boolean;
}

export function SeleccionCambios({ cambios, aplicar, hayCorregida }: {
  cambios: CambioVista[];
  aplicar: (numeros: number[]) => Promise<ResultadoRevision>;
  hayCorregida: boolean;
}) {
  // Al inicio: lo ya aplicado o, si aún no se ha generado la escritura, todo
  const [elegidos, setElegidos] = useState<number[]>(() => (hayCorregida ? cambios.filter((c) => c.aplicado) : cambios).map((c) => c.numero));
  const [r, setR] = useState<ResultadoRevision>();
  const [pendiente, iniciar] = useTransition();
  const enviar = (numeros: number[]) => iniciar(async () => setR(await aplicar(numeros)));
  const marcar = (filtro: (c: CambioVista) => boolean) => setElegidos(cambios.filter(filtro).map((c) => c.numero));
  const importantes = cambios.filter((c) => c.nivel !== 'INFORMATIVA').length;
  const aplicados = cambios.filter((c) => c.aplicado).map((c) => c.numero);
  const sinCambios = hayCorregida && elegidos.length === aplicados.length && elegidos.every((n) => aplicados.includes(n));

  return (
    <div>
      <Mensaje r={r} />
      <div className="fila" style={{ gap: '0.5rem', marginBottom: '0.5rem' }}>
        <button type="button" className="secundario pequeno" onClick={() => marcar(() => true)} disabled={pendiente}>Todos ({cambios.length})</button>
        {importantes > 0 && importantes < cambios.length && <button type="button" className="secundario pequeno" onClick={() => marcar((c) => c.nivel !== 'INFORMATIVA')} disabled={pendiente}>Críticos y advertencias ({importantes})</button>}
        <button type="button" className="secundario pequeno" onClick={() => setElegidos([])} disabled={pendiente}>Ninguno</button>
      </div>
      <ul className="lista-seleccion propuestas">
        {cambios.map((c) => (
          <li key={c.numero}>
            <label className="casilla">
              <input type="checkbox" checked={elegidos.includes(c.numero)} disabled={pendiente}
                onChange={(e) => setElegidos((x) => (e.target.checked ? [...x, c.numero] : x.filter((y) => y !== c.numero)))} />
              <span>
                <span className="fila" style={{ gap: '0.4rem' }}>
                  <strong>[{c.numero}]</strong><EtiquetaNivel nivel={c.nivel} /><span className="suave">{c.categoria}</span>
                  {c.aplicado && <span className="etiqueta ok">Aplicado</span>}
                </span>
                <span><strong>Dónde:</strong> {c.ubicacion}{c.veces !== undefined && c.veces > 1 ? ` (en ${c.veces} lugares)` : ''}</span>
                <span className="cambio revision-marcas"><del>{c.original}</del> <span aria-hidden="true">→</span><span className="solo-lectores"> cambia a </span> <ins>{c.corregido || '(se elimina)'}</ins></span>
                <span><strong>Por qué:</strong> {c.motivo}</span>
                {c.fuente && <span className="suave">Fuente: {c.fuente}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="fila">
        <button type="button" className="exito" disabled={pendiente || !elegidos.length || sinCambios} aria-busy={pendiente} onClick={() => enviar(elegidos)}>
          {pendiente && <span className="girador pequeno" aria-hidden="true" />}
          {pendiente ? 'Generando…' : `Generar la escritura con ${elegidos.length} cambio(s)`}
        </button>
        {hayCorregida && (
          <button type="button" className="secundario" disabled={pendiente} onClick={() => { if (window.confirm('¿Descartar la escritura corregida?')) enviar([]); }}>Descartar la escritura corregida</button>
        )}
      </div>
      <p className="suave" style={{ marginTop: '0.5rem' }}>En la escritura generada, <span className="marca-agregado">lo agregado queda resaltado en amarillo</span> y <span className="marca-eliminado">lo eliminado, tachado en rojo</span>, cada cambio con su número; al final va la relación de cambios. También se descarga sin marcas, para firmar. Puede cambiar la selección y generarla de nuevo.</p>
    </div>
  );
}
