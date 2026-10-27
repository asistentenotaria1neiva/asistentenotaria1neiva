import { describe, expect, it } from 'vitest';
import { sugerenciasDesdeHechos } from '@/lib/ia/sugerencias';
import type { ResultadoExtraccion } from '@/lib/ia/documentos';

const d = (valor: unknown, confianza: 'ALTA' | 'MEDIA' | 'BAJA' = 'ALTA') => ({ valor, pagina: 1, fragmento: String(valor), confianza });

describe('sugerencias desde documentos', () => {
  it('cédula: nombre en mayúsculas, número normalizado y fuente conservada', () => {
    const r: ResultadoExtraccion = { tipo_detectado: 'CEDULA', legible: true, observaciones: [], datos: { numero: d('1075000111'), nombres: d('Ana Lucía'), apellidos: d('Prueba Rojas'), lugar_expedicion: d('NEIVA'), sexo: d('F') } };
    const s = sugerenciasDesdeHechos('CEDULA', r);
    const por = (c: string) => s.find((x) => x.campo === c)!;
    expect(por('persona:1075000111.nombre').valor).toBe('ANA LUCÍA PRUEBA ROJAS');
    expect(por('persona:1075000111.numero_documento').valor).toBe('1.075.000.111');
    expect(por('persona:1075000111.genero').valor).toBe('F');
    expect(por('persona:1075000111.numero_documento').pagina).toBe(1);
    expect(s.every((x) => !x.revisionManual)).toBe(true);
  });

  it('varias cédulas en un mismo PDF: una persona por cada una', () => {
    const r: ResultadoExtraccion = { tipo_detectado: 'CEDULA', legible: true, observaciones: [], datos: { cedulas: [
      { numero: d('1075000111'), nombres: d('ANA'), apellidos: d('PRUEBA') },
      { numero: d('1075000222'), nombres: d('LUIS'), apellidos: d('EJEMPLO') },
      { numero: d('1075000333'), nombres: d('MARTA'), apellidos: d('FICTICIA') },
    ] } };
    const s = sugerenciasDesdeHechos('CEDULA', r);
    expect(s.filter((x) => x.campo.endsWith('.numero_documento')).map((x) => x.valor)).toEqual(['1.075.000.111', '1.075.000.222', '1.075.000.333']);
    expect(s.find((x) => x.campo === 'persona:1075000222.nombre')!.valor).toBe('LUIS EJEMPLO');
  });

  it('confianza baja → revisión manual (la IA no adivina)', () => {
    const r: ResultadoExtraccion = { tipo_detectado: 'CEDULA', legible: true, observaciones: [], datos: { numero: d('1075000111', 'BAJA'), nombres: d('ANA'), apellidos: d('PRUEBA') } };
    const s = sugerenciasDesdeHechos('CEDULA', r).find((x) => x.campo.endsWith('numero_documento'))!;
    expect(s.revisionManual).toBe(true);
    expect(s.motivoRevision).toContain('Confianza baja');
  });

  it('valor que no pasa la validación de formato → revisión manual', () => {
    const r: ResultadoExtraccion = { tipo_detectado: 'CERTIFICADO_TRADICION', legible: true, observaciones: [], datos: { matricula: d('200-999001'), cedula_catastral: d('41001019900000999000100000') } };
    const s = sugerenciasDesdeHechos('CERTIFICADO_TRADICION', r).find((x) => x.campo.endsWith('.cedula_catastral'))!;
    expect(s.revisionManual).toBe(true);
    expect(s.motivoRevision).toContain('dígitos');
  });

  it('documento ilegible → todas las sugerencias a revisión', () => {
    const r: ResultadoExtraccion = { tipo_detectado: 'PAZ_Y_SALVO', legible: false, observaciones: ['borroso'], datos: { cedula_catastral: d('0199000009990001000000000'), vigencia_hasta: d('2026-12-31'), avaluo: d(35260000) } };
    expect(sugerenciasDesdeHechos('PAZ_Y_SALVO', r).every((x) => x.revisionManual)).toBe(true);
  });

  it('registro civil: calcula si es menor de edad', () => {
    const r: ResultadoExtraccion = { tipo_detectado: 'REGISTRO_CIVIL_NACIMIENTO', legible: true, observaciones: [], datos: { nuip: d('1075809000'), nombre: d('VALENTINA PRUEBA'), fecha_nacimiento: d('2015-05-01'), sexo: d('FEMENINO') } };
    const s = sugerenciasDesdeHechos('REGISTRO_CIVIL_NACIMIENTO', r, new Date(2026, 9, 19));
    expect(s.find((x) => x.campo.endsWith('menor_de_edad'))!.valor).toBe(true);
  });
});
