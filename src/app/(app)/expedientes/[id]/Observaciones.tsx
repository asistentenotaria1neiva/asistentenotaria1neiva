'use client';
/** Observaciones del digitador para la IA y el botón para generar la escritura */
import { useActionState } from 'react';
import type { Resultado } from '../acciones';
import { Mensaje } from '../formularios';

export function FormularioObservaciones({ inicial, guardar, generar, puedeGenerar, version }: {
  inicial: string;
  guardar: (r: Resultado, f: FormData) => Promise<Resultado>;
  generar: (r: Resultado, f: FormData) => Promise<Resultado>;
  puedeGenerar: boolean;
  version: number;
}) {
  const [rg, accionGuardar, guardando] = useActionState(guardar, {});
  const [rn, accionGenerar, generando] = useActionState(generar, {});
  const pendiente = guardando || generando;
  return (
    <form action={accionGuardar}>
      <Mensaje r={generando ? undefined : rn.error || rn.ok ? rn : rg} />
      <div className="campo">
        <label htmlFor="observaciones">Observaciones para la IA (opcional)</label>
        <textarea id="observaciones" name="observaciones" defaultValue={inicial} rows={5} maxLength={8000}
          placeholder="Lo que la IA debe tener en cuenta y no está en los documentos: p. ej. «El precio es $180.000.000 pagaderos con crédito del FNA por $120.000.000 y el resto de contado», «La compradora es soltera sin unión marital», «No incluir la afectación a vivienda familiar»." />
        <div className="ayuda">La IA sigue la plantilla al pie de la letra y solo cambia los datos del negocio. Lo que no encuentre queda marcado «FALTA» en amarillo.</div>
      </div>
      <div className="fila">
        <button type="submit" formAction={accionGenerar} disabled={pendiente || !puedeGenerar} aria-busy={generando}>
          {generando && <span className="girador pequeno" aria-hidden="true" />}{generando ? 'Iniciando…' : version ? `Generar versión ${version + 1}` : 'Generar escritura'}
        </button>
        <button type="submit" className="secundario" disabled={pendiente}>{guardando ? 'Guardando…' : 'Guardar observaciones'}</button>
      </div>
    </form>
  );
}
