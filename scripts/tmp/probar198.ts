import { db } from '../../src/lib/db';
import { leerCifrado } from '../../src/lib/almacenamiento';
import { parrafosDocx } from '../../src/lib/escritura/docx';
import { unidadesDelNegocio, fragmentosDeUnidades, compactarUnidades } from '../../src/lib/escritura/unidades';
(async () => {
  const e = await db.expediente.findFirst({ where: { numeroInterno: 'EXP-2026-00198' }, include: { documentos: true } });
  const pdf = e!.documentos.find((d) => d.mime === 'application/pdf')!;
  const w = e!.documentos.find((d) => d.mime !== 'application/pdf')!;
  const u = unidadesDelNegocio((pdf.lectura as any).documentos, e!.observaciones);
  console.log('UNIDADES', u);
  const ps = parrafosDocx(await leerCifrado(w.rutaCifrada));
  for (const f of fragmentosDeUnidades(ps, u)) console.log('\n--', f.unidad, f.texto.length, f.texto.slice(0, 160), '…', f.texto.slice(-120));
  const c = compactarUnidades(ps)!;
  const total = ps.join('\n').length, queda = c.parrafos.join('\n').length;
  console.log('\nCOMPACTO: total', total, 'queda', queda, 'unidades quitadas', c.quitadas);
  console.log(c.parrafos.filter((p) => p.startsWith('[El sistema')).map((p) => p.slice(0, 250)).join('\n'));
  await db.$disconnect();
})();
