import { Suspense } from 'react';
import { requerirSesion } from '@/lib/sesion';
import { accionCerrarSesion } from '../(acceso)/acciones';
import { MenuLateral, type EnlaceMenu } from './navegacion';
import { Avisos } from './notificaciones/Avisos';
import { Actividad } from './Actividad';
import { noLeidas } from '@/lib/servicios/notificaciones';

const ROL: Record<string, string> = { ADMINISTRADOR: 'Administrador', REVISOR: 'Revisor', DIGITADOR: 'Digitador' };

async function AvisosConConteo({ usuarioId }: { usuarioId: string }) {
  return <Avisos inicial={await noLeidas(usuarioId)} />;
}

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
      { href: '/admin/consumo', texto: 'Consumo de IA' },
      { href: '/admin/entrenamiento', texto: 'Entrenamiento IA' },
      { href: '/admin/alertas', texto: 'Alertas' },
      { href: '/admin/configuracion', texto: 'Configuración' },
    ] : []),
  ];
  return (
    <div className="app">
      <MenuLateral enlaces={enlaces}>
        {/* El conteo no detiene la página: llega en cuanto esté listo */}
        <Suspense fallback={<Avisos inicial={0} />}>
          <AvisosConConteo usuarioId={s.usuario.id} />
        </Suspense>
        <div className="pie">
          <div><strong>{s.usuario.nombre}</strong></div>
          <div className="suave">{ROL[s.usuario.rol]}{s.remota ? ' · acceso remoto' : ''}</div>
          <form action={accionCerrarSesion}>
            <button type="submit" className="secundario pequeno">Cerrar sesión</button>
          </form>
        </div>
      </MenuLateral>
      <main className="principal">{children}</main>
      <Actividad />
    </div>
  );
}
