/**
 * Carga los casos FICTICIOS de datos_prueba/casos.json como expedientes, para capacitación.
 * Solo para ambientes de prueba/capacitación, nunca en producción con casos reales.
 *
 * Uso: npm run datos:prueba -- <usuario_digitador>
 */
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/lib/db';
import type { SesionActiva } from '../src/lib/sesion-tipos';
import { crearExpediente, guardarPaso } from '../src/lib/servicios/expedientes';
import { asegurarCatalogo } from '../src/lib/servicios/inicializacion';
import type { DatosExpediente } from '../src/lib/escritura/tipos';

async function principal() {
  if (process.env.NODE_ENV === 'production' && process.env.PERMITIR_DATOS_PRUEBA !== 'true') {
    throw new Error('No se cargan datos de prueba en producción (defina PERMITIR_DATOS_PRUEBA=true solo en un ambiente de capacitación).');
  }
  const usuario = process.argv[2];
  if (!usuario) throw new Error('Indique el usuario digitador: npm run datos:prueba -- <usuario>');
  const u = await db.usuario.findUniqueOrThrow({ where: { usuario } });
  await asegurarCatalogo();
  const s: SesionActiva = { sesionId: 'script', usuario: { id: u.id, usuario: u.usuario, nombre: u.nombreCompleto, rol: u.rol, debeCambiarContrasena: false, totpActivo: u.totpActivo }, dispositivoId: null, remota: false, segundoFactorOk: true, ip: 'script' };
  const { casos } = JSON.parse(fs.readFileSync(path.resolve('datos_prueba/casos.json'), 'utf8')) as { casos: { clave: string; actos: string[]; datos: DatosExpediente }[] };
  for (const c of casos) {
    const id = await crearExpediente(s, c.actos);
    await guardarPaso(s, id, { paso: 'escritura', valor: c.datos.escritura });
    await guardarPaso(s, id, { paso: 'personas', valor: c.datos.personas });
    await guardarPaso(s, id, { paso: 'inmuebles', valor: c.datos.inmuebles });
    for (const a of c.actos) await guardarPaso(s, id, { paso: 'acto', acto: a, valor: c.datos.actos[a] as Record<string, unknown> });
    console.log(`Caso "${c.clave}" cargado (${c.actos.join(' + ')}).`);
  }
  await db.$disconnect();
}

principal().catch((e) => { console.error(e.message); process.exit(1); });
