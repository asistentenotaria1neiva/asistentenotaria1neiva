import { leerCifrado } from '../../src/lib/almacenamiento';
import { textoDocx } from '../../src/lib/escritura/docx';
import { writeFileSync } from 'node:fs';
(async () => {
  const b = await leerCifrado('documentos/78/78288a98-0470-4b7c-8abb-1ed8c9338135.bin');
  const t = textoDocx(b);
  writeFileSync(process.argv[2], t);
  console.log('bytes', b.length, 'chars', t.length);
  for (const k of ['405', '482', 'TORRE 3', 'TORRE TRES']) { const i = t.indexOf(k); console.log(k, i, [...t.matchAll(new RegExp(k, 'g'))].length); }
})();
