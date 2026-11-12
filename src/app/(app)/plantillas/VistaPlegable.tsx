'use client';
/** Vista previa de un .docx que se carga solo al abrirla (no descarga el archivo si nadie la mira) */
import { useState } from 'react';
import { VisorDocx } from './VisorDocx';

export function VistaPlegable({ url, titulo, abierta = false, leyenda = false }: { url: string; titulo: string; abierta?: boolean; leyenda?: boolean }) {
  const [vista, setVista] = useState(abierta);
  return (
    <details className="vista-plegable" open={abierta} onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) setVista(true); }}>
      <summary>{titulo}</summary>
      {leyenda && (
        <p className="leyenda-marcas">
          <span><span className="muestra-falta">FALTA</span> dato que no está en los documentos</span>
          <span><span className="muestra-verificar">VERIFICAR</span> dato dudoso para confirmar</span>
        </p>
      )}
      {vista && <VisorDocx url={url} />}
    </details>
  );
}
