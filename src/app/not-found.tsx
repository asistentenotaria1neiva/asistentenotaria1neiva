import Link from 'next/link';
import { MarcoAcceso } from './(acceso)/Marco';
import { Icono } from './Icono';

export const metadata = { title: 'Página no encontrada' };

export default function NoEncontrado() {
  return (
    <MarcoAcceso titulo="Página no encontrada" descripcion="La dirección no existe o usted no tiene acceso a ese registro.">
      <Link className="boton grande bloque" href="/"><Icono nombre="inicio" tamano={18} />Ir al inicio</Link>
    </MarcoAcceso>
  );
}
