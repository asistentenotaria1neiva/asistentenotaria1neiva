import { db } from '@/lib/db';
import { requerirSesion, datosAuditoria } from '@/lib/sesion';
import { auditar } from '@/lib/auditoria';
import { indicadoresMes } from '@/lib/servicios/aprendizaje';

/** Informe mensual para el notario (página pensada para imprimir o guardar como PDF desde el navegador) */
export default async function InformeMensual({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const s = await requerirSesion({ roles: ['ADMINISTRADOR'] });
  const { mes = '' } = await searchParams;
  const hoy = new Date();
  const [anio, m] = (/^\d{4}-\d{2}$/.test(mes) ? mes : `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`).split('-').map(Number);
  const ind = await indicadoresMes(anio, m);
  const tipos = await db.tipoEscritura.findMany({ select: { id: true, nombre: true } });
  await auditar({ ...datosAuditoria(s), accion: 'INFORME_MENSUAL_GENERADO', detalle: { periodo: ind.periodo } });
  const nombre = (id: string) => tipos.find((t) => t.id === id)?.nombre ?? id;
  return (
    <article className="tarjeta">
      <h1>Informe mensual de entrenamiento y calidad – {ind.periodo}</h1>
      <p className="suave">Notaría Primera del Círculo de Neiva · Asistente de escrituración · Generado el {hoy.toLocaleDateString('es-CO')} por {s.usuario.nombre}. Contiene solo cifras agregadas y casos anonimizados.</p>
      <h2>1. Indicadores</h2>
      <table><tbody>
        <tr><td>Datos extraídos por la IA aceptados sin corrección</td><td><strong>{ind.datosExtraidos.porcentajeSinCorreccion ?? 'sin datos'}{ind.datosExtraidos.porcentajeSinCorreccion !== null && '%'}</strong> ({ind.datosExtraidos.sinCorreccion} de {ind.datosExtraidos.revisados})</td></tr>
        <tr><td>Observaciones acertadas frente a falsas alarmas</td><td><strong>{ind.observaciones.acertadas}</strong> acertadas · <strong>{ind.observaciones.falsasAlarmas}</strong> falsas alarmas ({ind.observaciones.porcentajeAcierto ?? '—'}% de acierto)</td></tr>
        <tr><td>Tiempo promedio por escritura (creación → aprobación)</td><td><strong>{ind.escrituras.horasPromedio ?? '—'} horas</strong> ({ind.escrituras.aprobadas} escrituras)</td></tr>
        <tr><td>Escrituras devueltas por el revisor</td><td><strong>{ind.escrituras.devueltas}</strong></td></tr>
        <tr><td>Consumo de la API de Claude</td><td>{ind.api.llamadas} llamadas · US$ {ind.api.costoUSD.toFixed(2)} estimados</td></tr>
      </tbody></table>
      <h2>2. Patrones de corrección (casos de aprendizaje anonimizados)</h2>
      {!ind.patrones.length ? <p className="suave">Sin correcciones registradas en el periodo.</p> : (
        <table><thead><tr><th>Tipo de escritura</th><th>Categoría</th><th>Campo / regla</th><th>Veces</th></tr></thead>
          <tbody>{ind.patrones.map((p, i) => <tr key={i}><td>{nombre(p.tipo)}</td><td>{p.categoria.toLowerCase()}</td><td>{p.campo ?? '—'}</td><td>{p.veces}</td></tr>)}</tbody></table>
      )}
      <h2>3. Decisiones que requieren al notario</h2>
      <ul>
        <li>Revisar los patrones anteriores y aprobar los ajustes propuestos a instrucciones, reglas, formularios o plantillas (cada cambio queda versionado).</li>
        <li>Validar las referencias normativas pendientes en las fichas de cada tipo de escritura.</li>
        <li>Entregar las plantillas faltantes de prioridad alta (ver Plantillas → checklist).</li>
      </ul>
      <p className="suave">Para guardar este informe: Imprimir → Guardar como PDF.</p>
    </article>
  );
}
