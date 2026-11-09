/**
 * Consumo de la API de Claude (tabla consumo_ia): tokens y costo por digitador, por escritura,
 * por revisión de escritura ya hecha, por tarea y por modelo. El costo es el calculado con el precio de cada llamada; el costo real
 * facturado por Anthropic está en Estadísticas (src/lib/ia/consumo.ts).
 */
import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from '../db';

export interface Totales {
  llamadas: number;
  tokensEntrada: number;
  tokensSalida: number;
  tokensCache: number;
  costoUSD: number;
}

type Suma = { _count: number; _sum: { tokensEntrada: number | null; tokensSalida: number | null; tokensCacheLectura: number | null; tokensCacheEscritura: number | null; costoUSD: number | null } };
const SUMA = { _count: true, _sum: { tokensEntrada: true, tokensSalida: true, tokensCacheLectura: true, tokensCacheEscritura: true, costoUSD: true } } as const;

function totales(g: Suma): Totales {
  return {
    llamadas: g._count,
    tokensEntrada: g._sum.tokensEntrada ?? 0,
    tokensSalida: g._sum.tokensSalida ?? 0,
    tokensCache: (g._sum.tokensCacheLectura ?? 0) + (g._sum.tokensCacheEscritura ?? 0),
    costoUSD: g._sum.costoUSD ?? 0,
  };
}

export async function consumoIA(filtro: { desde?: Date; hasta?: Date; usuarioId?: string; proposito?: string }) {
  const where: Prisma.ConsumoIAWhereInput = {
    ...(filtro.desde || filtro.hasta ? { creadoEn: { ...(filtro.desde ? { gte: filtro.desde } : {}), ...(filtro.hasta ? { lt: filtro.hasta } : {}) } } : {}),
    ...(filtro.usuarioId ? { usuarioId: filtro.usuarioId } : {}),
    ...(filtro.proposito ? { proposito: filtro.proposito } : {}),
  };
  const [total, porUsuario, porUsuarioExpediente, porExpediente, porProposito, porModelo, plantillas, historicos, porRevision] = await Promise.all([
    db.consumoIA.aggregate({ where, ...SUMA }),
    db.consumoIA.groupBy({ by: ['usuarioId'], where, ...SUMA, _max: { creadoEn: true } }),
    db.consumoIA.groupBy({ by: ['usuarioId', 'expedienteId'], where: { ...where, expedienteId: { not: null } }, _count: true }),
    db.consumoIA.groupBy({ by: ['expedienteId'], where: { ...where, expedienteId: { not: null } }, ...SUMA, _max: { creadoEn: true } }),
    db.consumoIA.groupBy({ by: ['proposito'], where, ...SUMA }),
    db.consumoIA.groupBy({ by: ['modelo'], where, ...SUMA }),
    db.consumoIA.aggregate({ where: { ...where, plantillaId: { not: null } }, ...SUMA }),
    db.consumoIA.count({ where: { ...where, historico: true } }),
    db.consumoIA.groupBy({ by: ['revisionId'], where: { ...where, revisionId: { not: null } }, ...SUMA, _min: { creadoEn: true }, _max: { creadoEn: true } }),
  ]);

  const idsUsuarios = porUsuario.map((u) => u.usuarioId).filter((x): x is string => !!x);
  const idsExpedientes = porExpediente.map((e) => e.expedienteId).filter((x): x is string => !!x);
  const [usuarios, expedientes, revisionesBD] = await Promise.all([
    db.usuario.findMany({ where: { id: { in: idsUsuarios } }, select: { id: true, nombreCompleto: true, rol: true } }),
    db.expediente.findMany({
      where: { id: { in: idsExpedientes } },
      select: { id: true, numeroInterno: true, numeroEscritura: true, estado: true, actos: true, tipo: { select: { nombre: true } }, responsable: { select: { nombreCompleto: true } } },
    }),
    db.revisionEscritura.findMany({
      where: { id: { in: porRevision.map((g) => g.revisionId!).filter(Boolean) } },
      select: { id: true, nombreArchivo: true, estado: true, paginas: true, resultado: true, cargadaPor: { select: { nombreCompleto: true } } },
    }),
  ]);
  const revision = new Map(revisionesBD.map((r) => [r.id, r]));
  const nombre = new Map(usuarios.map((u) => [u.id, u]));
  const expediente = new Map(expedientes.map((e) => [e.id, e]));

  const digitadores = porUsuario
    .map((u) => {
      const t = totales(u);
      const escrituras = porUsuarioExpediente.filter((x) => x.usuarioId === u.usuarioId).length;
      return { usuarioId: u.usuarioId, nombre: u.usuarioId ? nombre.get(u.usuarioId)?.nombreCompleto ?? 'Usuario eliminado' : 'Sin usuario', rol: u.usuarioId ? nombre.get(u.usuarioId)?.rol ?? null : null, escrituras, promedioUSD: escrituras ? t.costoUSD / escrituras : null, ultima: u._max.creadoEn, ...t };
    })
    .sort((a, b) => b.costoUSD - a.costoUSD);

  const escrituras = porExpediente
    .map((g) => {
      const e = expediente.get(g.expedienteId!);
      return {
        expedienteId: g.expedienteId!,
        existe: !!e,
        numeroInterno: e?.numeroInterno ?? 'Expediente eliminado',
        numeroEscritura: e?.numeroEscritura ?? null,
        estado: e?.estado ?? null,
        actos: Array.isArray(e?.actos) ? (e.actos as string[]).map((a) => a.replace(/_/g, ' ')).join(' + ') : e?.tipo.nombre ?? '—',
        responsable: e?.responsable.nombreCompleto ?? '—',
        ultima: g._max.creadoEn,
        ...totales(g),
      };
    })
    .sort((a, b) => b.costoUSD - a.costoUSD);

  // Revisiones de escrituras ya hechas: lo que costó cada una (todas sus llamadas, también si se revisó de nuevo)
  const revisiones = porRevision
    .map((g) => {
      const r = revision.get(g.revisionId!);
      const res = r?.resultado as { tipoEscritura?: string; cambios?: unknown[] } | null | undefined;
      return {
        revisionId: g.revisionId!,
        existe: !!r,
        nombre: r?.nombreArchivo ?? 'Revisión eliminada',
        tipo: res?.tipoEscritura ?? null,
        estado: r?.estado ?? null,
        paginas: r?.paginas ?? null,
        cambios: Array.isArray(res?.cambios) ? res.cambios.length : null,
        cargadaPor: r?.cargadaPor.nombreCompleto ?? '—',
        inicio: g._min.creadoEn,
        ultima: g._max.creadoEn,
        ...totales(g),
      };
    })
    .sort((a, b) => b.costoUSD - a.costoUSD);

  return {
    total: totales(total),
    revisiones,
    promedioPorRevisionUSD: revisiones.length ? revisiones.reduce((s, r) => s + r.costoUSD, 0) / revisiones.length : null,
    digitadores,
    escrituras,
    promedioPorEscrituraUSD: escrituras.length ? escrituras.reduce((s, e) => s + e.costoUSD, 0) / escrituras.length : null,
    porProposito: porProposito.map((g) => ({ proposito: g.proposito, ...totales(g) })).sort((a, b) => b.costoUSD - a.costoUSD),
    porModelo: porModelo.map((g) => ({ modelo: g.modelo, ...totales(g) })).sort((a, b) => b.costoUSD - a.costoUSD),
    plantillas: totales(plantillas),
    historicos,
  };
}

/** Lo que lleva gastado una revisión de escritura (todas sus llamadas) */
export async function consumoDeRevision(revisionId: string): Promise<Totales> {
  return totales(await db.consumoIA.aggregate({ where: { revisionId }, ...SUMA }));
}
