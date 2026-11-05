'use client';
/**
 * Carga de varias plantillas a la vez: un archivo por fila, cada uno con su tipo de escritura.
 * Cada archivo va en su propia petición (api/plantillas/cargar) y todas salen al mismo tiempo.
 * Cada archivo es el MODELO de redacción de su tipo de escritura: se guarda tal como viene (la IA lo
 * toma como base para redactar; no se convierte en variables).
 */
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ResultadoCarga } from '@/lib/servicios/carga-plantillas';

const MAXIMO = 6;
const LIMITE_MB = 4; // Vercel limita cada petición a 4,5 MB

export interface TipoCargable { id: string; nombre: string; grupo: 'nueva' | 'version'; detalle: string }

type Estado = { fase: 'lista' } | { fase: 'cargando' } | { fase: 'hecha'; r: ResultadoCarga } | { fase: 'error'; error: string };
interface Fila { clave: string; archivo: File; tipoId: string; notas: string; estado: Estado }

const sinTildes = (x: string) => x.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Tipo cuyo id aparece en el nombre del archivo ("compraventa_hipoteca v2.docx" → compraventa_hipoteca) */
function adivinarTipo(nombre: string, tipos: TipoCargable[]): string {
  const n = ` ${sinTildes(nombre).replace(/\.docx$/, '').replace(/[^a-z0-9]+/g, ' ')} `;
  return tipos.filter((t) => n.includes(` ${t.id.replace(/_/g, ' ')} `)).sort((a, b) => b.id.length - a.id.length)[0]?.id ?? '';
}

/** Sube un archivo a api/plantillas/cargar */
async function enviar(f: Pick<Fila, 'archivo' | 'tipoId' | 'notas'>): Promise<Estado> {
  const datos = new FormData();
  datos.set('archivo', f.archivo);
  datos.set('tipoId', f.tipoId);
  datos.set('notas', f.notas);
  try {
    const respuesta = await fetch('/api/plantillas/cargar', { method: 'POST', body: datos });
    const cuerpo = await respuesta.json().catch(() => ({ error: respuesta.status === 413 ? 'El archivo es demasiado grande.' : 'El servidor no respondió a tiempo. Revise la lista: la plantilla pudo haber quedado cargada.' }));
    return respuesta.ok ? { fase: 'hecha', r: cuerpo as ResultadoCarga } : { fase: 'error', error: (cuerpo as { error?: string }).error ?? 'No se pudo cargar la plantilla.' };
  } catch {
    return { fase: 'error', error: 'Se perdió la conexión con el servidor.' };
  }
}

function Resultado({ r }: { r: ResultadoCarga }) {
  return <span className="etiqueta ok">Cargada v{r.version}: pendiente de aprobación</span>;
}

export function CargaPlantillas({ tipos, inicial }: { tipos: TipoCargable[]; inicial?: string }) {
  const router = useRouter();
  const [filas, setFilas] = useState<Fila[]>([]);
  const [aviso, setAviso] = useState<string>();
  const enCurso = filas.some((f) => f.estado.fase === 'cargando');
  const pendientes = filas.filter((f) => f.estado.fase === 'lista' || f.estado.fase === 'error');

  const cambiar = (clave: string, cambio: Partial<Fila>) => setFilas((fs) => fs.map((f) => (f.clave === clave ? { ...f, ...cambio } : f)));

  function agregar(lista: FileList | null) {
    setAviso(undefined);
    const nuevos = [...(lista ?? [])].filter((a) => !filas.some((f) => f.archivo.name === a.name && f.archivo.size === a.size));
    const espacio = MAXIMO - filas.filter((f) => f.estado.fase !== 'hecha').length;
    if (nuevos.length > espacio) setAviso(`Se cargan hasta ${MAXIMO} plantillas a la vez; se tomaron las primeras ${Math.max(espacio, 0)}.`);
    setFilas((fs) => [
      ...fs.filter((f) => f.estado.fase !== 'hecha'),
      ...nuevos.slice(0, Math.max(espacio, 0)).map((archivo, i) => ({
        clave: `${Date.now()}-${i}-${archivo.name}`, archivo, notas: '', estado: { fase: 'lista' } as Estado,
        tipoId: adivinarTipo(archivo.name, tipos) || (lista?.length === 1 && !fs.length ? inicial ?? '' : ''),
      })),
    ]);
  }

  async function cargarUna(f: Fila) {
    cambiar(f.clave, { estado: { fase: 'cargando' } });
    cambiar(f.clave, { estado: await enviar(f) });
  }

  async function cargarTodas() {
    setAviso(undefined);
    if (pendientes.some((f) => !f.tipoId)) return setAviso('Elija el tipo de escritura de cada archivo.');
    const repetido = pendientes.find((f, i) => pendientes.findIndex((g) => g.tipoId === f.tipoId) !== i);
    if (repetido) return setAviso(`Hay dos archivos para «${tipos.find((t) => t.id === repetido.tipoId)?.nombre}»: cárguelos en tandas distintas (cada uno será una versión).`);
    const grande = pendientes.find((f) => f.archivo.size > LIMITE_MB * 1024 * 1024);
    if (grande) return setAviso(`«${grande.archivo.name}» supera ${LIMITE_MB} MB.`);
    await Promise.all(pendientes.map(cargarUna));
    router.refresh();
  }

  const opciones = (grupo: TipoCargable['grupo']) => tipos.filter((t) => t.grupo === grupo).map((t) => <option key={t.id} value={t.id}>{t.nombre} · {t.detalle}</option>);

  return (
    <div>
      <div className="campo">
        <label htmlFor="carga-archivos">Archivos .docx (hasta {MAXIMO} a la vez)</label>
        <input id="carga-archivos" type="file" multiple disabled={enCurso} accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => { agregar(e.target.files); e.target.value = ''; }} />
        <div className="ayuda">Si el nombre del archivo contiene el tipo (p. ej. <code>hipoteca.docx</code>), se elige solo; revíselo.</div>
      </div>

      {filas.length > 0 && (
        <div className="tabla">
          <table className="tabla-apilable">
            <thead><tr><th>Archivo</th><th>Tipo de escritura</th><th>Notas</th><th>Resultado</th><th aria-label="Acciones" /></tr></thead>
            <tbody>
              {filas.map((f) => {
                const editable = f.estado.fase === 'lista' || f.estado.fase === 'error';
                return (
                  <tr key={f.clave}>
                    <td className="principal-celda"><strong style={{ overflowWrap: 'anywhere' }}>{f.archivo.name}</strong><div className="suave">{(f.archivo.size / 1024).toFixed(0)} KB</div></td>
                    <td data-etiqueta="Tipo">
                      <select aria-label={`Tipo de escritura de ${f.archivo.name}`} value={f.tipoId} disabled={!editable} onChange={(e) => cambiar(f.clave, { tipoId: e.target.value })}>
                        <option value="">— Elija el tipo —</option>
                        <optgroup label="Sin plantilla (nueva)">{opciones('nueva')}</optgroup>
                        <optgroup label="Nueva versión de una plantilla existente">{opciones('version')}</optgroup>
                      </select>
                    </td>
                    <td data-etiqueta="Notas">
                      <input type="text" aria-label={`Notas de ${f.archivo.name}`} value={f.notas} disabled={!editable} placeholder="Origen u observaciones" onChange={(e) => cambiar(f.clave, { notas: e.target.value })} />
                    </td>
                    <td data-etiqueta="Resultado">
                      {f.estado.fase === 'lista' && <span className="suave">Lista para cargar</span>}
                      {f.estado.fase === 'cargando' && <span className="fila" style={{ gap: '0.5rem' }}><span className="girador pequeno" aria-hidden="true" style={{ color: 'var(--primario)' }} /> Cargando…</span>}
                      {f.estado.fase === 'error' && <span className="texto-peligro">{f.estado.error}</span>}
                      {f.estado.fase === 'hecha' && <Resultado r={f.estado.r} />}
                    </td>
                    <td className="acciones">
                      {f.estado.fase === 'hecha'
                        ? <Link className="boton pequeno" href={`/plantillas/${f.estado.r.id}`}>Abrir v{f.estado.r.version}</Link>
                        : <button type="button" className="secundario pequeno" disabled={!editable} onClick={() => setFilas((fs) => fs.filter((x) => x.clave !== f.clave))}>Quitar</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="ayuda">Cargue escrituras modelo de la notaría, tal como están en Word: la IA las toma como base para redactar cada caso (no hace falta poner variables).</p>
      {aviso && <div className="aviso alerta" role="alert">{aviso}</div>}
      {enCurso && <div className="aviso info" role="status">Cargando {filas.filter((f) => f.estado.fase === 'cargando').length} plantilla(s). No cierre esta página.</div>}
      <button type="button" className="pequeno" disabled={enCurso || !pendientes.length} aria-busy={enCurso} onClick={cargarTodas}>
        {pendientes.length > 1 ? `Cargar ${pendientes.length} plantillas` : 'Cargar'}
      </button>
    </div>
  );
}

/** Botón «Cargar» de una fila de la lista: elige un .docx y lo carga como nueva versión del tipo */
export function CargaRapida({ tipoId }: { tipoId: string; nombre: string }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<Estado>({ fase: 'lista' });

  async function cargar(lista: FileList | null) {
    const archivo = lista?.[0];
    if (!archivo) return;
    if (archivo.size > LIMITE_MB * 1024 * 1024) return setEstado({ fase: 'error', error: `El archivo supera ${LIMITE_MB} MB.` });
    setEstado({ fase: 'cargando' });
    const r = await enviar({ archivo, tipoId, notas: '' });
    setEstado(r);
    if (r.fase === 'hecha') router.refresh();
  }

  return (
    <>
      {estado.fase === 'cargando' ? (
        <span className="fila" role="status" style={{ gap: '0.5rem' }}><span className="girador pequeno" aria-hidden="true" style={{ color: 'var(--primario)' }} /> Cargando…</span>
      ) : estado.fase === 'hecha' ? (
        <span className="fila" style={{ gap: '0.25rem' }}><Resultado r={estado.r} /><Link className="boton pequeno" href={`/plantillas/${estado.r.id}`}>Abrir v{estado.r.version}</Link></span>
      ) : (
        <span className="fila" style={{ gap: '0.25rem' }}>
          {estado.fase === 'error' && <span className="texto-peligro">{estado.error}</span>}
          <button type="button" className="secundario pequeno" onClick={() => entrada.current?.click()}>{estado.fase === 'error' ? 'Reintentar' : 'Cargar'}</button>
        </span>
      )}
      <input ref={entrada} type="file" hidden accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(e) => { cargar(e.target.files); e.target.value = ''; }} />
    </>
  );
}
