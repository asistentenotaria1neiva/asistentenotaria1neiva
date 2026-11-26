/**
 * Limpieza automática del almacenamiento (Supabase gratis: 1 GB). Corre sola, como máximo una vez
 * cada 6 horas, después de responder una consulta de notificaciones (api/notificaciones), y también a
 * mano con scripts/liberar-espacio.ts. Tres reglas, configurables con variables de entorno:
 *
 *   1. LIMPIEZA_ESCRITURAS_DIAS (30): las escrituras creadas hace más de ese número de días se borran
 *      definitivamente, con sus documentos, versiones y archivos (la auditoría se conserva).
 *   2. LIMPIEZA_PDF_DIAS (3): los PDF soporte ya leídos de escrituras con una versión terminada se
 *      retiran a los N días de cargados. Lo que la IA leyó queda en la base: se puede generar de nuevo.
 *   3. LIMPIEZA_PDF_MAXIMO_MB (500): si aun así los PDF soporte pasan de ese total, se retiran antes
 *      (de los más antiguos a los más nuevos, solo de escrituras con versión terminada).
 *
 * Nunca toca una escritura que se está generando ni las plantillas de la biblioteca.
 */
import 'server-only';
import { db } from '@/lib/db';
import { auditar } from '@/lib/auditoria';
import { borrarCifrado, ARCHIVO_RETIRADO } from '@/lib/almacenamiento';
import { consumirLimite } from '@/lib/seguridad/limites';

const numero = (v: string | undefined, porDefecto: number) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : porDefecto);
const DIA = 24 * 3600_000;

export async function limpiarAlmacenamiento() {
  const diasEscrituras = numero(process.env.LIMPIEZA_ESCRITURAS_DIAS, 30);
  const diasPdf = numero(process.env.LIMPIEZA_PDF_DIAS, 3);
  const maximoPdf = numero(process.env.LIMPIEZA_PDF_MAXIMO_MB, 500) * 1024 * 1024;
  let escriturasBorradas = 0, pdfRetirados = 0, bytesLiberados = 0;

  // 1. Escrituras viejas, completas
  const viejas = await db.expediente.findMany({
    where: { creadoEn: { lt: new Date(Date.now() - diasEscrituras * DIA) }, generaciones: { none: { estado: 'EN_CURSO' } } },
    select: { id: true, numeroInterno: true, plantillaRuta: true, documentos: { select: { rutaCifrada: true, tamano: true } }, generaciones: { select: { rutaDocx: true } } },
    take: 50,
  });
  for (const e of viejas) {
    await db.expediente.delete({ where: { id: e.id } });
    const rutas = [...e.documentos.map((d) => d.rutaCifrada), ...e.generaciones.flatMap((g) => (g.rutaDocx ? [g.rutaDocx] : [])), ...(e.plantillaRuta ? [e.plantillaRuta] : [])];
    await Promise.all(rutas.map((r) => borrarCifrado(r).catch((err) => console.error('[limpieza] escritura', err))));
    await auditar({ accion: 'EXPEDIENTE_ELIMINADO', entidad: 'expediente', entidadId: e.id, detalle: { numero: e.numeroInterno, automatico: true, motivo: `más de ${diasEscrituras} días`, documentos: e.documentos.length, versiones: e.generaciones.length } });
    escriturasBorradas++;
    bytesLiberados += e.documentos.reduce((a, d) => a + (d.rutaCifrada === ARCHIVO_RETIRADO ? 0 : d.tamano), 0);
  }

  // 2 y 3. PDF soporte ya usados
  const candidatos = await db.documento.findMany({
    where: {
      rutaCifrada: { not: ARCHIVO_RETIRADO }, estadoLectura: 'LEIDO', lectura: { not: { equals: null } },
      expediente: { generaciones: { some: { estado: 'COMPLETADA' }, none: { estado: 'EN_CURSO' } } },
    },
    orderBy: { creadoEn: 'asc' },
    select: { id: true, rutaCifrada: true, tamano: true, creadoEn: true, expedienteId: true },
  });
  const totalPdf = await db.documento.aggregate({ where: { rutaCifrada: { not: ARCHIVO_RETIRADO } }, _sum: { tamano: true } });
  let ocupado = totalPdf._sum.tamano ?? 0;
  const limiteFecha = Date.now() - diasPdf * DIA;
  for (const d of candidatos) {
    if (d.creadoEn.getTime() >= limiteFecha && ocupado <= maximoPdf) break; // los siguientes son más nuevos
    // Primero la base: si el borrado del archivo falla queda un huérfano, nunca una referencia rota
    await db.documento.update({ where: { id: d.id }, data: { rutaCifrada: ARCHIVO_RETIRADO } });
    await borrarCifrado(d.rutaCifrada).catch((err) => console.error('[limpieza] pdf', err));
    ocupado -= d.tamano; pdfRetirados++; bytesLiberados += d.tamano;
  }
  if (pdfRetirados) await auditar({ accion: 'DOCUMENTOS_RETIRADOS', entidad: 'documento', detalle: { automatico: true, cantidad: pdfRetirados, megas: Math.round(bytesLiberados / 1048576) } });
  return { escriturasBorradas, pdfRetirados, megasLiberados: Math.round(bytesLiberados / 1048576) };
}

/** Limpieza como máximo una vez cada 6 horas (la llama api/notificaciones después de responder) */
export async function limpiezaPeriodica() {
  if (!(await consumirLimite('sistema:limpieza-almacenamiento', 1, 6 * 3600)).permitido) return;
  const r = await limpiarAlmacenamiento();
  if (r.escriturasBorradas || r.pdfRetirados) console.log('[limpieza]', r);
}
