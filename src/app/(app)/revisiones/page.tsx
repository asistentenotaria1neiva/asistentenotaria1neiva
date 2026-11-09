import Link from 'next/link';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { listarRevisiones, resultadoDe } from '@/lib/servicios/revision-escrituras';
import { FormAdmin } from '../admin/formularios';
import { RefrescoAutomatico } from '../expedientes/formularios';
import { Tabla, fecha } from '../componentes';
import { accionCargarRevision } from './acciones';

// La carga programa el análisis de la IA, que puede tardar unos minutos
export const maxDuration = 300;

const ESTADO: Record<string, [string, string]> = {
  EN_CURSO: ['informativa', 'Analizando con IA…'], COMPLETADA: ['ok', 'Analizada'], ERROR: ['critica', 'Error'],
};

export default async function Revisiones() {
  const s = await requerirSesion();
  const [revisiones, tipos] = await Promise.all([
    listarRevisiones(s),
    db.tipoEscritura.findMany({ where: { esBloque: false }, orderBy: { nombre: 'asc' }, select: { id: true, nombre: true } }),
  ]);
  const enCurso = revisiones.some((r) => r.estado === 'EN_CURSO');
  const todas = s.usuario.rol !== 'DIGITADOR';
  const sinIA = !process.env.ANTHROPIC_API_KEY;

  return (
    <>
      {enCurso && <RefrescoAutomatico segundos={8} />}
      <h1>Revisar escritura</h1>
      <p className="suave">Cargue una escritura ya redactada. La IA la revisa (datos que no coinciden, redacción, contenido, normas) y recomienda cambios puntuales de texto, sin tocar su estructura; usted elige cuáles aplicar. Los cambios se hacen en una copia: el original no cambia.</p>

      <section className="tarjeta">
        <h2 style={{ marginTop: 0 }}>Nueva revisión</h2>
        {sinIA && <div className="aviso alerta">La IA no está configurada en el servidor: no se pueden revisar escrituras.</div>}
        <FormAdmin accion={accionCargarRevision} columnas campos={[
          { nombre: 'archivo', etiqueta: 'Escritura (.docx)', tipo: 'archivo', ayuda: 'En Word. Si está en .doc, ábrala en Word y guárdela como .docx.' },
          { nombre: 'tipoId', etiqueta: 'Tipo de escritura (opcional)', tipo: 'select', opciones: [['', 'Que la IA lo deduzca'], ...tipos.map((t) => [t.id, t.nombre] as [string, string])], ayuda: 'Si lo indica, se compara con el modelo aprobado de ese tipo.' },
          { nombre: 'notas', etiqueta: '¿Algo en especial que revisar? (opcional)', tipo: 'area', ayuda: 'P. ej.: «Verificar que el precio en letras coincida» o «Revisar los linderos del lote».' },
        ]} botones={[{ texto: 'Cargar y revisar con IA' }]} mensajePendiente="Cargando la escritura…" />
      </section>

      <section className="tarjeta">
        <h2 style={{ marginTop: 0 }}>{todas ? 'Revisiones' : 'Mis revisiones'}</h2>
        {!revisiones.length ? <p className="vacio">Aún no hay escrituras revisadas.</p> : (
          <Tabla>
            <thead><tr><th>Escritura</th><th>Estado</th><th>Recomendaciones</th>{todas && <th>Cargada por</th>}<th>Fecha</th></tr></thead>
            <tbody>{revisiones.map((r) => {
              const res = resultadoDe(r);
              const [clase, texto] = ESTADO[r.estado] ?? ['', r.estado];
              const criticas = res?.recomendaciones.filter((x) => x.nivel === 'CRITICA').length ?? 0;
              return (
                <tr key={r.id}>
                  <td className="principal-celda"><Link href={`/revisiones/${r.id}`}>{r.nombreArchivo}</Link>{res?.tipoDetectado && <div className="suave">{res.tipoDetectado}</div>}</td>
                  <td data-etiqueta="Estado">
                    <span className={`etiqueta ${clase}`}>{r.estado === 'EN_CURSO' && <span className="girador pequeno" aria-hidden="true" />} {texto}</span>
                    {r.aplicadaEn && <> <span className="etiqueta ok">Corregida</span></>}
                  </td>
                  <td data-etiqueta="Recomendaciones">{res ? <>{res.recomendaciones.length}{criticas ? <span className="etiqueta critica" style={{ marginLeft: 6 }}>{criticas} crítica(s)</span> : null}</> : <span className="suave">—</span>}</td>
                  {todas && <td data-etiqueta="Cargada por" className="suave">{r.cargadaPor.nombreCompleto}</td>}
                  <td data-etiqueta="Fecha" className="suave">{fecha(r.creadaEn)}</td>
                </tr>
              );
            })}</tbody>
          </Tabla>
        )}
      </section>
    </>
  );
}
