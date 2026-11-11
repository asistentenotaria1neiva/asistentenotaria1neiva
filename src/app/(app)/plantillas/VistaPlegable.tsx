'use client';
/** Vista previa de un .docx que se carga solo al abrirla (no descarga el archivo si nadie la mira) */
import { useState } from 'react';
import { VisorDocx } from './VisorDocx';

export function VistaPlegable({ url, titulo, abierta = false }: { url: string; titulo: string; abierta?: boolean }) {
  const [vista, setVista] = useState(abierta);
  return (
    <details open={abierta} onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) setVista(true); }}>
      <summary>{titulo}</summary>
      {vista && <div style={{ marginTop: 12 }}><VisorDocx url={url} /></div>}
    </details>
  );
}
