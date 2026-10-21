import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { nuevoSecreto, codigoQR } from '@/lib/seguridad/totp';
import { descifrarTexto } from '@/lib/seguridad/cifrado';
import { accionConfirmar2FA } from '../acciones';
import { FormularioCodigo } from '../componentes';

export default async function Configurar2FA() {
  const s = await requerirSesion({ paso: 'configurar-2fa' });
  const u = await db.usuario.findUniqueOrThrow({ where: { id: s.usuario.id } });
  if (u.totpActivo) redirect(s.segundoFactorOk ? '/' : '/verificacion');
  if (s.remota) {
    return (
      <main className="acceso"><div className="tarjeta"><h1>Doble factor pendiente</h1>
        <div className="aviso error">El doble factor solo se puede configurar por primera vez desde la red de la oficina.</div></div></main>
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
    <main className="acceso">
      <div className="tarjeta">
        <h1>Configurar doble factor</h1>
        <p className="suave">Escanee el código con Google Authenticator, Microsoft Authenticator u otra aplicación TOTP y escriba el código que genera.</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="Código QR para la aplicación de autenticación" width={220} height={220} />
        <p className="suave">Clave manual: <code>{secreto.replace(/(.{4})/g, '$1 ').trim()}</code></p>
        <FormularioCodigo accion={accionConfirmar2FA} boton="Activar doble factor" />
      </div>
    </main>
  );
}
