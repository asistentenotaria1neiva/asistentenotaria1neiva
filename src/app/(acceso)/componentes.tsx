'use client';
/** Formularios de acceso (componentes de cliente) */
import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Estado } from './acciones';
import { Icono } from '../Icono';

/** Contenido del botón de envío: girador mientras se procesa */
function Enviar({ pendiente, texto, enCurso }: { pendiente: boolean; texto: string; enCurso: string }) {
  return <>{pendiente && <span className="girador pequeno" aria-hidden="true" />}{pendiente ? enCurso : texto}</>;
}

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
      {estado.error && <div className="aviso error" role="alert"><Icono nombre="error" /><div>{estado.error}{estado.registrarEquipo && <> <Link href="/registrar-equipo">Registrar este equipo</Link></>}</div></div>}
      {estado.ok && <div className="aviso exito" role="status"><Icono nombre="exito" /><div>{estado.ok}</div></div>}
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
      <button type="submit" disabled={pendiente} aria-busy={pendiente}><Enviar pendiente={pendiente} texto="Ingresar" enCurso="Verificando…" /></button>
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
      <button type="submit" disabled={pendiente} aria-busy={pendiente}><Enviar pendiente={pendiente} texto={boton} enCurso="Verificando…" /></button>
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
      <button type="submit" disabled={pendiente} aria-busy={pendiente}><Enviar pendiente={pendiente} texto="Cambiar contraseña" enCurso="Guardando…" /></button>
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
        <div className="ayuda">Un nombre que el administrador reconozca al aprobarlo: lugar y número del equipo.</div></div>
      <button type="submit" disabled={pendiente || !!estado.ok} aria-busy={pendiente}><Enviar pendiente={pendiente} texto="Registrar equipo" enCurso="Registrando…" /></button>
      {estado.ok && <p className="mt"><Link href="/ingreso">Volver al ingreso</Link></p>}
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
      <button type="submit" disabled={pendiente} aria-busy={pendiente}><Enviar pendiente={pendiente} texto="Crear administrador" enCurso="Creando…" /></button>
    </form>
  );
}
