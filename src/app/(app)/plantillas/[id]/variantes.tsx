'use client';
/**
 * Tabla de variantes de un tipo de escritura con buscador: filtra por el nombre de la variante y por
 * «cuándo usarla» (sin distinguir tildes ni mayúsculas; cada palabra debe aparecer) y por estado.
 */
import { useState } from 'react';
import Link from 'next/link';

export interface FilaVariante {
  nombre: string;
  principalId: string;
  vigente?: number;
  pendiente?: number;
  criterios: string | null;
}

const ESTADOS = { '': 'Todas', aprobada: 'Aprobadas', pendiente: 'Pendientes', sin: 'Sin criterios' } as const;
type Estado = keyof typeof ESTADOS;

const normalizar = (x: string) => x.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function TablaVariantes({ variantes, actualId }: { variantes: FilaVariante[]; actualId: string }) {
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState<Estado>('');
  const palabras = normalizar(q).split(/\s+/).filter(Boolean);
  const cumpleEstado = (v: FilaVariante, e: Estado) =>
    e === '' || (e === 'aprobada' && v.vigente !== undefined) || (e === 'pendiente' && v.pendiente !== undefined) || (e === 'sin' && !v.criterios?.trim());
  const filas = variantes.filter((v) => {
    if (!cumpleEstado(v, estado)) return false;
    const texto = normalizar(`${v.nombre} ${v.criterios ?? ''}`);
    return palabras.every((p) => texto.includes(p));
  });

  return (
    <>
      <div className="fila" style={{ gap: '0.5rem', alignItems: 'end', flexWrap: 'wrap' }}>
        <div className="campo" style={{ flex: '1 1 16rem', marginBottom: 0 }}>
          <label htmlFor="buscar-variante">Buscar variante</label>
          <input id="buscar-variante" type="search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Banco, obra, constructora, acto, subsidio…" autoComplete="off" />
        </div>
        <nav className="pestanas" aria-label="Filtrar variantes por estado">
          {(Object.keys(ESTADOS) as Estado[]).map((e) => (
            <button key={e} type="button" className={e === estado ? 'pequeno' : 'secundario pequeno'} aria-pressed={e === estado} onClick={() => setEstado(e)}>
              {ESTADOS[e]} <span className="conteo">{variantes.filter((v) => cumpleEstado(v, e)).length}</span>
            </button>
          ))}
        </nav>
      </div>
      <p className="suave" role="status" style={{ margin: '0.5rem 0' }}>
        {filas.length === variantes.length ? `${variantes.length} variantes` : `${filas.length} de ${variantes.length} variantes`}
      </p>
      {filas.length ? (
        <div className="tabla">
          <table className="tabla-apilable">
            <thead><tr><th>Variante</th><th>Estado</th><th>Cuándo usarla</th></tr></thead>
            <tbody>{filas.map((v) => (
              <tr key={v.nombre}>
                <td className="principal-celda">{v.principalId === actualId ? <strong>{v.nombre}</strong> : <Link href={`/plantillas/${v.principalId}`}>{v.nombre}</Link>}</td>
                <td data-etiqueta="Estado">
                  <div className="fila" style={{ gap: '0.25rem' }}>
                    {v.vigente !== undefined && <span className="etiqueta ok">Aprobada v{v.vigente}</span>}
                    {v.pendiente !== undefined && <span className="etiqueta advertencia">Pendiente v{v.pendiente}</span>}
                    {v.vigente === undefined && v.pendiente === undefined && <span className="etiqueta">No aprobada</span>}
                  </div>
                </td>
                <td data-etiqueta="Cuándo usarla" className="suave">{v.criterios ?? '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <p className="suave vacio">
          Ninguna variante coincide{q ? ` con «${q}»` : ''}.{' '}
          <button type="button" className="secundario pequeno" onClick={() => { setQ(''); setEstado(''); }}>Ver todas</button>
        </p>
      )}
    </>
  );
}
