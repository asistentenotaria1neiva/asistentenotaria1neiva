/**
 * Costo real facturado por Anthropic (Usage and Cost Admin API, /v1/organizations/cost_report).
 * Requiere una clave de administrador (ANTHROPIC_ADMIN_KEY, sk-ant-admin...) o una clave de API
 * que no esté asignada a un workspace. Anthropic no publica el saldo de créditos por API:
 * el saldo restante se calcula con el saldo registrado en el panel del administrador menos lo
 * gastado desde ese momento (costo real o, sin clave de administrador, el calculado por la aplicación).
 */
import 'server-only';
import { db } from '../db';

const URL_COSTOS = 'https://api.anthropic.com/v1/organizations/cost_report';

export type CostoReal = { ok: true; usd: number } | { ok: false; error: string };

function claveAdmin(): string | undefined {
  return process.env.ANTHROPIC_ADMIN_KEY?.trim() || process.env.ANTHROPIC_API_KEY?.trim() || undefined;
}

/** Suma el costo (USD) de los días UTC en [desde, hasta). Los datos llegan con unos minutos de retraso. */
export async function costoRealUSD(desde: Date, hasta: Date): Promise<CostoReal> {
  const clave = claveAdmin();
  if (!clave) return { ok: false, error: 'No hay clave configurada (ANTHROPIC_ADMIN_KEY).' };
  if (hasta <= desde) return { ok: true, usd: 0 };
  // La API solo devuelve días completos (UTC) que terminan antes de ending_at: se redondea hacia arriba para incluir el día en curso
  const fin = new Date(Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), hasta.getUTCDate()));
  if (fin < hasta) fin.setUTCDate(fin.getUTCDate() + 1);
  hasta = fin;
  let centavos = 0;
  let pagina: string | null = null;
  try {
    do {
      const q = new URLSearchParams({ starting_at: desde.toISOString(), ending_at: hasta.toISOString(), bucket_width: '1d', limit: '31' });
      if (pagina) q.set('page', pagina);
      const r = await fetch(`${URL_COSTOS}?${q}`, {
        headers: { 'x-api-key': clave, 'anthropic-version': '2023-06-01' },
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      });
      if (r.status === 401 || r.status === 403) return { ok: false, error: 'La clave no tiene permiso para consultar costos: configure ANTHROPIC_ADMIN_KEY con una clave de administrador.' };
      if (!r.ok) return { ok: false, error: `Anthropic respondió ${r.status} al consultar los costos.` };
      const cuerpo = (await r.json()) as { data: { results: { amount: string }[] }[]; has_more: boolean; next_page: string | null };
      for (const b of cuerpo.data) for (const x of b.results) centavos += Number(x.amount) || 0;
      pagina = cuerpo.has_more ? cuerpo.next_page : null;
    } while (pagina);
  } catch {
    return { ok: false, error: 'No se pudo conectar con Anthropic para consultar los costos.' };
  }
  return { ok: true, usd: Math.round(centavos) / 100 };
}

/** Momento del registro del saldo: fecha y hora ISO, o solo AAAA-MM-DD (medianoche de Colombia) */
export function instanteRegistro(fecha: string): Date | null {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? new Date(`${fecha}T05:00:00Z`) : new Date(fecha);
  return isNaN(d.getTime()) ? null : d;
}

/** Costo calculado por la aplicación (tabla consumo_ia) en [desde, hasta) */
async function costoEstimadoUSD(desde: Date, hasta: Date): Promise<number> {
  if (hasta <= desde) return 0;
  const r = await db.consumoIA.aggregate({ where: { creadoEn: { gte: desde, lt: hasta } }, _sum: { costoUSD: true } });
  return r._sum.costoUSD ?? 0;
}

export type Creditos =
  | { ok: true; saldoUSD: number; gastadoUSD: number; registradoUSD: number; registradoEn: Date; fuente: 'real' | 'estimado'; aviso?: string; diarioUSD: number; diasRestantes: number | null }
  | { ok: false; error: string };

/**
 * Saldo restante = saldo registrado − lo gastado desde ese momento.
 * Con clave de administrador se usa el costo real de Anthropic (días completos UTC; el resto del día del registro
 * se toma del costo calculado). Sin ella, el costo calculado por la aplicación con la tarifa de cada modelo.
 */
export async function creditosRestantes(registro: { saldoUSD: number; fecha: string }): Promise<Creditos> {
  const inicio = registro.fecha ? instanteRegistro(registro.fecha) : null;
  if (!registro.saldoUSD || !inicio) return { ok: false, error: 'Aún no se ha registrado el saldo de créditos.' };
  const ahora = new Date();
  const finDia = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), inicio.getUTCDate() + 1));
  const hace7 = new Date(ahora.getTime() - 7 * 86_400_000);
  const [parcial, real, semana] = await Promise.all([
    costoEstimadoUSD(inicio, finDia < ahora ? finDia : ahora),
    finDia < ahora ? costoRealUSD(finDia, ahora) : Promise.resolve<CostoReal>({ ok: true, usd: 0 }),
    costoEstimadoUSD(hace7, ahora),
  ]);
  let gastado: number;
  let fuente: 'real' | 'estimado';
  let aviso: string | undefined;
  if (real.ok) {
    gastado = parcial + real.usd;
    fuente = 'real';
  } else {
    gastado = await costoEstimadoUSD(inicio, ahora);
    fuente = 'estimado';
    aviso = real.error;
  }
  const saldo = Math.round((registro.saldoUSD - gastado) * 100) / 100;
  // Ritmo de gasto: promedio diario de los últimos 7 días
  const diario = semana / 7;
  return {
    ok: true, saldoUSD: saldo, gastadoUSD: Math.round(gastado * 100) / 100, registradoUSD: registro.saldoUSD, registradoEn: inicio,
    fuente, aviso, diarioUSD: diario, diasRestantes: diario > 0 ? Math.max(0, saldo) / diario : null,
  };
}
