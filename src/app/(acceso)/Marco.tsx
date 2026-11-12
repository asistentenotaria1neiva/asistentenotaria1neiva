/** Marco de las pantallas de acceso (servidor): panel de la marca a la izquierda y el formulario a la derecha */
import { Icono, type NombreIcono } from '../Icono';

const PASOS = ['Usuario y contraseña', 'Doble factor'];

export function MarcoAcceso({ titulo, descripcion, paso, porQue, children, pie }: {
  titulo: string;
  descripcion?: React.ReactNode;
  /** Paso del ingreso (1 o 2) para mostrar el indicador */
  paso?: 1 | 2;
  /** Por qué se pide este paso, en una línea */
  porQue?: { icono: NombreIcono; texto: React.ReactNode };
  children?: React.ReactNode;
  pie?: React.ReactNode;
}) {
  return (
    <main className="acceso">
      <section className="acceso-marca" aria-label="Notaría Primera del Círculo de Neiva">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/logo-blanco.svg" alt="Notaría 1 · Neiva - Huila" width={300} height={185} />
        <div>
          <p className="lema">Asistente de escrituración</p>
          <p>Prepara la escritura sobre la plantilla de la notaría, verifica los datos con los documentos y advierte lo que falta. La firma, el control de legalidad y la responsabilidad siguen siendo del notario.</p>
          <ul className="garantias">
            <li><Icono nombre="equipo" tamano={18} />Solo desde equipos registrados y aprobados</li>
            <li><Icono nombre="candado" tamano={18} />Documentos cifrados y sesión que se cierra sola</li>
            <li><Icono nombre="auditoria" tamano={18} />Cada acción queda registrada a nombre de quien la hace</li>
          </ul>
        </div>
        <div className="pie-marca"><span className="tres-lineas" aria-hidden="true" />Uso exclusivo del personal autorizado</div>
      </section>
      <div className="acceso-formulario">
        <div className="acceso-caja">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="isotipo-movil" src="/marca/nombre.svg" alt="Notaría 1 · Neiva - Huila" width={150} height={41} />
          {paso && (
            <ol className="pasos-acceso" aria-label="Pasos del ingreso">
              {PASOS.map((p, i) => (
                <li key={p} className={i + 1 === paso ? 'actual' : i + 1 < paso ? 'hecho' : undefined} aria-current={i + 1 === paso ? 'step' : undefined}>
                  <span aria-hidden="true">{i + 1 < paso ? '✓' : i + 1}</span>{p}
                </li>
              ))}
            </ol>
          )}
          <h1>{titulo}</h1>
          {descripcion && <p className="suave">{descripcion}</p>}
          {children}
          {porQue && <p className="por-que"><Icono nombre={porQue.icono} tamano={18} /><span>{porQue.texto}</span></p>}
          {pie && <div className="pie-acceso">{pie}</div>}
        </div>
      </div>
    </main>
  );
}
