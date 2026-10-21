import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { evaluarReglas, nombresCoinciden, type DocumentoAnalizado, type EntradaReglas } from '@/lib/reglas/reglas';
import type { DatosExpediente } from '@/lib/escritura/tipos';
import type { ResultadoExtraccion } from '@/lib/ia/documentos';

const casos = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'datos_prueba', 'casos.json'), 'utf8')).casos as
  { clave: string; actos: string[]; datos: DatosExpediente }[];
const clonar = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const caso = (clave: string) => clonar(casos.find((c) => c.clave === clave)!);
const HOY = new Date(2026, 9, 19); // 19 de octubre de 2026

const d = (valor: unknown, pagina = 1, fragmento = String(valor)) => ({ valor, pagina, fragmento, confianza: 'ALTA' as const });

/** Certificado de tradición coherente con el caso "compraventa_simple" */
function certificado(opc: { documento?: string; nombre?: string; anotaciones?: { tipo: string; numero: string; especificacion: string }[]; fecha?: string } = {}): DocumentoAnalizado {
  const hechos: ResultadoExtraccion = {
    tipo_detectado: 'CERTIFICADO_TRADICION', legible: true, observaciones: [],
    datos: {
      matricula: d('200-999001'), fecha_impresion: d(opc.fecha ?? '2026-10-06'), circulo_registral: d('NEIVA'),
      cedula_catastral: d('410010199000009990001000000000'), direccion: d('CARRERA 99 # 1A SUR 01'), municipio: d('NEIVA'),
      tipo_predio: d('URBANO'), area: d(null),
      propietarios: [{ nombre: d(opc.nombre ?? 'PRUEBA ROJAS ANA LUCIA'), documento: d(opc.documento ?? '1075000111'), porcentaje: d(null) }],
      anotaciones_vigentes: (opc.anotaciones ?? []).map((a) => ({ numero: d(a.numero), fecha: d('2024-02-07'), especificacion: d(a.especificacion), tipo: a.tipo, a_favor_de: d(null), documento_origen: d(null) })),
      ultima_adquisicion: { modo: d('COMPRAVENTA'), de: d('PEDRO PABLO EJEMPLO SALAS'), a: d('ANA LUCIA PRUEBA ROJAS'), escritura_numero: d('234'), escritura_fecha: d('2024-02-07'), notaria: d('NOTARIA PRIMERA DE NEIVA'), anotacion: d('009') },
    },
  };
  return { id: 'doc-cert', nombre: 'certificado.pdf', tipo: 'CERTIFICADO_TRADICION', hechos };
}

function entrada(clave: string, documentos: DocumentoAnalizado[] = [], ajustar?: (dx: DatosExpediente) => void): EntradaReglas {
  const c = caso(clave);
  ajustar?.(c.datos);
  return { datos: c.datos, actos: c.actos, documentos, hoy: HOY };
}
const codigos = (e: EntradaReglas) => evaluarReglas(e).map((h) => `${h.nivel}:${h.codigo}`);

describe('ejemplos del pliego (sección 6.4)', () => {
  it('CRÍTICA: la cédula del vendedor no coincide con la del certificado de tradición', () => {
    const h = evaluarReglas(entrada('compraventa_simple', [certificado({ documento: '1075000999' })]));
    const x = h.find((o) => o.codigo === 'R03-TITULAR-DOCUMENTO')!;
    expect(x.nivel).toBe('CRITICA');
    expect(x.mensaje).toContain('ANA LUCIA PRUEBA ROJAS');
    expect(x.evidencia?.documento).toBe('certificado.pdf');
  });

  it('ADVERTENCIA: hipoteca vigente en el certificado no mencionada en el formulario', () => {
    const h = evaluarReglas(entrada('compraventa_simple', [certificado({ anotaciones: [{ tipo: 'HIPOTECA', numero: '010', especificacion: 'HIPOTECA ABIERTA' }] })]));
    expect(h.find((o) => o.codigo === 'R03-GRAVAMEN-VIGENTE')?.nivel).toBe('ADVERTENCIA');
  });

  it('INFORMATIVA: el paz y salvo predial vence en 5 días', () => {
    const e = entrada('compraventa_simple', [certificado()], (dx) => { dx.inmuebles[0].paz_salvo!.vigencia_hasta = '2026-10-24'; });
    const x = evaluarReglas(e).find((o) => o.codigo === 'R04-PAZ-SALVO-POR-VENCER')!;
    expect(x.nivel).toBe('INFORMATIVA');
    expect(x.mensaje).toContain('5 día(s)');
  });
});

describe('cruces con el certificado de tradición', () => {
  it('caso coherente: sin observaciones críticas', () => {
    expect(codigos(entrada('compraventa_simple', [certificado()])).filter((c) => c.startsWith('CRITICA'))).toEqual([]);
  });
  it('el nombre inscrito en otro orden no es una discrepancia', () => {
    expect(nombresCoinciden('PRUEBA ROJAS ANA LUCIA', 'ANA LUCIA PRUEBA ROJAS')).toBe(true);
    expect(nombresCoinciden('MARIA DE LOS ANGELES DIAZ', 'MARIA ANGELES DIAZ')).toBe(true);
    expect(nombresCoinciden('ANA LUCIA PRUEBA', 'ANA MARIA PRUEBA')).toBe(false);
  });
  it('vendedor que no es titular inscrito', () => {
    expect(codigos(entrada('compraventa_simple', [certificado({ documento: '999', nombre: 'OTRA PERSONA DISTINTA' })]))).toContain('CRITICA:R03-TITULAR');
  });
  it('embargo vigente bloquea la compraventa', () => {
    expect(codigos(entrada('compraventa_simple', [certificado({ anotaciones: [{ tipo: 'EMBARGO', numero: '012', especificacion: 'EMBARGO EJECUTIVO' }] })]))).toContain('CRITICA:R03-LIMITACION-VIGENTE');
  });
  it('la hipoteca no se advierte si la misma escritura la cancela', () => {
    const e = entrada('compraventa_simple', [certificado({ anotaciones: [{ tipo: 'HIPOTECA', numero: '010', especificacion: 'HIPOTECA' }] })]);
    e.actos = ['cancelacion_hipoteca', 'compraventa'];
    expect(codigos(e)).not.toContain('ADVERTENCIA:R03-GRAVAMEN-VIGENTE');
  });
  it('certificado antiguo y fecha distinta a la del formulario', () => {
    const c = codigos(entrada('compraventa_simple', [certificado({ fecha: '2026-08-01' })]));
    expect(c).toContain('ADVERTENCIA:R03-CERT-ANTIGUO');
    expect(c).toContain('ADVERTENCIA:R03-CERT-FECHA');
  });
  it('matrícula del formulario distinta a la del certificado', () => {
    const e = entrada('compraventa_simple', [certificado()], (dx) => { dx.inmuebles[0].matricula = '200-999777'; });
    expect(codigos(e)).toContain('CRITICA:R03-MATRICULA');
  });
  it('sin certificado cargado', () => {
    expect(codigos(entrada('compraventa_simple'))).toContain('ADVERTENCIA:R03-SIN-CERTIFICADO');
  });
});

describe('reglas contra el error humano', () => {
  it('NIT con dígito de verificación errado', () => {
    const e = entrada('cancelacion_hipoteca_banco', [], (dx) => { dx.personas[0].numero_documento = '860.002.964-5'; });
    expect(codigos(e)).toContain('CRITICA:R01-DOCUMENTO');
  });
  it('dos personas con el mismo documento', () => {
    const e = entrada('compraventa_simple', [], (dx) => { dx.personas[1].numero_documento = dx.personas[0].numero_documento; });
    expect(codigos(e)).toContain('CRITICA:R01-DUPLICADO');
  });
  it('cédula catastral con un dígito de menos', () => {
    const e = entrada('compraventa_simple', [], (dx) => { dx.inmuebles[0].cedula_catastral = '4100101990000099900010000000'; });
    expect(codigos(e)).toContain('CRITICA:R02-CATASTRAL');
  });
  it('paz y salvo vencido', () => {
    const e = entrada('compraventa_simple', [], (dx) => { dx.inmuebles[0].paz_salvo!.vigencia_hasta = '2026-10-01'; });
    expect(codigos(e)).toContain('CRITICA:R04-PAZ-SALVO-VENCIDO');
  });
  it('comprador casado sin decisión de afectación', () => {
    const e = entrada('compraventa_simple', [], (dx) => { dx.personas[1].estado_civil = 'CASADO(A), CON SOCIEDAD CONYUGAL VIGENTE'; });
    expect(codigos(e)).toContain('CRITICA:R05-AFECTACION');
  });
  it('precio inferior al avalúo catastral', () => {
    const e = entrada('compraventa_simple', [], (dx) => { dx.actos.compraventa.precio = 20_000_000; });
    expect(codigos(e)).toContain('ADVERTENCIA:R05-PRECIO-AVALUO');
  });
  it('condición resolutoria cuyo plazo aún no se cumple', () => {
    const e = entrada('tres_actos', [], (dx) => { dx.inmuebles[0].tradicion.escritura_fecha = '2025-03-26'; });
    expect(codigos(e)).toContain('CRITICA:R06-PLAZO-CONDICION');
  });
  it('condición resolutoria vencida no genera alerta de plazo', () => {
    expect(codigos(entrada('tres_actos'))).not.toContain('CRITICA:R06-PLAZO-CONDICION');
  });
  it('cancelación de patrimonio con beneficiario menor', () => {
    const e = entrada('compraventa_simple');
    e.actos = ['cancelacion_patrimonio'];
    e.datos.actos.cancelacion_patrimonio = { propietario_id: 'p1', inmueble_id: 'i1', hijos: [{ nombre: 'HIJO PRUEBA', mayor_de_edad: false }] };
    expect(codigos(e)).toContain('CRITICA:R07-PATRIMONIO-MENORES');
  });
  it('cédula cargada con número distinto al digitado', () => {
    const ced: DocumentoAnalizado = { id: 'c1', nombre: 'cedula.jpg', tipo: 'CEDULA', hechos: { tipo_detectado: 'CEDULA', legible: true, observaciones: [], datos: { numero: d('1.075.000.112'), nombres: d('ANA LUCIA'), apellidos: d('PRUEBA ROJAS'), lugar_expedicion: d('NEIVA') } } };
    expect(codigos(entrada('compraventa_simple', [ced]))).toContain('CRITICA:R08-CEDULA-NUMERO');
  });
  it('apoderado sin poder cargado', () => {
    expect(codigos(entrada('divorcio'))).toContain('ADVERTENCIA:R09-SIN-PODER');
  });
  it('borrador con datos sin diligenciar', () => {
    const e = entrada('compraventa_simple');
    e.borradorTexto = 'Texto «FALTA: a.precio_letras» resto';
    expect(codigos(e)).toContain('CRITICA:R12-BORRADOR-INCOMPLETO');
  });
  it('salida del país: autorización posterior a la mayoría de edad y otorgante que no es padre', () => {
    const rc: DocumentoAnalizado = { id: 'rc', nombre: 'registro.pdf', tipo: 'REGISTRO_CIVIL_NACIMIENTO', hechos: { tipo_detectado: 'REGISTRO_CIVIL_NACIMIENTO', legible: true, observaciones: [], datos: { nuip: d('1075809000'), fecha_nacimiento: d('2010-05-01'), padre_documento: d('999'), madre_documento: d('1075000502') } } };
    const c = codigos(entrada('salida_pais', [rc]));
    expect(c).toContain('CRITICA:R10-PATRIA-POTESTAD');
    expect(c).toContain('ADVERTENCIA:R10-MAYORIA-EDAD');
  });
});
