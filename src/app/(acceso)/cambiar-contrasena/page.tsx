import { requerirSesion } from '@/lib/sesion';
import { accionCambiarContrasena } from '../acciones';
import { FormularioContrasena } from '../componentes';

export default async function CambiarContrasena() {
  const s = await requerirSesion({ paso: 'cambiar-contrasena' });
  return (
    <main className="acceso">
      <div className="tarjeta">
        <h1>Cambiar contraseña</h1>
        {s.usuario.debeCambiarContrasena && <div className="aviso info">Debe cambiar la contraseña asignada antes de continuar.</div>}
        <FormularioContrasena accion={accionCambiarContrasena} />
      </div>
    </main>
  );
}
