import { describe, expect, it } from 'vitest';
import { expedicionEnMinuscula } from '@/lib/escritura/expedicion';
import { tramosNegrilla } from '@/lib/escritura/formato-notarial';

describe('expedición de la cédula', () => {
  it('pasa «EXPEDIDA EN …» a minúscula con el lugar en mayúscula inicial y con tildes', () => {
    expect(expedicionEnMinuscula('número **36.156.647 EXPEDIDA EN NEIVA**, estado civil')).toBe('número **36.156.647 expedida en Neiva**, estado civil');
    expect(expedicionEnMinuscula('1.032.489.141 EXPEDIDA EN BOGOTA D.C., estado')).toBe('1.032.489.141 expedida en Bogotá D.C., estado');
    expect(expedicionEnMinuscula('12.102.850 expedida en LA PLATA (H), quien')).toBe('12.102.850 expedida en La Plata (H), quien');
    expect(expedicionEnMinuscula('83.250.116 EXPEDIDAS EN NATAGA y')).toBe('83.250.116 expedidas en Nátaga y');
  });
  it('no toca lo que ya está bien, ni lo que sigue al lugar', () => {
    expect(expedicionEnMinuscula('12.102.850 expedida en Neiva, quien obra')).toBe('12.102.850 expedida en Neiva, quien obra');
    expect(expedicionEnMinuscula('1.075 EXPEDIDA EN NEIVA ESTADO CIVIL SOLTERO')).toBe('1.075 expedida en Neiva ESTADO CIVIL SOLTERO');
    expect(expedicionEnMinuscula('expedida en «FALTA: lugar de expedición de ANA RUIZ»')).toBe('expedida en «FALTA: lugar de expedición de ANA RUIZ»');
  });
  it('solo el número queda en negrita', () => {
    const t = 'número 36.156.647 expedida en Bogotá D.C., estado';
    const negrita = tramosNegrilla(t).map(([a, b]) => t.slice(a, b));
    expect(negrita).toEqual(['36.156.647']);
  });
});
