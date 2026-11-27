/**
 * Equipos que vuelven a pedir permiso tras el paso de Vercel al servidor local. El equipo se identifica
 * con una cookie, y el navegador guarda las cookies por dirección: en https://servidor no envía la que
 * recibió en el dominio de Vercel. Para la aplicación es un equipo nuevo, y queda PENDIENTE.
 *
 * Este script reconoce cada equipo PENDIENTE cuya huella de navegador es idéntica a la de UN solo
 * equipo APROBADO: pasa al aprobado el token del registro nuevo (ese navegador queda autorizado con el
 * nombre e historial de siempre), borra el registro nuevo y lo deja en la auditoría (EQUIPO_RECONOCIDO).
 * No aprueba nada que no estuviera aprobado. Sin --confirmar solo muestra lo que haría.
 *
 *   --exportar <archivo.json>  guarda los equipos PENDIENTES (antes de volver a copiar la base de Supabase)
 *   --importar <archivo.json>  los vuelve a crear (después de copiarla), si su token no existe ya
 *
 * Uso: npx tsx --tsconfig tsconfig.scripts.json --env-file=.env scripts/reconocer-equipos.ts [--exportar f | --importar f] [--confirmar]
 */
import fs from 'node:fs/promises';
import { db } from '../src/lib/db';
import { auditar } from '../src/lib/auditoria';

const confirmar = process.argv.includes('--confirmar');
const arg = (n: string) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const QUIEN = 'reconocer-equipos (script del administrador)';

async function exportar(archivo: string) {
  const pendientes = await db.dispositivo.findMany({ where: { estado: 'PENDIENTE' } });
  await fs.writeFile(archivo, JSON.stringify(pendientes, null, 2));
  console.log(`Exportados ${pendientes.length} equipo(s) pendiente(s) a ${archivo}.`);
}

async function importar(archivo: string) {
  const filas = JSON.parse(await fs.readFile(archivo, 'utf8')) as Array<{ id: string; nombre: string; tokenHash: string; huella: string | null; ipRegistro: string | null; agenteUsuario: string | null; creadoEn: string }>;
  for (const f of filas) {
    if (await db.dispositivo.findUnique({ where: { tokenHash: f.tokenHash } })) { console.log(`  ya existe: ${f.nombre}`); continue; }
    console.log(`  ${confirmar ? 'importado' : 'se importaría'}: ${f.nombre}`);
    if (confirmar) await db.dispositivo.create({ data: { id: f.id, nombre: f.nombre, tokenHash: f.tokenHash, huella: f.huella, ipRegistro: f.ipRegistro, agenteUsuario: f.agenteUsuario, creadoEn: new Date(f.creadoEn), estado: 'PENDIENTE' } });
  }
}

async function reconocer() {
  const pendientes = await db.dispositivo.findMany({ where: { estado: 'PENDIENTE', huella: { not: null } } });
  let reconocidos = 0;
  for (const p of pendientes) {
    const iguales = await db.dispositivo.findMany({ where: { estado: 'APROBADO', huella: p.huella } });
    if (iguales.length !== 1) {
      console.log(`  ${p.nombre}: ${iguales.length ? `${iguales.length} aprobados con la misma huella (ambiguo)` : 'ningún aprobado con la misma huella'}; queda pendiente para el administrador.`);
      continue;
    }
    const a = iguales[0];
    console.log(`  ${p.nombre} (${p.ipRegistro}) = ${a.nombre}${confirmar ? ': reconocido.' : ': se reconocería.'}`);
    if (!confirmar) continue;
    await db.$transaction([
      db.dispositivo.delete({ where: { id: p.id } }),
      db.dispositivo.update({ where: { id: a.id }, data: { tokenHash: p.tokenHash } }),
    ]);
    await auditar({
      accion: 'EQUIPO_RECONOCIDO', usuarioNombre: QUIEN, ip: '127.0.0.1', entidad: 'dispositivo', entidadId: a.id,
      detalle: { nombre: a.nombre, registroNuevo: p.nombre, ipRegistro: p.ipRegistro, motivo: 'Mismo navegador (huella idéntica) registrado de nuevo al cambiar de Vercel a https://servidor' },
    });
    reconocidos++;
  }
  console.log(confirmar ? `Reconocidos ${reconocidos} equipo(s).` : 'Nada cambiado. Ejecute de nuevo con --confirmar.');
}

async function principal() {
  const exp = arg('--exportar'), imp = arg('--importar');
  if (exp) return exportar(exp);
  if (imp) await importar(imp);
  await reconocer();
}

principal().finally(() => db.$disconnect());
