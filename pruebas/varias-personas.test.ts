import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import PizZip from 'pizzip';
import { actoDesdePlantilla, papelDe } from '@/lib/escritura/actos-plantilla';
import { ACTOS } from '@/lib/escritura/actos';
import { ESQUEMAS } from '@/lib/escritura/esquemas';
import { prepararContexto } from '@/lib/escritura/contexto';
import { generarBorrador } from '@/lib/escritura/generar';
import { datosVacios } from '@/lib/escritura/tipos';
import { datosFaltantes } from '@/lib/escritura/rutas';

const raiz = path.resolve(__dirname, '..');
const r = (t: string) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`;
function docxCon(...parrafos: string[]): Buffer {
  const zip = new PizZip(fs.readFileSync(path.join(raiz, 'plantillas', 'docx', 'cierre.docx')));
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${parrafos.map((p) => `<w:p>${p.split('|').map(r).join('')}</w:p>`).join('')}<w:sectPr/></w:body></w:document>`);
  return zip.generate({ type: 'nodebuffer' }) as Buffer;
}

// Plantilla hecha con un caso de UN usufructuario (las variables partidas en varios runs, como las deja Word)
const PLANTILLA = docxCon(
  'Compareció {{nombre_vendedor}}, con cédula {{cedula_vendedor}}, quien vende la nuda propiedad y constituye usufructo a favor de {{nombre_|usufructuario}}, identificado con la cédula número {{cedula_usufructuario}} expedida en {{expedicion_usufructuario}}, de estado civil {{estado_civil_usufructuario}}. El inmueble tiene matrícula {{matricula}}.',
  'EL USUFRUCTUARIO {{nombre_usufructuario}} acepta.',
  '',
  '______________________',
  '{{nombre_usufructuario}}',
  'C.C. {{cedula_usufructuario}} de {{expedicion_usufructuario}}',
);
const tipo = { id: 'compraventa_usufructo_prueba', nombre: 'Compraventa con constitución de usufructo', categoria: 'A. Actos sobre inmuebles' };

describe('varias personas con el mismo papel en una plantilla hecha para una', () => {
  const { esquema, acto } = actoDesdePlantilla(tipo, PLANTILLA, { id: 'p1', version: 1 });
  const campos = esquema.pasos[0].campos;

  it('reconoce el papel de cada variable', () => {
    expect(papelDe('nombre_usufructuario')).toEqual({ papel: 'usufructuario', atributo: 'nombre' });
    expect(papelDe('estado_civil_nudo_propietario')).toEqual({ papel: 'nudo_propietario', atributo: 'estado_civil' });
    expect(papelDe('matricula')).toBeNull();
    expect(campos.some((c) => c.id === 'cantidad_usufructuario')).toBe(true);
    expect(campos.some((c) => c.id === 'cantidad_vendedor')).toBe(true);
    expect(campos.some((c) => c.id === 'estado_civil_usufructuario__2')).toBe(true);
  });

  it('pide los datos de la segunda persona solo si son dos, y genera la escritura con las dos', async () => {
    ESQUEMAS[tipo.id] = esquema;
    ACTOS[tipo.id] = acto;
    try {
      const datos = datosVacios();
      datos.escritura.numero = 10;
      const una = { nombre_vendedor: 'PEDRO VENDE', cedula_vendedor: '12.345.678', nombre_usufructuario: 'ANA PRIMERA', cedula_usufructuario: '1.075.000.111', expedicion_usufructuario: 'Neiva', estado_civil_usufructuario: 'soltera', matricula: '200-1' };
      datos.actos[tipo.id] = { ...una };
      expect(datosFaltantes(datos, [tipo.id]).some((f) => f.ruta.includes('__2'))).toBe(false);

      datos.actos[tipo.id] = { ...una, cantidad_usufructuario: 2 };
      expect(datosFaltantes(datos, [tipo.id]).map((f) => f.ruta)).toContain(`acto:${tipo.id}.nombre_usufructuario__2`);
      expect(datosFaltantes(datos, [tipo.id]).some((f) => f.ruta.includes('__3'))).toBe(false);

      datos.actos[tipo.id] = { ...una, cantidad_usufructuario: 2, nombre_usufructuario__2: 'LUIS SEGUNDO', cedula_usufructuario__2: '7.700.222', expedicion_usufructuario__2: 'Pitalito', estado_civil_usufructuario__2: 'casado' };
      const g = await generarBorrador(prepararContexto(datos, [tipo.id]), async () => PLANTILLA);
      expect(g.faltantes).toEqual([]);
      // Dentro del párrafo: el tramo de cada persona, separado por «y»; lo demás no se repite
      expect(g.texto).toContain('a favor de ANA PRIMERA, identificado con la cédula número 1.075.000.111 expedida en Neiva, de estado civil soltera y LUIS SEGUNDO, identificado con la cédula número 7.700.222 expedida en Pitalito, de estado civil casado. El inmueble tiene matrícula 200-1.');
      expect(g.texto.match(/Compareció PEDRO VENDE/g)).toHaveLength(1);
      expect(g.texto).toContain('EL USUFRUCTUARIO ANA PRIMERA y LUIS SEGUNDO acepta.');
      // El bloque de firma se repite completo
      expect(g.texto).toMatch(/_+\nANA PRIMERA\nC\.C\. 1\.075\.000\.111 de Neiva[\s\S]*_+\nLUIS SEGUNDO\nC\.C\. 7\.700\.222 de Pitalito/);
    } finally {
      delete ESQUEMAS[tipo.id];
      delete ACTOS[tipo.id];
    }
  });
});
