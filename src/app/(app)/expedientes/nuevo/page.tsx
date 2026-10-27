import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { ESQUEMAS } from '@/lib/escritura/esquemas';
import { cargarActosDePlantillas } from '@/lib/servicios/actos-plantilla';
import { accionCrearExpediente } from '../acciones';
import { FormularioNuevo } from '../formularios';

export default async function NuevoExpediente() {
  await requerirSesion({ roles: ['ADMINISTRADOR', 'REVISOR', 'DIGITADOR'] });
  // Cada tipo con plantilla aprobada es un acto disponible, con el formulario armado desde su plantilla
  await cargarActosDePlantillas();
  const aprobadas = await db.plantilla.findMany({ where: { estado: 'APROBADA' }, select: { tipoId: true } });
  const actos = Object.values(ESQUEMAS)
    .map((e) => ({ id: e.tipo, nombre: e.titulo, estadoPlantilla: aprobadas.some((a) => a.tipoId === e.tipo) ? 'APROBADA' : 'PENDIENTE' }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  const sinAprobar = await db.tipoEscritura.count({ where: { esBloque: false, activo: true, plantillas: { none: { estado: 'APROBADA' } } } });
  return (
    <>
      <h1>Nuevo expediente</h1>
      <div className="aviso info">
        Elija los actos de la escritura. Hay {actos.length} acto(s) disponibles: los que tienen una plantilla aprobada por el notario. La IA llena los datos con los documentos que cargue y pregunta lo que falte.
        {sinAprobar > 0 && ` Otros ${sinAprobar} tipos de escritura aparecerán aquí cuando su plantilla se apruebe (ver Plantillas).`}
      </div>
      <FormularioNuevo accion={accionCrearExpediente} actos={actos} />
    </>
  );
}
