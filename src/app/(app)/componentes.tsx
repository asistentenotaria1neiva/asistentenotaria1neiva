/** Componentes de presentación compartidos (servidor) */
import Link from 'next/link';

export function EtiquetaNivel({ nivel }: { nivel: string }) {
  const clase = nivel === 'CRITICA' ? 'critica' : nivel === 'ADVERTENCIA' ? 'advertencia' : 'informativa';
  const texto = nivel === 'CRITICA' ? 'Crítica' : nivel === 'ADVERTENCIA' ? 'Advertencia' : 'Informativa';
  return <span className={`etiqueta ${clase}`}>{texto}</span>;
}

/** Estado de la última versión generada de una escritura */
export function EtiquetaVersion({ g }: { g?: { version: number; estado: string } | null }) {
  if (!g) return <span className="etiqueta">Sin generar</span>;
  if (g.estado === 'EN_CURSO') return <span className="etiqueta informativa">Generando v{g.version}</span>;
  if (g.estado === 'ERROR') return <span className="etiqueta critica">v{g.version} con error</span>;
  return <span className="etiqueta ok">Versión {g.version}</span>;
}

export function fecha(d: Date | null | undefined, conHora = true): string {
  if (!d) return '—';
  return d.toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', ...(conHora ? { timeStyle: 'short' } : {}) });
}

/**
 * Contenedor de tabla: en escritorio se desplaza a lo ancho si no cabe; con apilable (por defecto),
 * en móvil cada fila se muestra como una tarjeta y cada celda con su data-etiqueta.
 */
export function Tabla({ children, apilable = true, className = '' }: { children: React.ReactNode; apilable?: boolean; className?: string }) {
  return <div className="tabla"><table className={`${apilable ? 'tabla-apilable' : ''} ${className}`.trim() || undefined}>{children}</table></div>;
}

export interface FilaEscritura {
  id: string;
  numeroInterno: string;
  titulo: string | null;
  plantillaNombre: string;
  actualizadoEn: Date;
  responsable: { nombreCompleto: string };
  plantilla: { categoria: string } | null;
  _count: { documentos: number };
  generaciones: { version: number; estado: string }[];
}

export function TablaExpedientes({ filas, conResponsable = true }: { filas: FilaEscritura[]; conResponsable?: boolean }) {
  if (!filas.length) return <p className="suave vacio">No hay escrituras.</p>;
  return (
    <Tabla>
      <thead><tr><th>Número</th><th>Escritura</th><th>Plantilla</th><th>Estado</th>{conResponsable && <th>Responsable</th>}<th className="numero">Documentos</th><th>Actualizada</th></tr></thead>
      <tbody>
        {filas.map((e) => (
          <tr key={e.id}>
            <td className="principal-celda"><Link href={`/expedientes/${e.id}`} className="radicado">{e.numeroInterno}</Link></td>
            <td data-etiqueta="Escritura">{e.titulo || <span className="suave">Sin título</span>}</td>
            <td data-etiqueta="Plantilla">{e.plantillaNombre}{e.plantilla && <div className="suave">{e.plantilla.categoria}</div>}</td>
            <td data-etiqueta="Estado"><EtiquetaVersion g={e.generaciones[0]} /></td>
            {conResponsable && <td data-etiqueta="Responsable">{e.responsable.nombreCompleto}</td>}
            <td data-etiqueta="Documentos" className="numero">{e._count.documentos}</td>
            <td data-etiqueta="Actualizada" className="suave">{fecha(e.actualizadoEn)}</td>
          </tr>
        ))}
      </tbody>
    </Tabla>
  );
}
