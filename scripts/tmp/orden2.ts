import { db } from '../../src/lib/db';
const comparar = new Intl.Collator('es', { numeric: true, sensitivity: 'base' }).compare;
const numeroInicial = (n: string) => { const m = /^\s*(\d+)/.exec(n); return m ? Number(m[1]) : Number.POSITIVE_INFINITY; };
const sin = (n: string) => n.replace(/^\s*\d+\s*[-–.]?\s*/, '').trim();
const cmp = (a: string, b: string) => { const x = numeroInicial(a), y = numeroInicial(b); return x !== y ? (x < y ? -1 : 1) : comparar(sin(a), sin(b)) || comparar(a, b); };
(async () => {
  const t = (await db.plantilla.findMany({ where: { activa: true, categoria: 'COMPRAVENTA' }, select: { nombre: true } })).map((x) => x.nombre).sort(cmp);
  console.log(t.slice(0, 4).join('\n'), '\n…\n' + t.slice(8, 12).join('\n'), '\n…\n' + t.slice(-3).join('\n'));
  await db.$disconnect();
})();
