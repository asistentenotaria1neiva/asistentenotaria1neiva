import { describe, expect, it } from 'vitest';
import { TIPOS_DOCUMENTALES, esquemaExtraccion, normalizarExtraccion, type TipoDocumental } from '@/lib/ia/documentos';
import { ESQUEMA_REVISION, ESQUEMA_CORRECCION, ESQUEMA_REVISION_PLANTILLA, ESQUEMA_CORRECCION_PLANTILLA, ESQUEMA_VARIABILIZAR_PLANTILLA, esquemaAsistente } from '@/lib/ia/instrucciones';

/** La API rechaza los esquemas con más de 16 parámetros de tipo unión (["string", "null"] o anyOf) */
const LIMITE_UNIONES = 16;

function uniones(e: unknown): number {
  if (!e || typeof e !== 'object') return 0;
  const o = e as Record<string, unknown>;
  const propia = Array.isArray(o.type) || Array.isArray(o.anyOf) ? 1 : 0;
  return propia + Object.values(o).reduce<number>((n, v) => n + (Array.isArray(v) ? v.reduce<number>((m, x) => m + uniones(x), 0) : uniones(v)), 0);
}

describe('esquemas que se envían a la API de Claude', () => {
  it.each(Object.keys(TIPOS_DOCUMENTALES))('extracción de %s sin campos de tipo unión', (tipo) => {
    expect(uniones(esquemaExtraccion(tipo as TipoDocumental))).toBe(0);
  });

  it('revisión, corrección y asistente dentro del límite de uniones', () => {
    for (const e of [ESQUEMA_REVISION, ESQUEMA_CORRECCION, ESQUEMA_REVISION_PLANTILLA, ESQUEMA_CORRECCION_PLANTILLA, ESQUEMA_VARIABILIZAR_PLANTILLA, esquemaAsistente(['compraventa'])]) {
      expect(uniones(e)).toBeLessThanOrEqual(LIMITE_UNIONES);
    }
  });
});

describe('normalización de la extracción', () => {
  const d = (campo: string, valor: string, indice = 0) => ({ campo, indice, valor, pagina: 1, fragmento: valor, confianza: 'ALTA' });
  const r = (tipo: TipoDocumental, datos: unknown[]) => normalizarExtraccion(tipo, { tipo_detectado: tipo, legible: true, observaciones: [], datos: datos as unknown as Record<string, unknown> });

  it('dato ausente → null; números y booleanos a su tipo', () => {
    const x = r('PAZ_Y_SALVO', [d('tipo', 'PREDIAL'), d('avaluo', '$1.550.000'), d('entidad', '')]);
    expect(x.datos.avaluo).toEqual({ valor: 1550000, pagina: 1, fragmento: '$1.550.000', confianza: 'ALTA' });
    expect(x.datos.numero).toMatchObject({ valor: null, pagina: null, fragmento: null });
    expect(x.datos.entidad).toMatchObject({ valor: null });
  });

  it('listas por índice, objetos anidados, opciones y booleanos', () => {
    const cert = r('CERTIFICADO_TRADICION', [
      d('matricula', '200-54708'), d('propietarios.nombre', 'JOSE', 0), d('propietarios.documento', '7708330', 0), d('propietarios.nombre', 'ANA', 1),
      d('anotaciones_vigentes.tipo', 'HIPOTECA', 0), d('anotaciones_vigentes.numero', '07', 0), d('ultima_adquisicion.escritura_numero', '1014'),
    ]);
    const prop = cert.datos.propietarios as Record<string, { valor: unknown }>[];
    expect(prop.map((p) => p.nombre.valor)).toEqual(['JOSE', 'ANA']);
    expect(prop[1].documento.valor).toBeNull();
    expect((cert.datos.anotaciones_vigentes as Record<string, unknown>[])[0].tipo).toBe('HIPOTECA');
    expect((cert.datos.ultima_adquisicion as Record<string, { valor: unknown }>).escritura_numero.valor).toBe('1014');
    const esc = r('ESCRITURA_ANTERIOR', [d('afecta_vivienda_familiar', 'false'), d('area_terreno', '88,00')]);
    expect(esc.datos.afecta_vivienda_familiar).toMatchObject({ valor: false });
    expect(esc.datos.area_terreno).toMatchObject({ valor: 88 });
  });
});
