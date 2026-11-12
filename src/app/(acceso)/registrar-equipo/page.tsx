import Link from 'next/link';
import { accionRegistrarEquipo } from '../acciones';
import { FormularioEquipo } from '../componentes';
import { MarcoAcceso } from '../Marco';

export const metadata = { title: 'Registrar equipo' };

export default function RegistrarEquipo() {
  return (
    <MarcoAcceso
      titulo="Registrar este equipo"
      descripcion="Cada computador de la oficina se registra una sola vez. Queda pendiente hasta que el administrador lo apruebe; avísele cuando lo registre."
      porQue={{ icono: 'equipo', texto: 'Solo los equipos aprobados pueden abrir la aplicación, y el registro solo funciona desde la red de la oficina. Si el equipo se formatea o cambia de navegador, hay que registrarlo de nuevo.' }}
      pie={<Link href="/ingreso">Volver al ingreso</Link>}
    >
      <FormularioEquipo accion={accionRegistrarEquipo} />
    </MarcoAcceso>
  );
}
