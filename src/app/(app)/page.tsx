import Link from 'next/link';
import { requerirSesion } from '@/lib/sesion';
import { listarExpedientes } from '@/lib/servicios/expedientes';
import { noLeidas } from '@/lib/servicios/notificaciones';
import { EtiquetaVersion, TablaExpedientes, Vacio, hace, type FilaEscritura } from './componentes';
import { Icono } from '../Icono';

/** Qué le falta a cada escritura para avanzar (con los datos de la lista) */
function siguiente(e: FilaEscritura): string {
  const g = e.generaciones[0];
  if (g?.estado === 'EN_CURSO') return 'Ver el avance';
  if (g?.estado === 'ERROR') return 'Revisar el error';
  if (g?.estado === 'CANCELADA') return 'Generar de nuevo';
  if (g) return `Revisar la versión ${g.version}`;
  if (!e._count.documentos) return 'Cargar los documentos';
  return 'Generar la escritura';
}

function saludo(): string {
  const hora = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota', hour: 'numeric', hour12: false })) % 24;
  return hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
}

export default async function Inicio({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const s = await requerirSesion();
  const { error } = await searchParams;
  const [filas, avisos] = await Promise.all([listarExpedientes(s, { soloPropios: true, limite: 50 }), noLeidas(s.usuario.id)]);
  const generando = filas.filter((e) => e.generaciones[0]?.estado === 'EN_CURSO').length;
  const sinGenerar = filas.filter((e) => !e.generaciones[0]).length;
  const conVersion = filas.filter((e) => e.generaciones[0]?.estado === 'COMPLETADA').length;
  const recientes = filas.slice(0, 6);
  const primero = s.usuario.nombre.split(/\s+/)[0] ?? '';
  const nombre = primero.charAt(0).toLocaleUpperCase('es-CO') + primero.slice(1).toLocaleLowerCase('es-CO');

  return (
    <>
      <div className="fila entre encabezado">
        <div>
          <p className="saludo">{saludo()}, {nombre}</p>
          <h1>Mis escrituras</h1>
        </div>
        {filas.length > 0 && <div className="fila">
          <Link className="boton secundario" href="/plantillas"><Icono nombre="biblioteca" tamano={18} />Biblioteca</Link>
          <Link className="boton" href="/expedientes/nuevo"><Icono nombre="mas" tamano={18} />Nueva escritura</Link>
        </div>}
      </div>
      {error === 'permiso' && <div className="aviso error" role="alert"><Icono nombre="candado" /><div>No tiene permiso para esa sección.</div></div>}
      {avisos > 0 && <div className="aviso info"><Icono nombre="campana" /><div>Tiene {avisos} notificación{avisos === 1 ? '' : 'es'} sin leer. <Link href="/notificaciones">Verlas</Link></div></div>}

      {!filas.length ? (
        <section className="tarjeta">
          <Vacio icono="escrituras" titulo="Aún no tiene escrituras">
            <p>Empiece por elegir en la biblioteca la escritura modelo más parecida al negocio.</p>
            <Link className="boton" href="/expedientes/nuevo"><Icono nombre="mas" tamano={18} />Nueva escritura</Link>
          </Vacio>
        </section>
      ) : (
        <>
          <div className="rejilla cuatro">
            <div className="tarjeta compacta indicador"><span className="rotulo"><Icono nombre="escrituras" tamano={16} />Recientes</span><span className="cifra">{filas.length}</span><span className="tenue">{filas.length === 50 ? 'las 50 más recientes' : 'en total'}</span></div>
            <div className="tarjeta compacta indicador"><span className="rotulo"><Icono nombre="subir" tamano={16} />Sin generar</span><span className="cifra">{sinGenerar}</span><span className="tenue">faltan documentos o generar</span></div>
            <div className="tarjeta compacta indicador"><span className="rotulo"><Icono nombre="reloj" tamano={16} />Generando</span><span className="cifra">{generando}</span><span className="tenue">le avisaremos al terminar</span></div>
            <div className="tarjeta compacta indicador"><span className="rotulo"><Icono nombre="check" tamano={16} />Con versión</span><span className="cifra">{conVersion}</span><span className="tenue">listas para revisar</span></div>
          </div>

          <h2><span className="sobretitulo"><span className="tres-lineas" aria-hidden="true" />Continuar donde quedó</span></h2>
          <div className="en-curso">
            {recientes.map((e) => (
              <Link key={e.id} href={`/expedientes/${e.id}`} className="tarjeta-escritura">
                <span className="fila entre"><span className="radicado">{e.numeroInterno}</span><EtiquetaVersion g={e.generaciones[0]} /></span>
                <span className="titulo">{e.titulo || e.plantillaNombre}</span>
                <span className="tenue">{e.plantilla?.categoria ?? 'Plantilla personal'} · {e._count.documentos} documento(s)</span>
                <span className="pie-tarjeta"><span>{hace(e.actualizadoEn)}</span><span className="siguiente">{siguiente(e)}<Icono nombre="adelante" tamano={14} /></span></span>
              </Link>
            ))}
          </div>

          <h2><span className="sobretitulo"><span className="tres-lineas" aria-hidden="true" />Todas mis escrituras</span></h2>
          <TablaExpedientes filas={filas} conResponsable={false} />
        </>
      )}
    </>
  );
}
