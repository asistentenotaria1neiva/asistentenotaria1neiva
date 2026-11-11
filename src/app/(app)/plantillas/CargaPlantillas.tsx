'use client';
/**
 * El revisor alimenta la biblioteca: uno o varios .docx con su categoría (y banco o subcategoría).
 * La fecha de cada plantilla es la de modificación del archivo, salvo que se indique otra.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface Estado { nombre: string; estado: 'pendiente' | 'ok' | 'error'; mensaje?: string }

const fechaArchivo = (a: File) => new Date(a.lastModified).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

export function CargaPlantillas({ categorias, subcategorias }: { categorias: string[]; subcategorias: string[] }) {
  const router = useRouter();
  const [lista, setLista] = useState<Estado[]>([]);
  const [pendiente, iniciar] = useTransition();
  return (
    <form onSubmit={(ev) => {
      ev.preventDefault();
      const formulario = ev.currentTarget;
      const datos = new FormData(formulario);
      const archivos = datos.getAll('archivos').filter((x): x is File => x instanceof File && x.size > 0);
      const fecha = String(datos.get('fecha') ?? '');
      setLista(archivos.map((a) => ({ nombre: a.name, estado: 'pendiente' })));
      iniciar(async () => {
        let siguiente = 0;
        const actualizar = (i: number, e: Partial<Estado>) => setLista((l) => l.map((x, k) => (k === i ? { ...x, ...e } : x)));
        await Promise.all(Array.from({ length: Math.min(3, archivos.length) }, async () => {
          while (siguiente < archivos.length) {
            const i = siguiente++;
            const a = archivos[i];
            const f = new FormData();
            f.set('archivo', a);
            f.set('categoria', String(datos.get('categoria') ?? ''));
            f.set('subcategoria', String(datos.get('subcategoria') ?? ''));
            f.set('fecha', fecha || fechaArchivo(a));
            if (archivos.length === 1) f.set('nombre', String(datos.get('nombre') ?? ''));
            try {
              const r = await fetch('/api/plantillas/cargar', { method: 'POST', body: f });
              const j = (await r.json().catch(() => ({}))) as { error?: string; nombre?: string };
              actualizar(i, r.ok ? { estado: 'ok', mensaje: `agregada como «${j.nombre}»` } : { estado: 'error', mensaje: j.error ?? 'No se pudo agregar.' });
            } catch {
              actualizar(i, { estado: 'error', mensaje: 'Se perdió la conexión con el servidor.' });
            }
          }
        }));
        formulario.reset();
        router.refresh();
      });
    }}>
      <div className="filtros">
        <div className="ancho">
          <label htmlFor="archivos">Plantillas (.docx)</label>
          <input id="archivos" name="archivos" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple required />
          <div className="ayuda">Escrituras modelo completas en Word. Si son varias, todas quedan en la misma categoría y cada una con el nombre de su archivo.</div>
        </div>
        <div>
          <label htmlFor="categoria-nueva">Categoría</label>
          <input id="categoria-nueva" name="categoria" type="text" list="categorias-biblioteca" required maxLength={80} placeholder="COMPRAVENTA, HIPOTECA…" />
          <datalist id="categorias-biblioteca">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <div>
          <label htmlFor="subcategoria-nueva">Banco / subcategoría</label>
          <input id="subcategoria-nueva" name="subcategoria" type="text" list="subcategorias-biblioteca" maxLength={80} placeholder="Opcional" />
          <datalist id="subcategorias-biblioteca">{subcategorias.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <div>
          <label htmlFor="fecha-plantilla">Fecha</label>
          <input id="fecha-plantilla" name="fecha" type="date" />
          <div className="ayuda">Vacía: la del archivo.</div>
        </div>
        <div>
          <label htmlFor="nombre-plantilla">Nombre (si es una sola)</label>
          <input id="nombre-plantilla" name="nombre" type="text" maxLength={200} placeholder="El del archivo" />
        </div>
        <div className="acciones-filtro"><button type="submit" disabled={pendiente} aria-busy={pendiente}>{pendiente && <span className="girador pequeno" aria-hidden="true" />}{pendiente ? 'Agregando…' : 'Agregar a la biblioteca'}</button></div>
      </div>
      {lista.length > 0 && (
        <ul className="hallazgos" aria-live="polite">
          {lista.map((x, i) => (
            <li key={i}>
              <span className={`etiqueta ${x.estado === 'ok' ? 'ok' : x.estado === 'error' ? 'critica' : 'informativa'}`}>{x.estado === 'ok' ? 'Agregada' : x.estado === 'error' ? 'Error' : 'Cargando'}</span> {x.nombre}{x.mensaje ? <span className="suave"> — {x.mensaje}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
