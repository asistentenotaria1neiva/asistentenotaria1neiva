/** Entre pestañas del expediente el encabezado se mantiene y solo se espera el contenido */
export default function CargandoSeccion() {
  return <div className="cargando" role="status"><span className="girador" aria-hidden="true" />Cargando…</div>;
}
