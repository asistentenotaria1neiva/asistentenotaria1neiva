import { describe, it, expect } from 'vitest';
import { revisarNumeroPorPapel } from '../src/lib/texto/concordancia';

describe('singular y plural por papel', () => {
  it('advierte el plural cuando hay un solo vendedor', () => {
    const texto = 'Compareció ANA PÉREZ. PRIMERO: LOS VENDEDORES transfieren a título de venta a favor de LOS COMPRADORES el inmueble. Los vendedores declaran que el inmueble es suyo.';
    const r = revisarNumeroPorPapel(texto, [{ papel: 'Vendedora' }, { papel: 'Comprador' }, { papel: 'Compradora' }]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ papel: 'vendedor', cantidad: 1, escrito: 'PLURAL', veces: 2 });
    expect(r[0].ejemplos[0]).toContain('LOS VENDEDORES transfieren');
  });

  it('advierte el singular cuando hay varios compradores', () => {
    const r = revisarNumeroPorPapel('Entrega al comprador el inmueble y EL COMPRADOR lo acepta.', [{ papel: 'Comprador' }, { papel: 'Comprador' }]);
    expect(r).toMatchObject([{ papel: 'comprador', cantidad: 2, escrito: 'SINGULAR', veces: 2 }]);
  });

  it('no cuenta al apoderado ni mira los colectivos', () => {
    const texto = 'EL VENDEDOR, representado por su apoderado, transfiere a LA PARTE COMPRADORA, quienes aceptan.';
    const r = revisarNumeroPorPapel(texto, [{ papel: 'Vendedor' }, { papel: 'Apoderado del vendedor' }, { papel: 'Comprador' }, { papel: 'Compradora' }]);
    expect(r).toEqual([]);
  });

  it('sin otorgantes no advierte nada', () => {
    expect(revisarNumeroPorPapel('LOS VENDEDORES transfieren', [])).toEqual([]);
  });
});
