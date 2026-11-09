import { describe, expect, it, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import PizZip from 'pizzip';
import { vistaPreviaDocx, textoDeParrafos } from '@/lib/escritura/vista-previa';

// Base de datos, almacenamiento, auditoría e IA en memoria
const filas = new Map<string, Record<string, unknown>>();
const archivos = new Map<string, Buffer>();
const respuestaIA = vi.fn();
/** Como la base: cada lectura y escritura del JSON es una copia independiente */
const copia = (f: Record<string, unknown>) => ({ ...f, resultado: f.resultado ? JSON.parse(JSON.stringify(f.resultado)) : f.resultado });

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auditoria', () => ({ auditar: vi.fn(async () => {}) }));
vi.mock('@/lib/almacenamiento', () => ({
  guardarCifrado: vi.fn(async (d: Buffer, p: string) => { const ruta = `${p}/${archivos.size}`; archivos.set(ruta, Buffer.from(d)); return ruta; }),
  leerCifrado: vi.fn(async (ruta: string) => archivos.get(ruta)!),
  borrarCifrado: vi.fn(async (ruta: string) => { archivos.delete(ruta); }),
}));
vi.mock('@/lib/ia/cliente', () => ({
  ErrorIA: class extends Error {},
  llamarEstructurado: (...a: unknown[]) => respuestaIA(...a),
}));
vi.mock('@/lib/db', () => ({
  db: {
    revisionEscritura: {
      create: async ({ data }: { data: Record<string, unknown> }) => { const f = { id: 'r1', creadaEn: new Date(), rutaCorregida: null, aplicadaEn: null, resultado: null, ...data }; filas.set('r1', f); return f; },
      findUnique: async ({ where }: { where: { id: string } }) => (filas.has(where.id) ? { ...copia(filas.get(where.id)!), cargadaPor: { nombreCompleto: 'Ana' } } : null),
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => copia(filas.get(where.id)!),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => { const f = copia({ ...filas.get(where.id)!, ...data }); filas.set(where.id, f); return f; },
      delete: async ({ where }: { where: { id: string } }) => { filas.delete(where.id); },
    },
    tipoEscritura: { findUnique: async () => null },
    plantilla: { findFirst: async () => null },
  },
}));

const raiz = path.resolve(__dirname, '..');
const r = (t: string) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`;
function docxCon(cuerpo: string, sectPr = '<w:sectPr><w:pgMar w:top="1701" w:right="1247" w:bottom="510" w:left="1758"/></w:sectPr>'): Buffer {
  const zip = new PizZip(fs.readFileSync(path.join(raiz, 'plantillas', 'docx', 'cierre.docx')));
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${cuerpo}${sectPr}</w:body></w:document>`);
  return zip.generate({ type: 'nodebuffer' }) as Buffer;
}
const texto = (d: Buffer) => textoDeParrafos(vistaPreviaDocx(d));
const sesion = { sesionId: 's', usuario: { id: 'u1', usuario: 'ana', nombre: 'Ana', rol: 'DIGITADOR' as const, debeCambiarContrasena: false, totpActivo: false }, dispositivoId: null, remota: false, segundoFactorOk: true, ip: '127.0.0.1' };

const ESCRITURA = docxCon([
  `<w:p>${r('Compareció JUAN PERES GÓMEZ, mayor de edad, identificado con cédula 12.345.')}</w:p>`,
  `<w:p>${r('El vendedor JUAN PERES GÓMEZ transfiere el inmueble por la suma de CIEN MILLONES DE PESOS ($100.000.000).')}</w:p>`,
  `<w:p>${r('Los compradores declaran que recibio el inmueble.')}</w:p>`,
].join(''));

const recomendacion = (x: Partial<{ nivel: string; categoria: string; mensaje: string; original: string | null; corregido: string | null; todas_las_apariciones: boolean }>) => ({
  nivel: 'ADVERTENCIA', categoria: 'REDACCION', mensaje: 'm', original: null, corregido: null, todas_las_apariciones: false, ...x,
});

describe('revisión de escrituras ya hechas', () => {
  beforeEach(() => { filas.clear(); archivos.clear(); respuestaIA.mockReset(); });

  it('verifica el formato de la notaría sin cambiar el documento', async () => {
    const { verificarFormato } = await import('@/lib/servicios/revision-escrituras');
    const bien = verificarFormato(ESCRITURA);
    expect(bien[0]).toMatchObject({ ok: true });
    const mal = verificarFormato(docxCon(`<w:p>${r('Texto')}</w:p><w:p/><w:p>${r('Más texto')}</w:p><w:p>${r('Fin')}</w:p>`, '<w:sectPr><w:pgMar w:top="1440" w:right="1247" w:bottom="510" w:left="1758"/></w:sectPr>'));
    expect(mal[0].ok).toBe(false);
    expect(mal[0].mensaje).toContain('superior 2,5 cm');
    expect(mal.at(-1)).toMatchObject({ ok: false });
  });

  it('analiza, deja aplicables solo los cambios que se pueden hacer y aplica los elegidos en una copia', async () => {
    const { cargarRevision, aplicarCambios, resultadoDe, descargarRevision } = await import('@/lib/servicios/revision-escrituras');
    respuestaIA.mockResolvedValue({
      modelo: 'claude-sonnet-5-5', tokensEntrada: 10, tokensSalida: 5, duracionMs: 1,
      datos: {
        tipo_detectado: 'Compraventa', resumen: 'Hay errores de redacción.',
        recomendaciones: [
          recomendacion({ nivel: 'INFORMATIVA', original: 'declaran que recibio', corregido: 'declaran que recibieron' }),
          recomendacion({ nivel: 'CRITICA', categoria: 'DATOS', original: 'PERES', corregido: 'PÉREZ', todas_las_apariciones: true }),
          recomendacion({ original: 'texto que no existe', corregido: 'otro' }),
          recomendacion({ categoria: 'CONTENIDO', mensaje: 'Falta la afectación a vivienda familiar.' }),
        ],
      },
    });
    const { id, tarea } = await cargarRevision(sesion, { nombreArchivo: 'escritura.docx', archivo: ESCRITURA });
    await tarea();
    const fila = filas.get(id)!;
    expect(fila.estado).toBe('COMPLETADA');
    const res = resultadoDe(fila as never)!;
    // Ordenadas por nivel: la crítica primero
    expect(res.recomendaciones.map((x) => [x.nivel, x.aplicable])).toEqual([['CRITICA', true], ['ADVERTENCIA', false], ['ADVERTENCIA', false], ['INFORMATIVA', true]]);
    expect(res.recomendaciones[0].veces).toBe(2);
    expect(res.recomendaciones.find((x) => x.original === 'texto que no existe')?.motivo).toContain('no está tal cual');

    // Se eligen solo la crítica: el original no cambia y la copia lleva el cambio en las dos apariciones
    const r1 = await aplicarCambios(sesion, id, [0]);
    expect(r1).toEqual({ aplicadas: 1, fallidas: [] });
    const corregida = (await descargarRevision(sesion, id, 'corregida', true)).bytes;
    expect(texto(corregida)).toContain('Compareció JUAN PÉREZ GÓMEZ');
    expect(texto(corregida)).toContain('El vendedor JUAN PÉREZ GÓMEZ');
    expect(texto(corregida)).toContain('recibio');
    expect(texto((await descargarRevision(sesion, id, 'original', true)).bytes)).toContain('PERES');

    // Otra selección rehace la copia desde el original; un índice no aplicable se ignora
    await aplicarCambios(sesion, id, [3, 1]);
    const otra = texto((await descargarRevision(sesion, id, 'corregida', true)).bytes);
    expect(otra).toContain('recibieron');
    expect(otra).toContain('PERES');

    // Sin selección se descarta la copia
    await aplicarCambios(sesion, id, []);
    expect(filas.get(id)!.rutaCorregida).toBeNull();
  });

  it('rechaza archivos que no son .docx', async () => {
    const { cargarRevision } = await import('@/lib/servicios/revision-escrituras');
    await expect(cargarRevision(sesion, { nombreArchivo: 'escritura.pdf', archivo: Buffer.from('x') })).rejects.toThrow('.docx');
    await expect(cargarRevision(sesion, { nombreArchivo: 'escritura.docx', archivo: Buffer.from('no es zip') })).rejects.toThrow('no es un documento de Word');
  });
});
