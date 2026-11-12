'use client';
/**
 * Paso 3 (observaciones del digitador para la IA) y el panel «Siguiente paso» con el botón para generar.
 * Ambos van en el mismo formulario (display: contents): la sección se ve en la columna de los pasos y el
 * panel en la columna derecha, y los dos botones siguen enviando este formulario como antes.
 */
import { useActionState } from 'react';
import type { Resultado } from '../acciones';
import { Mensaje } from '../formularios';
import { Icono } from '../../../Icono';

export function FormularioObservaciones({ inicial, guardar, generar, puedeGenerar, version, abierto, clasePaso, resumen, panel, pie, generarPrincipal }: {
  inicial: string;
  guardar: (r: Resultado, f: FormData) => Promise<Resultado>;
  generar: (r: Resultado, f: FormData) => Promise<Resultado>;
  puedeGenerar: boolean;
  version: number;
  /** El paso se muestra abierto (si no, queda plegado con su resumen) */
  abierto: boolean;
  clasePaso: string;
  resumen: string;
  /** Contenido del panel antes del botón de generar (estado, requisitos, descarga…) */
  panel: React.ReactNode;
  /** Contenido del panel después del botón (acciones secundarias y la nota de responsabilidad) */
  pie: React.ReactNode;
  /** Generar es la acción principal (si ya hay una versión para revisar, pasa a ser secundaria) */
  generarPrincipal: boolean;
}) {
  const [rg, accionGuardar, guardando] = useActionState(guardar, {});
  const [rn, accionGenerar, generando] = useActionState(generar, {});
  const pendiente = guardando || generando;
  const textoGenerar = version ? `Generar versión ${version + 1}` : 'Generar escritura';
  return (
    <form action={accionGuardar} className="contenido-formulario">
      <details id="paso-observaciones" className={`paso orden-3 ${clasePaso}`} open={abierto}>
        <summary>
          <span className="numero-paso" aria-hidden="true">{clasePaso.includes('hecho') ? <Icono nombre="check" tamano={16} /> : 3}</span>
          <span className="titulo-paso"><h2>Observaciones</h2><span className="resumen">{resumen}</span></span>
        </summary>
        <div className="cuerpo-paso">
          {!generando && rg && (rg.error || rg.ok) && <Mensaje r={rg} />}
          <div className="campo">
            <label htmlFor="observaciones">Lo que la IA debe tener en cuenta y no está en los documentos <span className="opcional">(opcional)</span></label>
            <textarea id="observaciones" name="observaciones" defaultValue={inicial} rows={6} maxLength={8000}
              placeholder="Por ejemplo: «El precio es $180.000.000, pagaderos con crédito del FNA por $120.000.000 y el resto de contado», «La compradora es soltera sin unión marital», «No incluir la afectación a vivienda familiar»." />
            <div className="ayuda">La IA sigue la plantilla al pie de la letra y solo cambia los datos del negocio. Lo que no encuentre queda <span className="muestra-falta">FALTA</span> en amarillo.</div>
          </div>
          <button type="submit" className="secundario" disabled={pendiente} aria-busy={guardando}>
            {guardando ? <span className="girador pequeno" aria-hidden="true" /> : <Icono nombre="check" tamano={18} />}{guardando ? 'Guardando…' : 'Guardar observaciones'}
          </button>
        </div>
      </details>

      <aside className="panel-accion" aria-label="Siguiente paso">
        {panel}
        <Mensaje r={generando ? undefined : rn.error || rn.ok ? rn : undefined} />
        <button type="submit" formAction={accionGenerar} className={generarPrincipal ? 'grande bloque' : 'secundario bloque'} disabled={pendiente || !puedeGenerar} aria-busy={generando}>
          {generando ? <span className="girador pequeno" aria-hidden="true" /> : <Icono nombre={generarPrincipal ? 'ia' : 'refrescar'} tamano={18} />}{generando ? 'Iniciando…' : textoGenerar}
        </button>
        {pie}
      </aside>
    </form>
  );
}
