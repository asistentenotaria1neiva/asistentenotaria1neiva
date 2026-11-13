import { Suspense } from 'react';
import { requerirSesion } from '@/lib/sesion';
import { accionCerrarSesion } from '../(acceso)/acciones';
import { MenuLateral, type EnlaceMenu } from './navegacion';
import { Avisos } from './notificaciones/Avisos';
import { Actividad } from './Actividad';
import { Icono } from '../Icono';
import { noLeidas } from '@/lib/servicios/notificaciones';
import { clavePublicaPush } from '@/lib/servicios/push';

const ROL: Record<string, string> = { ADMINISTRADOR: 'Administrador', REVISOR: 'Revisor', DIGITADOR: 'Digitador' };

async function AvisosConConteo({ usuarioId }: { usuarioId: string }) {
  return <Avisos inicial={await noLeidas(usuarioId)} clavePush={clavePublicaPush()} />;
}

/** Iniciales del nombre (máximo dos) para el distintivo del usuario */
const iniciales = (nombre: string) => nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requerirSesion();
  const admin = s.usuario.rol === 'ADMINISTRADOR';
  const enlaces: EnlaceMenu[] = [
    { href: '/', texto: 'Inicio', icono: 'inicio' },
    { href: '/expedientes', texto: 'Escrituras', icono: 'escrituras' },
    { href: '/plantillas', texto: 'Biblioteca de plantillas', icono: 'biblioteca' },
    ...(admin ? [
      { href: '/admin', texto: 'Panel', icono: 'panel', seccion: 'Administración' },
      { href: '/admin/dispositivos', texto: 'Dispositivos', icono: 'equipo' },
      { href: '/admin/usuarios', texto: 'Usuarios', icono: 'usuarios' },
      { href: '/admin/auditoria', texto: 'Auditoría', icono: 'auditoria' },
      { href: '/admin/estadisticas', texto: 'Estadísticas', icono: 'estadisticas' },
      { href: '/admin/consumo', texto: 'Consumo de IA', icono: 'consumo' },
      { href: '/admin/alertas', texto: 'Alertas', icono: 'alerta' },
      { href: '/admin/configuracion', texto: 'Configuración', icono: 'configuracion' },
    ] satisfies EnlaceMenu[] : []),
  ];
  return (
    <div className="app">
      <a className="saltar" href="#contenido">Saltar al contenido</a>
      <MenuLateral
        enlaces={enlaces}
        avisos={
          // El conteo no detiene la página: llega en cuanto esté listo
          <Suspense fallback={<Avisos inicial={0} clavePush={clavePublicaPush()} />}>
            <AvisosConConteo usuarioId={s.usuario.id} />
          </Suspense>
        }
        pie={
          <div className="pie">
            <span className="avatar" aria-hidden="true">{iniciales(s.usuario.nombre)}</span>
            <div className="quien">
              <strong>{s.usuario.nombre}</strong>
              <span>{ROL[s.usuario.rol]}{s.remota ? ' · acceso remoto' : ''}</span>
            </div>
            <form action={accionCerrarSesion}>
              <button type="submit" className="boton-salir"><Icono nombre="salir" tamano={18} />Cerrar sesión</button>
            </form>
          </div>
        }
      />
      <main className="principal" id="contenido" tabIndex={-1}>{children}</main>
      <Actividad />
    </div>
  );
}
