import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { plantillasLlenadas } from '../src/lib/escritura/ejemplo-plantilla';
import { vistaPreviaDocx, textoDeParrafos } from '../src/lib/escritura/vista-previa';
const textoDePlantilla = (b: Buffer) => textoDeParrafos(vistaPreviaDocx(b));
import { NOTARIA_POR_DEFECTO } from '../src/lib/escritura/contexto';

const cargar = (tipoId: string) => {
  const archivo = fs.readFileSync(`plantillas/docx/${tipoId}.docx`);
  return { tipoId, archivo, texto: textoDePlantilla(archivo) };
};

describe('plantilla llenada por el sistema para la IA', () => {
  it('llena las etiquetas con el caso de ejemplo y deja la redacción de la notaría', () => {
    const r = plantillasLlenadas([cargar('compraventa'), cargar('cierre')], ['compraventa'], NOTARIA_POR_DEFECTO, null);
    expect(r.map((x) => x.tipoId)).toEqual(['compraventa', 'cierre']);
    expect(r.every((x) => x.origen === 'EJEMPLO')).toBe(true);
    const cuerpo = r[0].texto;
    expect(cuerpo).not.toMatch(/\{\{/);
    expect(cuerpo).toContain('haber recibido en su totalidad');
  });

  it('no devuelve nada para modelos sin etiquetas', () => {
    expect(plantillasLlenadas([{ tipoId: 'compraventa', archivo: Buffer.alloc(0), texto: 'PRIMERO: Que el vendedor transfiere…' }], ['compraventa'], NOTARIA_POR_DEFECTO, null)).toEqual([]);
  });
});
