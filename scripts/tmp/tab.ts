import { db } from '../../src/lib/db';
import { leerCifrado } from '../../src/lib/almacenamiento';
import { writeFileSync } from 'node:fs';
import PizZip from 'pizzip';
(async () => {
  const e = await db.expediente.findFirst({ where: { numeroInterno: 'EXP-2026-00198' }, include: { plantilla: true, generaciones: { orderBy: { version: 'desc' }, take: 1 } } });
  const g = e!.generaciones[0];
  const gen = await leerCifrado(g.rutaDocx!);
  const pla = e!.plantillaRuta ? await leerCifrado(e!.plantillaRuta) : await leerCifrado(e!.plantilla!.rutaCifrada);
  for (const [n, b] of [['gen', gen], ['pla', pla]] as const) {
    writeFileSync(`${process.argv[2]}/${n}.docx`, b);
    const x = new PizZip(b).file('word/document.xml')!.asText();
    writeFileSync(`${process.argv[2]}/${n}.xml`, x);
    console.log(n, 'parrafos', (x.match(/<w:p[ >]/g) ?? []).length, 'leader', (x.match(/w:leader="(\w+)"/g) ?? []).reduce((a: Record<string, number>, k) => ((a[k] = (a[k] ?? 0) + 1), a), {}),
      'tabs en texto', (x.match(/<w:tab\/>/g) ?? []).length, 'br', (x.match(/<w:br\/>/g) ?? []).length, 'guiones escritos', (x.match(/-{3,}/g) ?? []).length);
    console.log('  sectPr', x.match(/<w:pgSz[^>]*\/>|<w:pgMar[^>]*\/>/g));
  }
  await db.$disconnect();
})();
