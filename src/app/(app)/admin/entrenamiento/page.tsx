import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { SISTEMA_EXTRACCION, SISTEMA_REVISION } from '@/lib/ia/instrucciones';
import { configuracionModelo } from '@/lib/ia/cliente';
import { accionInstruccion } from '../acciones';
import { FormAdmin } from '../formularios';
import { Tabla, fecha } from '../../componentes';

export default async function Entrenamiento() {
  await requerirSesion({ roles: ['ADMINISTRADOR'] });
  const hace90 = new Date(Date.now() - 90 * 86_400_000);
  const [patrones, instrucciones, tipos, recientes] = await Promise.all([
    db.correccion.groupBy({ by: ['tipoId', 'categoria', 'campo'], where: { creadoEn: { gt: hace90 } }, _count: true, orderBy: { _count: { campo: 'desc' } }, take: 40 }),
    db.instruccionIA.findMany({ orderBy: [{ proposito: 'asc' }, { tipoId: 'asc' }, { version: 'desc' }] }),
    db.tipoEscritura.findMany({ where: { esBloque: false }, select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
    db.correccion.findMany({ orderBy: { creadoEn: 'desc' }, take: 25 }),
  ]);
  const nombre = (id: string | null) => (id ? tipos.find((t) => t.id === id)?.nombre ?? id : 'Todas las escrituras');
  const ext = configuracionModelo('EXTRACCION');
  const rev = configuracionModelo('REVISION');
  const pla = configuracionModelo('PLANTILLA');
  return (
    <>
      <h1>Entrenamiento de la IA</h1>
      <div className="aviso info">El modelo de Anthropic <strong>no se reentrena</strong>. El ajuste se hace aquí: instrucciones adicionales por tipo de escritura (versionadas y aprobadas), reglas, formularios y plantillas. Modelos en uso: documentos <code>{ext.modelo}</code> (esfuerzo {ext.esfuerzo}), expediente <code>{rev.modelo}</code> (esfuerzo {rev.esfuerzo}), plantillas <code>{pla.modelo}</code> (esfuerzo {pla.esfuerzo}) — configurables por variables de entorno.</div>

      <section className="tarjeta">
        <h2>Patrones de error (últimos 90 días)</h2>
        {!patrones.length ? <p className="suave">Aún no hay casos de aprendizaje.</p> : (
          <Tabla><thead><tr><th>Tipo de escritura</th><th>Categoría</th><th>Campo / regla</th><th className="numero">Casos</th></tr></thead>
            <tbody>{patrones.map((p, i) => (
              <tr key={i}>
                <td className="principal-celda">{nombre(p.tipoId)}</td>
                <td data-etiqueta="Categoría">{p.categoria.toLowerCase()}</td>
                <td data-etiqueta="Campo / regla">{p.campo ?? '—'}</td>
                <td data-etiqueta="Casos" className="numero">{p._count}</td>
              </tr>
            ))}</tbody></Tabla>
        )}
      </section>

      <section className="tarjeta">
        <h2>Casos de aprendizaje recientes (anonimizados)</h2>
        {!recientes.length ? <p className="suave">Aún no hay casos de aprendizaje.</p> : (
          <Tabla><thead><tr><th>Fecha</th><th>Tipo</th><th>Categoría</th><th>Campo</th><th>IA</th><th>Corregido</th><th>Motivo</th></tr></thead>
            <tbody>{recientes.map((c) => (
              <tr key={c.id}>
                <td data-etiqueta="Fecha" className="suave">{fecha(c.creadoEn)}</td>
                <td data-etiqueta="Tipo">{nombre(c.tipoId)}</td>
                <td data-etiqueta="Categoría">{c.categoria.toLowerCase()}</td>
                <td data-etiqueta="Campo">{c.campo}</td>
                <td data-etiqueta="IA"><code>{c.valorIA}</code></td>
                <td data-etiqueta="Corregido"><code>{c.valorCorregido}</code></td>
                <td data-etiqueta="Motivo" className="suave">{c.motivo}</td>
              </tr>
            ))}</tbody></Tabla>
        )}
      </section>

      <section className="tarjeta">
        <h2>Nueva instrucción (queda pendiente de aprobación)</h2>
        <FormAdmin accion={accionInstruccion} ocultos={{ operacion: 'crear' }} campos={[
          { nombre: 'proposito', etiqueta: 'Para', tipo: 'select', opciones: [['EXTRACCION', 'Extracción de datos de documentos'], ['REVISION', 'Revisión y observaciones']] },
          { nombre: 'tipoId', etiqueta: 'Tipo de escritura', tipo: 'select', opciones: [['', 'Todas'], ...tipos.map((t) => [t.id, t.nombre] as [string, string])] },
          { nombre: 'contenido', etiqueta: 'Instrucción', tipo: 'area', ayuda: 'Ej.: "En los certificados de tradición de la ORIP de La Plata la fecha de impresión aparece al pie de la última página."' },
          { nombre: 'motivo', etiqueta: 'Patrón de error que la motiva', tipo: 'area' },
        ]} botones={[{ operacion: 'crear', texto: 'Crear versión' }]} />
      </section>

      <section className="tarjeta">
        <h2>Instrucciones versionadas</h2>
        <details><summary>Instrucciones base (versión fija del código)</summary>
          <h3>Extracción</h3><pre className="vista-previa">{SISTEMA_EXTRACCION}</pre>
          <h3>Revisión</h3><pre className="vista-previa">{SISTEMA_REVISION}</pre>
        </details>
        {!instrucciones.length ? <p className="suave">Aún no hay instrucciones adicionales.</p> : (
          <Tabla><thead><tr><th>Para</th><th>Tipo</th><th>Versión</th><th>Estado</th><th>Contenido</th><th aria-label="Acciones" /></tr></thead>
            <tbody>{instrucciones.map((i) => (
              <tr key={i.id}>
                <td className="principal-celda">{i.proposito === 'EXTRACCION' ? 'Extracción' : 'Revisión'}</td>
                <td data-etiqueta="Tipo">{nombre(i.tipoId)}</td>
                <td data-etiqueta="Versión">v{i.version}</td>
                <td data-etiqueta="Estado"><span className={`etiqueta ${i.estado === 'APROBADA' ? 'ok' : i.estado === 'RETIRADA' ? '' : 'advertencia'}`}>{i.estado.toLowerCase().replace('_', ' ')}</span></td>
                <td data-etiqueta="Contenido" className="suave">{i.contenido.slice(0, 200)}{i.motivo ? ` · Motivo: ${i.motivo.slice(0, 100)}` : ''}</td>
                <td className="acciones">{i.estado !== 'RETIRADA' && <FormAdmin accion={accionInstruccion} ocultos={{ id: i.id }} botones={[...(i.estado !== 'APROBADA' ? [{ operacion: 'aprobar', texto: 'Aprobar', clase: 'exito' }] : []), { operacion: 'retirar', texto: 'Retirar', clase: 'secundario' }]} />}</td>
              </tr>
            ))}</tbody></Tabla>
        )}
      </section>
    </>
  );
}
