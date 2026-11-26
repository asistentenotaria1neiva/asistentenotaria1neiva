import { db } from '../../src/lib/db';
(async () => {
  const g = await db.generacion.findFirst({ where: { expediente: { numeroInterno: 'EXP-2026-00198' } }, orderBy: { version: 'desc' }, select: { progreso: true } });
  for (const c of (g!.progreso as any).cambios) {
    const s = JSON.stringify(c);
    if (/NOMBRE O DIRECCION|DECLARACIONES JURAMENTADAS|DECIMA CUARTA/.test(s)) console.log(c.p, c.accion, JSON.stringify({ texto: c.texto?.slice(0, 150), reemplazos: c.reemplazos?.map((r: any) => ({ o: r.original.slice(0, 80), n: r.nuevo.slice(0, 150) })), ins: c.insertar_despues?.map((t: string) => t.slice(0, 80)) }));
  }
  await db.$disconnect();
})();
