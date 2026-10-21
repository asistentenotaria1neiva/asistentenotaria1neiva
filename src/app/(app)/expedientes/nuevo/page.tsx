import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { ESQUEMAS } from '@/lib/escritura/esquemas';
import { accionCrearExpediente } from '../acciones';
import { FormularioNuevo } from '../formularios';

export default async function NuevoExpediente() {
  await requerirSesion({ roles: ['ADMINISTRADOR', 'REVISOR', 'DIGITADOR'] });
  const aprobadas = await db.plantilla.findMany({ where: { estado: 'APROBADA' }, select: { tipoId: true } });
  const actos = Object.values(ESQUEMAS).map((e) => ({ id: e.tipo, nombre: e.titulo, estadoPlantilla: aprobadas.some((a) => a.tipoId === e.tipo) ? 'APROBADA' : 'PENDIENTE' }));
  const faltantes = await db.tipoEscritura.count({ where: { esBloque: false, plantillas: { none: {} } } });
  return (
    <>
      <h1>Nuevo expediente</h1>
      <div className="aviso info">Hay {actos.length} actos con plantilla convertida. Otros {faltantes} tipos de escritura aún no tienen plantilla: la notaría debe entregarlas (ver Plantillas → checklist).</div>
      <FormularioNuevo accion={accionCrearExpediente} actos={actos} />
    </>
  );
}
