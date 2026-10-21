import { requerirSesion } from '@/lib/sesion';
import { todasConfig, DESCRIPCIONES } from '@/lib/configuracion';
import { ipCliente } from '@/lib/seguridad/red';
import { accionConfiguracion } from '../acciones';
import { FormAdmin } from '../formularios';

export default async function Configuracion() {
  await requerirSesion({ roles: ['ADMINISTRADOR'] });
  const config = await todasConfig();
  const ip = await ipCliente();
  return (
    <>
      <h1>Configuración</h1>
      <div className="aviso info">Su IP pública actual es <code>{ip}</code>. Los valores se escriben en formato JSON (por ejemplo una lista de IP: <code>{'["190.85.10.20", "190.85.11.0/24"]'}</code>). Cada cambio queda en la auditoría con el valor anterior y el nuevo.</div>
      {Object.entries(config).map(([clave, valor]) => (
        <section className="tarjeta" key={clave}>
          <h2 style={{ marginTop: 0 }}><code>{clave}</code></h2>
          <p className="suave">{DESCRIPCIONES[clave as keyof typeof DESCRIPCIONES]}</p>
          <FormAdmin accion={accionConfiguracion} ocultos={{ clave }} campos={[{ nombre: 'valor', etiqueta: 'Valor', tipo: 'area', valor: JSON.stringify(valor, null, 2) }]} botones={[{ texto: 'Guardar' }]} />
        </section>
      ))}
    </>
  );
}
