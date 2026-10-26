import { describe, expect, it, vi, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('server-only', () => ({}));

describe('carga de documentos en partes', () => {
  beforeAll(() => {
    process.env.RUTA_ALMACENAMIENTO = fs.mkdtempSync(path.join(os.tmpdir(), 'partes-'));
    process.env.CLAVE_MAESTRA ??= crypto.randomBytes(32).toString('base64');
    delete process.env.SUPABASE_URL;
  });

  it('une las partes en orden y las borra', async () => {
    const { guardarParte, unirPartes } = await import('@/lib/almacenamiento');
    const carga = crypto.randomBytes(16).toString('hex');
    const original = crypto.randomBytes(7 * 1024 * 1024 + 123);
    const partes = [original.subarray(0, 3 << 20), original.subarray(3 << 20, 6 << 20), original.subarray(6 << 20)];
    // Llegan en desorden: se unen por índice
    await guardarParte(carga, 2, partes[2]);
    await guardarParte(carga, 0, partes[0]);
    await guardarParte(carga, 1, partes[1]);
    expect((await unirPartes(carga, 3)).equals(original)).toBe(true);
    await expect(unirPartes(carga, 3)).rejects.toThrow();
  });

  it('rechaza rutas de carga no válidas', async () => {
    const { guardarParte } = await import('@/lib/almacenamiento');
    await expect(guardarParte('../../x', 0, Buffer.from('a'))).rejects.toThrow(/no válida/);
  });
});
