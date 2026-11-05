import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import PizZip from 'pizzip';
import { prepararContexto } from '@/lib/escritura/contexto';
import { armarEscritura, faltantesEn, parrafoXml, MARCA_FALTANTE } from '@/lib/escritura/generar';
import { vistaPreviaDocx, textoDeParrafos } from '@/lib/escritura/vista-previa';
import { ErrorDatos } from '@/lib/escritura/personas';
import type { DatosExpediente } from '@/lib/escritura/tipos';

const raiz = path.resolve(__dirname, '..');
const casos = JSON.parse(fs.readFileSync(path.join(raiz, 'datos_prueba', 'casos.json'), 'utf8')).casos as
  { clave: string; actos: string[]; datos: DatosExpediente }[];
const base = fs.readFileSync(path.join(raiz, 'plantillas', 'docx', 'caratula.docx'));
const caso = (clave: string) => structuredClone(casos.find((c) => c.clave === clave)!);
/** Los datos calculados que recibe la IA para redactar, como texto */
const calculados = (c: { actos: string[]; datos: DatosExpediente }) => JSON.stringify(prepararContexto(c.datos, c.actos));

describe('datos calculados que recibe la redacción', () => {
  it.each(casos.map((c) => c.clave))('%s: se preparan sin datos faltantes', (clave) => {
    const c = caso(clave);
    const ctx = prepararContexto(c.datos, c.actos);
    expect(ctx.actos.map((a) => a.id)).toEqual(c.actos);
    expect(ctx.global).toHaveProperty('valores_notaria');
  });

  it('compraventa: lleva la carátula, el cierre y los nombres de los comparecientes', () => {
    const c = caso('compraventa_simple');
    const ctx = prepararContexto(c.datos, c.actos);
    expect(ctx.conCaratula).toBe(true);
    expect(calculados(c)).toContain('ANA LUCIA PRUEBA ROJAS');
    expect(calculados(c)).toContain('MARTA ELENA FICTICIA GOMEZ');
  });

  it('notaria encargada: el notario y el número en letras ya vienen calculados', () => {
    const t = calculados(caso('compraventa_encargada'));
    expect(t).toContain('LAURA PATRICIA ENSAYO VARGAS');
    expect(t).toContain('DOS MIL NOVECIENTOS CUARENTA (2.940)');
    expect(t).toContain('LA NOTARIA E,');
  });

  it('comprador casado que compra solo sin su cónyuge: pide el coadyuvante', () => {
    const c = caso('compraventa_simple');
    const comprador = c.datos.personas.find((p) => (c.datos.actos.compraventa.compradores as string[]).includes(p.id))!;
    comprador.estado_civil = 'CASADO(A), CON SOCIEDAD CONYUGAL VIGENTE';
    try {
      prepararContexto(c.datos, c.actos);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ErrorDatos);
      expect((e as ErrorDatos).faltantes.join(' ')).toContain('Ley 258 de 1996');
    }
  });

  it('informa todos los datos faltantes a la vez', () => {
    const c = caso('compraventa_simple');
    delete c.datos.actos.compraventa.precio;
    try {
      prepararContexto(c.datos, ['compraventa']);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ErrorDatos);
      expect((e as ErrorDatos).faltantes.join(' ')).toContain('precio');
    }
  });
});

describe('armado del Word desde el texto redactado por la IA', () => {
  const parrafos = [
    { texto: 'ESCRITURA PÚBLICA NÚMERO:', alineacion: 'JUSTIFICADO' as const },
    { texto: 'CANCELACIÓN DE HIPOTECA', alineacion: 'CENTRADO' as const },
    { texto: 'Compareció ANA LUCIA PRUEBA ROJAS, identificada con cédula de ciudadanía número 1.075.000.111 & otros <datos>, y manifestó:', alineacion: 'JUSTIFICADO' as const },
    { texto: 'PRIMERO: Que cancela la hipoteca constituida por escritura número «FALTA: número de la escritura de hipoteca».', alineacion: 'JUSTIFICADO' as const },
    { texto: '', alineacion: 'JUSTIFICADO' as const },
    { texto: 'Linderos:\nNORTE: con vía pública.\nSUR: con predio vecino.', alineacion: 'JUSTIFICADO' as const },
    { texto: '', alineacion: 'CENTRADO' as const },
    { texto: '______________________________', alineacion: 'CENTRADO' as const },
    { texto: 'ANA LUCIA PRUEBA ROJAS', alineacion: 'CENTRADO' as const },
  ];

  it('genera un .docx válido con el texto, sin renglones en blanco y con los faltantes', () => {
    const r = armarEscritura(base, parrafos);
    expect(r.docx.subarray(0, 2).toString()).toBe('PK');
    const texto = textoDeParrafos(vistaPreviaDocx(r.docx));
    expect(texto).toContain('Compareció ANA LUCIA PRUEBA ROJAS');
    expect(texto).toContain('& otros <datos>'); // caracteres especiales escapados en el XML
    expect(r.faltantes).toEqual(['número de la escritura de hipoteca']);
    expect(r.texto).toContain(MARCA_FALTANTE);
    // El texto del modelo base no queda: el cuerpo es solo lo redactado
    const xml = new PizZip(r.docx).file('word/document.xml')!.asText();
    expect(xml).not.toMatch(/\{\{/);
    // Formato de la notaría: Arial 12, justificado e interlineado 1,5
    expect(xml).toContain('w:ascii="Arial"');
    expect(xml).toContain('<w:jc w:val="both"/>');
    expect(xml).toContain('w:line="360"');
  });

  it('negrilla explícita con **…** y saltos de línea como w:br', () => {
    const xml = parrafoXml({ texto: 'Dice **en negrilla** y\nsigue', alineacion: 'JUSTIFICADO' });
    expect(xml).toContain('<w:b/>');
    expect(xml).toContain('<w:br/>');
    expect(xml).not.toContain('**');
  });

  it('resalta en amarillo lo que falta (en negrilla) y lo que hay que verificar', () => {
    const r = armarEscritura(base, [
      { texto: 'El lindero sur colinda con el lote 33B [VERIFICAR: se lee 33B o 338] y el precio es «FALTA: precio de la venta».', alineacion: 'JUSTIFICADO' },
      { texto: 'Texto sin marcas que no se resalta en ninguna parte del párrafo.', alineacion: 'JUSTIFICADO' },
    ]);
    const xml = new PizZip(r.docx).file('word/document.xml')!.asText();
    const resaltados = [...xml.matchAll(/<w:r>(<w:rPr>[\s\S]*?<\/w:rPr>)<w:t[^>]*>([^<]*)<\/w:t><\/w:r>/g)].filter((m) => m[1].includes('<w:highlight w:val="yellow"/>'));
    // El formato notarial puede partir una marca en varios tramos (negrillas automáticas): todos quedan resaltados
    const texto = resaltados.map((m) => m[2]).join('');
    expect(texto).toBe('[VERIFICAR: se lee 33B o 338]«FALTA: precio de la venta»');
    expect(resaltados.filter((m) => m[2].includes('FALTA')).every((m) => m[1].includes('<w:b/>'))).toBe(true);
    // Los guiones de relleno no quedan resaltados
    expect(resaltados.some((m) => /^-+\s*$/.test(m[2].trim()))).toBe(false);
    expect(r.verificar).toEqual(['se lee 33B o 338']);
    expect(r.faltantes).toEqual(['precio de la venta']);
  });

  it('detecta las marcas FALTA del texto', () => {
    expect(faltantesEn('a «FALTA: precio» b «FALTA: precio» c «FALTA: fecha»')).toEqual(['precio', 'fecha']);
  });
});
