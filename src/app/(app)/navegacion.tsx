'use client';
/** Navegación de la aplicación (cliente): marca la página activa y, en pantallas pequeñas, abre el menú como panel lateral */
import { Fragment, useEffect, useRef, useState } from 'react';
import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';
import { Icono, type NombreIcono } from '../Icono';

export interface EnlaceMenu { href: string; texto: string; icono: NombreIcono; seccion?: string }

/** Indicador del enlace que se está abriendo: respuesta inmediata al clic mientras llega la página */
export function Pendiente() {
  const { pending } = useLinkStatus();
  return <span className={`pendiente${pending ? ' activo' : ''}`} aria-hidden="true" />;
}

/** El enlace activo es el de ruta más larga que contiene la página actual ("/" solo cuando es exacta) */
function enlaceActivo(ruta: string, hrefs: string[]): string | undefined {
  return hrefs
    .filter((h) => (h === '/' ? ruta === '/' : ruta === h || ruta.startsWith(`${h}/`)))
    .sort((a, b) => b.length - a.length)[0];
}

export function MenuLateral({ enlaces, avisos, pie }: { enlaces: EnlaceMenu[]; avisos: React.ReactNode; pie: React.ReactNode }) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  // Al cambiar de página el menú se cierra
  const [rutaPrevia, setRutaPrevia] = useState(ruta);
  if (ruta !== rutaPrevia) { setRutaPrevia(ruta); setAbierto(false); }

  useEffect(() => {
    if (!abierto) return;
    // El foco entra al menú al abrirlo y vuelve al botón al cerrarlo con Escape
    panel.current?.querySelector<HTMLElement>('a, button')?.focus();
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') { setAbierto(false); boton.current?.focus(); } };
    document.addEventListener('keydown', alTeclear);
    document.body.classList.add('sin-desplazamiento');
    return () => { document.removeEventListener('keydown', alTeclear); document.body.classList.remove('sin-desplazamiento'); };
  }, [abierto]);

  const activo = enlaceActivo(ruta, ['/expedientes/nuevo', ...enlaces.map((e) => e.href)]);
  return (
    <>
      <header className="barra-superior">
        <button ref={boton} type="button" className="boton-menu" aria-expanded={abierto} aria-controls="menu-principal" aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'} onClick={() => setAbierto((a) => !a)}>
          <Icono nombre={abierto ? 'cerrar' : 'menu'} tamano={22} />
        </button>
        <Link href="/" className="marca-superior" aria-label="Notaría 1 · Inicio">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca/nombre-blanco.svg" alt="" width={120} height={32} />
        </Link>
        <Link href="/expedientes/nuevo" className="boton-superior" aria-label="Nueva escritura"><Icono nombre="mas" tamano={22} /></Link>
      </header>
      <nav ref={panel} id="menu-principal" className={`lateral${abierto ? ' abierto' : ''}`} aria-label="Menú principal">
        <Link href="/" className="marca" aria-label="Notaría 1 · Neiva - Huila · Inicio">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca/logo-blanco.svg" alt="" width={186} height={115} />
        </Link>
        <Link href="/expedientes/nuevo" className="boton-nueva" aria-current={activo === '/expedientes/nuevo' ? 'page' : undefined}>
          <Icono nombre="mas" tamano={18} />Nueva escritura<Pendiente />
        </Link>
        {enlaces.map((e, i) => (
          <Fragment key={e.href}>
            {e.seccion && <div className="seccion">{e.seccion}</div>}
            <Link href={e.href} aria-current={e.href === activo ? 'page' : undefined}><Icono nombre={e.icono} tamano={18} /><span>{e.texto}</span><Pendiente /></Link>
            {/* Las notificaciones van con el trabajo diario, después de la biblioteca */}
            {i === 2 && avisos}
          </Fragment>
        ))}
        {pie}
      </nav>
      {abierto && <div className="velo" aria-hidden="true" onClick={() => setAbierto(false)} />}
    </>
  );
}
