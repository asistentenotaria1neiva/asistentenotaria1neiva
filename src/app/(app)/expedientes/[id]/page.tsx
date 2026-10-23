import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { obtenerExpediente, puedeEditar, bloqueos } from '@/lib/servicios/expedientes';
import { accionFlujo } from '../acciones';
import { FormularioFlujo } from '../formularios';
import { fecha } from '../../componentes';

export default async function ResumenExpediente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requerirSesion();
  const e = await obtenerExpediente(s, id);
  const [b, ultimoBorrador, historial, usuarios, nDocs, nAnalizados, nRevisiones] = await Promise.all([
    bloqueos(id),
    db.borrador.findFirst({ where: { expedienteId: id }, orderBy: { version: 'desc' } }),
    db.auditoria.findMany({ where: { OR: [{ entidadId: id }, { detalle: { path: ['expedienteId'], equals: id } }] }, orderBy: { id: 'desc' }, take: 20 }),
    s.usuario.rol === 'ADMINISTRADOR' ? db.usuario.findMany({ where: { estado: 'ACTIVO' }, select: { id: true, nombreCompleto: true } }) : Promise.resolve([]),
    db.documento.count({ where: { expedienteId: id } }),
    db.documento.count({ where: { expedienteId: id, estadoAnalisis: 'COMPLETADO' } }),
    db.analisisIA.count({ where: { expedienteId: id, proposito: 'REVISION', estado: 'COMPLETADO' } }),
  ]);
  const accion = accionFlujo.bind(null, id);
  const editable = puedeEditar(s, e);
  const revisor = s.usuario.rol !== 'DIGITADOR';
  const cerrado = ['APROBADA', 'FIRMADA', 'ARCHIVADA'].includes(e.estado);
  const pasos = [
    { t: 'Crear expediente y elegir actos', hecho: true },
    { t: 'Cargar documentos soporte', hecho: nDocs > 0 },
    { t: 'La IA analiza los documentos y prepara las preguntas', hecho: nAnalizados > 0 },
    { t: 'Responder las preguntas del asistente y resolver inconsistencias', hecho: !!ultimoBorrador },
    { t: 'Revisión (reglas + IA) y observaciones resueltas', hecho: nRevisiones > 0 && !b.criticas.length && !b.advertencias.length },
    { t: 'Escritura en Word generada sobre la plantilla aprobada (con espacios para la terminación)', hecho: !!ultimoBorrador },
    { t: 'Aprobación del revisor', hecho: cerrado },
    { t: 'Lista para firma del notario', hecho: cerrado },
  ];
  return (
    <div className="rejilla dos">
      <section className="tarjeta">
        <h2>Flujo de la escritura</h2>
        <ol className="lista-estado">{pasos.map((p, i) => (
          <li key={p.t} className={p.hecho ? 'hecho' : 'pendiente'}>
            <span className="marca-estado" aria-hidden="true">{p.hecho ? '✓' : i + 1}</span>
            <span>{p.t}<span className="solo-lectores"> {p.hecho ? '(hecho)' : '(pendiente)'}</span></span>
          </li>
        ))}</ol>
        {(b.criticas.length > 0 || b.advertencias.length > 0) && (
          <div className="aviso alerta">Observaciones abiertas: {b.criticas.length} crítica(s) y {b.advertencias.length} advertencia(s). Las críticas impiden avanzar.</div>
        )}
        <h3>Acciones</h3>
        {editable && <FormularioFlujo accion={accion} botones={[{ valor: 'enviar', texto: 'Enviar a revisión' }]} />}
        {revisor && e.estado === 'EN_REVISION' && (
          <FormularioFlujo accion={accion} campos={[{ nombre: 'comentario', etiqueta: 'Comentario para el responsable (obligatorio si devuelve)', tipo: 'area' }]}
            botones={[{ valor: 'aprobar', texto: 'Aprobar (lista para firma)', clase: 'exito' }, { valor: 'devolver', texto: 'Devolver con comentarios', clase: 'secundario' }]} />
        )}
        {revisor && e.estado === 'APROBADA' && (
          <FormularioFlujo accion={accion} campos={[{ nombre: 'numeroEscritura', etiqueta: 'Número de escritura asignado', tipo: 'numero' }]} botones={[{ valor: 'firmar', texto: 'Marcar como firmada por el notario' }]} />
        )}
        {s.usuario.rol === 'ADMINISTRADOR' && (
          <details><summary>Acciones del administrador</summary>
            <FormularioFlujo accion={accion} campos={[{ nombre: 'usuarioId', etiqueta: 'Reasignar a', tipo: 'select', opciones: usuarios.map((u) => [u.id, u.nombreCompleto]) }]} botones={[{ valor: 'reasignar', texto: 'Reasignar', clase: 'secundario' }]} />
            <FormularioFlujo accion={accion} campos={[{ nombre: 'motivo', etiqueta: 'Motivo de la reapertura', tipo: 'area' }]} botones={[{ valor: 'reabrir', texto: 'Reabrir', clase: 'secundario' }, { valor: 'archivar', texto: 'Archivar', clase: 'peligro' }]} />
          </details>
        )}
        {!editable && !revisor && <p className="suave">El expediente no se puede editar en su estado actual.</p>}
      </section>
      <section className="tarjeta">
        <h2>Historial</h2>
        {!historial.length && <p className="suave">Sin movimientos registrados.</p>}
        <ul className="historial">{historial.map((h) => (
          <li key={String(h.id)}>
            <span>{h.accion.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())}</span>
            <span className="suave">{h.usuarioNombre}</span>
            <time className="suave">{fecha(h.fecha)}</time>
          </li>
        ))}</ul>
        <p className="suave">Creado: {fecha(e.creadoEn)} · Último cambio: {fecha(e.actualizadoEn)}</p>
      </section>
    </div>
  );
}
