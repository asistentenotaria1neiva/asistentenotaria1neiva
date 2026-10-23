import { describe, expect, it } from 'vitest';
import { datosFaltantes, rutaDesdeError, rutaDesdeCampo, convertirRespuesta, resolverRuta, validarValor } from '@/lib/escritura/rutas';
import { datosVacios, type DatosExpediente, type Persona, type Inmueble } from '@/lib/escritura/tipos';

function expediente(): DatosExpediente {
  const d = datosVacios();
  d.personas = [
    { id: 'v1', tipo_persona: 'NATURAL', nombre: 'JOSE PRUEBA', genero: 'M', tipo_documento: 'CC', numero_documento: '7.708.330', domicilio: 'la ciudad de Neiva (H)' } as Persona,
    { id: 'c1', tipo_persona: 'NATURAL', nombre: 'MARIA PRUEBA', genero: 'F', tipo_documento: 'CC', numero_documento: '36.184.955', lugar_expedicion: 'Neiva', estado_civil: 'SOLTERO(A), SIN UNION MARITAL DE HECHO', actividad_economica: 'INDEPENDIENTE' } as Persona,
  ];
  d.inmuebles = [{
    id: 'i1', tipo_inmueble: 'LOTE', direccion: 'CALLE 2G NÚMERO 31-19', municipio: 'Neiva', departamento: 'Huila', linderos: 'NORTE: …', matricula: '200-54708', orip: 'NEIVA - HUILA',
    cedula_catastral: '410010107000001020010000000000', fecha_certificado_tradicion: '2026-08-18',
    tradicion: { modo: 'COMPRA', tradente: 'ORGANIZACION POPULAR DE VIVIENDA LOS ANGELES', escritura_numero: '1014', escritura_fecha: '2016-05-05', notaria: 'la Notaria Quinta de Neiva' },
  } as Inmueble];
  return d;
}

describe('asistente: datos que faltan', () => {
  it('pregunta lo obligatorio del acto y no los datos de la terminación', () => {
    const f = datosFaltantes(expediente(), ['compraventa']);
    const rutas = f.map((x) => x.ruta);
    expect(rutas).toContain('acto:compraventa.vendedores');
    expect(rutas).toContain('acto:compraventa.precio');
    expect(f.find((x) => x.ruta === 'acto:compraventa.precio')!.obligatorio).toBe(true);
    expect(rutas.some((r) => /^escritura\.(numero|fecha_otorgamiento|hojas|derechos|retefuente)$/.test(r))).toBe(false);
  });

  it('pide estado civil, actividad y lugar de expedición solo de quienes comparecen', () => {
    const d = expediente();
    expect(datosFaltantes(d, ['compraventa']).some((x) => x.ruta.startsWith('persona:v1.'))).toBe(false);
    d.actos.compraventa = { vendedores: ['v1'], compradores: ['c1'], inmuebles: ['i1'], precio: 2500000, afectacion: 'NO_APLICA' };
    const f = datosFaltantes(d, ['compraventa']);
    expect(f.map((x) => x.ruta)).toEqual(['persona:v1.estado_civil', 'persona:v1.actividad_economica', 'persona:v1.lugar_expedicion']);
    expect(f.every((x) => !x.obligatorio)).toBe(true);
  });

  it('convierte la ruta de un error de validación en la ruta de campo', () => {
    const d = expediente();
    expect(rutaDesdeError(d, 'personas.1.genero')).toBe('persona:c1.genero');
    expect(rutaDesdeError(d, 'inmuebles.0.tradicion.tradente')).toBe('inmueble:i1.tradicion.tradente');
    expect(rutaDesdeError(d, 'actos.compraventa.precio')).toBe('acto:compraventa.precio');
    expect(rutaDesdeError(d, 'escritura.autoriza')).toBe('escritura.autoriza');
    expect(rutaDesdeError(d, 'personas.9.genero')).toBeNull();
  });
});

describe('asistente: respuestas', () => {
  it('convierte cada respuesta al tipo del campo y la valida', () => {
    const d = expediente();
    const precio = resolverRuta(d, ['compraventa'], 'acto:compraventa.precio')!.campo;
    expect(convertirRespuesta(precio, '$2.500.000')).toBe(2500000);
    const cuota = resolverRuta(d, ['compraventa'], 'acto:compraventa.es_cuota')!.campo;
    expect(convertirRespuesta(cuota, 'false')).toBe(false);
    expect(convertirRespuesta(cuota, '')).toBeUndefined();
    const vendedores = resolverRuta(d, ['compraventa'], 'acto:compraventa.vendedores')!.campo;
    expect(validarValor(vendedores, convertirRespuesta(vendedores, ['v1']), d)).toEqual({ valor: ['v1'] });
    expect(validarValor(vendedores, ['no-existe'], d)).toEqual({ error: 'no son personas registradas' });
  });

  it('no resuelve campos de actos que no están en la escritura', () => {
    expect(resolverRuta(expediente(), ['compraventa'], 'acto:hipoteca.valor')).toBeNull();
  });
});

describe('asistente: corregir desde una observación', () => {
  it('convierte el campo de una observación de las reglas en la ruta de la pregunta', () => {
    expect(rutaDesdeCampo('personas.v1.estado_civil')).toBe('persona:v1.estado_civil');
    expect(rutaDesdeCampo('inmuebles.i1.matricula')).toBe('inmueble:i1.matricula');
    expect(rutaDesdeCampo('actos.compraventa.precio')).toBe('acto:compraventa.precio');
    expect(rutaDesdeCampo('persona:v1.nombre')).toBe('persona:v1.nombre');
    expect(rutaDesdeCampo('texto libre de la IA')).toBeNull();
    expect(resolverRuta(expediente(), ['compraventa'], rutaDesdeCampo('personas.v1.estado_civil')!)?.etiqueta).toBe('JOSE PRUEBA · Estado civil');
  });
});
