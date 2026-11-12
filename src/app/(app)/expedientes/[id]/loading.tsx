/** Mientras llega la escritura: la forma de la página (encabezado, pasos, secciones y panel) */
export default function CargandoEscritura() {
  return (
    <div role="status" aria-label="Cargando la escritura">
      <span className="esqueleto linea c30" />
      <span className="esqueleto titulo" />
      <span className="esqueleto linea c50" />
      <div className="tarjeta pasos mt"><span className="esqueleto linea" /></div>
      <div className="escritura">
        <div className="paso"><div className="cuerpo-paso"><span className="esqueleto linea c50" /><span className="esqueleto linea c70" /></div></div>
        <div className="paso"><div className="cuerpo-paso"><span className="esqueleto linea c30" /><span className="esqueleto bloque" /></div></div>
        <div className="panel-accion"><span className="esqueleto linea c50" /><span className="esqueleto linea" /><span className="esqueleto bloque" /></div>
      </div>
      <span className="solo-lectores">Cargando…</span>
    </div>
  );
}
