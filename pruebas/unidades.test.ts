import { describe, it, expect } from 'vitest';
import { unidadesEn, unidadesDelNegocio, fragmentosDeUnidades, compactarUnidades, documentoDeFragmentos, sinRelleno } from '../src/lib/escritura/unidades';
import type { DocumentoLeido } from '../src/lib/ia/instrucciones';

// EXP-2026-00198: la orden nombra «MEDITERRANEO APT 405, GARAJE N° 482»; los linderos están en el
// reglamento de propiedad horizontal cargado en Word (765.988 caracteres, el 405 en el carácter 282.083)
const lectura = (datos: [string, string][]): DocumentoLeido => ({
  tipo: 'Orden de escrituración', paginas: '1', resumen: '', fecha_documento: '', textos_literales: [], alertas: [],
  datos: datos.map(([dato, valor]) => ({ dato, valor, pagina: 1 })),
});

const apto = (n: number, torre = 3) => `APARTAMENTO ${n}: Ver plano No. PHR-6. Tiene su acceso a través de la circulación comunal del cuarto piso de la Torre ${torre} del CONJUNTO RESIDENCIAL MEDITERRANEO. DEPENDENCIAS: Salón-comedor, balcón. LINDEROS AREA PRIVADA APARTAMENTO: POR EL NORTE: en longitud de cinco metros (5.00 mts) con balcón. POR EL SUR: con hall. + + + + + + ++ ++`;
const parq = (n: number) => `PARQUEADERO ${n}: Ver plano No. PHR-1, Situado en el Sótano (Nivel -3.28mts). Área privada de catorce metros con cincuenta decímetros cuadrados (14.50 M2) alinderado así: NORTE-ORIENTE: con zona común.`;

const reglamento = [
  'ESCRITURA PÚBLICA NÚMERO 2531',
  'LOTE 2 B: con un área de 4.036,36 m2, alinderado así: NORTE: con la carrera 2 W.',
  'ARTÍCULO 7. DETERMINACIÓN DE LOS INMUEBLES: QUINCE (15) LOCALES COMERCIALES, OCHENTA Y SEIS (86) PARQUEADEROS PRIVADOS',
  ...[480, 481, 482, 483].map(parq),
  ...[401, 402, 403, 404, 405, 406].map((n) => apto(n)),
  'POR EL NADIR: con placa común. POR EL CENIT: con placa común.',
  'ARTÍCULO 30. ÉPOCAS DE REUNIÓN: Las sesiones de la Asamblea General podrán ser ordinarias o extraordinarias.',
];

describe('unidades del negocio', () => {
  it('reconoce abreviaturas, sinónimos y la torre', () => {
    expect(unidadesEn('MEDITERRANEO APT 405, GARAJE N° 482')).toEqual([{ tipo: 'APARTAMENTO', numero: '405' }, { tipo: 'PARQUEADERO', numero: '482' }]);
    expect(unidadesEn('APARTAMENTO 405 TORRE 3 ETAPA 1.')).toEqual([{ tipo: 'APARTAMENTO', numero: '405', agrupacion: 'TORRE 3' }]);
    expect(unidadesEn('Parqueaderos 1 a 76 y LOCAL COMERCIAL 20')).toEqual([{ tipo: 'LOCAL', numero: '20' }]);
  });

  it('toma las unidades de los datos y las observaciones, no de los linderos ni el lote matriz', () => {
    const u = unidadesDelNegocio([lectura([
      ['Descripción del inmueble', 'APARTAMENTO 405 TORRE 3 ETAPA 1'],
      ['Inmueble', 'MEDITERRANEO APT 405, GARAJE N° 482'],
      ['Linderos', 'POR EL SUR con el apartamento 404'],
      ['Lote matriz', 'LOTE 2B'],
    ])], 'Los linderos de los inmuebles aparecen en el archivo en word adjunto.');
    expect(u).toEqual([{ tipo: 'APARTAMENTO', numero: '405', agrupacion: 'TORRE 3' }, { tipo: 'PARQUEADERO', numero: '482' }]);
  });
});

describe('fragmentos textuales del Word', () => {
  it('copia el párrafo de cada unidad y sus continuaciones, hasta la siguiente', () => {
    const f = fragmentosDeUnidades(reglamento, [{ tipo: 'APARTAMENTO', numero: '406' }, { tipo: 'PARQUEADERO', numero: '482' }]);
    expect(f).toHaveLength(2);
    expect(f[0].texto).toContain('APARTAMENTO 406:');
    expect(f[0].texto).toContain('POR EL NADIR');
    expect(f[0].texto).not.toContain('ARTÍCULO 30');
    expect(f[0].texto).not.toContain('+ + +');
    expect(f[1].texto).toBe(parq(482));
  });

  it('con el mismo número en varias torres, prefiere la del negocio', () => {
    const f = fragmentosDeUnidades([apto(405, 1), apto(405, 3)], [{ tipo: 'APARTAMENTO', numero: '405', agrupacion: 'TORRE 3' }]);
    expect(f).toHaveLength(1);
    expect(f[0].texto).toContain('Torre 3');
  });

  it('se entregan como textos literales de un documento más', () => {
    const d = documentoDeFragmentos('MEDITERRANEO ETAPA 1.docx', fragmentosDeUnidades(reglamento, [{ tipo: 'APARTAMENTO', numero: '405' }]));
    expect(d?.tipo).toMatch(/TEXTO EXACTO del Word/);
    expect(d?.textos_literales[0].texto).toContain('LINDEROS AREA PRIVADA');
    expect(documentoDeFragmentos('x.docx', [])).toBeNull();
  });
});

describe('lectura compacta de un reglamento', () => {
  it('quita las descripciones de unidad, deja un índice y conserva el lote matriz y el articulado', () => {
    const c = compactarUnidades(reglamento)!;
    expect(c.quitadas).toBe(10);
    const t = c.parrafos.join('\n');
    expect(t).toContain('LOTE 2 B');
    expect(t).toContain('ARTÍCULO 30');
    expect(t).not.toContain('LINDEROS AREA PRIVADA');
    expect(t).toContain('PARQUEADERO 480, 481, 482, 483; APARTAMENTO 401, 402, 403, 404, 405, 406');
  });

  it('una escritura de un solo inmueble se lee entera', () => {
    expect(compactarUnidades(['Comparecieron …', apto(405), 'TERCERO. TRADICIÓN: …'])).toBeNull();
  });

  it('quita el relleno de fin de renglón sin tocar los espacios en blanco por llenar', () => {
    expect(sinRelleno('con hall. + + + + ++ ++\nescritura número ______ del')).toBe('con hall.\nescritura número ______ del');
  });
});
