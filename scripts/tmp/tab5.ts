import { db } from '../../src/lib/db';
import { readFileSync, writeFileSync } from 'node:fs';
import PizZip from 'pizzip';
import { aplicarCambios, formatoPagina } from '../../src/lib/escritura/docx';
(async () => {
  const g = await db.generacion.findFirst({ where: { expediente: { numeroInterno: 'EXP-2026-00198' } }, orderBy: { version: 'desc' }, select: { progreso: true } });
  const cambios = (g!.progreso as any)?.cambios;
  console.log('cambios guardados', Array.isArray(cambios) ? cambios.length : 'no hay');
  if (!Array.isArray(cambios)) return db.$disconnect();
  const r = aplicarCambios(readFileSync(`${process.argv[2]}/pla.docx`), cambios);
  const out = formatoPagina(r.docx);
  writeFileSync(`${process.argv[2]}/198-corregida.docx`, out);
  const x = new PizZip(out).file('word/document.xml')!.asText();
  console.log('tabulaciones de relleno', (x.match(/w:leader="hyphen"/g) ?? []).length, '| saltos manuales', (x.match(/<w:br\/>/g) ?? []).length, '| párrafos', (x.match(/<w:p[ >]/g) ?? []).length, '| no aplicados', r.noAplicados.length);
  await db.$disconnect();
})();
