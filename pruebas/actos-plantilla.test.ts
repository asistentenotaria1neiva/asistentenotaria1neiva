import { describe, expect, it } from 'vitest';
import { actoDesdePlantilla, CAMPO_INDICACIONES } from '@/lib/escritura/actos-plantilla';
import { ACTOS } from '@/lib/escritura/actos';
import { ESQUEMAS } from '@/lib/escritura/esquemas';
import { prepararContexto } from '@/lib/escritura/contexto';
import { datosVacios } from '@/lib/escritura/tipos';
import { ErrorDatos } from '@/lib/escritura/personas';
import { datosFaltantes } from '@/lib/escritura/rutas';

const tipo = { id: 'cancelacion_afectacion_prueba', nombre: 'Cancelación de afectación (prueba)', categoria: 'A. Actos sobre inmuebles' };

describe('actos por plantilla (la plantilla es el modelo de redacción)', () => {
  const { esquema, acto } = actoDesdePlantilla(tipo, { id: 'p1', version: 2 });
  const campos = esquema.pasos[0].campos;

  it('el formulario no tiene variables: comparecientes, inmuebles e indicaciones para la redacción', () => {
    expect(campos.map((c) => c.id)).toEqual(['comparecientes', 'inmuebles', CAMPO_INDICACIONES]);
    expect(campos.find((c) => c.id === 'comparecientes')).toMatchObject({ tipo: 'personas', obligatorio: true });
    expect(esquema.porPlantilla).toEqual({ plantillaId: 'p1', version: 2 });
    expect(acto.porPlantilla).toBe(true);
    // Un acto que no recae sobre inmuebles no los pide
    const familia = actoDesdePlantilla({ ...tipo, id: 'union_prueba', categoria: 'B. Familia' }, { id: 'p2', version: 1 });
    expect(familia.esquema.pasos[0].campos.map((c) => c.id)).toEqual(['comparecientes', CAMPO_INDICACIONES]);
  });

  it('pide quiénes comparecen y prepara la escritura sin carátula común', () => {
    ESQUEMAS[tipo.id] = esquema;
    ACTOS[tipo.id] = acto;
    try {
      const datos = datosVacios();
      datos.personas = [{ id: 'p1', tipo_persona: 'NATURAL', nombre: 'ANA PRUEBA', genero: 'F', tipo_documento: 'CC', numero_documento: '1075000111' }];
      datos.inmuebles = [{ id: 'i1', matricula: '200-1', direccion: 'Calle 1' } as never];
      expect(datosFaltantes(datos, [tipo.id]).map((f) => f.ruta)).toContain(`acto:${tipo.id}.comparecientes`);
      expect(() => prepararContexto(datos, [tipo.id])).toThrow(ErrorDatos);
      datos.actos[tipo.id] = { comparecientes: ['p1'], inmuebles: ['i1'] };
      const ctx = prepararContexto(datos, [tipo.id]);
      expect(ctx.conCaratula).toBe(false);
      expect(ctx.actos[0].plantilla).toBe(tipo.id);
      expect(JSON.stringify(ctx.global)).toContain('ANA PRUEBA');
    } finally {
      delete ESQUEMAS[tipo.id];
      delete ACTOS[tipo.id];
    }
  });
});
