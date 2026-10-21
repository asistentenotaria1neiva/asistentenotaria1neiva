/**
 * Prueba de integración del flujo completo contra PostgreSQL:
 * crear expediente → diligenciar por pasos → revisión (reglas) → plantillas pendientes bloquean →
 * aprobación de plantillas → borrador Word/PDF → observaciones → revisión → aprobación.
 * Además: documento cifrado en disco, auditoría encadenada e inmodificable.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '@/lib/db';
import type { SesionActiva } from '@/lib/sesion-tipos';
import { asegurarCatalogo } from '@/lib/servicios/inicializacion';
import { crearExpediente, guardarPaso, enviarARevision, aprobarExpediente, devolverExpediente, ErrorNegocio } from '@/lib/servicios/expedientes';
import { ejecutarRevision, resolverObservacion } from '@/lib/servicios/revision';
import { generarBorradorExpediente, descargarBorrador } from '@/lib/servicios/borradores';
import { aprobarPlantilla } from '@/lib/servicios/plantillas';
import { subirDocumento, descargarDocumento } from '@/lib/servicios/documentos';
import { verificarCadena } from '@/lib/auditoria';
import { hashContrasena } from '@/lib/seguridad/contrasenas';
import type { DatosExpediente } from '@/lib/escritura/tipos';

const caso = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'datos_prueba', 'casos.json'), 'utf8')).casos
  .find((c: { clave: string }) => c.clave === 'tres_actos') as { actos: string[]; datos: DatosExpediente };

const sufijo = Date.now().toString(36);
let digitador: SesionActiva, revisor: SesionActiva, admin: SesionActiva;

async function sesion(rol: 'DIGITADOR' | 'REVISOR' | 'ADMINISTRADOR', extra = ''): Promise<SesionActiva> {
  const u = await db.usuario.create({ data: { usuario: `${rol.toLowerCase()}${extra}.${sufijo}`, nombreCompleto: `${rol} DE PRUEBA`, rol, hashContrasena: await hashContrasena('ContrasenaDePrueba123'), debeCambiarContrasena: false } });
  return { sesionId: `s-${u.id}`, usuario: { id: u.id, usuario: u.usuario, nombre: u.nombreCompleto, rol, debeCambiarContrasena: false, totpActivo: rol === 'ADMINISTRADOR' }, dispositivoId: null, remota: false, segundoFactorOk: true, ip: '127.0.0.1' };
}

beforeAll(async () => {
  const r = await asegurarCatalogo();
  expect(r.tipos).toBeGreaterThan(60);
  digitador = await sesion('DIGITADOR');
  revisor = await sesion('REVISOR');
  admin = await sesion('ADMINISTRADOR');
});

describe('flujo completo de una escritura de tres actos', () => {
  let id = '';

  it('crea el expediente y guarda los pasos sin errores', async () => {
    id = await crearExpediente(digitador, caso.actos);
    const e = await db.expediente.findUniqueOrThrow({ where: { id } });
    expect(e.numeroInterno).toMatch(/^EXP-\d{4}-\d{5}$/);
    expect((await guardarPaso(digitador, id, { paso: 'escritura', valor: caso.datos.escritura })).errores).toEqual({});
    expect((await guardarPaso(digitador, id, { paso: 'personas', valor: caso.datos.personas })).errores).toEqual({});
    expect((await guardarPaso(digitador, id, { paso: 'inmuebles', valor: caso.datos.inmuebles })).errores).toEqual({});
    for (const acto of caso.actos) {
      expect((await guardarPaso(digitador, id, { paso: 'acto', acto, valor: caso.datos.actos[acto] as Record<string, unknown> })).errores).toEqual({});
    }
    expect(await db.compareciente.count({ where: { expedienteId: id } })).toBe(4);
  });

  it('el formulario reporta errores de formato y obligatoriedad', async () => {
    const malas = structuredClone(caso.datos.personas);
    malas[0].numero_documento = '12A';
    const r = await guardarPaso(digitador, id, { paso: 'personas', valor: malas });
    expect(Object.keys(r.errores)).toContain('personas.0.numero_documento');
    await guardarPaso(digitador, id, { paso: 'personas', valor: caso.datos.personas });
  });

  it('otro digitador no puede ver el expediente', async () => {
    const otro = await sesion('DIGITADOR', 'otro');
    await expect(guardarPaso(otro, id, { paso: 'escritura', valor: caso.datos.escritura })).rejects.toBeInstanceOf(ErrorNegocio);
  });

  it('la revisión por reglas advierte que faltan los certificados de tradición', async () => {
    const r = await ejecutarRevision(digitador, id, false);
    expect(r.hallazgos).toBeGreaterThan(0);
    const obs = await db.observacion.findMany({ where: { expedienteId: id, estado: 'ABIERTA' } });
    expect(obs.map((o) => o.codigo)).toContain('R03-SIN-CERTIFICADO');
    expect(obs.filter((o) => o.nivel === 'CRITICA')).toEqual([]);
  });

  it('sin plantillas aprobadas no se genera el borrador', async () => {
    await expect(generarBorradorExpediente(digitador, id)).rejects.toThrow(/APROBADA/);
  });

  it('con las plantillas aprobadas genera Word y PDF', async () => {
    for (const tipoId of ['caratula', 'cierre', ...caso.actos]) {
      const p = await db.plantilla.findFirstOrThrow({ where: { tipoId }, orderBy: { version: 'desc' } });
      if (p.estado !== 'APROBADA') await aprobarPlantilla(p.id, admin.usuario.id);
    }
    const r = await generarBorradorExpediente(digitador, id);
    expect(r.borrador.version).toBe(1);
    const docx = await descargarBorrador(digitador, r.borrador.id, 'docx');
    expect(docx.bytes.subarray(0, 2).toString()).toBe('PK');
    if (process.env.PDF_CONVERSOR_URL) {
      expect(r.avisoPdf).toBeUndefined();
      const pdf = await descargarBorrador(digitador, r.borrador.id, 'pdf');
      expect(pdf.bytes.subarray(0, 5).toString()).toBe('%PDF-');
    }
  });

  it('no se envía a revisión con advertencias abiertas; sí después de justificarlas', async () => {
    await expect(enviarARevision(digitador, id)).rejects.toThrow(/advertencia/);
    const abiertas = await db.observacion.findMany({ where: { expedienteId: id, estado: 'ABIERTA', nivel: 'ADVERTENCIA' } });
    for (const o of abiertas) await resolverObservacion(digitador, o.id, 'JUSTIFICADA', 'Los certificados se verificaron en físico en ventanilla.', false);
    await enviarARevision(digitador, id);
    expect((await db.expediente.findUniqueOrThrow({ where: { id } })).estado).toBe('EN_REVISION');
  });

  it('el digitador no aprueba; el revisor devuelve y luego aprueba', async () => {
    await expect(aprobarExpediente(digitador, id)).rejects.toBeInstanceOf(ErrorNegocio);
    await devolverExpediente(revisor, id, 'Verificar el nombre del coadyuvante en la cédula.');
    expect((await db.expediente.findUniqueOrThrow({ where: { id } })).estado).toBe('DEVUELTO');
    expect(await db.correccion.count({ where: { expedienteId: id, categoria: 'REVISION' } })).toBe(1);
    await generarBorradorExpediente(digitador, id);
    await enviarARevision(digitador, id);
    await aprobarExpediente(revisor, id);
    expect((await db.expediente.findUniqueOrThrow({ where: { id } })).estado).toBe('APROBADA');
  });
});

describe('seguridad de datos', () => {
  it('el documento se guarda cifrado y se recupera íntegro', async () => {
    const id = await crearExpediente(digitador, ['compraventa']);
    const contenido = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('CONTENIDO CONFIDENCIAL DE PRUEBA 1.075.000.111'), Buffer.from('\n%%EOF')]);
    const d = await subirDocumento(digitador, id, new File([contenido], 'cedula.pdf', { type: 'application/pdf' }), 'CEDULA');
    const enDisco = fs.readFileSync(path.resolve(process.env.RUTA_ALMACENAMIENTO ?? './almacenamiento', d.rutaCifrada));
    expect(enDisco.includes(Buffer.from('CONFIDENCIAL'))).toBe(false);
    const r = await descargarDocumento(digitador, d.id);
    expect(r.bytes.equals(contenido)).toBe(true);
  });

  it('rechaza archivos que no son PDF ni imagen aunque digan serlo', async () => {
    const id = await crearExpediente(digitador, ['compraventa']);
    await expect(subirDocumento(digitador, id, new File([Buffer.from('MZ ejecutable')], 'cedula.pdf', { type: 'application/pdf' }), 'CEDULA')).rejects.toThrow(/PDF o imágenes/);
  });

  it('la auditoría no se puede modificar ni borrar, y su cadena está íntegra', async () => {
    await expect(db.auditoria.updateMany({ data: { accion: 'ALTERADA' } })).rejects.toThrow();
    await expect(db.auditoria.deleteMany({})).rejects.toThrow();
    const r = await verificarCadena();
    expect(r.integra).toBe(true);
    expect(r.revisados).toBeGreaterThan(10);
  });
});
