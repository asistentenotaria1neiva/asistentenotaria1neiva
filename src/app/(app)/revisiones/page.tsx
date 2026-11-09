import Link from 'next/link';
import { requerirSesion } from '@/lib/sesion';
import { listarRevisiones, resultadoDe, avanceDe, tiposRevisables } from '@/lib/servicios/revision-escrituras';
import { RefrescoAutomatico } from '../expedientes/formularios';
import { Tabla, fecha } from '../componentes';
import { accionCargarRevision } from './acciones';
import { CargaRevision } from './CargaRevision';

// La carga programa la primera etapa de la revisión
export const maxDuration = 300;

const ESTADO: Record<string, [string, string]> = {
  EN_CURSO: ['informativa', 'Revisando con IA…'], COMPLETADA: ['ok', 'Revisada'], ERROR: ['critica', 'Error'],
};

export default async function Revisiones() {
  const s = await requerirSesion();
  const [revisiones, tipos] = await Promise.all([listarRevisiones(s), tiposRevisables()]);
  const enCurso = revisiones.some((r) => r.estado === 'EN_CURSO');
  const todas = s.usuario.rol !== 'DIGITADOR';
  const sinIA = !process.env.ANTHROPIC_API_KEY;

  return (
    <>
      {enCurso && <RefrescoAutomatico segundos={10} />}
      <h1>Revisar escritura</h1>
      <p className="suave">Para escrituras de sucesión ya redactadas. Cargue un PDF con la escritura y sus documentos soporte: la IA transcribe la escritura, la compara con los soportes y con la plantilla aprobada, y recomienda cambios puntuales sin tocar su estructura. Usted elige cuáles aplicar y se genera la escritura en Word con los cambios marcados (lo agregado en amarillo, lo eliminado tachado en rojo) y la relación de qué se cambió, dónde y por qué.</p>

      <section className="tarjeta">
        <h2 style={{ marginTop: 0 }}>Nueva revisión</h2>
        {sinIA && <div className="aviso alerta">La IA no está configurada en el servidor: no se pueden revisar escrituras.</div>}
        {!tipos.length ? <div className="aviso alerta">No hay plantillas de sucesión aprobadas: cargue y apruebe una en Plantillas.</div>
          : <CargaRevision tipos={tipos} iniciar={accionCargarRevision} deshabilitada={sinIA} />}
      </section>

      <section className="tarjeta">
        <h2 style={{ marginTop: 0 }}>{todas ? 'Revisiones' : 'Mis revisiones'}</h2>
        {!revisiones.length ? <p className="vacio">Aún no hay escrituras revisadas.</p> : (
          <Tabla>
            <thead><tr><th>Escritura</th><th>Estado</th><th>Cambios</th>{todas && <th>Cargada por</th>}<th>Fecha</th></tr></thead>
            <tbody>{revisiones.map((r) => {
              const res = resultadoDe(r);
              const avance = avanceDe(r);
              const [clase, texto] = ESTADO[r.estado] ?? ['', r.estado];
              const criticos = res ? [...res.cambios, ...res.observaciones].filter((x) => x.nivel === 'CRITICA').length : 0;
              return (
                <tr key={r.id}>
                  <td className="principal-celda"><Link href={`/revisiones/${r.id}`}>{r.nombreArchivo}</Link>{res?.tipoEscritura && <div className="suave">{res.tipoEscritura}</div>}</td>
                  <td data-etiqueta="Estado">
                    <span className={`etiqueta ${clase}`}>{r.estado === 'EN_CURSO' && <span className="girador pequeno" aria-hidden="true" />} {texto}{avance ? ` ${avance.porcentaje} %` : ''}</span>
                    {r.aplicadaEn && <> <span className="etiqueta ok">Corregida</span></>}
                  </td>
                  <td data-etiqueta="Cambios">{res ? <>{res.cambios.length}{criticos ? <span className="etiqueta critica" style={{ marginLeft: 6 }}>{criticos} crítico(s)</span> : null}</> : <span className="suave">—</span>}</td>
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
