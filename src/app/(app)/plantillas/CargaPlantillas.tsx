'use client';
/**
 * El revisor alimenta la biblioteca: uno o varios .docx con su categoría (y banco o subcategoría).
 * La fecha de cada plantilla es la de modificación del archivo, salvo que se indique otra.
 */
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icono } from '../../Icono';

interface Estado { nombre: string; estado: 'pendiente' | 'ok' | 'error'; mensaje?: string }

const fechaArchivo = (a: File) => new Date(a.lastModified).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

export function CargaPlantillas({ categorias, subcategorias }: { categorias: string[]; subcategorias: string[] }) {
  const router = useRouter();
  const [lista, setLista] = useState<Estado[]>([]);
  const [elegidos, setElegidos] = useState(0);
  const [sobre, setSobre] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const campo = useRef<HTMLInputElement>(null);
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
        setElegidos(0);
        router.refresh();
      });
    }}>
      <label
        className={`zona-carga${sobre ? ' sobre' : ''}${pendiente ? ' ocupada' : ''}`}
        onDragOver={(e) => { e.preventDefault(); if (!sobre) setSobre(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSobre(false); }}
        onDrop={(e) => {
          e.preventDefault();
          setSobre(false);
          if (!campo.current || !e.dataTransfer.files.length) return;
          campo.current.files = e.dataTransfer.files;
          setElegidos(e.dataTransfer.files.length);
        }}
      >
        <span className="icono-zona"><Icono nombre="plantilla" tamano={24} /></span>
        <strong>{elegidos ? `${elegidos} archivo(s) elegido(s)` : <>Arrastre aquí las plantillas o <span className="elegir">elíjalas</span></>}</strong>
        <span className="tenue">Escrituras modelo completas en Word (.docx). Si son varias, todas quedan en la misma categoría y cada una con el nombre de su archivo.</span>
        <input ref={campo} id="archivos" name="archivos" type="file" aria-label="Elegir plantillas (.docx)" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple required
          onChange={(e) => setElegidos(e.currentTarget.files?.length ?? 0)} />
      </label>
      <div className="filtros mt">
        <div>
          <label htmlFor="categoria-nueva">Categoría</label>
          <input id="categoria-nueva" name="categoria" type="text" list="categorias-biblioteca" required maxLength={80} placeholder="COMPRAVENTA, HIPOTECA…" />
          <datalist id="categorias-biblioteca">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <div>
          <label htmlFor="subcategoria-nueva">Banco / subcategoría <span className="opcional">(opcional)</span></label>
          <input id="subcategoria-nueva" name="subcategoria" type="text" list="subcategorias-biblioteca" maxLength={80} />
          <datalist id="subcategorias-biblioteca">{subcategorias.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <div>
          <label htmlFor="fecha-plantilla">Fecha <span className="opcional">(vacía: la del archivo)</span></label>
          <input id="fecha-plantilla" name="fecha" type="date" />
        </div>
        <div>
          <label htmlFor="nombre-plantilla">Nombre <span className="opcional">(si es una sola)</span></label>
          <input id="nombre-plantilla" name="nombre" type="text" maxLength={200} placeholder="El del archivo" />
        </div>
        <div className="acciones-filtro"><button type="submit" disabled={pendiente} aria-busy={pendiente}>{pendiente ? <span className="girador pequeno" aria-hidden="true" /> : <Icono nombre="subir" tamano={18} />}{pendiente ? 'Agregando…' : 'Agregar a la biblioteca'}</button></div>
      </div>
      {lista.length > 0 && (
        <ul className="cola-carga" aria-live="polite">
          {lista.map((x, i) => (
            <li key={i} className={x.estado === 'error' ? 'error' : undefined}>
              <span className="nombre">{x.nombre}</span>
              <span className={`etiqueta ${x.estado === 'ok' ? 'ok' : x.estado === 'error' ? 'critica' : 'informativa gira'}`}>{x.estado === 'ok' ? 'Agregada' : x.estado === 'error' ? 'Error' : 'Cargando'}</span>
              {x.mensaje && <span className="mensaje">{x.mensaje}</span>}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
