import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requerirSesion } from '@/lib/sesion';
import { obtenerExpediente, ErrorNegocio } from '@/lib/servicios/expedientes';
import { db } from '@/lib/db';
import { EtiquetaEstado } from '../../componentes';
import { PestanasExpediente } from '../../navegacion';

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
    { href: '/documentos', texto: `1 · Documentos (${docs})` },
    { href: '/asistente', texto: '2 · Asistente IA' },
    { href: '/formulario', texto: '3 · Formulario' },
    { href: '/observaciones', texto: `4 · Observaciones (${abiertas} abierta${abiertas === 1 ? '' : 's'})` },
    { href: '/borrador', texto: `5 · Borrador (${borradores})` },
  ];
  return (
    <>
      <p className="suave" style={{ marginBottom: '0.35rem' }}><Link href="/expedientes">← Expedientes</Link></p>
      <div className="encabezado">
        <h1>{e.numeroInterno} <EtiquetaEstado estado={e.estado} /></h1>
        <p className="suave">
          {(e.actos as string[]).map((a) => a.replace(/_/g, ' ')).join(' + ')}
          <br />Responsable: {e.responsable.nombreCompleto}{e.revisor ? ` · Revisor: ${e.revisor.nombreCompleto}` : ''}
        </p>
      </div>
      {e.estado === 'DEVUELTO' && e.comentarioRevision && <div className="aviso alerta"><strong>Devuelto por el revisor:</strong> {e.comentarioRevision}</div>}
      <PestanasExpediente base={`/expedientes/${id}`} pestanas={pestanas} />
      {children}
    </>
  );
}
