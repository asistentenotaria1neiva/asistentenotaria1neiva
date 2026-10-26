import Link from 'next/link';
import { after } from 'next/server';
import { requerirSesion } from '@/lib/sesion';
import { listarNotificaciones, marcarLeidas } from '@/lib/servicios/notificaciones';
import { fecha } from '../componentes';

export default async function Notificaciones() {
  const s = await requerirSesion();
  const lista = await listarNotificaciones(s.usuario.id);
  // Se marcan leídas después de mostrarlas: en esta visita aún se ven resaltadas las nuevas
  if (lista.some((n) => !n.leidaEn)) after(() => marcarLeidas(s.usuario.id, lista.filter((n) => !n.leidaEn).map((n) => n.id)));
  return (
    <>
      <h1>Notificaciones</h1>
      <p className="suave">Avisos de los análisis de la IA y del estado de sus escrituras. Para recibirlos también como aviso del navegador, pulse «Avisarme en este equipo» en el menú.</p>
      {!lista.length ? <section className="tarjeta suave vacio">No tiene notificaciones.</section> : (
        <ul className="lista-notificaciones">
          {lista.map((n) => (
            <li key={n.id} className={`tarjeta${n.leidaEn ? '' : ' nueva'}`}>
              <div className="fila entre">
                <strong>{n.enlace ? <Link href={n.enlace}>{n.titulo}</Link> : n.titulo}</strong>
                <span className="suave">{!n.leidaEn && <span className="etiqueta informativa">nueva</span>} {fecha(n.creadaEn)}</span>
              </div>
              <p style={{ margin: '0.35rem 0 0' }}>{n.mensaje}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
