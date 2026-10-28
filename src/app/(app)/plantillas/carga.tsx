'use client';
/**
 * Carga de varias plantillas a la vez: un archivo por fila, cada uno con su tipo de escritura.
 * Cada archivo va en su propia petición (api/plantillas/cargar) y todas salen al mismo tiempo,
 * así la conversión del caso real y la revisión de la IA corren en paralelo.
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

/** Sube un archivo a api/plantillas/cargar; la respuesta trae la conversión y si el archivo es del tipo elegido */
async function enviar(f: Pick<Fila, 'archivo' | 'tipoId' | 'notas'> & { otros?: File[] }, convertir: boolean): Promise<Estado> {
  const datos = new FormData();
  datos.set('archivo', f.archivo);
  datos.set('tipoId', f.tipoId);
  datos.set('notas', f.notas);
  datos.set('convertir', convertir ? '1' : '');
  for (const o of f.otros ?? []) datos.append('otros', o);
  try {
    const respuesta = await fetch('/api/plantillas/cargar', { method: 'POST', body: datos });
    const cuerpo = await respuesta.json().catch(() => ({ error: respuesta.status === 413 ? 'El archivo es demasiado grande.' : 'El servidor no respondió a tiempo. Revise la lista: la plantilla pudo haber quedado cargada.' }));
    return respuesta.ok ? { fase: 'hecha', r: cuerpo as ResultadoCarga } : { fase: 'error', error: (cuerpo as { error?: string }).error ?? 'No se pudo cargar la plantilla.' };
  } catch {
    return { fase: 'error', error: 'Se perdió la conexión con el servidor.' };
  }
}

function Resultado({ r }: { r: ResultadoCarga }) {
  return (
    <div className="fila" style={{ gap: '0.3rem' }}>
      <Conversion c={r.conversion} />
      <TipoVerificado r={r} />
    </div>
  );
}

/** Lo único que la IA verifica al cargar: que el archivo sea del tipo de escritura elegido */
function TipoVerificado({ r }: { r: ResultadoCarga }) {
  if (r.tipoCorrecto === null) return null;
  return r.tipoCorrecto
    ? <span className="etiqueta ok" title={r.motivoTipo ?? undefined}>Es {r.tipo}</span>
    : <span className="etiqueta critica" title={r.motivoTipo ?? undefined}>No es {r.tipo}{r.motivoTipo ? `: ${r.motivoTipo}` : ''}</span>;
}

function Conversion({ c }: { c: ResultadoCarga['conversion'] }) {
  if (!c) return null;
  if (c.error) return <span className="etiqueta advertencia" title={c.error}>No se convirtió: se cargó tal cual</span>;
  if (!c.esCasoReal) return <span className="etiqueta">Ya era plantilla</span>;
  return <span className="etiqueta informativa">Caso real: {c.reemplazos} dato(s) → variables{c.noAplicados ? ` · ${c.noAplicados} sin cambiar` : ''}</span>;
}

export function CargaPlantillas({ tipos, inicial }: { tipos: TipoCargable[]; inicial?: string }) {
  const router = useRouter();
  const [filas, setFilas] = useState<Fila[]>([]);
  const [convertir, setConvertir] = useState(true);
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
    cambiar(f.clave, { estado: await enviar(f, convertir) });
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
                      {f.estado.fase === 'cargando' && <span className="fila" style={{ gap: '0.4rem' }}><span className="girador pequeno" aria-hidden="true" style={{ color: 'var(--primario)' }} /> Analizando…</span>}
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

      <label className="casilla" style={{ marginBottom: '0.75rem' }}>
        <input type="checkbox" checked={convertir} disabled={enCurso} onChange={(e) => setConvertir(e.target.checked)} />
        Si un archivo es la escritura de un caso real, cambiar sus datos por variables con la IA
      </label>
      {aviso && <div className="aviso alerta" role="alert">{aviso}</div>}
      {enCurso && <div className="aviso info" role="status">Analizando {filas.filter((f) => f.estado.fase === 'cargando').length} plantilla(s) al mismo tiempo. Puede tardar unos minutos; no cierre esta página.</div>}
      <button type="button" className="pequeno" disabled={enCurso || !pendientes.length} aria-busy={enCurso} onClick={cargarTodas}>
        {pendientes.length > 1 ? `Cargar y analizar ${pendientes.length} plantillas` : 'Cargar y analizar'}
      </button>
    </div>
  );
}

/**
 * Botón «Cargar» de una fila de la lista: abre de una vez el selector de archivos (uno o varios) y
 * una ventana para analizarlos con la IA. Con varios archivos, uno es la base (su formato es el de
 * la plantilla) y los demás son otros casos del mismo tipo que la IA compara para saber qué es
 * texto fijo y qué son datos. Al analizar, la ventana se cierra y la fila muestra el avance, así
 * se pueden cargar otras plantillas mientras tanto.
 */
const MAXIMO_CASOS = 6;

export function CargaRapida({ tipoId, nombre }: { tipoId: string; nombre: string }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const ventana = useRef<HTMLDialogElement>(null);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [base, setBase] = useState(0);
  const [notas, setNotas] = useState('');
  const [convertir, setConvertir] = useState(true);
  const [aviso, setAviso] = useState<string>();
  const [estado, setEstado] = useState<Estado>({ fase: 'lista' });
  const varios = archivos.length > 1;
  const total = archivos.reduce((s, a) => s + a.size, 0);
  const grande = total > LIMITE_MB * 1024 * 1024;

  function elegir(lista: FileList | null) {
    // Con la ventana abierta se agregan a los que ya hay; si no, empieza una carga nueva
    const previos = ventana.current?.open ? archivos : [];
    const nuevos = [...(lista ?? [])].filter((a) => !previos.some((x) => x.name === a.name && x.size === a.size));
    if (!nuevos.length) return;
    const todos = [...previos, ...nuevos];
    setAviso(todos.length > MAXIMO_CASOS ? `Se usan hasta ${MAXIMO_CASOS} archivos; se tomaron los primeros ${MAXIMO_CASOS}.` : undefined);
    if (!ventana.current?.open) { setBase(0); setNotas(''); }
    setArchivos(todos.slice(0, MAXIMO_CASOS));
    setEstado({ fase: 'lista' });
    if (!ventana.current?.open) ventana.current?.showModal();
  }

  function quitar(i: number) {
    setArchivos((as) => as.filter((_, j) => j !== i));
    setBase((b) => (i === b ? 0 : i < b ? b - 1 : b));
  }

  async function analizar() {
    if (!archivos.length || grande) return;
    ventana.current?.close();
    setEstado({ fase: 'cargando' });
    const r = await enviar({ archivo: archivos[base], otros: archivos.filter((_, i) => i !== base), tipoId, notas }, convertir || varios);
    setEstado(r);
    if (r.fase === 'hecha') router.refresh();
  }

  return (
    <>
      {estado.fase === 'cargando' ? (
        <span className="fila" role="status" style={{ gap: '0.4rem' }}><span className="girador pequeno" aria-hidden="true" style={{ color: 'var(--primario)' }} /> Analizando con IA…</span>
      ) : estado.fase === 'hecha' ? (
        <span className="fila" style={{ gap: '0.3rem' }}><Resultado r={estado.r} /><Link className="boton pequeno" href={`/plantillas/${estado.r.id}`}>Abrir v{estado.r.version}</Link></span>
      ) : estado.fase === 'error' ? (
        <span className="fila" style={{ gap: '0.3rem' }}>
          <span className="texto-peligro">{estado.error}</span>
          <button type="button" className="secundario pequeno" onClick={() => ventana.current?.showModal()}>Reintentar</button>
        </span>
      ) : (
        <button type="button" className="secundario pequeno" onClick={() => entrada.current?.click()}>Cargar</button>
      )}
      <input ref={entrada} type="file" hidden multiple accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(e) => { elegir(e.target.files); e.target.value = ''; }} />
      <dialog ref={ventana} className="ventana" aria-labelledby={`ventana-${tipoId}`}>
        <h2 id={`ventana-${tipoId}`}>Cargar plantilla: {nombre}</h2>
        {varios && <p className="suave">La IA compara los {archivos.length} casos para separar el texto fijo de los datos y arma la plantilla sobre el archivo base, con su mismo formato.</p>}
        <ul className="lista-conversion">
          {archivos.map((a, i) => (
            <li key={`${a.name}-${a.size}`} className="fila entre">
              {varios ? (
                <label className="casilla" style={{ margin: 0 }}>
                  <input type="radio" name={`base-${tipoId}`} checked={i === base} onChange={() => setBase(i)} />
                  <span><strong style={{ overflowWrap: 'anywhere' }}>{a.name}</strong> <span className="suave">· {(a.size / 1024).toFixed(0)} KB{i === base ? ' · base' : ''}</span></span>
                </label>
              ) : <span><strong style={{ overflowWrap: 'anywhere' }}>{a.name}</strong> <span className="suave">· {(a.size / 1024).toFixed(0)} KB</span></span>}
              {varios && <button type="button" className="secundario pequeno" onClick={() => quitar(i)}>Quitar</button>}
            </li>
          ))}
        </ul>
        {varios && <p className="ayuda">Marque como base el archivo cuyo formato quiere conservar.</p>}
        {aviso && <div className="aviso alerta" role="alert">{aviso}</div>}
        {grande && <div className="aviso alerta" role="alert">Entre todos, los archivos superan {LIMITE_MB} MB.</div>}
        {estado.fase === 'error' && <div className="aviso error" role="alert">{estado.error}</div>}
        <div className="campo">
          <label htmlFor={`notas-${tipoId}`}>Notas</label>
          <input id={`notas-${tipoId}`} type="text" value={notas} placeholder="Origen u observaciones" onChange={(e) => setNotas(e.target.value)} />
        </div>
        {!varios && (
          <label className="casilla" style={{ marginBottom: '0.75rem' }}>
            <input type="checkbox" checked={convertir} onChange={(e) => setConvertir(e.target.checked)} />
            Si es la escritura de un caso real, cambiar sus datos por variables con la IA
          </label>
        )}
        <p className="ayuda">Al analizar, esta ventana se cierra y la fila muestra el avance: puede seguir cargando otras plantillas.</p>
        <div className="fila" style={{ justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button type="button" className="secundario pequeno" onClick={() => ventana.current?.close()}>Cancelar</button>
          <button type="button" className="secundario pequeno" disabled={archivos.length >= MAXIMO_CASOS} onClick={() => entrada.current?.click()}>Agregar archivos</button>
          <button type="button" className="pequeno" disabled={!archivos.length || grande} onClick={analizar}>Analizar con IA</button>
        </div>
      </dialog>
    </>
  );
}
