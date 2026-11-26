import { readFileSync } from 'node:fs';
import { compactarUnidades } from '../../src/lib/escritura/unidades';
const ps = readFileSync(process.argv[2], 'utf8').split('\n');
const c = compactarUnidades(ps)!;
const orden = c.parrafos.map((p, i) => ({ i, n: p.length, t: p.slice(0, 110) })).sort((a, b) => b.n - a.n).slice(0, 25);
for (const o of orden) console.log(o.i, o.n, o.t);
const rellenos = c.parrafos.join('\n').match(/(?:\+\s*){3,}/g)?.join('').length; console.log('relleno +', rellenos);
