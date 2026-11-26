'use client';
/** Ordenar la lista de plantillas: al elegir un criterio se recarga la lista (los enlaces los arma el servidor) */
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Icono } from '../../Icono';

export function OrdenPlantillas({ actual, opciones }: { actual: string; opciones: { valor: string; texto: string; href: string }[] }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  return (
    <div className={`orden-plantillas${pendiente ? ' cargando' : ''}`}>
      <Icono nombre="filtro" tamano={16} />
      <label htmlFor="orden-plantillas">Ordenar por</label>
      <select
        id="orden-plantillas"
        value={actual}
        disabled={pendiente}
        onChange={(e) => {
          const o = opciones.find((x) => x.valor === e.target.value);
          if (o) iniciar(() => router.push(o.href, { scroll: false }));
        }}
      >
        {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
      </select>
    </div>
  );
}
