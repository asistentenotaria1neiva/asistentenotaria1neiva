import { db } from '../../src/lib/db';
(async () => {
  const e = await db.expediente.findFirst({ where: { numeroInterno: { endsWith: '00198' } } });
  const docs = await db.documento.findMany({ where: { expedienteId: e!.id }, select: { id: true, nombreOriginal: true, mime: true, rutaCifrada: true, creadoEn: true, estadoLectura: true } });
  console.log(docs);
  const aud = await db.auditoria.findMany({ where: { OR: [{ entidadId: e!.id }, { detalle: { path: ['expedienteId'], equals: e!.id } }] }, orderBy: { creadoEn: 'asc' }, select: { accion: true, creadoEn: true, detalle: true, entidadId: true } }).catch((x) => { console.log(String(x)); return []; });
  for (const a of aud) console.log(a.creadoEn.toISOString(), a.accion, JSON.stringify(a.detalle).slice(0, 300));
  const gens = await db.generacion.findMany({ where: { expedienteId: e!.id }, select: { version: true, estado: true, creadaEn: true, error: true } });
  console.log(gens);
  await db.$disconnect();
})();
