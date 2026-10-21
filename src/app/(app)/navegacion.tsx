'use client';
/** Navegación de la aplicación (cliente): marca la página activa y, en pantallas pequeñas, abre el menú como panel lateral */
import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface EnlaceMenu { href: string; texto: string; seccion?: string }

/** El enlace activo es el de ruta más larga que contiene la página actual ("/" solo cuando es exacta) */
function enlaceActivo(ruta: string, hrefs: string[]): string | undefined {
  return hrefs
    .filter((h) => (h === '/' ? ruta === '/' : ruta === h || ruta.startsWith(`${h}/`)))
    .sort((a, b) => b.length - a.length)[0];
}

export function MenuLateral({ enlaces, children }: { enlaces: EnlaceMenu[]; children: React.ReactNode }) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  // Al cambiar de página el menú se cierra
  const [rutaPrevia, setRutaPrevia] = useState(ruta);
  if (ruta !== rutaPrevia) { setRutaPrevia(ruta); setAbierto(false); }

  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('keydown', alTeclear);
    document.body.classList.add('sin-desplazamiento');
    return () => { document.removeEventListener('keydown', alTeclear); document.body.classList.remove('sin-desplazamiento'); };
  }, [abierto]);

  const activo = enlaceActivo(ruta, enlaces.map((e) => e.href));
  return (
    <>
      <header className="barra-superior">
        <button type="button" className="boton-menu" aria-expanded={abierto} aria-controls="menu-principal" aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'} onClick={() => setAbierto((a) => !a)}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {abierto ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
        <Link href="/" className="marca-superior">Escrituración<small>Notaría Primera de Neiva</small></Link>
      </header>
      <nav id="menu-principal" className={`lateral${abierto ? ' abierto' : ''}`} aria-label="Menú principal">
        <div className="marca">Escrituración<small>Notaría Primera de Neiva</small></div>
        {enlaces.map((e) => (
          <Fragment key={e.href}>
            {e.seccion && <div className="seccion">{e.seccion}</div>}
            <Link href={e.href} aria-current={e.href === activo ? 'page' : undefined}>{e.texto}</Link>
          </Fragment>
        ))}
        {children}
      </nav>
      {abierto && <div className="velo" aria-hidden="true" onClick={() => setAbierto(false)} />}
    </>
  );
}

/** Pestañas del expediente: la activa es la que coincide exactamente con la página */
export function PestanasExpediente({ base, pestanas }: { base: string; pestanas: { href: string; texto: string }[] }) {
  const ruta = usePathname();
  return (
    <nav aria-label="Secciones del expediente">
      <ul className="pasos">
        {pestanas.map((p) => {
          const href = `${base}${p.href}`;
          return <li key={p.href}><Link href={href} aria-current={ruta === href ? 'page' : undefined}>{p.texto}</Link></li>;
        })}
      </ul>
    </nav>
  );
}
