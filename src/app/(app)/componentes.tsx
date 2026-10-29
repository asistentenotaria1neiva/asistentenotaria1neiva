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

/**
 * Contenedor de tabla: en escritorio se desplaza a lo ancho si no cabe; con apilable (por defecto),
 * en móvil cada fila se muestra como una tarjeta y cada celda con su data-etiqueta.
 */
export function Tabla({ children, apilable = true, className = '' }: { children: React.ReactNode; apilable?: boolean; className?: string }) {
  return <div className="tabla"><table className={`${apilable ? 'tabla-apilable' : ''} ${className}`.trim() || undefined}>{children}</table></div>;
}

/** Lo que hay que incluir en la consulta de expedientes para mostrar sus otorgantes */
export const INCLUIR_OTORGANTES = {
  comparecientes: { select: { nombre: true, numeroDocumento: true, rol: true } },
  // Nombres leídos por la IA que aún no se confirman (la persona puede estar sin nombre en el formulario)
  datosExtraidos: { where: { campo: { startsWith: 'persona:', endsWith: '.nombre' }, estado: { not: 'DESCARTADO' } }, select: { campo: true, valor: true } },
};

type ConOtorgantes = { comparecientes?: { nombre: string; numeroDocumento: string; rol: string }[]; datosExtraidos?: { campo: string; valor: unknown }[] };

/** Nombres de los otorgantes conocidos: los del formulario y, si falta el nombre, el leído de los documentos */
export function otorgantesDe(e: ConOtorgantes): string[] {
  const dig = (x: unknown) => String(x ?? '').replace(/\D/g, '');
  const leidos = new Map<string, string>();
  for (const d of e.datosExtraidos ?? []) {
    const doc = dig(d.campo.split(':')[1]?.split('.')[0]);
    if (typeof d.valor === 'string' && d.valor.trim() && !leidos.has(doc)) leidos.set(doc, d.valor.trim().toUpperCase());
  }
  // Primero los que ya tienen papel en algún acto
  const comparecientes = [...(e.comparecientes ?? [])].sort((a, b) => Number(a.rol === 'SIN_ROL') - Number(b.rol === 'SIN_ROL'));
  const vistos = new Set<string>();
  const nombres: string[] = [];
  for (const c of comparecientes) {
    const doc = dig(c.numeroDocumento);
    vistos.add(doc);
    const nombre = c.nombre.trim() || leidos.get(doc);
    nombres.push(nombre || `Doc. ${c.numeroDocumento}`);
  }
  for (const [doc, nombre] of leidos) if (!vistos.has(doc)) nombres.push(nombre);
  return [...new Set(nombres)];
}

export function TablaExpedientes({ filas }: { filas: ({ id: string; numeroInterno: string; estado: string; actualizadoEn: Date; tipo: { nombre: string }; responsable: { nombreCompleto: string }; actos: unknown; _count?: { observaciones: number } } & ConOtorgantes)[] }) {
  if (!filas.length) return <p className="suave vacio">No hay expedientes.</p>;
  return (
    <Tabla>
      <thead><tr><th>Número</th><th>Otorgantes</th><th>Actos</th><th>Estado</th><th>Responsable</th><th className="numero">Obs. abiertas</th><th>Actualizado</th></tr></thead>
      <tbody>
        {filas.map((e) => {
          const otorgantes = otorgantesDe(e);
          return (
          <tr key={e.id}>
            <td className="principal-celda"><Link href={`/expedientes/${e.id}`}><strong>{e.numeroInterno}</strong></Link></td>
            <td data-etiqueta="Otorgantes">{otorgantes.length ? <>{otorgantes.slice(0, 4).join(', ')}{otorgantes.length > 4 && <span className="suave"> y {otorgantes.length - 4} más</span>}</> : <span className="suave">—</span>}</td>
            <td data-etiqueta="Actos">{Array.isArray(e.actos) ? (e.actos as string[]).map((a) => a.replace(/_/g, ' ')).join(' + ') : e.tipo.nombre}</td>
            <td data-etiqueta="Estado"><EtiquetaEstado estado={e.estado} /></td>
            <td data-etiqueta="Responsable">{e.responsable.nombreCompleto}</td>
            <td data-etiqueta="Obs. abiertas" className="numero">{e._count?.observaciones ? <span className="etiqueta advertencia">{e._count.observaciones}</span> : e._count ? '0' : '—'}</td>
            <td data-etiqueta="Actualizado" className="suave">{fecha(e.actualizadoEn)}</td>
          </tr>
          );
        })}
      </tbody>
    </Tabla>
  );
}
