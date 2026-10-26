import { describe, expect, it, vi, beforeAll } from 'vitest';
import crypto from 'node:crypto';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {} }));

describe('firma de las etapas encadenadas (/api/tareas)', () => {
  beforeAll(() => { process.env.CLAVE_FIRMA ??= crypto.randomBytes(32).toString('base64'); });

  it('acepta solo la firma del mismo análisis y turno', async () => {
    const { firmaValida } = await import('@/lib/servicios/tareas');
    const { huellaToken } = await import('@/lib/seguridad/cifrado');
    const firma = huellaToken('tarea:abc:3');
    expect(firmaValida('abc', 3, firma)).toBe(true);
    expect(firmaValida('abc', 4, firma)).toBe(false);
    expect(firmaValida('otro', 3, firma)).toBe(false);
    expect(firmaValida('abc', 3, 'x')).toBe(false);
  });
});
