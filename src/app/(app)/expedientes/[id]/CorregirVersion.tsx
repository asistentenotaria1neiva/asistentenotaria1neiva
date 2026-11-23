'use client';
/**
 * «Corregir esta versión»: el digitador escribe qué hay que ajustar y la IA cambia solo esos párrafos
 * sobre la última versión (mucho más barato que generar una versión completa).
 */
import { useActionState } from 'react';
import type { Resultado } from '../acciones';
import { Mensaje } from '../formularios';
import { Icono } from '../../../Icono';

export function CorregirVersion({ corregir, version, siguiente }: {
  corregir: (r: Resultado, f: FormData) => Promise<Resultado>;
  version: number;
  /** Número que tendrá la versión corregida */
  siguiente: number;
}) {
  const [r, accion, pendiente] = useActionState(corregir, {});
  return (
    // Abierto y destacado: corregir cuesta cerca de un tercio de una versión completa (panel Consumo de IA)
    <details id="corregir-version" className="corregir-version" open>
      <summary><Icono nombre="editar" tamano={16} />Corregir la versión {version}<span className="etiqueta-economica">Más económico</span></summary>
      <form action={accion}>
        <div className="campo">
          <label htmlFor="pedido">¿Qué hay que corregir?</label>
          <textarea id="pedido" name="pedido" rows={4} maxLength={3000} required
            placeholder="Por ejemplo: «La compradora es casada con sociedad conyugal vigente», «Quitar la constitución del patrimonio de familia», «El crédito es por $130.000.000»." />
          <div className="ayuda">La IA cambia solo lo que usted pide (y donde ese dato se repite); el resto de la escritura queda igual. <strong>Cuesta cerca de la tercera parte de generar una versión completa</strong>: úselo para cualquier ajuste de datos, cláusulas o redacción. Genere una versión completa solo si cargó documentos nuevos o cambió la plantilla.</div>
        </div>
        <Mensaje r={pendiente ? undefined : r.error || r.ok ? r : undefined} />
        <button type="submit" className="secundario" disabled={pendiente} aria-busy={pendiente}>
          {pendiente ? <span className="girador pequeno" aria-hidden="true" /> : <Icono nombre="ia" tamano={18} />}{pendiente ? 'Iniciando…' : `Corregir y crear la versión ${siguiente}`}
        </button>
      </form>
    </details>
  );
}
