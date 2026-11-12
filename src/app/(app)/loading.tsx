/** Se muestra mientras el servidor prepara la página: un esqueleto con encabezado, cifras y una tabla */
export default function Cargando() {
  return (
    <div role="status" aria-label="Cargando la página">
      <span className="esqueleto titulo" />
      <span className="esqueleto linea c50" />
      <div className="rejilla cuatro mt">
        {[0, 1, 2, 3].map((i) => <div key={i} className="tarjeta compacta"><span className="esqueleto linea c50" /><span className="esqueleto titulo" /></div>)}
      </div>
      <div className="tarjeta mt">
        {[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className="esqueleto linea" />)}
      </div>
      <span className="solo-lectores">Cargando…</span>
    </div>
  );
}
