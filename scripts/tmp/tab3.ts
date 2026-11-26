import { readFileSync } from 'node:fs';
const d = process.argv[2];
const ver = (x: string) => { const tabs = x.match(/<w:tabs>[\s\S]*?<\/w:tabs>/)?.[0]?.match(/<w:tab [^>]*>/g)?.map((t) => t.replace(/w:/g, '').replace(/<tab |\/>/g, '')).join(';') ?? ''; return `{${tabs}} ` + x.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, '').replace(/<w:tab\/>/g, '⇥').replace(/<w:br\/>/g, '↵').replace(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g, '$1').replace(/<[^>]+>/g, ''); };
for (const n of ['pla', 'gen']) {
  const ps = readFileSync(`${d}/${n}.xml`, 'utf8').match(/<w:p[ >][\s\S]*?<\/w:p>/g)!;
  console.log(`\n===== ${n}`);
  for (const k of ['MATRICULA INMOBILIARIA:', 'CEDULA CATASTRAL PAZ', 'NOMBRE O DIRECCION', 'CUARTO:', 'ESCRITURA PÚBLICA NÚMERO']) {
    const p = ps.find((x) => ver(x).includes(k)); if (p) console.log('·', ver(p).slice(0, 300).replace(/-{6,}/g, (g) => `-×${g.length}`));
  }
  console.log('párrafos con leader', ps.filter((p) => /leader/.test(p)).length, ' con br', ps.filter((p) => /<w:br\/>/.test(p)).length);
}
