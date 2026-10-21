import { accionRegistrarEquipo } from '../acciones';
import { FormularioEquipo } from '../componentes';

export default function RegistrarEquipo() {
  return (
    <main className="acceso">
      <div className="tarjeta">
        <h1>Registrar equipo</h1>
        <p className="suave">Cada computador de la oficina se registra una sola vez. El equipo queda pendiente hasta que el administrador lo apruebe. Solo funciona desde la red de la oficina.</p>
        <FormularioEquipo accion={accionRegistrarEquipo} />
      </div>
    </main>
  );
}
