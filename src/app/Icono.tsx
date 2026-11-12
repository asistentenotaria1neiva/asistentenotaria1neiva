/**
 * Íconos de la aplicación: SVG en línea de trazo redondeado (como los terminales del isotipo N1).
 * Sirven en componentes de servidor y de cliente; son decorativos (aria-hidden) salvo que se pase «titulo».
 */
const TRAZOS = {
  inicio: 'M4 10.5L12 4l8 6.5V19a1 1 0 01-1 1h-4.5v-6h-5v6H5a1 1 0 01-1-1z',
  mas: 'M12 5v14M5 12h14',
  escrituras: 'M8 3h7l4 4v11a2 2 0 01-2 2H8a2 2 0 01-2-2V5a2 2 0 012-2zM14.5 3v4.5H19M9.5 12.5h5M9.5 16h5',
  biblioteca: 'M5 4.5A1.5 1.5 0 016.5 3H18v15H6.5A1.5 1.5 0 005 19.5zM5 19.5A1.5 1.5 0 006.5 21H18v-3M9 7.5h5',
  campana: 'M6 16V11a6 6 0 1112 0v5l1.5 2h-15zM10 20.5a2 2 0 004 0',
  panel: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  equipo: 'M3.5 5h17v11h-17zM9 20h6M12 16v4',
  usuarios: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20a6.5 6.5 0 0113 0M16 4.3a3.5 3.5 0 010 6.4M18 14.2a6.5 6.5 0 013.5 5.8',
  auditoria: 'M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6zM9 12l2 2 4-4',
  estadisticas: 'M4 20h16M6.5 16.5v-5M11 16.5V7M15.5 16.5v-7M20 16.5V4.5',
  consumo: 'M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4',
  alerta: 'M12 4l9 16H3zM12 10v4M12 17h.01',
  configuracion: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  salir: 'M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 16l-4-4 4-4M6 12h10',
  menu: 'M4 7h16M4 12h16M4 17h16',
  cerrar: 'M6 6l12 12M18 6L6 18',
  descargar: 'M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14',
  subir: 'M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 16v2.5A1.5 1.5 0 005.5 20h13a1.5 1.5 0 001.5-1.5V16',
  documento: 'M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8zM14 3v5h5',
  imagen: 'M5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1zM4 16l4.5-4.5L14 17M13 13l2.5-2.5L20 15M9 9.5h.01',
  buscar: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 8h.01',
  error: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7.5v5.5M12 16.5h.01',
  exito: 'M12 21a9 9 0 100-18 9 9 0 000 18zM8 12.5l2.8 2.8L16 10',
  reloj: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  ojo: 'M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7zM12 15a3 3 0 100-6 3 3 0 000 6z',
  papelera: 'M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13M10 11v5M14 11v5',
  editar: 'M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16zM13.5 6.5l4 4',
  atras: 'M15 5l-7 7 7 7',
  adelante: 'M9 5l7 7-7 7',
  abajo: 'M6 9l6 6 6-6',
  plantilla: 'M5 3h14v18H5zM8.5 7h7M8.5 10.5h7M8.5 14h4',
  ia: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
  refrescar: 'M20 11a8 8 0 00-14.3-4.5L4 8M4 4v4h4M4 13a8 8 0 0014.3 4.5L20 16M20 20v-4h-4',
  filtro: 'M4 5h16l-6 7.5V19l-4 1.5v-8z',
  versiones: 'M12 3l9 4.5-9 4.5-9-4.5zM3 12l9 4.5 9-4.5M3 16.5L12 21l9-4.5',
  candado: 'M6 11h12v9H6zM8.5 11V7.5a3.5 3.5 0 017 0V11',
  red: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z',
  telefono: 'M8 3h8a1 1 0 011 1v16a1 1 0 01-1 1H8a1 1 0 01-1-1V4a1 1 0 011-1zM11 18h2',
  mas_opciones: 'M5 12h.01M12 12h.01M19 12h.01',
  imprimir: 'M7 9V3h10v6M7 17H5a1 1 0 01-1-1v-6a1 1 0 011-1h14a1 1 0 011 1v6a1 1 0 01-1 1h-2M7 14h10v7H7z',
} as const;

export type NombreIcono = keyof typeof TRAZOS;

export function Icono({ nombre, tamano = 20, titulo, className }: { nombre: NombreIcono; tamano?: number; titulo?: string; className?: string }) {
  return (
    <svg
      className={`icono${className ? ` ${className}` : ''}`}
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={titulo ? undefined : true}
      role={titulo ? 'img' : undefined}
      focusable="false"
    >
      {titulo && <title>{titulo}</title>}
      <path d={TRAZOS[nombre]} />
    </svg>
  );
}
