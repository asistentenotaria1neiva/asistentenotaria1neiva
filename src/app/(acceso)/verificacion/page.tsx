import { requerirSesion } from '@/lib/sesion';
import { redirect } from 'next/navigation';
import { accionVerificar, accionCerrarSesion } from '../acciones';
import { FormularioCodigo } from '../componentes';
import { MarcoAcceso } from '../Marco';
import { Icono } from '../../Icono';

export const metadata = { title: 'Doble factor' };

export default async function Verificacion() {
  const s = await requerirSesion({ paso: 'verificacion' });
  if (s.segundoFactorOk) redirect('/');
  if (!s.usuario.totpActivo) redirect('/configurar-2fa');
  return (
    <MarcoAcceso
      titulo="Doble factor"
      descripcion="Abra su aplicación de autenticación (Google o Microsoft Authenticator) y escriba el código de 6 dígitos que muestra ahora."
      paso={2}
      porQue={{ icono: 'telefono', texto: 'El código cambia cada 30 segundos y solo lo tiene su teléfono: aunque alguien conozca su contraseña, no puede entrar sin él.' }}
      pie={<form action={accionCerrarSesion}><button className="enlace-boton" type="submit">Cancelar e ingresar con otro usuario</button></form>}
    >
      {s.remota && <div className="aviso alerta"><Icono nombre="red" /><div>Está ingresando desde fuera de la red de la oficina.</div></div>}
      <FormularioCodigo accion={accionVerificar} boton="Verificar" />
    </MarcoAcceso>
  );
}
