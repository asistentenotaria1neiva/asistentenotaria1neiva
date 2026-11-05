import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import PizZip from 'pizzip';
import { actoDesdePlantilla } from '@/lib/escritura/actos-plantilla';
import { ACTOS } from '@/lib/escritura/actos';
import { ESQUEMAS } from '@/lib/escritura/esquemas';
import { prepararContexto } from '@/lib/escritura/contexto';
import { generarBorrador } from '@/lib/escritura/generar';
import { datosVacios } from '@/lib/escritura/tipos';
import { ErrorDatos } from '@/lib/escritura/personas';
import { datosFaltantes } from '@/lib/escritura/rutas';
import { validarCampos } from '@/lib/escritura/validar-formulario';

const raiz = path.resolve(__dirname, '..');
const carpeta = path.join(raiz, 'plantillas', 'por_aprobar', 'docx');
const plantillas = fs.readdirSync(carpeta).filter((f) => f.endsWith('.docx')).map((f) => f.replace(/\.docx$/, ''));

describe('plantillas por aprobar (carpeta Ejemplos 2026)', () => {
  it('están las cinco', () => {
    expect(plantillas.sort()).toEqual(['cancelacion_afectacion', 'cancelacion_patrimonio', 'compraventa_hipoteca', 'declaracion_construccion', 'divorcio_civil']);
  });

  for (const id of plantillas) {
    for (const condiciones of [true, false]) {
      it(`${id}: se genera completa con las condiciones en ${condiciones ? 'Sí' : 'No'}`, async () => {
        const archivo = fs.readFileSync(path.join(carpeta, `${id}.docx`));
        const tipo = { id: `${id}_prueba`, nombre: id, categoria: 'A. Actos sobre inmuebles' };
        const { esquema, acto } = actoDesdePlantilla(tipo, archivo, { id: 'p', version: 1 });
        const campos = esquema.pasos[0].campos;
        ESQUEMAS[tipo.id] = esquema;
        ACTOS[tipo.id] = acto;
        try {
          const datos = datosVacios();
          datos.escritura.numero = 1234;
          const valores: Record<string, unknown> = {};
          for (const c of campos) valores[c.id] = c.tipo === 'booleano' ? condiciones : `«${c.id}»`;
          datos.actos[tipo.id] = valores;
          expect(datosFaltantes(datos, [tipo.id])).toEqual([]);
          const g = await generarBorrador(prepararContexto(datos, [tipo.id]), async () => archivo);
          expect(g.faltantes).toEqual([]);
          expect(g.texto).not.toMatch(/\{\{|\}\}|\[\[|\]\]/);
          expect(g.texto).toContain('ESCRITURA PÚBLICA NÚMERO: MIL DOSCIENTOS TREINTA Y CUATRO (1.234)');
          // Las variables de los bloques que no se imprimen no se exigen
          const ocultas = campos.filter((c) => c.tipo !== 'booleano' && !g.texto.includes(`«${c.id}»`));
          datos.actos[tipo.id] = { ...valores, ...Object.fromEntries(ocultas.map((c) => [c.id, ''])) };
          expect(() => prepararContexto(datos, [tipo.id])).not.toThrow();
          expect(Object.keys(validarCampos(campos, datos.actos[tipo.id] as Record<string, unknown>))).toEqual([]);
        } finally {
          delete ESQUEMAS[tipo.id];
          delete ACTOS[tipo.id];
        }
      });
    }
  }

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

describe('campos condicionales de una plantilla', () => {
  const r = (t: string) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
  const docx = (...ps: string[]) => {
    const zip = new PizZip(fs.readFileSync(path.join(raiz, 'plantillas', 'docx', 'cierre.docx')));
    zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${ps.map(r).join('')}<w:sectPr/></w:body></w:document>`);
    return zip.generate({ type: 'nodebuffer' }) as Buffer;
  };
  const plantilla = docx(
    'Comparece {{nombre}}.',
    '{{#hay_hijos}}Hijos: {{descripcion_hijos}}.{{/hay_hijos}}{{^hay_hijos}}Sin hijos.{{/hay_hijos}}',
    '{{#por_escritura}}Escritura del {{fecha_matrimonio}}.{{/por_escritura}}{{^por_escritura}}El día {{fecha_matrimonio}}.{{/por_escritura}}',
  );
  const tipo = { id: 'condicional_prueba', nombre: 'Prueba', categoria: 'B. Familia' };
  const { esquema, acto } = actoDesdePlantilla(tipo, plantilla, { id: 'p', version: 1 });
  const campo = (id: string) => esquema.pasos[0].campos.find((c) => c.id === id)!;

  it('la variable de un bloque solo se muestra y se exige con él', () => {
    expect(campo('nombre').visibleSi).toBeUndefined();
    expect(campo('descripcion_hijos').visibleSi).toEqual({ campo: 'hay_hijos', valores: [true, 'true'] });
    // Está en los dos bloques de una misma condición: siempre visible
    expect(campo('fecha_matrimonio').visibleSi).toBeUndefined();
    expect(() => acto.preparar({ nombre: 'ANA', hay_hijos: false, por_escritura: true, fecha_matrimonio: '1 de enero' }, {} as never)).not.toThrow();
    expect(() => acto.preparar({ nombre: 'ANA', hay_hijos: true, por_escritura: true, fecha_matrimonio: '1 de enero' }, {} as never)).toThrow(ErrorDatos);
    expect(() => acto.preparar({ nombre: 'ANA', hay_hijos: false, por_escritura: false }, {} as never)).toThrow(ErrorDatos);
  });
});
