import { db } from '../../src/lib/db';
(async () => {
  const e = await db.expediente.findFirst({ where: { numeroInterno: { endsWith: '00198' } }, include: { documentos: { select: { id: true, nombreOriginal: true, mime: true, paginas: true, estadoLectura: true, errorLectura: true, lectura: true } }, generaciones: { select: { version: true, estado: true, resultado: true, observaciones: true }, orderBy: { version: 'desc' }, take: 1 } } });
  if (!e) { console.log('no'); return; }
  console.log(e.numeroInterno, e.plantillaNombre, '\nOBS:', e.observaciones);
  for (const d of e.documentos) console.log('\n=== DOC', d.nombreOriginal, d.mime, d.paginas, d.estadoLectura, d.errorLectura, '\n', JSON.stringify(d.lectura).slice(0, 6000));
  console.log('\n=== GEN', JSON.stringify(e.generaciones[0]).slice(0, 8000));
  await db.$disconnect();
})();
