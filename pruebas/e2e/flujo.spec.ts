/**
 * Recorrido de punta a punta en navegador:
 * instalación → doble factor → usuarios → registro y aprobación del equipo → cambio de contraseña →
 * expediente → carga cifrada → validación del formulario → reglas → panel del administrador.
 */
import { test, expect, type Page } from '@playwright/test';
import { generate } from 'otplib';

test.describe.configure({ mode: 'serial' });

const ADMIN = { usuario: 'admin.prueba', contrasena: 'AdminDePrueba2026' };
const DIGITADOR = { usuario: 'digitador.prueba', nueva: 'DigitadorPrueba2026' };
let secretoTotp = '';
let temporalDigitador = '';
const usados = new Set<string>();
/** Código TOTP vigente; si ya se usó (la app no acepta repetidos), espera al siguiente intervalo de 30 s */
async function codigoNuevo(page: Page): Promise<string> {
  for (;;) {
    const c = await generate({ secret: secretoTotp });
    if (!usados.has(c)) { usados.add(c); return c; }
    await page.waitForTimeout(31_000 - (Date.now() % 30_000));
  }
}
const captura = (page: Page, nombre: string) => page.screenshot({ path: `pruebas/salida/e2e-${nombre}.png`, fullPage: true });

async function ingresar(page: Page, usuario: string, contrasena: string) {
  await page.goto('/ingreso');
  await page.getByLabel('Usuario').fill(usuario);
  await page.getByLabel('Contraseña').fill(contrasena);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

async function cerrarSesion(page: Page) {
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/ingreso/);
}

test('instalación y doble factor del administrador', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/instalacion/);
  await page.getByLabel('Nombre completo').fill('ADMINISTRADOR DE PRUEBA');
  await page.getByLabel('Usuario').fill(ADMIN.usuario);
  await page.getByLabel('Contraseña', { exact: true }).fill(ADMIN.contrasena);
  await page.getByLabel('Confirmar contraseña').fill(ADMIN.contrasena);
  await page.getByRole('button', { name: 'Crear administrador' }).click();
  await expect(page).toHaveURL(/instalado=1/);

  // Contraseña equivocada: mensaje genérico
  await ingresar(page, ADMIN.usuario, 'ContrasenaErrada123');
  await expect(page.locator('.aviso[role=alert]')).toContainText('Usuario o contraseña incorrectos');

  await ingresar(page, ADMIN.usuario, ADMIN.contrasena);
  await expect(page).toHaveURL(/configurar-2fa/);
  secretoTotp = (await page.locator('code').first().innerText()).replace(/\s/g, '');
  await captura(page, '01-configurar-2fa');
  await page.getByLabel('Código de 6 dígitos').fill(await codigoNuevo(page));
  await page.getByRole('button', { name: 'Activar doble factor' }).click();
  await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible();

  // Crear usuarios
  await page.goto('/admin/usuarios');
  await page.getByLabel('Nombre completo').fill('DIGITADOR DE PRUEBA');
  await page.getByLabel('Usuario').fill(DIGITADOR.usuario);
  await page.getByRole('button', { name: 'Crear con contraseña temporal' }).click();
  await expect(page.getByText('Contraseña temporal')).toBeVisible();
  temporalDigitador = await page.locator('.aviso.alerta code').innerText();
  expect(temporalDigitador.length).toBeGreaterThanOrEqual(12);

  // Registrar este equipo y aprobarlo
  await page.goto('/registrar-equipo');
  await page.getByLabel('Nombre del equipo').fill('Equipo de prueba 1');
  await page.getByRole('button', { name: 'Registrar equipo' }).click();
  await expect(page.locator('.aviso[role=status]').last()).toContainText('pendiente');
  await page.goto('/admin/dispositivos');
  await page.getByRole('button', { name: 'Aprobar' }).click();
  await expect(page.getByText('aprobado', { exact: true })).toBeVisible();
  await captura(page, '02-dispositivos');
  await cerrarSesion(page);
});

test('digitador: cambio de contraseña, expediente, carga cifrada, formulario y reglas', async ({ page, context }) => {
  // El equipo se registró en la prueba anterior con otro contexto: se registra y aprueba de nuevo aquí
  await ingresar(page, ADMIN.usuario, ADMIN.contrasena);
  await page.getByLabel('Código de 6 dígitos').fill(await codigoNuevo(page));
  await page.getByRole('button', { name: 'Verificar' }).click();
  await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible();
  await page.goto('/registrar-equipo');
  await page.getByLabel('Nombre del equipo').fill('Equipo de prueba 2');
  await page.getByRole('button', { name: 'Registrar equipo' }).click();
  await expect(page.locator('.aviso[role=status]').last()).toContainText('pendiente');
  await page.goto('/admin/dispositivos');
  await page.getByRole('row', { name: /Equipo de prueba 2/ }).getByRole('button', { name: 'Aprobar' }).click();
  await expect(page.getByRole('row', { name: /Equipo de prueba 2/ }).getByText('aprobado')).toBeVisible();
  await cerrarSesion(page);

  // Sin equipo autorizado el digitador no entra (contexto nuevo, sin cookie del equipo)
  const otro = await context.browser()!.newContext();
  const p2 = await otro.newPage();
  await ingresar(p2, DIGITADOR.usuario, temporalDigitador);
  await expect(p2.locator('.aviso[role=alert]')).toContainText('no está autorizado');
  await otro.close();

  // Desde el equipo aprobado: contraseña temporal → cambio obligatorio
  await ingresar(page, DIGITADOR.usuario, temporalDigitador);
  await expect(page).toHaveURL(/cambiar-contrasena/);
  await page.getByLabel('Contraseña actual').fill(temporalDigitador);
  await page.getByLabel('Nueva contraseña', { exact: true }).fill(DIGITADOR.nueva);
  await page.getByLabel('Confirmar nueva contraseña').fill(DIGITADOR.nueva);
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible();

  // Nuevo expediente
  await page.goto('/expedientes/nuevo');
  await page.getByLabel(/Compraventa de inmueble/).check();
  await page.getByRole('button', { name: 'Crear expediente' }).click();
  await expect(page).toHaveURL(/\/expedientes\/.+\/documentos/);
  await expect(page.getByRole('heading', { name: /EXP-\d{4}-00001/ })).toBeVisible();

  // Carga de un documento (se cifra en el servidor)
  await page.getByLabel('Tipo de documento').selectOption('CEDULA');
  await page.getByLabel('Archivo(s) PDF o imagen').setInputFiles({ name: 'cedula.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nprueba\n%%EOF') });
  await page.getByRole('button', { name: 'Cargar' }).click();
  await expect(page.locator('.aviso[role=status]').last()).toContainText('cargado');
  await expect(page.getByText('El análisis con IA no está disponible')).toBeVisible();
  await captura(page, '03-documentos');

  // Formulario: el paso del acto no deja avanzar sin datos obligatorios
  await page.getByRole('link', { name: '4 · Formulario' }).click();
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /^[0-9]+. Compraventa$/ }).click();
  await expect(page.getByRole('heading', { name: 'Compraventa', level: 2 })).toBeVisible();
  await page.getByRole('button', { name: 'Guardar y continuar →' }).or(page.getByRole('link', { name: 'Ir a la revisión →' })).first().waitFor();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('Precio: dato obligatorio.')).toBeVisible();
  await expect(page.getByText('Vendedor(es): dato obligatorio.')).toBeVisible();

  // Paso de personas: un documento mal digitado se marca
  await page.getByRole('button', { name: /^[0-9]+. Personas$/ }).click();
  await page.getByRole('button', { name: '+ Agregar persona' }).click();
  await page.getByLabel('Nombre completo / razón social *').fill('ana lucia prueba rojas');
  await page.getByLabel('Número de documento *').fill('12A');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText(/Número de documento: La cédula solo puede contener números/)).toBeVisible();
  await captura(page, '04-formulario-errores');

  // Reglas: el expediente incompleto tiene observaciones críticas
  await page.getByRole('link', { name: /5 · Observaciones/ }).click();
  await page.getByRole('button', { name: 'Ejecutar reglas' }).click();
  await expect(page.locator('.aviso[role=status]').last()).toContainText('Revisión ejecutada');
  await page.reload();
  await expect(page.getByText(/Falta: Compraventa de inmueble/).first()).toBeVisible();
  await captura(page, '05-observaciones');

  // El borrador no se genera con críticas abiertas
  await page.getByRole('link', { name: /6 · Borrador/ }).click();
  await expect(page.getByText(/observación\(es\) crítica\(s\) abiertas/)).toBeVisible();
  await cerrarSesion(page);
});

test('panel del administrador y auditoría íntegra', async ({ page }) => {
  await ingresar(page, ADMIN.usuario, ADMIN.contrasena);
  await page.getByLabel('Código de 6 dígitos').fill(await codigoNuevo(page));
  await page.getByRole('button', { name: 'Verificar' }).click();
  await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible();
  for (const [ruta, titulo] of [['/admin', 'Panel del administrador'], ['/admin/plantillas', 'Plantillas'], ['/admin/estadisticas', 'Estadísticas e indicadores'],
    ['/admin/entrenamiento', 'Entrenamiento de la IA'], ['/admin/alertas', 'Alertas de seguridad'], ['/admin/configuracion', 'Configuración'], ['/expedientes', 'Expedientes']] as const) {
    await page.goto(ruta);
    await expect(page.getByRole('heading', { name: titulo, exact: true })).toBeVisible();
  }
  await page.goto('/admin/plantillas');
  await expect(page.getByText('tipos sin plantilla (la notaría debe entregarlas)')).toBeVisible();
  await captura(page, '06-plantillas');
  await page.goto('/admin/alertas');
  await expect(page.getByText(/no está autorizado|equipo no registrado/i).first()).toBeVisible();
  await page.goto('/admin/auditoria');
  await page.getByRole('button', { name: 'Verificar integridad de la cadena' }).click();
  await expect(page.locator('.aviso[role=status]').last()).toContainText('Cadena íntegra');
  await captura(page, '07-auditoria');
});
