import { readFileSync } from 'node:fs';
const d = process.argv[2];
const ver = (x: string) => x.replace(/<w:tab\/>/g, '⇥').replace(/<w:br\/>/g, '↵').replace(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g, '$1').replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, (p) => { const t = p.match(/<w:tabs>[\s\S]*?<\/w:tabs>/)?.[0]; const ind = p.match(/<w:ind[^>]*\/>/)?.[0]; return `{${t ? t.replace(/<\/?w:tabs>/g, '').replace(/w:/g, '') : ''}${ind ? ' ' + ind.replace(/w:/g, '') : ''}} `; }).replace(/<[^>]+>/g, '');
for (const n of ['pla', 'gen']) {
  const x = readFileSync(`${d}/${n}.xml`, 'utf8');
  const ps = x.match(/<w:p[ >][\s\S]*?<\/w:p>/g)!;
  console.log(`\n===== ${n}`);
  const sel = n === 'pla' ? ps.filter((p) => /⇥/.test(ver(p))).slice(0, 6) : [...ps.filter((p) => /leader/.test(p)).slice(0, 4), ...ps.filter((p) => /<w:br\/>/.test(p)).slice(0, 3)];
  for (const p of sel) console.log('·', ver(p).slice(0, 420));
}
