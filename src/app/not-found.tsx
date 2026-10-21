import Link from 'next/link';

export default function NoEncontrado() {
  return (
    <main className="acceso">
      <div className="tarjeta">
        <h1>Página no encontrada</h1>
        <p className="suave">La dirección no existe o no tiene acceso a ese registro.</p>
        <Link className="boton" href="/" style={{ width: '100%' }}>Ir al inicio</Link>
      </div>
    </main>
  );
}
