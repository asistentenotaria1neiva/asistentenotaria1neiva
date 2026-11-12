import { requerirSesion } from '@/lib/sesion';
import { todasConfig, DESCRIPCIONES } from '@/lib/configuracion';
import { ipCliente } from '@/lib/seguridad/red';
import { accionConfiguracion } from '../acciones';
import { FormAdmin } from '../formularios';
import { Icono } from '../../../Icono';

export const metadata = { title: 'Configuración' };

export default async function Configuracion() {
  await requerirSesion({ roles: ['ADMINISTRADOR'] });
  const config = await todasConfig();
  const ip = await ipCliente();
  return (
    <>
      <div className="encabezado">
        <h1>Configuración</h1>
        <p className="suave">Parámetros de la aplicación en formato JSON. Cada cambio queda en la auditoría con el valor anterior y el nuevo.</p>
      </div>
      <div className="aviso info"><Icono nombre="red" /><div>Su IP pública actual es <code>{ip}</code>. Ejemplo de lista de IP: <code>{'["190.85.10.20", "190.85.11.0/24"]'}</code>.</div></div>
      {Object.entries(config).map(([clave, valor]) => (
        <section className="tarjeta valor-json" key={clave}>
          <div className="tarjeta-cabecera"><h2><code>{clave}</code></h2></div>
          <p className="suave">{DESCRIPCIONES[clave as keyof typeof DESCRIPCIONES]}</p>
          <FormAdmin accion={accionConfiguracion} ocultos={{ clave }} campos={[{ nombre: 'valor', etiqueta: 'Valor', tipo: 'area', valor: JSON.stringify(valor, null, 2) }]} botones={[{ texto: 'Guardar' }]} />
        </section>
      ))}
    </>
  );
}
