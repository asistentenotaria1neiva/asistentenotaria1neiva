import Link from 'next/link';
import { requerirSesion } from '@/lib/sesion';
import { accionCerrarSesion } from '../(acceso)/acciones';

const ROL: Record<string, string> = { ADMINISTRADOR: 'Administrador', REVISOR: 'Revisor', DIGITADOR: 'Digitador' };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requerirSesion();
  const admin = s.usuario.rol === 'ADMINISTRADOR';
  return (
    <div className="app">
      <nav className="lateral" aria-label="Menú principal">
        <div className="marca">Escrituración<small>Notaría Primera de Neiva</small></div>
        <Link href="/">Inicio</Link>
        <Link href="/expedientes">Expedientes</Link>
        {s.usuario.rol !== 'REVISOR' && <Link href="/expedientes/nuevo">Nuevo expediente</Link>}
        {admin && (
          <>
            <div className="seccion">Administración</div>
            <Link href="/admin">Panel</Link>
            <Link href="/admin/dispositivos">Dispositivos</Link>
            <Link href="/admin/usuarios">Usuarios</Link>
            <Link href="/admin/plantillas">Plantillas</Link>
            <Link href="/admin/auditoria">Auditoría</Link>
            <Link href="/admin/estadisticas">Estadísticas</Link>
            <Link href="/admin/entrenamiento">Entrenamiento IA</Link>
            <Link href="/admin/alertas">Alertas</Link>
            <Link href="/admin/configuracion">Configuración</Link>
          </>
        )}
        <div className="pie">
          <div><strong>{s.usuario.nombre}</strong></div>
          <div className="suave" style={{ color: '#dbe4f3' }}>{ROL[s.usuario.rol]}{s.remota ? ' · acceso remoto' : ''}</div>
          <form action={accionCerrarSesion} style={{ marginTop: '0.5rem' }}>
            <button type="submit" className="secundario pequeno">Cerrar sesión</button>
          </form>
        </div>
      </nav>
      <main className="principal">{children}</main>
    </div>
  );
}
