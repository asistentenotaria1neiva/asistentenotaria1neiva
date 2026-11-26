import { readFileSync } from 'node:fs';
import PizZip from 'pizzip';
const x = new PizZip(readFileSync(process.argv[2])).file('word/document.xml')!.asText();
const ps = x.match(/<w:p[ >][\s\S]*?<\/w:p>/g)!;
ps.forEach((p, i) => { if (p.includes('<w:br/>')) console.log(i, /<w:tbl/.test(x.slice(0, x.indexOf(p))) && x.slice(0, x.indexOf(p)).lastIndexOf('<w:tbl') > x.slice(0, x.indexOf(p)).lastIndexOf('</w:tbl>') ? '(tabla)' : '', p.replace(/<w:br\/>/g, '↵').replace(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g, '$1').replace(/<[^>]+>/g, '').replace(/-{6,}/g, '---').slice(0, 220)); });
