/**
 * Costo real facturado por Anthropic (Usage and Cost Admin API, /v1/organizations/cost_report).
 * Requiere una clave de administrador (ANTHROPIC_ADMIN_KEY, sk-ant-admin...) o una clave de API
 * que no esté asignada a un workspace. Anthropic no publica el saldo de créditos por API:
 * el saldo restante se calcula con el saldo registrado en Configuración menos el costo real
 * desde esa fecha.
 */
import 'server-only';

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

/** Saldo restante = saldo registrado en la fecha indicada − costo real desde ese día (UTC) hasta ahora */
export async function creditosRestantes(registro: { saldoUSD: number; fecha: string }): Promise<CostoReal & { gastadoUSD?: number }> {
  if (!registro.saldoUSD || !/^\d{4}-\d{2}-\d{2}$/.test(registro.fecha)) return { ok: false, error: 'Registre el saldo de créditos en Configuración (ia.creditos).' };
  const gasto = await costoRealUSD(new Date(`${registro.fecha}T00:00:00Z`), new Date());
  if (!gasto.ok) return gasto;
  return { ok: true, usd: Math.round((registro.saldoUSD - gasto.usd) * 100) / 100, gastadoUSD: gasto.usd };
}
