import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { nuevoSecreto, codigoQR } from '@/lib/seguridad/totp';
import { descifrarTexto } from '@/lib/seguridad/cifrado';
import { accionConfirmar2FA, accionCerrarSesion } from '../acciones';
import { FormularioCodigo } from '../componentes';
import { MarcoAcceso } from '../Marco';
import { Icono } from '../../Icono';

export const metadata = { title: 'Configurar el doble factor' };

export default async function Configurar2FA() {
  const s = await requerirSesion({ paso: 'configurar-2fa' });
  const u = await db.usuario.findUniqueOrThrow({ where: { id: s.usuario.id } });
  if (u.totpActivo) redirect(s.segundoFactorOk ? '/' : '/verificacion');
  if (s.remota) {
    return (
      <MarcoAcceso
        titulo="Doble factor pendiente"
        paso={2}
        pie={<form action={accionCerrarSesion}><button type="submit" className="secundario">Cerrar sesión</button></form>}
      >
        <div className="aviso error" role="alert"><Icono nombre="red" /><div>Por seguridad, el doble factor solo se puede configurar por primera vez desde la red de la oficina.</div></div>
        <p className="suave">Está conectado desde la IP <code>{s.ip}</code>, que no está registrada como red de la oficina. Para continuar puede:</p>
        <ul className="suave">
          <li>Ingresar una vez desde la oficina y configurar el doble factor. Después podrá entrar desde cualquier lugar.</li>
          <li>O pedirle al administrador que agregue temporalmente esta IP en <strong>Configuración → red.ips_oficina</strong> y la retire cuando termine.</li>
        </ul>
      </MarcoAcceso>
    );
  }
  // Solo un usuario sin doble factor activo puede generar su secreto inicial
  let cifrado = u.totpSecretoCifrado;
  if (!cifrado) {
    cifrado = nuevoSecreto().secretoCifrado;
    await db.usuario.update({ where: { id: u.id }, data: { totpSecretoCifrado: cifrado } });
  }
  const secreto = descifrarTexto(cifrado);
  const qr = await codigoQR(secreto, u.usuario);
  return (
    <MarcoAcceso
      titulo="Configurar el doble factor"
      descripcion="Escanee el código con Google Authenticator, Microsoft Authenticator u otra aplicación TOTP y escriba el código de 6 dígitos que genera."
      paso={2}
      porQue={{ icono: 'telefono', texto: 'Desde ahora, cada ingreso le pedirá el código de su teléfono: aunque alguien conozca su contraseña, no puede entrar sin él.' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="qr" src={qr} alt="Código QR para la aplicación de autenticación" width={220} height={220} />
      <p className="tenue">¿No puede escanearlo? Escriba esta clave en la aplicación: <code>{secreto.replace(/(.{4})/g, '$1 ').trim()}</code></p>
      <FormularioCodigo accion={accionConfirmar2FA} boton="Activar doble factor" />
    </MarcoAcceso>
  );
}
