import { db } from '../../src/lib/db';
async function principal() {
  const exps = await db.expediente.findMany({ select: { id: true, numeroInterno: true, creadoEn: true, eliminadoEn: true, documentos: { select: { tamano: true } }, generaciones: { select: { estado: true, creadaEn: true } } } });
  const filas = exps.map((e) => ({ n: e.numeroInterno, creado: e.creadoEn.toISOString().slice(0, 10), elim: !!e.eliminadoEn, docs: e.documentos.length, mb: e.documentos.reduce((a, d) => a + Number(d.tamano), 0) / 1048576, lista: e.generaciones.some((g) => g.estado === 'COMPLETADA') }));
  filas.sort((a, b) => a.creado.localeCompare(b.creado));
  const tot = (f: typeof filas) => f.reduce((a, x) => a + x.mb, 0).toFixed(0);
  console.log('Escrituras:', filas.length, 'MB docs:', tot(filas));
  for (const f of filas) console.log(f.creado, f.n.padEnd(14), String(f.docs).padStart(3), f.mb.toFixed(1).padStart(7), 'MB', f.lista ? 'con versión' : 'SIN versión', f.elim ? 'ELIMINADA' : '');
  for (const dias of [7, 14, 21, 30]) { const lim = new Date(Date.now() - dias * 864e5).toISOString().slice(0, 10); const v = filas.filter((f) => f.creado < lim && f.lista); console.log(`>${dias} días y con versión: ${v.length} escrituras, ${tot(v)} MB`); }
}
principal().then(() => db.$disconnect(), async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
