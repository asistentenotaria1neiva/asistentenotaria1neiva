'use client';
/** Filtros de la biblioteca: al cambiar la categoría, el año o las fechas se busca de inmediato */
import { useState } from 'react';

interface Categoria { nombre: string; total: number; subcategorias: { nombre: string; total: number }[] }

export function FiltrosPlantillas({ base, valores, categorias, anios, administrar }: {
  base: string;
  valores: { q: string; categoria: string; subcategoria: string; anio: string; desde: string; hasta: string; retiradas: boolean };
  categorias: Categoria[];
  anios: { anio: number; total: number }[];
  administrar: boolean;
}) {
  const [categoria, setCategoria] = useState(valores.categoria);
  const subcategorias = categorias.find((c) => c.nombre === categoria)?.subcategorias ?? [];
  const enviar = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => e.currentTarget.form?.requestSubmit();
  const filtrado = Object.entries(valores).some(([, v]) => v);
  return (
    <form className="tarjeta filtros" method="get" action={base} role="search">
      <div className="ancho">
        <label htmlFor="q">Buscar plantilla</label>
        <input id="q" name="q" type="search" defaultValue={valores.q} placeholder="Palabras del nombre o del contenido: casa soltero caja honor, leasing davivienda…" autoComplete="off" />
      </div>
      <div>
        <label htmlFor="categoria">Categoría</label>
        <select id="categoria" name="categoria" value={categoria} onChange={(e) => { setCategoria(e.target.value); const sub = e.currentTarget.form?.elements.namedItem('subcategoria') as HTMLSelectElement | null; if (sub) sub.value = ''; enviar(e); }}>
          <option value="">Todas</option>
          {categorias.map((c) => <option key={c.nombre} value={c.nombre}>{c.nombre} ({c.total})</option>)}
        </select>
      </div>
      {subcategorias.length > 0 && (
        <div>
          <label htmlFor="subcategoria">Banco / subcategoría</label>
          <select id="subcategoria" name="subcategoria" defaultValue={valores.subcategoria} onChange={enviar}>
            <option value="">Todas</option>
            {subcategorias.map((s) => <option key={s.nombre} value={s.nombre}>{s.nombre} ({s.total})</option>)}
          </select>
        </div>
      )}
      <div>
        <label htmlFor="anio">Año</label>
        <select id="anio" name="anio" defaultValue={valores.anio} onChange={enviar}>
          <option value="">Todos</option>
          {anios.map((a) => <option key={a.anio} value={a.anio}>{a.anio} ({a.total})</option>)}
        </select>
      </div>
      <div><label htmlFor="desde">Modificada desde</label><input id="desde" name="desde" type="date" defaultValue={valores.desde} onChange={enviar} /></div>
      <div><label htmlFor="hasta">Hasta</label><input id="hasta" name="hasta" type="date" defaultValue={valores.hasta} onChange={enviar} /></div>
      {administrar && (
        <label className="casilla"><input type="checkbox" name="retiradas" value="1" defaultChecked={valores.retiradas} onChange={enviar} /> Incluir retiradas</label>
      )}
      <div className="acciones-filtro">
        <button type="submit">Buscar</button>
        {filtrado && <a className="boton secundario" href={base}>Limpiar</a>}
      </div>
    </form>
  );
}
