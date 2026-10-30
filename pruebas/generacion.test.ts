import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { prepararContexto } from '@/lib/escritura/contexto';
import { generarBorrador, MARCA_FALTANTE } from '@/lib/escritura/generar';
import { ErrorDatos } from '@/lib/escritura/personas';
import type { DatosExpediente } from '@/lib/escritura/tipos';

const raiz = path.resolve(__dirname, '..');
const casos = JSON.parse(fs.readFileSync(path.join(raiz, 'datos_prueba', 'casos.json'), 'utf8')).casos as
  { clave: string; actos: string[]; datos: DatosExpediente }[];
const cargar = async (id: string) => fs.readFileSync(path.join(raiz, 'plantillas', 'docx', `${id}.docx`));
const salida = path.join(raiz, 'pruebas', 'salida');
fs.mkdirSync(salida, { recursive: true });

async function generar(clave: string) {
  const caso = casos.find((c) => c.clave === clave)!;
  const r = await generarBorrador(prepararContexto(caso.datos, caso.actos), cargar);
  fs.writeFileSync(path.join(salida, `${clave}.docx`), r.docx);
  fs.writeFileSync(path.join(salida, `${clave}.txt`), r.texto);
  return r;
}

describe('generación de borradores sobre las plantillas', () => {
  it.each(casos.map((c) => c.clave))('%s se genera sin variables faltantes', async (clave) => {
    const r = await generar(clave);
    expect(r.faltantes).toEqual([]);
    expect(r.texto).not.toContain(MARCA_FALTANTE);
    expect(r.texto).not.toMatch(/\{\{|\}\}/);
    expect(r.docx.subarray(0, 2).toString()).toBe('PK'); // .docx válido (zip)
  });

  it('compraventa simple reproduce la redacción de F52', async () => {
    const { texto } = await generar('compraventa_simple');
    expect(texto).toContain('Compareció quien dijo ser, ANA LUCIA PRUEBA ROJAS, mayor de edad, domiciliada en la ciudad de Neiva (H), identificada con cédula de ciudadanía número 1.075.000.111 expedida en Neiva, estado civil SOLTERA, SIN UNION MARITAL DE HECHO, actividad económica INDEPENDIENTE, y manifestó:');
    expect(texto).toContain('PRIMERO: Que por este instrumento público transfiere en venta a quien dijo ser, MARTA ELENA FICTICIA GOMEZ');
    expect(texto).toContain('con área de NOVENTA Y SIETE PUNTO CINCUENTA METROS CUADRADOS (97.50 M2), junto con la casa de habitación que allí existe con área de construcción de CINCUENTA METROS CUADRADOS (50.00 M2)');
    expect(texto).toContain('SEGUNDO. TRADICIÓN: Que el inmueble fue adquirido por la vendedora siendo de estado civil SOLTERA, SIN UNION MARITAL DE HECHO, por compra hecha a PEDRO PABLO EJEMPLO SALAS, mediante escritura pública número 234 del 07 de FEBRERO de 2024, otorgada en la Notaria Primera de Neiva');
    expect(texto).toContain('CIEN MILLONES DE PESOS M/CTE ($100.000.000), suma que la vendedora manifiesta haber recibido en su totalidad a entera satisfacción de manos de la compradora.');
    expect(texto).toContain('PARAGRAFO: Las otorgantes de manera libre y espontanea declaramos');
    expect(texto).toContain('SEPTIMO: La vendedora manifiesta que el inmueble que enajena no se encuentra afectado a vivienda familiar.');
    expect(texto).toContain('b. La compradora manifestó ser de estado civil SOLTERA, SIN UNION MARITAL DE HECHO, razón por la cual no procede la AFECTACIÓN A VIVIENDA FAMILIAR');
    expect(texto).toContain('Certificados de paz y salvos por concepto de predial unificado y valorización del predio inscrito en el catastro vigente bajo el número 0199000009990001000000000');
    expect(texto).toContain('con vigencia hasta el 31 de Diciembre de 2026');
    expect(texto).toContain('LAS OTORGANTES,');
    expect(texto).toContain('EL NOTARIO,');
    // Sin fecha: no se imprime el párrafo de "En la ciudad de Neiva…" (como las minutas de la notaría)
    expect(texto).not.toContain('En la ciudad de Neiva');
  });

  it('lote sin construcción: no procede la afectación aunque el comprador sea casado y compre solo', async () => {
    const caso = structuredClone(casos.find((c) => c.clave === 'compraventa_simple')!);
    const comprador = caso.datos.personas.find((p) => (caso.datos.actos.compraventa.compradores as string[]).includes(p.id))!;
    comprador.estado_civil = 'CASADO(A), CON SOCIEDAD CONYUGAL VIGENTE';
    caso.datos.actos.compraventa.afectacion = 'NO_PROCEDE_LOTE';
    const { texto } = await generarBorrador(prepararContexto(caso.datos, caso.actos), cargar);
    expect(texto).toContain('b. No procede la AFECTACIÓN A VIVIENDA FAMILIAR de que trata la Ley 258 de 1996, reformada por la Ley 854 de 2003, por tratarse de un lote de terreno sin construcción.');
    expect(texto).not.toContain('razón por la cual no procede');
  });

  it('gravamen que subsiste: va en un PARAGRAFO aparte, no dentro de la cláusula de libertad', async () => {
    const caso = structuredClone(casos.find((c) => c.clave === 'compraventa_simple')!);
    caso.datos.actos.compraventa.excepcion_gravamen = 'No obstante, el(la)(los) otorgante(s) dejan constancia que tienen conocimiento que en la anotación número 001 del citado folio de matrícula inmobiliaria, se encuentra inscrita Servidumbre de acueducto pasiva en mayor extensión e insisten al Notario autorizar el presente instrumento público.';
    const { texto } = await generarBorrador(prepararContexto(caso.datos, caso.actos), cargar);
    expect(texto).toContain('libre de todo gravamen, pero que en todo caso se obliga a salir al saneamiento de lo vendido conforme a la Ley.');
    expect(texto).toContain('PARAGRAFO: No obstante, el(la)(los) otorgante(s) dejan constancia que tienen conocimiento que en la anotación número 001 del citado folio de matrícula inmobiliaria, se encuentra inscrita Servidumbre de acueducto pasiva en mayor extensión e insisten al Notario autorizar el presente instrumento público.');
    expect(texto).not.toContain('público.,');
    expect(texto).not.toContain('con excepción de');
  });

  it('compraventa con fecha, notaria encargada y coadyuvante', async () => {
    const { texto } = await generar('compraventa_encargada');
    expect(texto).toContain('ESCRITURA PÚBLICA NÚMERO: DOS MIL NOVECIENTOS CUARENTA (2.940)');
    expect(texto).not.toContain('PRIMER ACTO'); // con un solo acto no se numeran
    expect(texto).toContain('cuya Notaria Encargada es la señora LAURA PATRICIA ENSAYO VARGAS');
    expect(texto).toContain('a los QUINCE (15) DÍAS del mes de OCTUBRE del año DOS MIL VEINTISEIS (2026)');
    expect(texto).toContain('JOSE ANTONIO PRUEBA LUNA, mayor de edad, domiciliado en la ciudad de Neiva (H), identificado con');
    expect(texto).toContain('quien coadyuva la presente escritura');
    expect(texto).toContain('NO QUEDA AFECTADO A VIVIENDA FAMILIAR, por voluntad expresa y conjunta de los compañeros permanentes');
    expect(texto).toContain('LA NOTARIA E,');
  });

  it('informa todos los datos faltantes a la vez', () => {
    const caso = casos.find((c) => c.clave === 'compraventa_simple')!;
    const datos: DatosExpediente = JSON.parse(JSON.stringify(caso.datos));
    delete datos.actos.compraventa.precio;
    delete datos.actos.compraventa.afectacion;
    try {
      prepararContexto(datos, ['compraventa']);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ErrorDatos);
      expect((e as ErrorDatos).faltantes.join(' ')).toContain('precio');
    }
  });
});
