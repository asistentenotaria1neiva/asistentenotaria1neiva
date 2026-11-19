import { describe, expect, it } from 'vitest';
import { actosPedidos, encabezadosDeActos, actosSinCumplir, nombraActo } from '../src/lib/escritura/actos';

const plantilla = new Map<number, string>([
  [25, 'En la ciudad de Neiva, Departamento del Huila, a los SEIS (06) DÍAS del mes de OCTUBRE…'],
  [27, 'PRIMER ACTO - COMPRAVENTA'],
  [29, 'Compareció quien dijo ser, ELICEO CHARRY GUTIERREZ…'],
  [46, 'Previa indagación a los comparecientes, el inmueble NO QUEDA AFECTADO A VIVIENDA FAMILIAR.'],
  [48, 'SEGUNDO ACTO - HIPOTECA ABIERTA SIN LIMITE DE CUANTIA'],
]);

describe('actos pedidos en las observaciones', () => {
  it('lee el acto y su posición', () => {
    expect(actosPedidos('En el primer acto se debe realizar cancelación de hipoteca.')).toEqual([
      { acto: 'CANCELACION DE HIPOTECA', posicion: 1, texto: 'En el primer acto se debe realizar cancelación de hipoteca' },
    ]);
  });

  it('toma la posición de una frase posterior («déjelo como primer acto»)', () => {
    const r = actosPedidos('Realizar cancelación de hipoteca de Granahorrar. Déjelo como primer acto.');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ acto: 'CANCELACION DE HIPOTECA', posicion: 1 });
  });

  it('sin acto ni posición no pide nada', () => {
    expect(actosPedidos('La compradora es soltera. Precio 170 millones.')).toEqual([]);
    expect(actosPedidos(null)).toEqual([]);
  });
});

describe('cumplimiento de los actos pedidos', () => {
  const pedidos = actosPedidos('En el primer acto se debe realizar cancelación de hipoteca.');

  it('detecta el acto insertado al final de la compraventa (EXP-2026-00060)', () => {
    const actuales = new Map(plantilla);
    actuales.set(46, `${plantilla.get(46)}\nCANCELACIÓN DE HIPOTECA: Presente, ADRIANA DEL PILAR GARZON SARMIENTO…`);
    const problemas = actosSinCumplir(pedidos, encabezadosDeActos(actuales), [...actuales.values()].join('\n'));
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toContain('el PRIMER ACTO es «PRIMER ACTO - COMPRAVENTA»');
    expect(nombraActo(actuales.get(46)!.split('\n')[1], 'CANCELACION DE HIPOTECA')).toBe(true);
  });

  it('acepta el acto en su lugar y los demás renumerados', () => {
    const actuales = new Map(plantilla);
    actuales.set(25, `${plantilla.get(25)}\n**PRIMER ACTO - CANCELACIÓN DE AMPLIACIÓN DE HIPOTECA**\nCompareció …`);
    actuales.set(27, 'SEGUNDO ACTO - COMPRAVENTA');
    actuales.set(48, 'TERCER ACTO - HIPOTECA ABIERTA SIN LIMITE DE CUANTIA');
    expect(actosSinCumplir(pedidos, encabezadosDeActos(actuales), '')).toEqual([]);
  });

  it('una hipoteca abierta cuenta como la hipoteca pedida', () => {
    const p = actosPedidos('La hipoteca va como segundo acto.');
    expect(actosSinCumplir(p, encabezadosDeActos(plantilla), '')).toEqual([]);
  });

  it('acto pedido sin posición que no está', () => {
    const p = actosPedidos('Agregar cancelación de patrimonio de familia');
    expect(actosSinCumplir(p, encabezadosDeActos(plantilla), '')[0]).toContain('no tiene un acto de CANCELACION DE PATRIMONIO DE FAMILIA');
  });
});
