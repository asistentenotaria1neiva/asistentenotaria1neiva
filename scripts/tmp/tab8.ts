import { readFileSync } from 'node:fs';
import PizZip from 'pizzip';
const x = new PizZip(readFileSync(process.argv[2])).file('word/document.xml')!.asText();
const pila: string[] = []; let error = '';
for (const m of x.matchAll(/<(\/?)([\w:]+)[^>]*?(\/?)>/g)) {
  if (m[0].startsWith('<?')) continue;
  if (m[3]) continue;
  if (!m[1]) pila.push(m[2]); else if (pila.pop() !== m[2]) { error = `cierre inesperado ${m[2]} en ${m.index}`; break; }
}
console.log(error || (pila.length ? `sin cerrar: ${pila.join(',')}` : 'XML bien formado'));
const ps = x.match(/<w:p[ >][\s\S]*?<\/w:p>/g)!;
const t = (p: string) => p.replace(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g, '$1').replace(/<[^>]+>/g, '').replace(/-{6,}/g, ' ---');
const i = ps.findIndex((p) => t(p).startsWith('CEDULA CATASTRAL PAZ'));
console.log(ps.slice(i, i + 2).map(t).join('\n'));
