import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { obtenerExpediente, puedeEditar, datosDe, actosDe } from '@/lib/servicios/expedientes';
import { pasosExpediente } from '@/lib/escritura/esquemas';
import { accionGuardarPaso, accionAplicarSugerencia, accionDescartarSugerencia } from '../../acciones';
import FormularioPasos, { type SugerenciaVista } from './FormularioPasos';

export default async function Formulario({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ paso?: string }> }) {
  const { id } = await params;
  const { paso } = await searchParams;
  const s = await requerirSesion();
  const e = await obtenerExpediente(s, id);
  const pendientes = await db.datoExtraido.findMany({ where: { expedienteId: id, estado: 'PENDIENTE' }, include: { documento: { select: { nombreOriginal: true } } }, orderBy: { creadoEn: 'asc' } });
  const sugerencias: SugerenciaVista[] = pendientes.map((d) => ({
    id: d.id, campo: d.campo, valor: d.valor, pagina: d.pagina, fragmento: d.fragmento, confianza: d.confianza, revisionManual: d.revisionManual, documento: d.documento?.nombreOriginal ?? 'documento',
  }));
  const revisar = sugerencias.filter((x) => x.revisionManual).length;
  // Cambia solo cuando se aplica o descarta una sugerencia (trae datos nuevos del servidor); guardar no reinicia el formulario
  const versionSugerencias = await db.datoExtraido.count({ where: { expedienteId: id, estado: { not: 'PENDIENTE' } } });
  return (
    <>
      {sugerencias.length > 0 && (
        <div className={`aviso ${revisar ? 'alerta' : 'info'}`}>
          La IA dejó {sugerencias.length} sugerencia(s) pendiente(s){revisar ? `, ${revisar} con confianza baja o formato dudoso que requieren revisión manual` : ''}. Ninguna se aplica sola: revise la fuente y decida.
        </div>
      )}
      <FormularioPasos key={`sug-${versionSugerencias}`} pasoInicial={Math.max(0, Number(paso) || 0)} expedienteId={id} pasos={pasosExpediente(actosDe(e))} datosIniciales={datosDe(e)}
        sugerencias={sugerencias} editable={puedeEditar(s, e)} guardar={accionGuardarPaso} aplicar={accionAplicarSugerencia} descartar={accionDescartarSugerencia} />
    </>
  );
}
