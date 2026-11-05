import { describe, expect, it } from 'vitest';
import { corregirNumeroDocumento, pareceEntidad } from '@/lib/validaciones/formatos';
import { pazYSalvosPorInmueble, pazYSalvosAntiguos, aplicarPazYSalvoVigente } from '@/lib/escritura/paz-salvo';
import { evaluarReglas } from '@/lib/reglas/reglas';
import { datosVacios, type Inmueble } from '@/lib/escritura/tipos';
import type { ResultadoExtraccion } from '@/lib/ia/documentos';

describe('número de documento corregido sin preguntar', () => {
  it('quita rótulos, lugar de expedición, guiones y letras del escáner', () => {
    expect(corregirNumeroDocumento('CC', 'C.C. No. 12.345.678 de Neiva')).toEqual({ tipo: 'CC', numero: '12.345.678' });
    expect(corregirNumeroDocumento('CC', '1.075.234.567-')).toEqual({ tipo: 'CC', numero: '1.075.234.567' });
    expect(corregirNumeroDocumento('CC', 'CC#1075234567')).toEqual({ tipo: 'CC', numero: '1.075.234.567' });
    expect(corregirNumeroDocumento('CC', '1O75234567')).toEqual({ tipo: 'CC', numero: '1.075.234.567' });
    expect(corregirNumeroDocumento('CC', '12 345 678 expedida en Pitalito')).toEqual({ tipo: 'CC', numero: '12.345.678' });
    expect(corregirNumeroDocumento('CC', 'sin número')).toBeNull();
  });

  it('el NIT de una entidad registrada como cédula pasa a NIT', () => {
    expect(pareceEntidad('BANCO DAVIVIENDA S.A.')).toBe(true);
    expect(pareceEntidad('MARIA SALAZAR')).toBe(false);
    expect(corregirNumeroDocumento('CC', 'NIT 860.034.313-7', true)).toEqual({ tipo: 'NIT', numero: '860.034.313-7' });
    expect(corregirNumeroDocumento('NIT', '860034313 - 7')).toEqual({ tipo: 'NIT', numero: '860.034.313-7' });
  });
});

const hechos = (cat: string, vigencia: string, avaluo: number): ResultadoExtraccion => ({
  tipo_detectado: 'PAZ_Y_SALVO', legible: true, observaciones: [], datos: {
    cedula_catastral: { valor: cat, pagina: 1, fragmento: cat, confianza: 'ALTA' },
    vigencia_hasta: { valor: vigencia, pagina: 1, fragmento: vigencia, confianza: 'ALTA' },
    avaluo: { valor: avaluo, pagina: 1, fragmento: String(avaluo), confianza: 'ALTA' },
    entidad: { valor: 'la Secretaría de Hacienda de Neiva (H)', pagina: 1, fragmento: '', confianza: 'ALTA' },
  },
});

describe('paz y salvo vigente: uno antiguo no cuenta', () => {
  const inmueble = (): Inmueble => ({
    id: 'i1', tipo_inmueble: 'CASA', direccion: 'CL 1', municipio: 'Neiva', departamento: 'Huila', linderos: 'x', matricula: '200-1234', orip: 'NEIVA - HUILA',
    cedula_catastral: '410010101000000010001000000000', fecha_certificado_tradicion: '2026-10-30',
    tradicion: { modo: 'COMPRA', tradente: 'X', escritura_numero: '1', escritura_fecha: '2020-01-01', notaria: 'la Notaria Primera de Neiva' },
    // Quedó con el antiguo (el protocolizado en la escritura de la hipoteca)
    paz_salvo: { entidad: 'la Secretaría de Hacienda de Neiva (H)', vigencia_hasta: '2019-12-31', avaluo: 40000000 },
  } as Inmueble);
  const docs = [
    { id: 'viejo', nombre: 'escritura hipoteca p. 9', hechos: hechos('01-01-0000-0001-000', '2019-12-31', 40000000) },
    { id: 'nuevo', nombre: 'paz y salvo 2026', hechos: hechos('41-001-01-01-0000-0001-0001-0-00-00-0000', '2026-12-31', 95000000) },
  ];

  it('elige el más reciente y corrige el formulario', () => {
    const i = inmueble();
    const por = pazYSalvosPorInmueble([i], docs);
    expect(por.get('i1')![0].documentoId).toBe('nuevo');
    expect([...pazYSalvosAntiguos(por)]).toEqual(['viejo']);
    expect(aplicarPazYSalvoVigente([i], por)).toEqual(['i1']);
    expect(i.paz_salvo).toMatchObject({ vigencia_hasta: '2026-12-31', avaluo: 95000000 });
  });

  it('las reglas no lo marcan vencido ni comparan con el antiguo', () => {
    const d = datosVacios();
    d.inmuebles = [inmueble()];
    const h = evaluarReglas({ datos: d, actos: [], documentos: docs.map((x) => ({ ...x, tipo: 'PAZ_Y_SALVO' as const })), hoy: new Date('2026-11-05') });
    expect(h.some((x) => x.codigo === 'R04-PAZ-SALVO-VENCIDO')).toBe(false);
    expect(h.some((x) => x.codigo === 'R04-PAZ-SALVO-PREDIO')).toBe(false);
  });

  it('si el más reciente sí está vencido, se advierte', () => {
    const d = datosVacios();
    d.inmuebles = [inmueble()];
    // Vencido hace unos días (no es histórico) y la escritura transfiere el inmueble
    const reciente = { id: 'reciente', nombre: 'paz y salvo', tipo: 'PAZ_Y_SALVO' as const, hechos: hechos('410010101000000010001000000000', '2026-10-31', 95000000) };
    const h = evaluarReglas({ datos: d, actos: ['compraventa'], documentos: [{ ...docs[0], tipo: 'PAZ_Y_SALVO' as const }, reciente], hoy: new Date('2026-11-05') });
    expect(h.find((x) => x.codigo === 'R04-PAZ-SALVO-VENCIDO')).toMatchObject({ nivel: 'CRITICA', mensaje: expect.stringContaining('2026-10-31') });
  });
});

describe('paz y salvo histórico (vencido hace más de un año)', () => {
  const base = (): Inmueble => ({
    id: 'i1', tipo_inmueble: 'CASA', direccion: 'CL 1', municipio: 'Neiva', departamento: 'Huila', linderos: 'x', matricula: '206-28835', orip: 'NEIVA - HUILA',
    cedula_catastral: '410010101000000010001000000000', fecha_certificado_tradicion: '2026-10-30',
    tradicion: { modo: 'COMPRA', tradente: 'X', escritura_numero: '1', escritura_fecha: '2020-01-01', notaria: 'la Notaria Primera de Neiva' },
    paz_salvo: { entidad: 'la Secretaría de Hacienda de Neiva (H)', vigencia_hasta: '2011-10-31', avaluo: 9000000 },
  } as Inmueble);
  const viejo = { id: 'viejo', nombre: 'paz y salvo 2011', tipo: 'PAZ_Y_SALVO' as const, hechos: hechos('410010101000000010001000000000', '2011-10-31', 9000000) };

  it('es el único cargado: no se marca vencido ni se toma', () => {
    const d = datosVacios();
    d.inmuebles = [base()];
    d.actos.cancelacion_hipoteca = {};
    const h = evaluarReglas({ datos: d, actos: ['cancelacion_hipoteca'], documentos: [viejo], hoy: new Date('2026-11-05') });
    expect(h.filter((x) => x.codigo.startsWith('R04'))).toEqual([]);
    const i = base();
    expect(aplicarPazYSalvoVigente([i], pazYSalvosPorInmueble([i], []), '2026-11-05')).toEqual(['i1']);
    expect(i.paz_salvo).toBeUndefined();
  });

  it('en una cancelación de hipoteca, uno recién vencido es informativo; en una compraventa, crítico', () => {
    const d = datosVacios();
    d.inmuebles = [{ ...base(), paz_salvo: { entidad: 'x', vigencia_hasta: '2026-10-31', avaluo: 1 } } as Inmueble];
    const nivel = (actos: string[]) => evaluarReglas({ datos: d, actos, documentos: [], hoy: new Date('2026-11-05') }).find((x) => x.codigo === 'R04-PAZ-SALVO-VENCIDO')?.nivel;
    expect(nivel(['cancelacion_hipoteca'])).toBe('INFORMATIVA');
    expect(nivel(['compraventa'])).toBe('CRITICA');
  });
});
