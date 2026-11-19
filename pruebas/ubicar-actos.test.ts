import { describe, expect, it } from 'vitest';
import type { CambioParrafo } from '../src/lib/escritura/docx';
import { actosPedidos, actosSinCumplir, encabezadosDeActos } from '../src/lib/escritura/actos';
import { renumerar, tituloActo, ubicarActos } from '../src/lib/escritura/ubicar-actos';

// Plantilla de compraventa con hipoteca (la forma de la de EXP-2026-00060), con datos ficticios
const plantilla = new Map<number, string>([
  [4, 'PERSONAS QUE INTERVIENEN EN EL ACTO'],
  [16, 'ESPECIFICACION VALOR DEL ACTO'],
  [17, 'COMPRAVENTA\t$100.000.000'],
  [18, 'HIPOTECA ABIERTA SIN LIMITE DE CUANTIA\t$60.000.000'],
  [20, 'MATRICULA INMOBILIARIA: 200-999001'],
  [26, 'En la ciudad de Neiva, Departamento del Huila, a los SEIS (06) DÍAS del mes de OCTUBRE…'],
  [27, 'PRIMER ACTO - COMPRAVENTA'],
  [29, 'Compareció quien dijo ser, ANA PRUEBA ROJAS…'],
  [46, 'Previa indagación a los comparecientes, el inmueble NO QUEDA AFECTADO A VIVIENDA FAMILIAR.'],
  [48, 'SEGUNDO ACTO - HIPOTECA ABIERTA SIN LIMITE DE CUANTIA'],
  [50, 'PRIMERO: Que constituye hipoteca abierta…'],
]);
const cambio = (p: number, extra: Partial<CambioParrafo> = {}): CambioParrafo => ({ p, accion: 'REEMPLAZAR', reemplazos: [], texto: '', insertar_despues: [], ...extra });
const pedidos = actosPedidos('En el primer acto se debe realizar cancelación de hipoteca.');

/** Texto de cada párrafo con los cambios (como lo vería la verificación final) */
function resultado(cambios: CambioParrafo[]): Map<number, string> {
  const r = new Map(plantilla);
  for (const c of cambios) {
    let t = c.accion === 'REESCRIBIR' ? c.texto : c.reemplazos.reduce((x, y) => x.split(y.original).join(y.nuevo), plantilla.get(c.p) ?? '');
    if (c.insertar_despues.length) t = [t, ...c.insertar_despues].join('\n');
    r.set(c.p, t);
  }
  return r;
}

describe('ubicación obligatoria de los actos pedidos', () => {
  it('EXP-2026-00060: mueve el acto mal insertado al primer lugar, renumera y lo pone en la carátula', () => {
    const ia = [cambio(46, { insertar_despues: ['CANCELACIÓN DE HIPOTECA: Presente, LUISA EJEMPLO, en representación del banco…'] })];
    const u = ubicarActos(pedidos, plantilla, ia);
    const final = resultado(u.cambios);

    expect(final.get(46)).not.toContain('CANCELACIÓN DE HIPOTECA');
    expect(final.get(26)!.split('\n')[1]).toBe('**PRIMER ACTO - CANCELACIÓN DE HIPOTECA**');
    expect(final.get(26)!.split('\n')[2]).toContain('LUISA EJEMPLO');
    expect(final.get(27)).toBe('SEGUNDO ACTO - COMPRAVENTA');
    expect(final.get(48)).toBe('TERCER ACTO - HIPOTECA ABIERTA SIN LIMITE DE CUANTIA');
    expect(final.get(16)!.split('\n')[1]).toBe('CANCELACION DE HIPOTECA\t«EN BLANCO»');
    // Un solo párrafo de cuerpo: hay que redactarlo completo
    expect(u.porRedactar).toHaveLength(1);
    expect(u.porRedactar[0]).toMatchObject({ ancla: 26, antesDe: 'PRIMER ACTO - COMPRAVENTA' });
    // La verificación final ya no lo marca
    expect(actosSinCumplir(pedidos, encabezadosDeActos(final), [...final.values()].join('\n'))).toEqual([]);
  });

  it('si la IA no escribió nada del acto, deja el encabezado en su lugar para redactarlo', () => {
    const u = ubicarActos(pedidos, plantilla, []);
    const final = resultado(u.cambios);
    expect(final.get(26)!.split('\n')[1]).toBe('**PRIMER ACTO - CANCELACIÓN DE HIPOTECA**');
    expect(u.porRedactar[0].bloque).toEqual(['**PRIMER ACTO - CANCELACIÓN DE HIPOTECA**']);
  });

  it('no toca lo que la IA ya hizo bien y es idempotente', () => {
    const bien = [
      cambio(16, { accion: 'SOLO_INSERTAR', insertar_despues: ['CANCELACION DE HIPOTECA\tSIN CUANTIA'] }),
      cambio(26, { accion: 'SOLO_INSERTAR', insertar_despues: ['**PRIMER ACTO - CANCELACIÓN DE HIPOTECA**', 'Compareció…', 'PRIMERO: …', 'SEGUNDO: …'] }),
      cambio(27, { reemplazos: [{ original: 'PRIMER ACTO', nuevo: 'SEGUNDO ACTO' }] }),
      cambio(48, { reemplazos: [{ original: 'SEGUNDO ACTO', nuevo: 'TERCER ACTO' }] }),
    ];
    const u = ubicarActos(pedidos, plantilla, bien);
    expect(resultado(u.cambios)).toEqual(resultado(bien));
    expect(u.porRedactar).toEqual([]);
    expect(u.hechos).toEqual([]);
    const otra = ubicarActos(pedidos, plantilla, u.cambios);
    expect(otra.cambios).toEqual(u.cambios);
  });

  it('corrige el ordinal que la IA dejó mal y respeta un REESCRIBIR', () => {
    const ia = [
      cambio(26, { accion: 'SOLO_INSERTAR', insertar_despues: ['**SEGUNDO ACTO - CANCELACIÓN DE HIPOTECA**', 'a', 'b', 'c'] }),
      cambio(27, { reemplazos: [{ original: 'PRIMER ACTO', nuevo: 'PRIMER ACTO' }] }),
      cambio(48, { accion: 'REESCRIBIR', texto: 'SEGUNDO ACTO - HIPOTECA ABIERTA SIN LIMITE DE CUANTIA A FAVOR DEL BANCO' }),
    ];
    const final = resultado(ubicarActos(pedidos, plantilla, ia).cambios);
    expect(final.get(26)!.split('\n')[1]).toBe('**PRIMER ACTO - CANCELACIÓN DE HIPOTECA**');
    expect(final.get(27)).toBe('SEGUNDO ACTO - COMPRAVENTA');
    expect(final.get(48)).toBe('TERCER ACTO - HIPOTECA ABIERTA SIN LIMITE DE CUANTIA A FAVOR DEL BANCO');
  });

  it('una cancelación pedida sin lugar va primero; un acto que ya trae la plantilla no se toca', () => {
    expect(ubicarActos(actosPedidos('Agregar cancelación de hipoteca de Granahorrar.'), plantilla, []).porRedactar[0].pedido.posicion).toBe(1);
    const u = ubicarActos(actosPedidos('La hipoteca va como segundo acto.'), plantilla, []);
    expect(u.cambios).toEqual([]);
  });

  it('auxiliares', () => {
    expect(renumerar('PRIMER ACTO - COMPRAVENTA', 2)).toBe('SEGUNDO ACTO - COMPRAVENTA');
    expect(renumerar('ACTO PRIMERO: COMPRAVENTA', 3)).toBe('ACTO TERCERO: COMPRAVENTA');
    expect(renumerar('Primer acto', 2)).toBe('Segundo acto');
    expect(tituloActo('CANCELACION DE HIPOTECA')).toBe('CANCELACIÓN DE HIPOTECA');
  });
});
