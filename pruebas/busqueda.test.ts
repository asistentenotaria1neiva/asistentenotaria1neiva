import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {} }));
import { faltantesBuscables, convertirHallazgo } from '@/lib/servicios/busqueda';
import { sugerenciasDesdeHechos } from '@/lib/ia/sugerencias';
import { datosFaltantes } from '@/lib/escritura/rutas';
import { CAMPOS_INMUEBLE, CAMPOS_PERSONA } from '@/lib/escritura/esquemas';
import { datosVacios, type Inmueble, type Persona } from '@/lib/escritura/tipos';
import type { ResultadoExtraccion } from '@/lib/ia/documentos';

const campo = (lista: typeof CAMPOS_INMUEBLE, id: string) => lista.find((c) => c.id === id)!;

/** El caso de un lote de una urbanización: certificado sin cédula catastral, paz y salvo en mayor extensión */
function caso() {
  const d = datosVacios();
  d.personas = [
    { id: 'v', tipo_persona: 'NATURAL', nombre: 'ALVARO PRUEBA', genero: 'M', tipo_documento: 'CC', numero_documento: '1.075.000.111', lugar_expedicion: 'NEIVA' } as Persona,
    { id: 'c', tipo_persona: 'NATURAL', nombre: 'LUZ EJEMPLO', genero: 'F', tipo_documento: 'CC', numero_documento: '1.076.000.222', lugar_expedicion: 'ALGECIRAS' } as Persona,
  ];
  d.inmuebles = [
    { id: 'i9', tipo_inmueble: 'LOTE', direccion: 'CL 1 B BIS SUR # 12 - 04', municipio: 'ALGECIRAS', departamento: 'Huila', linderos: '', matricula: '200-301776', orip: 'NEIVA - HUILA', cedula_catastral: '', fecha_certificado_tradicion: '2026-10-13', tradicion: { modo: 'COMPRA', tradente: 'MEDINA PRUEBA', escritura_numero: '3549', escritura_fecha: '2025-11-05', notaria: 'la Notaria Primera de Neiva' } } as Inmueble,
    { id: 'i3', tipo_inmueble: 'LOTE', direccion: '', municipio: 'Neiva', departamento: 'Huila', linderos: '', matricula: '200-301770', orip: 'NEIVA - HUILA', cedula_catastral: '', fecha_certificado_tradicion: '', tradicion: { modo: 'COMPRA', tradente: '', escritura_numero: '', escritura_fecha: '', notaria: '' } } as Inmueble,
  ];
  return d;
}

describe('cédula catastral mal contada', () => {
  it('si la IA quitó mal los guiones, se toman los dígitos del fragmento', () => {
    const r: ResultadoExtraccion = { tipo_detectado: 'PAZ_Y_SALVO', legible: true, observaciones: [], datos: {
      cedula_catastral: { valor: '41020000000000000004428000000000', pagina: 1, fragmento: 'NUMERO CATASTRAL:41-020-00-00-00-00-0000-4428-0-00-00-0000', confianza: 'MEDIA' },
    } };
    const s = sugerenciasDesdeHechos('PAZ_Y_SALVO', r);
    const ps = s.find((x) => x.campo.endsWith('.cedula_catastral_paz_salvo'))!;
    expect(ps.valor).toBe('410200000000000004428000000000');
    expect(ps.campo).toBe('catastral:410200000000000004428000000000.cedula_catastral_paz_salvo');
    expect(ps.revisionManual).toBe(false);
  });
});

describe('preguntas solo de los inmuebles de la escritura', () => {
  it('un inmueble que no está en el acto no genera preguntas', () => {
    const d = caso();
    d.actos.compraventa = { vendedores: ['v'], compradores: ['c'], inmuebles: ['i9'], precio: 3000000 };
    const rutas = datosFaltantes(d, ['compraventa']).map((x) => x.ruta);
    expect(rutas.some((r) => r.startsWith('inmueble:i3.'))).toBe(false);
    expect(rutas).toContain('inmueble:i9.linderos');
  });
});

describe('búsqueda dirigida en los documentos', () => {
  it('busca lo vacío del inmueble del acto y lo que la escritura menciona del compareciente', () => {
    const d = caso();
    d.actos.compraventa = { vendedores: ['v'], compradores: ['c'], inmuebles: ['i9'] };
    const f = faltantesBuscables(d);
    const del = (ref: string) => f.filter((x) => x.ref === ref).map((x) => x.campo.id);
    expect(del('200-301776')).toEqual(expect.arrayContaining(['linderos', 'cedula_catastral', 'area_terreno', 'paz_salvo.avaluo']));
    expect(del('200-301776')).not.toContain('tradicion.tradente');
    expect(del('200-301770')).toEqual([]);
    expect(del('1075000111')).toEqual(['estado_civil', 'actividad_economica']);
    expect(f.every((x, i) => x.clave === `f${i + 1}`)).toBe(true);
  });

  it('convierte lo encontrado al tipo de cada campo', () => {
    const h = (valor: string, fragmento = valor) => ({ valor, fragmento, confianza: 'ALTA' as const });
    expect(convertirHallazgo(campo(CAMPOS_INMUEBLE, 'area_terreno'), h('115.28 m2'))).toBe(115.28);
    expect(convertirHallazgo(campo(CAMPOS_INMUEBLE, 'paz_salvo.avaluo'), h('$253.000'))).toBe(253000);
    expect(convertirHallazgo(campo(CAMPOS_INMUEBLE, 'involucrada_mayor_extension'), h('true'))).toBe(true);
    expect(convertirHallazgo(campo(CAMPOS_INMUEBLE, 'cedula_catastral'), h('41-020-00-00-00-00-0000-4428-0-00-00-0000'))).toBe('410200000000000004428000000000');
    expect(convertirHallazgo(campo(CAMPOS_PERSONA, 'estado_civil'), h('SOLTERO(A), SIN UNION MARITAL DE HECHO'))).toBe('SOLTERO(A), SIN UNION MARITAL DE HECHO');
    expect(convertirHallazgo(campo(CAMPOS_PERSONA, 'estado_civil'), h('soltero'))).toBeNull();
    expect(convertirHallazgo(campo(CAMPOS_INMUEBLE, 'fecha_certificado_tradicion'), h('13/10/2026'))).toBeNull();
  });
});

describe('búsqueda de los datos de un acto por plantilla', () => {
  it('busca las variables vacías y visibles de la plantilla, primero que las demás', async () => {
    const { ESQUEMAS } = await import('@/lib/escritura/esquemas');
    ESQUEMAS.cancelacion_hipoteca_prueba = {
      tipo: 'cancelacion_hipoteca_prueba', version: 1, titulo: 'Cancelación de hipoteca', plantillaFuente: 'prueba', porPlantilla: { plantillaId: 'x', version: 1 },
      pasos: [{ id: 'cancelacion_hipoteca_prueba', titulo: 'Cancelación', campos: [
        { id: 'numero_escritura_hipoteca', etiqueta: 'Numero escritura hipoteca', tipo: 'texto', obligatorio: true, ayuda: 'Va en la escritura así: …escritura pública número {{numero_escritura_hipoteca}} del…' },
        { id: 'acreedor', etiqueta: 'Acreedor', tipo: 'texto', obligatorio: true },
        { id: 'hay_apoderado', etiqueta: '¿Hay apoderado?', tipo: 'booleano' },
        { id: 'nombre_apoderado', etiqueta: 'Nombre apoderado', tipo: 'texto', obligatorio: true, visibleSi: { campo: 'hay_apoderado', valores: [true, 'true'] } },
        { id: 'inmueble.matricula_2', etiqueta: 'Inmueble matricula 2', tipo: 'texto', obligatorio: true },
      ] }],
      documentosSoporte: [], reglas: [],
    };
    try {
      const d = caso();
      d.actos.cancelacion_hipoteca_prueba = { acreedor: 'BANCO PRUEBA' };
      const f = faltantesBuscables(d, ['cancelacion_hipoteca_prueba']);
      const delActo = f.filter((x) => x.entidad === 'acto').map((x) => x.campo.id);
      expect(delActo).toEqual(['numero_escritura_hipoteca', 'hay_apoderado', 'inmueble.matricula_2']);
      expect(f[0].entidad).toBe('acto');
      expect(f[0].campo.ayuda).toContain('{{numero_escritura_hipoteca}}');
      // Solo el acto recién confirmado: sin personas ni inmuebles
      expect(faltantesBuscables(d, ['cancelacion_hipoteca_prueba'], { soloActos: ['cancelacion_hipoteca_prueba'] }).every((x) => x.entidad === 'acto')).toBe(true);
      // La compraventa (formulario propio) no tiene variables que buscar
      d.actos.compraventa = { vendedores: ['v'], compradores: ['c'], inmuebles: ['i9'] };
      expect(faltantesBuscables(d, ['compraventa']).some((x) => x.entidad === 'acto')).toBe(false);
    } finally {
      delete ESQUEMAS.cancelacion_hipoteca_prueba;
    }
  });
});

describe('acto por plantilla: solo el inmueble y las personas que el acto menciona', () => {
  it('no busca ni pregunta por los de una escritura de otro caso, y pide la tradición de quien vende', async () => {
    const { ESQUEMAS } = await import('@/lib/escritura/esquemas');
    const { mencionadosEnActos, quienesEnajenan } = await import('@/lib/escritura/relevantes');
    ESQUEMAS.cuota_prueba = {
      tipo: 'cuota_prueba', version: 1, titulo: 'Compraventa de cuota', plantillaFuente: 'prueba', porPlantilla: { plantillaId: 'x', version: 1 },
      pasos: [{ id: 'cuota_prueba', titulo: 'Cuota', campos: [
        { id: 'nombre_vendedor', etiqueta: 'Nombre vendedor', tipo: 'texto', obligatorio: true },
        { id: 'matricula_inmobiliaria', etiqueta: 'Matricula', tipo: 'texto', obligatorio: true },
        { id: 'titulo_adquisicion', etiqueta: 'Titulo', tipo: 'texto', obligatorio: true },
      ] }],
      documentosSoporte: [], reglas: [],
    };
    try {
      const d = caso();
      d.actos.cuota_prueba = { nombre_vendedor: 'ALVARO PRUEBA', matricula_inmobiliaria: '200-301776' };
      const m = mencionadosEnActos(d, ['cuota_prueba']);
      expect([...m.inmuebles]).toEqual(['i9']);
      expect([...m.personas]).toEqual(['v']);
      expect(quienesEnajenan(d, ['cuota_prueba'])).toEqual(['ALVARO PRUEBA']);
      const f = faltantesBuscables(d, ['cuota_prueba']);
      expect(f.some((x) => x.ref === '200-301770')).toBe(false);
      expect(f.some((x) => x.ref === '1076000222')).toBe(false);
      expect(datosFaltantes(d, ['cuota_prueba']).some((x) => x.ruta.startsWith('inmueble:i3.') || x.ruta.startsWith('persona:c.'))).toBe(false);
      d.inmuebles[0].linderos = '';
      d.inmuebles[0].tradicion.tradente = '';
      expect(f.find((x) => x.campo.id === 'titulo_adquisicion')?.entidad).toBe('acto');
      expect(faltantesBuscables(d, ['cuota_prueba']).find((x) => x.campo.id === 'tradicion.tradente')?.de).toContain('Adquisición de: ALVARO PRUEBA');
    } finally {
      delete ESQUEMAS.cuota_prueba;
    }
  });
});
