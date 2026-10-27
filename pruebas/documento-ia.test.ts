import { describe, expect, it, vi, beforeAll } from 'vitest';

vi.mock('server-only', () => ({}));

const subidas: { nombre: string; tipo: string; vence: number }[] = [];
const borrados: string[] = [];
vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    files = {
      upload: async (p: { file: { name: string; type: string }; expires_in_seconds: number }) => {
        subidas.push({ nombre: p.file.name, tipo: p.file.type, vence: p.expires_in_seconds });
        return { id: 'file_prueba' };
      },
      delete: async (id: string) => { borrados.push(id); },
    };
    static APIError = class extends Error {};
  }
  return { default: Anthropic, toFile: async (_: Buffer, name: string, o: { type: string }) => ({ name, type: o.type }) };
});

const pdf = (mb: number) => Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(Math.round(mb * 1024 * 1024))]);

describe('documento para la IA', () => {
  beforeAll(() => { process.env.ANTHROPIC_API_KEY = 'prueba'; });

  it('un PDF pequeño va dentro de la solicitud y no sube nada', async () => {
    const { prepararDocumento } = await import('@/lib/ia/cliente');
    const d = await prepararDocumento(pdf(1), 'application/pdf', 'Cédula');
    expect(d.bloque).toMatchObject({ type: 'document', source: { type: 'base64', media_type: 'application/pdf' } });
    await d.liberar();
    expect(subidas).toHaveLength(0);
  });

  it('un PDF grande se sube por la Files API con nombre genérico, vence en una hora y se borra al liberar', async () => {
    const { prepararDocumento } = await import('@/lib/ia/cliente');
    const d = await prepararDocumento(pdf(30), 'application/pdf', 'Título anterior');
    expect(subidas).toEqual([{ nombre: 'documento.pdf', tipo: 'application/pdf', vence: 3600 }]);
    expect(d.bloque).toEqual({ type: 'document', source: { type: 'file', file_id: 'file_prueba' }, title: 'Título anterior' });
    await d.liberar();
    expect(borrados).toEqual(['file_prueba']);
  });

  it('lee documentos con esfuerzo medium y revisa con high, salvo que la configuración diga otra cosa', async () => {
    const { configuracionModelo } = await import('@/lib/ia/cliente');
    delete process.env.CLAUDE_ESFUERZO_EXTRACCION;
    delete process.env.CLAUDE_ESFUERZO_REVISION;
    expect(configuracionModelo('EXTRACCION').esfuerzo).toBe('medium');
    expect(configuracionModelo('REVISION').esfuerzo).toBe('high');
    process.env.CLAUDE_ESFUERZO_EXTRACCION = 'high';
    expect(configuracionModelo('EXTRACCION').esfuerzo).toBe('high');
    delete process.env.CLAUDE_ESFUERZO_EXTRACCION;
  });
});
