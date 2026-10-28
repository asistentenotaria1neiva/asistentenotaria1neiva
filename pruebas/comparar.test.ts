import { describe, expect, it } from 'vitest';
import { mismoValor, mismaCatastral, claveMatricula, documentoQueManda } from '@/lib/escritura/comparar';
import { sugerenciasDesdeHechos } from '@/lib/ia/sugerencias';
import type { ResultadoExtraccion } from '@/lib/ia/documentos';

const d = (valor: unknown) => ({ valor, pagina: 1, fragmento: String(valor), confianza: 'ALTA' as const });

describe('comparación sin diferencias de forma', () => {
  it('cédulas con y sin puntos son la misma', () => {
    expect(mismoValor('numero_documento', '1.075.234.567', '1075234567')).toBe(true);
    expect(mismoValor('numero_documento', '1.075.234.567', '1075234568')).toBe(false);
  });

  it('matrículas con ceros a la izquierda o con texto son la misma', () => {
    expect(claveMatricula('No. 200-0012345')).toBe('200-12345');
    expect(mismoValor('matricula', '200-0012345', '200-12345')).toBe(true);
    expect(mismoValor('matricula', '200-12345', '200-12346')).toBe(false);
  });

  it('cédula catastral del certificado y del paz y salvo en formatos distintos', () => {
    expect(mismaCatastral('4100101060000037800130000000000', '010600000378001300000000')).toBe(true);
    expect(mismaCatastral('4100101060000037800130000000000', '010600000037800130000000000')).toBe(true);
    expect(mismaCatastral('41020000000000000004428000000000', '410200000000000004428000000000')).toBe(true);
    expect(mismaCatastral('4100101060000037800130000000000', '010600000379001300000000')).toBe(false);
  });

  it('nombres con los apellidos primero, tildes y mayúsculas', () => {
    expect(mismoValor('nombre', 'PÉREZ GÓMEZ JUAN CARLOS', 'Juan Carlos Perez Gomez')).toBe(true);
    expect(mismoValor('nombre', 'PEREZ GOMEZ JUAN', 'JUAN CARLOS PEREZ GOMEZ')).toBe(false);
    expect(mismoValor('direccion', 'Calle 5 # 10-20', 'CALLE 5 10 20')).toBe(true);
  });

  it('el documento que manda: la cédula para la persona, el certificado para los linderos, el título para las áreas', () => {
    expect(documentoQueManda('persona:123.nombre')).toBe('CEDULA');
    expect(documentoQueManda('inmueble:200-1.linderos')).toBe('CERTIFICADO_TRADICION');
    expect(documentoQueManda('inmueble:200-1.area_terreno')).toBe('ESCRITURA_ANTERIOR');
    expect(documentoQueManda('inmueble:200-1.cedula_catastral')).toBe('CERTIFICADO_TRADICION');
    expect(documentoQueManda('persona:123.estado_civil')).toBeNull();
  });
});

describe('sugerencias del certificado y de la escritura anterior', () => {
  it('certificado: linderos, áreas y titulares actuales', () => {
    const r: ResultadoExtraccion = { tipo_detectado: 'CERTIFICADO_TRADICION', legible: true, observaciones: [], datos: {
      matricula: d('200-54708'), linderos: d('NORTE: con lote 4'), area_terreno: d(72),
      propietarios: [{ nombre: d('PRUEBA ROJAS ANA'), documento: d('C.C. 1.075.000.111'), porcentaje: d(null) }],
    } };
    const s = sugerenciasDesdeHechos('CERTIFICADO_TRADICION', r);
    const por = (c: string) => s.find((x) => x.campo === c)?.valor;
    expect(por('inmueble:200-54708.linderos')).toBe('NORTE: con lote 4');
    expect(por('inmueble:200-54708.area_terreno')).toBe(72);
    expect(por('persona:1075000111.nombre')).toBe('PRUEBA ROJAS ANA');
  });

  it('escritura con varios inmuebles: los datos de cada uno por su matrícula', () => {
    const r: ResultadoExtraccion = { tipo_detectado: 'ESCRITURA_ANTERIOR', legible: true, observaciones: [], datos: { inmuebles: [
      { matricula: d('200-1'), linderos: d('Lote 1: NORTE…'), area_terreno: d(100), cedula_catastral: d(null), area_construida: d(null) },
      { matricula: d('200-2'), linderos: d('Lote 2: NORTE…'), area_terreno: d(null), cedula_catastral: d(null), area_construida: d(null) },
      { matricula: d(null), cedula_catastral: d('41001010100000001'), linderos: d('Mayor extensión…'), area_terreno: d(null), area_construida: d(null) },
    ] } };
    const s = sugerenciasDesdeHechos('ESCRITURA_ANTERIOR', r);
    expect(s.map((x) => x.campo)).toEqual(['inmueble:200-1.linderos', 'inmueble:200-1.area_terreno', 'inmueble:200-2.linderos', 'catastral:41001010100000001.linderos']);
  });
});
