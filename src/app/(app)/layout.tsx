import { requerirSesion } from '@/lib/sesion';
import { accionCerrarSesion } from '../(acceso)/acciones';
import { MenuLateral, type EnlaceMenu } from './navegacion';

const ROL: Record<string, string> = { ADMINISTRADOR: 'Administrador', REVISOR: 'Revisor', DIGITADOR: 'Digitador' };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requerirSesion();
  const admin = s.usuario.rol === 'ADMINISTRADOR';
  const enlaces: EnlaceMenu[] = [
    { href: '/', texto: 'Inicio' },
    { href: '/expedientes', texto: 'Expedientes' },
    { href: '/expedientes/nuevo', texto: 'Nuevo expediente' },
    ...(admin || s.usuario.rol === 'REVISOR' ? [{ href: '/plantillas', texto: 'Plantillas' }] : []),
    ...(admin ? [
      { href: '/admin', texto: 'Panel', seccion: 'Administración' },
      { href: '/admin/dispositivos', texto: 'Dispositivos' },
      { href: '/admin/usuarios', texto: 'Usuarios' },
      { href: '/admin/auditoria', texto: 'Auditoría' },
      { href: '/admin/estadisticas', texto: 'Estadísticas' },
      { href: '/admin/entrenamiento', texto: 'Entrenamiento IA' },
      { href: '/admin/alertas', texto: 'Alertas' },
      { href: '/admin/configuracion', texto: 'Configuración' },
    ] : []),
  ];
  return (
    <div className="app">
      <MenuLateral enlaces={enlaces}>
        <div className="pie">
          <div><strong>{s.usuario.nombre}</strong></div>
          <div className="suave">{ROL[s.usuario.rol]}{s.remota ? ' · acceso remoto' : ''}</div>
          <form action={accionCerrarSesion}>
            <button type="submit" className="secundario pequeno">Cerrar sesión</button>
          </form>
        </div>
      </MenuLateral>
      <main className="principal">{children}</main>
    </div>
  );
}
