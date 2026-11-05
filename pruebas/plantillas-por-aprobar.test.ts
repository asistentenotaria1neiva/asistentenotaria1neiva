import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import PizZip from 'pizzip';
import { vistaPreviaDocx, textoDeParrafos } from '@/lib/escritura/vista-previa';

const raiz = path.resolve(__dirname, '..');
const carpeta = path.join(raiz, 'plantillas', 'por_aprobar', 'docx');
const plantillas = fs.readdirSync(carpeta).filter((f) => f.endsWith('.docx')).map((f) => f.replace(/\.docx$/, ''));

describe('plantillas por aprobar (carpeta Ejemplos 2026)', () => {
  it('están las cinco', () => {
    expect(plantillas.sort()).toEqual(['cancelacion_afectacion', 'cancelacion_patrimonio', 'compraventa_hipoteca', 'declaracion_construccion', 'divorcio_civil']);
  });

  it.each(plantillas)('%s: es un .docx válido y su texto sirve de modelo de redacción', (id) => {
    const archivo = fs.readFileSync(path.join(carpeta, `${id}.docx`));
    expect(new PizZip(archivo).file('word/document.xml')).toBeTruthy();
    expect(textoDeParrafos(vistaPreviaDocx(archivo)).split(/\s+/).length).toBeGreaterThan(200);
  });

  it('no quedó ningún dato de un caso: cédulas, matrículas, cédulas catastrales ni valores', () => {
    // El NIT del BANCO DE BOGOTA S.A. es público y hace parte de su minuta
    const DATOS = /\b\d{1,3}(?:\.\d{3}){2,}\b(?<!860\.002\.964)|\b\d{3}-\d{4,}\b|\b\d{20,}\b|\$\s?\d{1,3}(?:\.\d{3})+/;
    for (const id of plantillas) {
      for (const texto of [
        new PizZip(fs.readFileSync(path.join(carpeta, `${id}.docx`))).file('word/document.xml')!.asText().replace(/<[^>]+>/g, ' '),
        fs.readFileSync(path.join(raiz, 'plantillas', 'por_aprobar', 'fuentes', `${id}.plantilla`), 'utf8'),
      ]) expect(texto.match(DATOS)?.[0] ?? null, id).toBeNull();
    }
  });
});
