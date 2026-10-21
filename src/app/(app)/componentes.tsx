/** Componentes de presentación compartidos (servidor) */
import Link from 'next/link';

export const ESTADOS: Record<string, { texto: string; clase: string }> = {
  BORRADOR: { texto: 'Borrador', clase: '' },
  EN_REVISION: { texto: 'En revisión', clase: 'informativa' },
  DEVUELTO: { texto: 'Devuelto', clase: 'advertencia' },
  APROBADA: { texto: 'Lista para firma', clase: 'ok' },
  FIRMADA: { texto: 'Firmada', clase: 'ok' },
  ARCHIVADA: { texto: 'Archivada', clase: '' },
};

export function EtiquetaEstado({ estado }: { estado: string }) {
  const e = ESTADOS[estado] ?? { texto: estado, clase: '' };
  return <span className={`etiqueta ${e.clase}`}>{e.texto}</span>;
}

export function EtiquetaNivel({ nivel }: { nivel: string }) {
  const clase = nivel === 'CRITICA' ? 'critica' : nivel === 'ADVERTENCIA' ? 'advertencia' : 'informativa';
  const texto = nivel === 'CRITICA' ? 'Crítica' : nivel === 'ADVERTENCIA' ? 'Advertencia' : 'Informativa';
  return <span className={`etiqueta ${clase}`}>{texto}</span>;
}

export function EtiquetaConfianza({ confianza }: { confianza: string }) {
  return <span className={`etiqueta ${confianza.toLowerCase()}`}>Confianza {confianza.toLowerCase()}</span>;
}

export function fecha(d: Date | null | undefined, conHora = true): string {
  if (!d) return '—';
  return d.toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', ...(conHora ? { timeStyle: 'short' } : {}) });
}

export function TablaExpedientes({ filas }: { filas: { id: string; numeroInterno: string; estado: string; actualizadoEn: Date; tipo: { nombre: string }; responsable: { nombreCompleto: string }; actos: unknown; _count?: { observaciones: number } }[] }) {
  if (!filas.length) return <p className="suave">No hay expedientes.</p>;
  return (
    <table>
      <thead><tr><th>Número</th><th>Actos</th><th>Estado</th><th>Responsable</th><th>Observaciones abiertas</th><th>Actualizado</th></tr></thead>
      <tbody>
        {filas.map((e) => (
          <tr key={e.id}>
            <td><Link href={`/expedientes/${e.id}`}>{e.numeroInterno}</Link></td>
            <td>{Array.isArray(e.actos) ? (e.actos as string[]).map((a) => a.replace(/_/g, ' ')).join(' + ') : e.tipo.nombre}</td>
            <td><EtiquetaEstado estado={e.estado} /></td>
            <td>{e.responsable.nombreCompleto}</td>
            <td>{e._count?.observaciones ?? '—'}</td>
            <td>{fecha(e.actualizadoEn)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
