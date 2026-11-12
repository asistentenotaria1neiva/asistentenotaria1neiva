import { requerirSesion } from '@/lib/sesion';
import { accionCambiarContrasena } from '../acciones';
import { FormularioContrasena } from '../componentes';
import { MarcoAcceso } from '../Marco';
import { Icono } from '../../Icono';

export const metadata = { title: 'Cambiar contraseña' };

export default async function CambiarContrasena() {
  const s = await requerirSesion({ paso: 'cambiar-contrasena' });
  return (
    <MarcoAcceso
      titulo="Cambiar contraseña"
      descripcion="Elija una contraseña que solo usted conozca."
      porQue={{ icono: 'candado', texto: 'La contraseña temporal la vio el administrador al crearla; por eso se cambia antes de empezar a trabajar.' }}
    >
      {s.usuario.debeCambiarContrasena && <div className="aviso info"><Icono nombre="info" /><div>Debe cambiar la contraseña asignada antes de continuar.</div></div>}
      <FormularioContrasena accion={accionCambiarContrasena} />
    </MarcoAcceso>
  );
}
