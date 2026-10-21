import { requerirSesion } from '@/lib/sesion';
import { redirect } from 'next/navigation';
import { accionVerificar, accionCerrarSesion } from '../acciones';
import { FormularioCodigo } from '../componentes';

export default async function Verificacion() {
  const s = await requerirSesion({ paso: 'verificacion' });
  if (s.segundoFactorOk) redirect('/');
  if (!s.usuario.totpActivo) redirect('/configurar-2fa');
  return (
    <main className="acceso">
      <div className="tarjeta">
        <h1>Doble factor</h1>
        <p className="suave">Escriba el código que muestra su aplicación de autenticación.{s.remota && ' Está ingresando desde fuera de la oficina.'}</p>
        <FormularioCodigo accion={accionVerificar} boton="Verificar" />
        <form action={accionCerrarSesion} style={{ marginTop: '1rem' }}><button className="secundario pequeno" type="submit">Cancelar</button></form>
      </div>
    </main>
  );
}
