'use client';
/** Formularios de acceso (componentes de cliente) */
import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Estado } from './acciones';

/** Huella del navegador (dato complementario al token del equipo; no identifica personas) */
export function useHuella(): string {
  const [huella, setHuella] = useState('');
  useEffect(() => {
    const base = [navigator.userAgent, navigator.language, screen.width, screen.height, screen.colorDepth,
      Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.hardwareConcurrency ?? ''].join('|');
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(base)).then((b) =>
      setHuella(Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('')));
  }, []);
  return huella;
}

type Accion = (estado: Estado, datos: FormData) => Promise<Estado>;

function Mensajes({ estado }: { estado: Estado }) {
  return (
    <>
      {estado.error && <div className="aviso error" role="alert">{estado.error}{estado.registrarEquipo && <> <Link href="/registrar-equipo">Registrar este equipo</Link></>}</div>}
      {estado.ok && <div className="aviso exito" role="status">{estado.ok}</div>}
    </>
  );
}

export function FormularioIngreso({ accion }: { accion: Accion }) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const huella = useHuella();
  return (
    <form action={enviar}>
      <Mensajes estado={estado} />
      <input type="hidden" name="huella" value={huella} />
      <div className="campo"><label htmlFor="usuario">Usuario</label><input id="usuario" name="usuario" type="text" autoComplete="username" required autoFocus /></div>
      <div className="campo"><label htmlFor="contrasena">Contraseña</label><input id="contrasena" name="contrasena" type="password" autoComplete="current-password" required /></div>
      <button type="submit" disabled={pendiente}>{pendiente ? 'Verificando…' : 'Ingresar'}</button>
    </form>
  );
}

export function FormularioCodigo({ accion, boton }: { accion: Accion; boton: string }) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  return (
    <form action={enviar}>
      <Mensajes estado={estado} />
      <div className="campo">
        <label htmlFor="codigo">Código de 6 dígitos</label>
        <input id="codigo" name="codigo" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus />
      </div>
      <button type="submit" disabled={pendiente}>{pendiente ? 'Verificando…' : boton}</button>
    </form>
  );
}

export function FormularioContrasena({ accion }: { accion: Accion }) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  return (
    <form action={enviar}>
      <Mensajes estado={estado} />
      <div className="campo"><label htmlFor="actual">Contraseña actual</label><input id="actual" name="actual" type="password" autoComplete="current-password" required /></div>
      <div className="campo"><label htmlFor="nueva">Nueva contraseña</label><input id="nueva" name="nueva" type="password" autoComplete="new-password" minLength={12} required />
        <div className="ayuda">Mínimo 12 caracteres, con mayúsculas, minúsculas y números.</div></div>
      <div className="campo"><label htmlFor="confirmacion">Confirmar nueva contraseña</label><input id="confirmacion" name="confirmacion" type="password" autoComplete="new-password" required /></div>
      <button type="submit" disabled={pendiente}>Cambiar contraseña</button>
    </form>
  );
}

export function FormularioEquipo({ accion }: { accion: Accion }) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const huella = useHuella();
  return (
    <form action={enviar}>
      <Mensajes estado={estado} />
      <input type="hidden" name="huella" value={huella} />
      <div className="campo"><label htmlFor="nombre">Nombre del equipo</label><input id="nombre" name="nombre" type="text" required placeholder="Recepción – equipo 2" />
        <div className="ayuda">El administrador verá este nombre al aprobar el equipo.</div></div>
      <button type="submit" disabled={pendiente || !!estado.ok}>Registrar equipo</button>
      {estado.ok && <p><Link href="/ingreso">Volver al ingreso</Link></p>}
    </form>
  );
}

export function FormularioInstalacion({ accion }: { accion: Accion }) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  return (
    <form action={enviar}>
      <Mensajes estado={estado} />
      <div className="campo"><label htmlFor="nombre">Nombre completo</label><input id="nombre" name="nombre" type="text" required /></div>
      <div className="campo"><label htmlFor="usuario">Usuario</label><input id="usuario" name="usuario" type="text" autoComplete="username" required /></div>
      <div className="campo"><label htmlFor="contrasena">Contraseña</label><input id="contrasena" name="contrasena" type="password" autoComplete="new-password" minLength={12} required /></div>
      <div className="campo"><label htmlFor="confirmacion">Confirmar contraseña</label><input id="confirmacion" name="confirmacion" type="password" autoComplete="new-password" required /></div>
      <button type="submit" disabled={pendiente}>Crear administrador</button>
    </form>
  );
}
