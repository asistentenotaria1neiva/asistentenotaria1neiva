import { db } from '../../src/lib/db';
const comparar = new Intl.Collator('es', { numeric: true, sensitivity: 'base' }).compare;
const sin = (n: string) => n.replace(/^\s*\d+\s*[-–.]\s*/, '').trim() || n;
(async () => {
  const t = await db.plantilla.findMany({ where: { activa: true, categoria: 'COMPRAVENTA' }, select: { nombre: true } });
  t.sort((a, b) => comparar(sin(a.nombre), sin(b.nombre)) || comparar(a.nombre, b.nombre));
  console.log(t.slice(0, 8).map((x) => x.nombre).join('\n'));
  await db.$disconnect();
})();
