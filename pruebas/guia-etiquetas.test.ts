import { describe, it, expect } from 'vitest';
import { etiquetasDe, guiaEtiquetas } from '../src/lib/ia/guia-etiquetas';

describe('guía de etiquetas de las plantillas', () => {
  it('reconoce las etiquetas con y sin «a.», bloques y filtros', () => {
    const e = etiquetasDe('{{a.precio_letras}}, {{a.forma_pago_texto}} {{#a.paragrafo_gravamen}}x{{/a.paragrafo_gravamen}} {{a.vendedores | el:\'vendedor\'}}');
    expect([...e]).toEqual(expect.arrayContaining(['precio_letras', 'forma_pago_texto', 'paragrafo_gravamen', 'vendedores']));
  });

  it('solo envía la guía de las etiquetas presentes', () => {
    const g = guiaEtiquetas(['Que el valor es {{a.precio_letras}}, {{a.forma_pago_texto}}', 'con {{a.certificados_texto}}.']);
    expect(g).toContain('{{forma_pago_texto}}');
    expect(g).toContain('haber recibido en su totalidad');
    expect(g).toContain('{{certificados_texto}}');
    expect(g).not.toContain('{{paragrafo_gravamen}}');
  });

  it('sin etiquetas conocidas no envía nada', () => {
    expect(guiaEtiquetas(['PRIMERO: Que el vendedor transfiere…'])).toBe('');
  });
});
