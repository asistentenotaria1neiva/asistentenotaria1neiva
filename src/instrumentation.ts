// Se ejecuta una vez al iniciar el servidor: verifica la configuración y carga el catálogo inicial.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const faltantes = ['DATABASE_URL', 'CLAVE_MAESTRA', 'CLAVE_FIRMA'].filter((k) => !process.env[k]);
  if (faltantes.length) {
    console.error(`[inicio] Faltan variables de entorno obligatorias: ${faltantes.join(', ')}`);
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) console.warn('[inicio] ANTHROPIC_API_KEY no está configurada: el análisis con IA no estará disponible.');
  try {
    const { asegurarCatalogo } = await import('./lib/servicios/inicializacion');
    const r = await asegurarCatalogo();
    console.log(`[inicio] Catálogo: ${r.tipos} tipos; nuevas plantillas: ${r.plantillas}; nuevos esquemas: ${r.esquemas}.`);
  } catch (e) {
    console.error('[inicio] No se pudo cargar el catálogo inicial:', (e as Error).message);
  }
}
