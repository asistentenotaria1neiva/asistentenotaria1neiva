/**
 * Emergencia: genera una contraseña temporal nueva para un usuario y la muestra en consola.
 * Uso: npx tsx --tsconfig tsconfig.scripts.json --env-file=.env scripts/_tmp/restablecer-admin.ts <usuario>
 * Sin <usuario> solo lista los usuarios existentes.
 */
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { hashContrasena } from '../../src/lib/seguridad/contrasenas';

const db = new PrismaClient();

async function main() {
  const usuario = (process.argv[2] ?? '').trim().toLowerCase();
  if (!usuario) {
    const todos = await db.usuario.findMany({ select: { usuario: true, nombreCompleto: true, rol: true, estado: true } });
    console.table(todos);
    return;
  }
  const u = await db.usuario.findUnique({ where: { usuario } });
  if (!u) throw new Error(`No existe el usuario «${usuario}».`);
  const base = crypto.randomBytes(12).toString('base64url').replace(/[-_]/g, 'x');
  const temporal = `${base.slice(0, 4).toUpperCase()}${base.slice(4, 10)}${crypto.randomInt(10, 99)}`;
  await db.usuario.update({
    where: { id: u.id },
    data: { hashContrasena: await hashContrasena(temporal), debeCambiarContrasena: true, intentosFallidos: 0, bloqueadoHasta: null },
  });
  console.log(`\nUsuario: ${u.usuario}\nContraseña temporal: ${temporal}\n(Al ingresar le pedirá cambiarla.)\n`);
}

main().catch((e) => { console.error(e.message ?? e); process.exitCode = 1; }).finally(() => db.$disconnect());
