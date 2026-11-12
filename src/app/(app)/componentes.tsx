/** Componentes de presentación compartidos (servidor) */
import Link from 'next/link';
import { Icono, type NombreIcono } from '../Icono';

export function EtiquetaNivel({ nivel }: { nivel: string }) {
  const clase = nivel === 'CRITICA' ? 'critica' : nivel === 'ADVERTENCIA' ? 'advertencia' : 'informativa';
  const texto = nivel === 'CRITICA' ? 'Crítica' : nivel === 'ADVERTENCIA' ? 'Advertencia' : 'Informativa';
  return <span className={`etiqueta ${clase}`}>{texto}</span>;
}

/** Estado de la última versión generada de una escritura */
export function EtiquetaVersion({ g }: { g?: { version: number; estado: string } | null }) {
  if (!g) return <span className="etiqueta">Sin generar</span>;
  if (g.estado === 'EN_CURSO') return <span className="etiqueta informativa gira">Generando v{g.version}</span>;
  if (g.estado === 'ERROR') return <span className="etiqueta critica">v{g.version} con error</span>;
  return <span className="etiqueta ok">Versión {g.version}</span>;
}

export function fecha(d: Date | null | undefined, conHora = true): string {
  if (!d) return '—';
  return d.toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', ...(conHora ? { timeStyle: 'short' } : {}) });
}

/** «hace 5 min», «hace 3 h», «hace 2 días» (o la fecha, si pasó más de una semana) */
export function hace(d: Date | null | undefined): string {
  if (!d) return '—';
  const min = Math.round((Date.now() - d.getTime()) / 60_000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const dias = Math.round(h / 24);
  return dias <= 7 ? `hace ${dias} día${dias === 1 ? '' : 's'}` : fecha(d, false);
}

/** Estado vacío: un ícono, qué pasa y, si aplica, qué hacer */
export function Vacio({ icono = 'documento', titulo, children }: { icono?: NombreIcono; titulo: string; children?: React.ReactNode }) {
  return (
    <div className="vacio">
      <span className="icono-vacio"><Icono nombre={icono} tamano={24} /></span>
      <strong>{titulo}</strong>
      {children}
    </div>
  );
}

/**
 * Contenedor de tabla: en escritorio se desplaza a lo ancho si no cabe; con apilable (por defecto),
 * en móvil cada fila se muestra como una tarjeta y cada celda con su data-etiqueta.
 * Con fija, la tabla se desplaza dentro de su marco y el encabezado queda a la vista (tablas largas).
 */
export function Tabla({ children, apilable = true, fija = false, className = '', etiqueta }: { children: React.ReactNode; apilable?: boolean; fija?: boolean; className?: string; etiqueta?: string }) {
  return (
    <div className={`tabla${fija ? ' fija' : ''}`} {...(fija ? { tabIndex: 0, role: 'region', 'aria-label': etiqueta ?? 'Tabla' } : {})}>
      <table className={`${apilable ? 'tabla-apilable' : ''} ${className}`.trim() || undefined}>{children}</table>
    </div>
  );
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

export function TablaExpedientes({ filas, conResponsable = true, vacio }: { filas: FilaEscritura[]; conResponsable?: boolean; vacio?: React.ReactNode }) {
  if (!filas.length) return <section className="tarjeta">{vacio ?? <Vacio icono="escrituras" titulo="No hay escrituras" />}</section>;
  return (
    <Tabla>
      <thead><tr><th>Número</th><th>Escritura</th><th>Plantilla</th><th>Estado</th>{conResponsable && <th>Responsable</th>}<th className="numero">Documentos</th><th>Actualizada</th></tr></thead>
      <tbody>
        {filas.map((e) => (
          <tr key={e.id}>
            <td className="principal-celda"><Link href={`/expedientes/${e.id}`} className="radicado">{e.numeroInterno}</Link></td>
            <td data-etiqueta="Escritura">{e.titulo || <span className="tenue">Sin título</span>}</td>
            <td data-etiqueta="Plantilla">{e.plantillaNombre}{e.plantilla && <div className="tenue">{e.plantilla.categoria}</div>}</td>
            <td data-etiqueta="Estado"><EtiquetaVersion g={e.generaciones[0]} /></td>
            {conResponsable && <td data-etiqueta="Responsable">{e.responsable.nombreCompleto}</td>}
            <td data-etiqueta="Documentos" className="numero">{e._count.documentos}</td>
            <td data-etiqueta="Actualizada" className="suave" title={fecha(e.actualizadoEn)}>{hace(e.actualizadoEn)}</td>
          </tr>
        ))}
      </tbody>
    </Tabla>
  );
}
