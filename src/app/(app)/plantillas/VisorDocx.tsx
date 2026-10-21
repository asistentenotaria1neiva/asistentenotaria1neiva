'use client';
/**
 * Muestra un .docx como se ve en Word (páginas, márgenes, encabezados, pies, imágenes y tablas)
 * con docx-preview, y resalta las variables {{…}} y las marcas «FALTA: …».
 * Las páginas se reducen para caber en el ancho disponible (nunca se amplían).
 */
import { useEffect, useRef, useState } from 'react';

const ETIQUETA = /\{\{[^{}]*\}\}|«FALTA:[^»]*»/;

function claseDe(texto: string): string {
  if (texto.startsWith('«')) return 'marca-faltante';
  const c = texto.replace(/^\{\{\s*/, '')[0];
  return c === '#' || c === '^' ? 'marca-condicion' : c === '/' ? 'marca-cierre' : 'marca-variable';
}

/** Envuelve en <span> las etiquetas que quedaron completas dentro de un mismo nodo de texto */
function resaltarEtiquetas(raiz: HTMLElement) {
  const caminante = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  const nodos: Text[] = [];
  while (caminante.nextNode()) if (ETIQUETA.test((caminante.currentNode as Text).data)) nodos.push(caminante.currentNode as Text);
  for (const nodo of nodos) {
    const fragmento = document.createDocumentFragment();
    let resto = nodo.data;
    for (let m = resto.match(ETIQUETA); m; m = resto.match(ETIQUETA)) {
      if (m.index) fragmento.append(resto.slice(0, m.index));
      const marca = document.createElement('span');
      marca.className = claseDe(m[0]);
      marca.textContent = m[0];
      fragmento.append(marca);
      resto = resto.slice(m.index! + m[0].length);
    }
    if (resto) fragmento.append(resto);
    nodo.replaceWith(fragmento);
  }
}

/** Reduce el documento para que la página quepa a lo ancho del visor */
function ajustarAncho(contenedor: HTMLElement, envoltura: HTMLElement, anchoPagina: number) {
  envoltura.style.zoom = String(Math.min(1, (contenedor.clientWidth - 2) / anchoPagina));
}

export function VisorDocx({ url }: { url: string }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const cuerpo = useRef<HTMLDivElement>(null);
  const estilos = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [error, setError] = useState('');

  useEffect(() => {
    const controlador = new AbortController();
    let observador: ResizeObserver | undefined;
    setEstado('cargando');
    (async () => {
      try {
        const r = await fetch(url, { signal: controlador.signal, cache: 'no-store' });
        if (!r.ok) throw new Error((await r.text()) || `Error ${r.status}`);
        const datos = await r.blob();
        const { renderAsync } = await import('docx-preview');
        if (controlador.signal.aborted || !cuerpo.current || !estilos.current) return;
        cuerpo.current.innerHTML = '';
        estilos.current.innerHTML = '';
        await renderAsync(datos, cuerpo.current, estilos.current, {
          inWrapper: true, breakPages: true, renderHeaders: true, renderFooters: true, renderFootnotes: true,
          useBase64URL: true, className: 'docx',
        });
        resaltarEtiquetas(cuerpo.current);
        const envoltura = cuerpo.current.querySelector<HTMLElement>('.docx-wrapper');
        const pagina = envoltura?.querySelector<HTMLElement>('section.docx');
        if (envoltura && pagina && contenedor.current) {
          const anchoPagina = pagina.offsetWidth + 48; // página + margen gris a los lados
          const c = contenedor.current;
          ajustarAncho(c, envoltura, anchoPagina);
          observador = new ResizeObserver(() => ajustarAncho(c, envoltura, anchoPagina));
          observador.observe(c);
        }
        setEstado('listo');
      } catch (e) {
        if (controlador.signal.aborted) return;
        setError(e instanceof Error ? e.message : 'No se pudo mostrar el documento.');
        setEstado('error');
      }
    })();
    return () => { controlador.abort(); observador?.disconnect(); };
  }, [url]);

  return (
    <div className="visor-docx" ref={contenedor}>
      {estado === 'cargando' && <p className="suave" style={{ padding: '1rem' }}>Cargando el documento…</p>}
      {estado === 'error' && <div className="aviso error" style={{ margin: '1rem' }}>No se pudo mostrar el documento: {error}. Descárguelo para revisarlo en Word.</div>}
      <div ref={estilos} />
      <div ref={cuerpo} />
    </div>
  );
}
