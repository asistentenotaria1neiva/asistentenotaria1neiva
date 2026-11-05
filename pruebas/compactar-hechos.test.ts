import { describe, expect, it } from 'vitest';
import { compactarHechos, normalizarExtraccion } from '@/lib/ia/documentos';

describe('compactarHechos', () => {
  it('quita los datos que no aparecieron y conserva los leídos con su fuente', () => {
    const hechos = normalizarExtraccion('CERTIFICADO_TRADICION', {
      tipo_detectado: 'CERTIFICADO_TRADICION', legible: true, observaciones: [],
      datos: [{ campo: 'matricula', indice: 0, valor: '200-12345', pagina: 1, fragmento: 'MATRÍCULA 200-12345', confianza: 'ALTA' }] as unknown as Record<string, unknown>,
    });
    const c = compactarHechos(hechos) as { legible: boolean; datos: Record<string, unknown> };
    expect(c.legible).toBe(true);
    expect(c.datos.matricula).toEqual({ valor: '200-12345', pagina: 1, fragmento: 'MATRÍCULA 200-12345', confianza: 'ALTA' });
    // Ningún dato vacío viaja a la IA
    expect(JSON.stringify(c.datos)).not.toContain('"valor":null');
    expect(JSON.stringify(c).length).toBeLessThan(JSON.stringify(hechos).length);
  });

  it('conserva los false, los ceros y los elementos de las listas con datos', () => {
    const c = compactarHechos({ datos: { a: { valor: false, pagina: null, fragmento: null, confianza: 'MEDIA' }, b: { valor: 0, pagina: 2, fragmento: 'x', confianza: 'ALTA' }, l: [{ n: { valor: null, pagina: null, fragmento: null, confianza: 'BAJA' } }, { n: { valor: 'X', pagina: 1, fragmento: 'X', confianza: 'ALTA' } }] } });
    expect(c).toEqual({ datos: { a: { valor: false, confianza: 'MEDIA' }, b: { valor: 0, pagina: 2, fragmento: 'x', confianza: 'ALTA' }, l: [{ n: { valor: 'X', pagina: 1, fragmento: 'X', confianza: 'ALTA' } }] } });
  });

  it('deja intactos los hechos sin datos', () => {
    expect(compactarHechos(null)).toBeNull();
  });
});
