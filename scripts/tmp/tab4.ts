import { readFileSync, writeFileSync } from 'node:fs';
import PizZip from 'pizzip';
import { formatoPagina } from '../../src/lib/escritura/docx';
const d = process.argv[2];
const out = formatoPagina(readFileSync(`${d}/gen.docx`));
writeFileSync(`${d}/198-sin-tabulacion.docx`, out);
const x = new PizZip(out).file('word/document.xml')!.asText();
console.log('leader', (x.match(/w:leader="hyphen"/g) ?? []).length, 'tabs en párrafos con guiones al final', (x.match(/-{3,}<\/w:t><\/w:r><w:r>(?:<w:rPr>.*?<\/w:rPr>)?<w:tab\/>/g) ?? []).length);
