import Link from 'next/link';
import { after } from 'next/server';
import { requerirSesion } from '@/lib/sesion';
import { listarNotificaciones, marcarLeidas } from '@/lib/servicios/notificaciones';
import { Vacio, fecha, hace } from '../componentes';
import { Icono } from '../../Icono';

export const metadata = { title: 'Notificaciones' };

export default async function Notificaciones() {
  const s = await requerirSesion();
  const lista = await listarNotificaciones(s.usuario.id);
  // Se marcan leídas después de mostrarlas: en esta visita aún se ven resaltadas las nuevas
  if (lista.some((n) => !n.leidaEn)) after(() => marcarLeidas(s.usuario.id, lista.filter((n) => !n.leidaEn).map((n) => n.id)));
  const nuevas = lista.filter((n) => !n.leidaEn).length;
  return (
    <>
      <div className="encabezado">
        <h1>Notificaciones {nuevas > 0 && <span className="etiqueta informativa">{nuevas} nueva{nuevas === 1 ? '' : 's'}</span>}</h1>
        <p className="suave">Avisos de la IA y del estado de sus escrituras. Para recibirlos también como aviso del navegador, pulse «Avisarme en este equipo» en el menú.</p>
      </div>
      {!lista.length ? (
        <section className="tarjeta"><Vacio icono="campana" titulo="No tiene notificaciones"><p>Cuando una escritura termine de generarse, el aviso llegará aquí.</p></Vacio></section>
      ) : (
        <ul className="lista-notificaciones">
          {lista.map((n) => (
            <li key={n.id} className={`tarjeta${n.leidaEn ? '' : ' nueva'}`}>
              <span className="icono-aviso" aria-hidden="true"><Icono nombre="campana" tamano={18} /></span>
              <div>
                <div className="fila entre">
                  <span className="titulo-aviso">{n.enlace ? <Link href={n.enlace}>{n.titulo}</Link> : n.titulo}{!n.leidaEn && <span className="solo-lectores"> (nueva)</span>}</span>
                  <time className="tenue" title={fecha(n.creadaEn)}>{hace(n.creadaEn)}</time>
                </div>
                <p className="mensaje">{n.mensaje}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
