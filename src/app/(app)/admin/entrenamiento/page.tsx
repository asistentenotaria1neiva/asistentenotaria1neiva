import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { SISTEMA_EXTRACCION, SISTEMA_REVISION } from '@/lib/ia/instrucciones';
import { configuracionModelo } from '@/lib/ia/cliente';
import { accionInstruccion } from '../acciones';
import { FormAdmin } from '../formularios';
import { fecha } from '../../componentes';

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
  return (
    <>
      <h1>Entrenamiento de la IA</h1>
      <div className="aviso info">El modelo de Anthropic <strong>no se reentrena</strong>. El ajuste se hace aquí: instrucciones adicionales por tipo de escritura (versionadas y aprobadas), reglas, formularios y plantillas. Modelos en uso: extracción <code>{ext.modelo}</code> (esfuerzo {ext.esfuerzo}), revisión <code>{rev.modelo}</code> (esfuerzo {rev.esfuerzo}) — configurables por variables de entorno.</div>

      <section className="tarjeta">
        <h2 style={{ marginTop: 0 }}>Patrones de error (últimos 90 días)</h2>
        {!patrones.length ? <p className="suave">Aún no hay casos de aprendizaje.</p> : (
          <table><thead><tr><th>Tipo de escritura</th><th>Categoría</th><th>Campo / regla</th><th>Casos</th></tr></thead>
            <tbody>{patrones.map((p, i) => <tr key={i}><td>{nombre(p.tipoId)}</td><td>{p.categoria.toLowerCase()}</td><td>{p.campo ?? '—'}</td><td>{p._count}</td></tr>)}</tbody></table>
        )}
      </section>

      <section className="tarjeta">
        <h2 style={{ marginTop: 0 }}>Casos de aprendizaje recientes (anonimizados)</h2>
        <table><thead><tr><th>Fecha</th><th>Tipo</th><th>Categoría</th><th>Campo</th><th>IA</th><th>Corregido</th><th>Motivo</th></tr></thead>
          <tbody>{recientes.map((c) => <tr key={c.id}><td className="suave">{fecha(c.creadoEn)}</td><td>{nombre(c.tipoId)}</td><td>{c.categoria.toLowerCase()}</td><td>{c.campo}</td><td><code>{c.valorIA}</code></td><td><code>{c.valorCorregido}</code></td><td className="suave">{c.motivo}</td></tr>)}</tbody></table>
      </section>

      <section className="tarjeta">
        <h2 style={{ marginTop: 0 }}>Nueva instrucción (queda pendiente de aprobación)</h2>
        <FormAdmin accion={accionInstruccion} ocultos={{ operacion: 'crear' }} campos={[
          { nombre: 'proposito', etiqueta: 'Para', tipo: 'select', opciones: [['EXTRACCION', 'Extracción de datos de documentos'], ['REVISION', 'Revisión y observaciones']] },
          { nombre: 'tipoId', etiqueta: 'Tipo de escritura', tipo: 'select', opciones: [['', 'Todas'], ...tipos.map((t) => [t.id, t.nombre] as [string, string])] },
          { nombre: 'contenido', etiqueta: 'Instrucción', tipo: 'area', ayuda: 'Ej.: "En los certificados de tradición de la ORIP de La Plata la fecha de impresión aparece al pie de la última página."' },
          { nombre: 'motivo', etiqueta: 'Patrón de error que la motiva', tipo: 'area' },
        ]} botones={[{ operacion: 'crear', texto: 'Crear versión' }]} />
      </section>

      <section className="tarjeta">
        <h2 style={{ marginTop: 0 }}>Instrucciones versionadas</h2>
        <details><summary>Instrucciones base (versión fija del código)</summary>
          <h3>Extracción</h3><pre className="vista-previa">{SISTEMA_EXTRACCION}</pre>
          <h3>Revisión</h3><pre className="vista-previa">{SISTEMA_REVISION}</pre>
        </details>
        <table><thead><tr><th>Para</th><th>Tipo</th><th>Versión</th><th>Estado</th><th>Contenido</th><th></th></tr></thead>
          <tbody>{instrucciones.map((i) => (
            <tr key={i.id}><td>{i.proposito.toLowerCase()}</td><td>{nombre(i.tipoId)}</td><td>v{i.version}</td>
              <td><span className={`etiqueta ${i.estado === 'APROBADA' ? 'ok' : i.estado === 'RETIRADA' ? '' : 'advertencia'}`}>{i.estado.toLowerCase().replace('_', ' ')}</span></td>
              <td className="suave">{i.contenido.slice(0, 200)}{i.motivo ? ` · Motivo: ${i.motivo.slice(0, 100)}` : ''}</td>
              <td>{i.estado !== 'RETIRADA' && <FormAdmin accion={accionInstruccion} ocultos={{ id: i.id }} botones={[...(i.estado !== 'APROBADA' ? [{ operacion: 'aprobar', texto: 'Aprobar', clase: 'exito' }] : []), { operacion: 'retirar', texto: 'Retirar', clase: 'secundario' }]} />}</td></tr>
          ))}</tbody></table>
      </section>
    </>
  );
}
