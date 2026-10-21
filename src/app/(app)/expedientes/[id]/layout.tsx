import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requerirSesion } from '@/lib/sesion';
import { obtenerExpediente, ErrorNegocio } from '@/lib/servicios/expedientes';
import { db } from '@/lib/db';
import { EtiquetaEstado } from '../../componentes';

export default async function ExpedienteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requerirSesion();
  let e;
  try { e = await obtenerExpediente(s, id); } catch (err) { if (err instanceof ErrorNegocio) notFound(); throw err; }
  const [docs, abiertas, borradores] = await Promise.all([
    db.documento.count({ where: { expedienteId: id } }),
    db.observacion.count({ where: { expedienteId: id, estado: 'ABIERTA' } }),
    db.borrador.count({ where: { expedienteId: id } }),
  ]);
  const pestanas = [
    { href: '', texto: 'Resumen y flujo' },
    { href: '/documentos', texto: `1–3 · Documentos (${docs})` },
    { href: '/formulario', texto: '4 · Formulario' },
    { href: '/observaciones', texto: `5 · Observaciones (${abiertas} abiertas)` },
    { href: '/borrador', texto: `6 · Borrador (${borradores})` },
  ];
  return (
    <>
      <div className="fila entre">
        <h1>{e.numeroInterno} <EtiquetaEstado estado={e.estado} /></h1>
        <span className="suave">Responsable: {e.responsable.nombreCompleto}{e.revisor ? ` · Revisor: ${e.revisor.nombreCompleto}` : ''}</span>
      </div>
      <p className="suave">{(e.actos as string[]).map((a) => a.replace(/_/g, ' ')).join(' + ')}</p>
      {e.estado === 'DEVUELTO' && e.comentarioRevision && <div className="aviso alerta"><strong>Devuelto por el revisor:</strong> {e.comentarioRevision}</div>}
      <ul className="pasos">{pestanas.map((p) => <li key={p.href}><Link href={`/expedientes/${id}${p.href}`}>{p.texto}</Link></li>)}</ul>
      {children}
    </>
  );
}
