/** Tipos compartidos entre las acciones de servidor y los componentes de cliente (sin dependencias de servidor) */
import type { DatosExpediente, Persona, Inmueble } from '../escritura/tipos';

export type ActualizacionPaso =
  | { paso: 'escritura'; valor: DatosExpediente['escritura'] }
  | { paso: 'personas'; valor: Persona[] }
  | { paso: 'inmuebles'; valor: Inmueble[] }
  | { paso: 'acto'; acto: string; valor: Record<string, unknown> };
