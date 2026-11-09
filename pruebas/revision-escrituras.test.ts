import { describe, expect, it, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import PizZip from 'pizzip';
import { PDFDocument } from 'pdf-lib';
import { vistaPreviaDocx, textoDeParrafos } from '@/lib/escritura/vista-previa';

// Base de datos, almacenamiento, auditoría, avisos e IA en memoria
const filas = new Map<string, Record<string, unknown>>();
const archivos = new Map<string, Buffer>();
const llamadas: string[] = [];
const respuestas = { revision: {} as unknown };
/** Como la base: cada lectura y escritura de los JSON es una copia independiente */
const copia = (f: Record<string, unknown>) => JSON.parse(JSON.stringify(f), (k, v) => (['creadaEn', 'actualizadaEn', 'analizadaEn', 'aplicadaEn'].includes(k) && v ? new Date(v) : v));
const raiz = path.resolve(__dirname, '..');
const PLANTILLA = fs.readFileSync(path.join(raiz, 'plantillas', 'docx', 'cierre.docx'));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auditoria', () => ({ auditar: vi.fn(async () => {}) }));
vi.mock('@/lib/servicios/notificaciones', () => ({ notificar: vi.fn(async () => {}) }));
vi.mock('@/lib/servicios/tareas', () => ({ firmaEtapa: () => 'firma', LIMITE_SIN_LATIDO_MS: 360_000 }));
vi.mock('@/lib/almacenamiento', () => ({
  guardarCifrado: vi.fn(async (d: Buffer, p: string) => { const ruta = `${p}/${archivos.size}-${Math.random()}`; archivos.set(ruta, Buffer.from(d)); return ruta; }),
  leerCifrado: vi.fn(async (ruta: string) => archivos.get(ruta)!),
  borrarCifrado: vi.fn(async (ruta: string) => { archivos.delete(ruta); }),
  guardarParte: vi.fn(async () => {}),
  unirPartes: vi.fn(async () => Buffer.from('')),
}));
vi.mock('@/lib/ia/cliente', () => ({
  ErrorIA: class extends Error {},
  prepararDocumento: async (_b: Buffer, _m: string, titulo: string) => ({ bloque: { type: 'text', text: titulo }, liberar: async () => {} }),
  llamarEstructurado: async (o: { sistema: string; contenido: { text?: string }[]; registro: { revisionId?: string } }) => {
    // Cada llamada queda en Consumo de IA a nombre de su revisión
    expect(o.registro.revisionId).toBe('r1');
    const uso = { modelo: 'claude-sonnet-5-5', tokensEntrada: 1, tokensSalida: 1, tokensCacheLectura: 0, duracionMs: 1 };
    if (o.sistema.startsWith('Recibes un PDF')) {
      llamadas.push('identificar');
      return { ...uso, datos: { escritura: [{ desde: 1, hasta: 5 }], tipo_escritura: 'Sucesión intestada de ANA PERES', soportes: [{ tipo: 'Registro civil de defunción', descripcion: 'De ANA PÉREZ', desde: 6, hasta: 6 }] } };
    }
    if (o.sistema.startsWith('Transcribes')) {
      const paginas = o.contenido[0].text!;
      llamadas.push(`transcribir ${paginas}`);
      return { ...uso, datos: { parrafos: paginas.includes('1 a 4')
        ? [
          { texto: 'ESCRITURA PÚBLICA NÚMERO:', alineacion: 'IZQUIERDA', continua_anterior: false },
          { texto: 'Compareció quien dijo ser JUAN GÓMEZ, apoderado de la causante ANA PERES, identificada con cédula 12.345, y', alineacion: 'JUSTIFICADO', continua_anterior: false },
        ]
        : [
          { texto: 'manifestó que eleva a escritura pública la sucesión de ANA PERES. ----------', alineacion: 'JUSTIFICADO', continua_anterior: true },
          { texto: 'PRIMERO: PRIMERO: Que el activo es de CIEN PESOS ($100).', alineacion: 'JUSTIFICADO', continua_anterior: false },
        ] } };
    }
    llamadas.push('revisar');
    expect(o.contenido.at(-1)!.text).toContain('[P2] Compareció quien dijo ser JUAN GÓMEZ, apoderado de la causante ANA PERES, identificada con cédula 12.345, y manifestó que eleva');
    return { ...uso, datos: respuestas.revision };
  },
}));
vi.mock('@/lib/db', () => ({
  db: {
    revisionEscritura: {
      create: async ({ data }: { data: Record<string, unknown> }) => { const f = copia({ id: 'r1', creadaEn: new Date(), actualizadaEn: new Date(), rutaBase: null, rutaCorregida: null, aplicadaEn: null, resultado: null, ...data }); filas.set('r1', f); return copia(f); },
      findUnique: async ({ where }: { where: { id: string } }) => (filas.has(where.id) ? { ...copia(filas.get(where.id)!), cargadaPor: { nombreCompleto: 'Ana' } } : null),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => { const f = copia({ ...filas.get(where.id)!, ...data, actualizadaEn: new Date() }); filas.set(where.id, f); return f; },
      updateMany: async ({ where, data }: { where: { id: string; estado?: string; progreso?: { equals: number } }; data: Record<string, unknown> }) => {
        const f = filas.get(where.id);
        if (!f || (where.estado && f.estado !== where.estado) || (where.progreso && (f.progreso as { turno: number } | null)?.turno !== where.progreso.equals)) return { count: 0 };
        filas.set(where.id, copia({ ...f, ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === 'object' && v && 'toJSON' in (v as object) && String(v).includes('DbNull') ? null : v])), actualizadaEn: new Date() }));
        return { count: 1 };
      },
      delete: async ({ where }: { where: { id: string } }) => { filas.delete(where.id); },
    },
    plantilla: { findFirst: async () => ({ id: 'p1', tipoId: 'sucesion_intestada', version: 1, archivo: PLANTILLA, tipo: { nombre: 'Sucesión intestada' } }) },
  },
}));

async function pdfDe(paginas: number): Promise<Buffer> {
  const d = await PDFDocument.create();
  for (let i = 0; i < paginas; i++) d.addPage();
  return Buffer.from(await d.save());
}
const texto = (d: Buffer) => textoDeParrafos(vistaPreviaDocx(d));
const xml = (d: Buffer) => new PizZip(d).file('word/document.xml')!.asText();
const sesion = { sesionId: 's', usuario: { id: 'u1', usuario: 'ana', nombre: 'Ana', rol: 'DIGITADOR' as const, debeCambiarContrasena: false, totpActivo: false }, dispositivoId: null, remota: false, segundoFactorOk: true, ip: '127.0.0.1' };

const cambio = (x: Record<string, unknown>) => ({ nivel: 'ADVERTENCIA', categoria: 'REDACCION', parrafo: 2, ubicacion: 'Comparecencia', original: '', corregido: '', todas_las_apariciones: false, motivo: 'm', fuente: 'Texto de la escritura', ...x });

describe('revisión de escrituras de sucesión desde un PDF', () => {
  beforeEach(() => { filas.clear(); archivos.clear(); llamadas.length = 0; });

  it('identifica, transcribe por bloques, revisa y genera la escritura con los cambios marcados y su relación', async () => {
    const { registrarRevision, aplicarCambios, resultadoDe, descargarRevision } = await import('@/lib/servicios/revision-escrituras');
    respuestas.revision = {
      resumen: 'El apellido de la causante no coincide con el registro civil.',
      cambios: [
        cambio({ nivel: 'CRITICA', categoria: 'DATOS', parrafo: 2, ubicacion: 'Comparecencia y cláusula PRIMERO', original: 'PERES', corregido: 'PÉREZ', todas_las_apariciones: true, motivo: 'El registro civil de defunción dice PÉREZ.', fuente: 'Registro civil de defunción, pág. 6' }),
        cambio({ parrafo: 4, ubicacion: 'Cláusula PRIMERO', original: 'PRIMERO: PRIMERO:', corregido: 'PRIMERO:', motivo: 'Título repetido.' }),
        cambio({ parrafo: 4, ubicacion: 'Cláusula PRIMERO', original: 'texto que no existe', corregido: 'otro' }),
      ],
      observaciones: [{ nivel: 'ADVERTENCIA', categoria: 'CONTENIDO', ubicacion: 'Otorgamiento', mensaje: 'Falta la constancia de la UGPP.', fuente: 'Modelo aprobado' }],
    };
    const { id, etapa } = await registrarRevision(sesion, { pdf: await pdfDe(6), nombreArchivo: 'sucesion.pdf', tipoId: 'sucesion_intestada' }, '');
    await etapa(); // sin dirección de la aplicación, las etapas siguen en la misma invocación

    expect(llamadas).toEqual(['identificar', 'transcribir Escritura, páginas 1 a 4', 'transcribir Escritura, páginas 5 a 5', 'revisar']);
    const fila = filas.get(id)!;
    expect(fila.estado).toBe('COMPLETADA');
    const res = resultadoDe(fila as never)!;
    // El párrafo partido entre los dos bloques queda en uno, sin el relleno de guiones
    expect(res.parrafos.map((x) => x.texto)).toEqual([
      'ESCRITURA PÚBLICA NÚMERO:',
      'Compareció quien dijo ser JUAN GÓMEZ, apoderado de la causante ANA PERES, identificada con cédula 12.345, y manifestó que eleva a escritura pública la sucesión de ANA PERES.',
      'PRIMERO: PRIMERO: Que el activo es de CIEN PESOS ($100).',
    ]);
    expect(res.soportes).toHaveLength(1);
    expect(res.cambios.map((c) => [c.numero, c.aplicable])).toEqual([[1, true], [2, true], [3, false]]);
    expect(res.cambios[0].veces).toBe(2);
    expect(res.cambios[2].noAplicable).toContain('no está tal cual');

    const r = await aplicarCambios(sesion, id, [1, 2, 3]);
    expect(r).toEqual({ aplicados: 2, fallidas: [] });
    const marcada = (await descargarRevision(sesion, id, 'corregida', true)).bytes;
    const x = xml(marcada);
    expect(x.match(/<w:t xml:space="preserve">PERES<\/w:t>/g)).toHaveLength(2);
    expect(x).toMatch(/<w:strike\/><w:color w:val="FF0000"\/>[^]*?PERES/);
    expect(x).toMatch(/<w:highlight w:val="yellow"\/><\/w:rPr><w:t xml:space="preserve">PÉREZ<\/w:t>/);
    expect(x).toContain('<w:vertAlign w:val="superscript"/></w:rPr><w:t xml:space="preserve">[1]</w:t>');
    const t = texto(marcada);
    expect(t).toContain('RELACIÓN DE CAMBIOS DE LA REVISIÓN');
    expect(t).toContain('[1] Comparecencia y cláusula PRIMERO (párrafo 2, 2 lugares). Se cambió «PERES» por «PÉREZ». Motivo: El registro civil de defunción dice PÉREZ. Fuente: Registro civil de defunción, pág. 6.');
    expect(t).toContain('PENDIENTE DE REVISAR A MANO');
    expect(t).toContain('Falta la constancia de la UGPP.');

    // La limpia: los mismos cambios, sin marcas ni relación
    const limpia = (await descargarRevision(sesion, id, 'limpia', true)).bytes;
    const tl = texto(limpia);
    expect(tl).toContain('la causante ANA PÉREZ, identificada');
    expect(tl).toContain('sucesión de ANA PÉREZ.');
    expect(tl).toContain('PRIMERO: Que el activo');
    expect(tl).not.toContain('PRIMERO: PRIMERO:');
    expect(tl).not.toContain('RELACIÓN DE CAMBIOS');
    expect(xml(limpia)).not.toContain('<w:strike/>');

    // La transcrita no cambia
    expect(texto((await descargarRevision(sesion, id, 'transcrita', true)).bytes)).toContain('ANA PERES');

    // Otra selección rehace la escritura; sin selección se descarta
    await aplicarCambios(sesion, id, [2]);
    expect(texto((await descargarRevision(sesion, id, 'limpia', true)).bytes)).toContain('ANA PERES');
    await aplicarCambios(sesion, id, []);
    expect(filas.get(id)!.rutaCorregida).toBeNull();
  });

  it('rechaza lo que no es un PDF', async () => {
    const { registrarRevision } = await import('@/lib/servicios/revision-escrituras');
    await expect(registrarRevision(sesion, { pdf: Buffer.from('no es pdf'), nombreArchivo: 'x.pdf', tipoId: 'sucesion_intestada' }, '')).rejects.toThrow('no es un PDF');
  });
});
