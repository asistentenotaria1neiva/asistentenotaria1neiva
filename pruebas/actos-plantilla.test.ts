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
import { resolverRuta, datosFaltantes } from '@/lib/escritura/rutas';

const raiz = path.resolve(__dirname, '..');
const r = (t: string) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`;

/** .docx mínimo con un párrafo por texto */
function docxCon(...parrafos: string[]): Buffer {
  const zip = new PizZip(fs.readFileSync(path.join(raiz, 'plantillas', 'docx', 'cierre.docx')));
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${parrafos.map((p) => `<w:p>${r(p)}</w:p>`).join('')}<w:sectPr/></w:body></w:document>`);
  return zip.generate({ type: 'nodebuffer' }) as Buffer;
}

const PLANTILLA = docxCon(
  'ESCRITURA PÚBLICA NÚMERO {{numero_escritura_letras}}. Ante {{nombre_notario}} compareció {{nombre_propietario}}, con cédula {{documento_propietario}}.',
  'Cancela la afectación constituida por escritura {{numero_escritura_afectacion}} sobre el inmueble con matrícula {{matricula_inmobiliaria}}.',
  '{{#hay_apoderado}}Actúa por medio de apoderado.{{/hay_apoderado}} Firma {{nombre_propietario}}. Derechos: {{derechos_notariales}}.',
);
const tipo = { id: 'cancelacion_afectacion_prueba', nombre: 'Cancelación de afectación (prueba)', categoria: 'A. Actos sobre inmuebles' };

describe('actos por plantilla', () => {
  const { esquema, acto } = actoDesdePlantilla(tipo, PLANTILLA, { id: 'p1', version: 2 });
  const campos = esquema.pasos[0].campos;

  it('un campo por variable, en orden, sin los datos de la notaría ni de la terminación', () => {
    expect(campos.map((c) => c.id)).toEqual(['nombre_propietario', 'documento_propietario', 'numero_escritura_afectacion', 'matricula_inmobiliaria', 'hay_apoderado']);
    expect(campos.find((c) => c.id === 'hay_apoderado')!.tipo).toBe('booleano');
    expect(campos.find((c) => c.id === 'matricula_inmobiliaria')).toMatchObject({ tipo: 'texto', obligatorio: true });
    // La ayuda muestra el fragmento de la escritura donde va el dato
    expect(campos.find((c) => c.id === 'numero_escritura_afectacion')!.ayuda).toContain('Cancela la afectación constituida por escritura {{numero_escritura_afectacion}}');
  });

  it('pide los datos que faltan y genera la escritura completa solo con la plantilla', async () => {
    ESQUEMAS[tipo.id] = esquema;
    ACTOS[tipo.id] = acto;
    try {
      const datos = datosVacios();
      expect(() => prepararContexto(datos, [tipo.id])).toThrow(ErrorDatos);
      expect(datosFaltantes(datos, [tipo.id]).map((f) => f.ruta)).toContain(`acto:${tipo.id}.matricula_inmobiliaria`);
      expect(resolverRuta(datos, [tipo.id], `acto:${tipo.id}.nombre_propietario`)?.campo.id).toBe('nombre_propietario');

      datos.escritura.numero = 1234;
      datos.actos[tipo.id] = { nombre_propietario: 'ANA PRUEBA ROJAS', documento_propietario: '1.075.000.111', numero_escritura_afectacion: '567', matricula_inmobiliaria: '200-12345', hay_apoderado: false };
      const ctx = prepararContexto(datos, [tipo.id]);
      expect(ctx.conCaratula).toBe(false);
      const plantillas: Record<string, Buffer> = { [tipo.id]: PLANTILLA };
      const g = await generarBorrador(ctx, async (id) => { if (!plantillas[id]) throw new Error(`no debía cargar ${id}`); return plantillas[id]; });
      expect(g.faltantes).toEqual([]);
      expect(g.texto).toContain('ESCRITURA PÚBLICA NÚMERO MIL DOSCIENTOS TREINTA Y CUATRO (1.234)');
      expect(g.texto).toContain('compareció ANA PRUEBA ROJAS, con cédula 1.075.000.111');
      expect(g.texto).toContain('matrícula 200-12345');
      expect(g.texto).not.toContain('apoderado');
      expect(g.texto).toContain('Derechos: .'); // queda en blanco para la terminación
    } finally {
      delete ESQUEMAS[tipo.id];
      delete ACTOS[tipo.id];
    }
  });
});
