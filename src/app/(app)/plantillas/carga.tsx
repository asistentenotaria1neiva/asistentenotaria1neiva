'use client';
/**
 * Carga de varias plantillas a la vez: un archivo por fila, cada uno con su tipo de escritura.
 * Cada archivo va en su propia petición (api/plantillas/cargar); los de tipos distintos salen al mismo
 * tiempo y los del mismo tipo uno tras otro (cada uno toma el siguiente número de versión).
 * Cada archivo es el MODELO de redacción de su tipo de escritura: se guarda tal como viene (la IA lo
 * toma como base para redactar; no se convierte en variables).
 * Varios archivos del mismo tipo son variantes (por banco, obra, actos…): si el tipo aún tiene una
 * sola plantilla, pasa a admitir variantes. Al terminar, la IA compara las variantes cargadas sin
 * «cuándo usarla» y lo escribe para cada una (api/plantillas/variantes).
 */
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ResultadoCarga } from '@/lib/servicios/carga-plantillas';

const MAXIMO = 6;
const LIMITE_MB = 4; // Vercel limita cada petición a 4,5 MB

/** `variantes`: el tipo admite varias plantillas aprobadas; cada archivo es una variante (con su nombre y cuándo usarla) */
export interface TipoCargable { id: string; nombre: string; grupo: 'nueva' | 'version'; detalle: string; variantes?: boolean }

/** `criterios`: «cuándo usarla» escrito por la IA después de cargar */
type Hecha = ResultadoCarga & { criterios?: string };
type Estado = { fase: 'lista' } | { fase: 'cargando' } | { fase: 'hecha'; r: Hecha } | { fase: 'error'; error: string };
interface Fila { clave: string; archivo: File; tipoId: string; notas: string; variante: string; criterios: string; estado: Estado }

const sinTildes = (x: string) => x.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Tipo cuyo id aparece en el nombre del archivo ("compraventa_hipoteca v2.docx" → compraventa_hipoteca) */
function adivinarTipo(nombre: string, tipos: TipoCargable[]): string {
  const n = ` ${sinTildes(nombre).replace(/\.docx$/, '').replace(/[^a-z0-9]+/g, ' ')} `;
  return tipos.filter((t) => n.includes(` ${t.id.replace(/_/g, ' ')} `)).sort((a, b) => b.id.length - a.id.length)[0]?.id ?? '';
}

/** Sube un archivo a api/plantillas/cargar */
async function enviar(f: Pick<Fila, 'archivo' | 'tipoId' | 'notas'> & Partial<Pick<Fila, 'variante' | 'criterios'>> & { activarVariantes?: boolean }): Promise<Estado> {
  const datos = new FormData();
  datos.set('archivo', f.archivo);
  datos.set('tipoId', f.tipoId);
  datos.set('notas', f.notas);
  if (f.variante) datos.set('variante', f.variante);
  if (f.criterios) datos.set('criterios', f.criterios);
  if (f.activarVariantes) datos.set('activarVariantes', '1');
  try {
    const respuesta = await fetch('/api/plantillas/cargar', { method: 'POST', body: datos });
    const cuerpo = await respuesta.json().catch(() => ({ error: respuesta.status === 413 ? 'El archivo es demasiado grande.' : 'El servidor no respondió a tiempo. Revise la lista: la plantilla pudo haber quedado cargada.' }));
    return respuesta.ok ? { fase: 'hecha', r: cuerpo as ResultadoCarga } : { fase: 'error', error: (cuerpo as { error?: string }).error ?? 'No se pudo cargar la plantilla.' };
  } catch {
    return { fase: 'error', error: 'Se perdió la conexión con el servidor.' };
  }
}

type Generadas = { ok: true; variantes: { id: string; variante: string; criterios: string }[] } | { ok: false; error: string };

/** La IA escribe el nombre y «cuándo usarla» de las variantes recién cargadas (`ids`) de un tipo */
async function generarCriterios(tipoId: string, ids: string[]): Promise<Generadas> {
  try {
    const respuesta = await fetch('/api/plantillas/variantes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipoId, ids }) });
    const cuerpo = await respuesta.json().catch(() => ({}));
    return respuesta.ok ? { ok: true, variantes: (cuerpo as { variantes?: [] }).variantes ?? [] } : { ok: false, error: (cuerpo as { error?: string }).error ?? 'La IA no pudo escribir cuándo usar cada variante.' };
  } catch {
    return { ok: false, error: 'Se perdió la conexión con el servidor mientras la IA escribía cuándo usar cada variante.' };
  }
}

/** Ids de las variantes cargadas sin criterios, por tipo */
function sinCriterios(cargadas: { tipoId: string; r: ResultadoCarga }[]) {
  const m = new Map<string, string[]>();
  for (const { tipoId, r } of cargadas) if (r.variante && !r.conCriterios) m.set(tipoId, [...(m.get(tipoId) ?? []), r.id]);
  return m;
}

function Resultado({ r }: { r: Hecha }) {
  return (
    <>
      <span className="etiqueta ok">Cargada v{r.version}{r.variante ? ` (variante «${r.variante}»)` : ''}: pendiente de aprobación</span>
      {r.criterios && <div className="suave" style={{ marginTop: '0.25rem' }}>Se usa cuando (escrito por la IA): {r.criterios}</div>}
    </>
  );
}

export function CargaPlantillas({ tipos, inicial }: { tipos: TipoCargable[]; inicial?: string }) {
  const router = useRouter();
  const [filas, setFilas] = useState<Fila[]>([]);
  const [aviso, setAviso] = useState<string>();
  const [escribiendo, setEscribiendo] = useState(false);
  const enCurso = escribiendo || filas.some((f) => f.estado.fase === 'cargando');
  const pendientes = filas.filter((f) => f.estado.fase === 'lista' || f.estado.fase === 'error');
  const tipoDe = (id: string) => tipos.find((t) => t.id === id);
  // Una fila es variante si su tipo ya admite variantes o si hay otro archivo pendiente del mismo tipo
  const esVariante = (f: Fila) => !!f.tipoId && (!!tipoDe(f.tipoId)?.variantes || (pendientes.includes(f) && pendientes.filter((g) => g.tipoId === f.tipoId).length > 1));

  const cambiar = (clave: string, cambio: Partial<Fila>) => setFilas((fs) => fs.map((f) => (f.clave === clave ? { ...f, ...cambio } : f)));

  function agregar(lista: FileList | null) {
    setAviso(undefined);
    const nuevos = [...(lista ?? [])].filter((a) => !filas.some((f) => f.archivo.name === a.name && f.archivo.size === a.size));
    const espacio = MAXIMO - filas.filter((f) => f.estado.fase !== 'hecha').length;
    if (nuevos.length > espacio) setAviso(`Se cargan hasta ${MAXIMO} plantillas a la vez; se tomaron las primeras ${Math.max(espacio, 0)}.`);
    setFilas((fs) => [
      ...fs.filter((f) => f.estado.fase !== 'hecha'),
      ...nuevos.slice(0, Math.max(espacio, 0)).map((archivo, i) => ({
        clave: `${Date.now()}-${i}-${archivo.name}`, archivo, notas: '', variante: '', criterios: '', estado: { fase: 'lista' } as Estado,
        tipoId: adivinarTipo(archivo.name, tipos) || (!fs.length ? inicial ?? '' : ''),
      })),
    ]);
  }

  async function cargarTodas() {
    setAviso(undefined);
    if (pendientes.some((f) => !f.tipoId)) return setAviso('Elija el tipo de escritura de cada archivo.');
    const grande = pendientes.find((f) => f.archivo.size > LIMITE_MB * 1024 * 1024);
    if (grande) return setAviso(`«${grande.archivo.name}» supera ${LIMITE_MB} MB.`);
    // Varios archivos de un tipo con una sola plantilla: se cargan como variantes (el tipo pasa a admitirlas)
    const porTipo = new Map<string, Fila[]>();
    for (const f of pendientes) porTipo.set(f.tipoId, [...(porTipo.get(f.tipoId) ?? []), f]);
    const activar = [...porTipo].filter(([id, fs]) => fs.length > 1 && !tipoDe(id)?.variantes).map(([id]) => id);
    if (activar.length && !window.confirm(`Hay varios archivos para ${activar.map((id) => `«${tipoDe(id)?.nombre}»`).join(', ')}. Se cargarán como variantes de ese tipo de escritura: podrá tener varias plantillas aprobadas y la IA elegirá la que corresponda a cada caso. Al terminar, la IA escribirá cuándo usar cada una. ¿Continuar?`)) return;

    // Tipos distintos en paralelo; los del mismo tipo uno tras otro
    const cargadas: { tipoId: string; clave: string; r: ResultadoCarga }[] = [];
    await Promise.all([...porTipo].map(async ([tipoId, fs]) => {
      for (const f of fs) {
        cambiar(f.clave, { estado: { fase: 'cargando' } });
        const e = await enviar({ ...f, activarVariantes: activar.includes(tipoId) });
        cambiar(f.clave, { estado: e });
        if (e.fase === 'hecha') cargadas.push({ tipoId, clave: f.clave, r: e.r });
      }
    }));

    const faltan = sinCriterios(cargadas);
    if (faltan.size) {
      setEscribiendo(true);
      const errores: string[] = [];
      await Promise.all([...faltan].map(async ([tipoId, ids]) => {
        const g = await generarCriterios(tipoId, ids);
        if (!g.ok) return errores.push(`${tipoDe(tipoId)?.nombre}: ${g.error}`);
        for (const v of g.variantes) {
          const c = cargadas.find((x) => x.r.id === v.id);
          if (c) cambiar(c.clave, { estado: { fase: 'hecha', r: { ...c.r, variante: v.variante, criterios: v.criterios } } });
        }
      }));
      setEscribiendo(false);
      if (errores.length) setAviso(errores.join(' '));
    }
    router.refresh();
  }

  const opciones = (grupo: TipoCargable['grupo']) => tipos.filter((t) => t.grupo === grupo).map((t) => <option key={t.id} value={t.id}>{t.nombre} · {t.detalle}</option>);

  return (
    <div>
      <div className="campo">
        <label htmlFor="carga-archivos">Archivos .docx (hasta {MAXIMO} a la vez)</label>
        <input id="carga-archivos" type="file" multiple disabled={enCurso} accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => { agregar(e.target.files); e.target.value = ''; }} />
        <div className="ayuda">
          Si el nombre del archivo contiene el tipo (p. ej. <code>hipoteca.docx</code>), se elige solo; revíselo.
          Varios archivos con el mismo tipo se cargan como variantes de ese tipo, y la IA escribe cuándo usar cada una.
        </div>
      </div>

      {filas.length > 0 && (
        <div className="tabla">
          <table className="tabla-apilable">
            <thead><tr><th>Archivo</th><th>Tipo de escritura</th><th>Notas</th><th>Resultado</th><th aria-label="Acciones" /></tr></thead>
            <tbody>
              {filas.map((f) => {
                const editable = !enCurso && (f.estado.fase === 'lista' || f.estado.fase === 'error');
                const variante = editable && esVariante(f);
                return (
                  <tr key={f.clave}>
                    <td className="principal-celda"><strong style={{ overflowWrap: 'anywhere' }}>{f.archivo.name}</strong><div className="suave">{(f.archivo.size / 1024).toFixed(0)} KB</div></td>
                    <td data-etiqueta="Tipo">
                      <select aria-label={`Tipo de escritura de ${f.archivo.name}`} value={f.tipoId} disabled={!editable} onChange={(e) => cambiar(f.clave, { tipoId: e.target.value })}>
                        <option value="">— Elija el tipo —</option>
                        <optgroup label="Sin plantilla (nueva)">{opciones('nueva')}</optgroup>
                        <optgroup label="Nueva versión de una plantilla existente">{opciones('version')}</optgroup>
                      </select>
                      {variante && (
                        <input type="text" aria-label={`Nombre de la variante de ${f.archivo.name}`} value={f.variante} style={{ marginTop: '0.25rem' }}
                          placeholder="Nombre de la variante (vacío: lo sugiere la IA)" onChange={(e) => cambiar(f.clave, { variante: e.target.value })} />
                      )}
                    </td>
                    <td data-etiqueta="Notas">
                      <input type="text" aria-label={`Notas de ${f.archivo.name}`} value={f.notas} disabled={!editable} placeholder="Origen u observaciones" onChange={(e) => cambiar(f.clave, { notas: e.target.value })} />
                      {variante && (
                        <input type="text" aria-label={`Cuándo usar la variante de ${f.archivo.name}`} value={f.criterios} style={{ marginTop: '0.25rem' }}
                          placeholder="Cuándo usarla (vacío: lo escribe la IA)" onChange={(e) => cambiar(f.clave, { criterios: e.target.value })} />
                      )}
                    </td>
                    <td data-etiqueta="Resultado">
                      {f.estado.fase === 'lista' && <span className="suave">{esVariante(f) && !tipoDe(f.tipoId)?.variantes ? 'Lista para cargar como variante' : 'Lista para cargar'}</span>}
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
      {enCurso && !escribiendo && <div className="aviso info" role="status">Cargando {filas.filter((f) => f.estado.fase === 'cargando').length} plantilla(s). No cierre esta página.</div>}
      {escribiendo && <div className="aviso info" role="status">La IA está comparando las variantes y escribiendo cuándo usar cada una…</div>}
      <button type="button" className="pequeno" disabled={enCurso || !pendientes.length} aria-busy={enCurso} onClick={cargarTodas}>
        {pendientes.length > 1 ? `Cargar ${pendientes.length} plantillas` : 'Cargar'}
      </button>
    </div>
  );
}

type EstadoRapida =
  | { fase: 'lista' }
  | { fase: 'cargando'; texto: string }
  | { fase: 'hecha'; r: Hecha[]; aviso?: string }
  | { fase: 'error'; error: string };

/**
 * Botón «Cargar» de una fila de la lista: elige uno o varios .docx. Uno se carga como plantilla del
 * tipo; varios, como variantes del tipo (que pasa a admitirlas), y la IA escribe cuándo usar cada una.
 */
export function CargaRapida({ tipoId, nombre }: { tipoId: string; nombre: string }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<EstadoRapida>({ fase: 'lista' });

  async function cargar(lista: FileList | null) {
    const archivos = [...(lista ?? [])];
    if (!archivos.length) return;
    if (archivos.length > MAXIMO) return setEstado({ fase: 'error', error: `Se cargan hasta ${MAXIMO} variantes a la vez.` });
    const grande = archivos.find((a) => a.size > LIMITE_MB * 1024 * 1024);
    if (grande) return setEstado({ fase: 'error', error: `«${grande.name}» supera ${LIMITE_MB} MB.` });
    const varias = archivos.length > 1;
    if (varias && !window.confirm(`Se cargarán ${archivos.length} plantillas como variantes de «${nombre}»: la IA elegirá la que corresponda a cada caso y ahora escribirá cuándo usar cada una. ¿Continuar?`)) return;

    // Una tras otra: cada una toma el siguiente número de versión
    const hechas: Hecha[] = [];
    const errores: string[] = [];
    for (const [i, archivo] of archivos.entries()) {
      setEstado({ fase: 'cargando', texto: varias ? `Cargando ${i + 1} de ${archivos.length}…` : 'Cargando…' });
      const e = await enviar({ archivo, tipoId, notas: '', activarVariantes: varias });
      if (e.fase === 'hecha') hechas.push(e.r);
      else if (e.fase === 'error') errores.push(varias ? `«${archivo.name}»: ${e.error}` : e.error);
    }
    if (!hechas.length) return setEstado({ fase: 'error', error: errores.join(' ') });

    const ids = sinCriterios(hechas.map((r) => ({ tipoId, r }))).get(tipoId) ?? [];
    if (varias && ids.length) {
      setEstado({ fase: 'cargando', texto: 'La IA está escribiendo cuándo usar cada variante…' });
      const g = await generarCriterios(tipoId, ids);
      if (g.ok) for (const v of g.variantes) { const h = hechas.find((x) => x.id === v.id); if (h) Object.assign(h, { variante: v.variante, criterios: v.criterios }); }
      else errores.push(g.error);
    }
    setEstado({ fase: 'hecha', r: hechas, aviso: errores.join(' ') || undefined });
    router.refresh();
  }

  if (estado.fase === 'cargando') {
    return <span className="fila" role="status" style={{ gap: '0.5rem' }}><span className="girador pequeno" aria-hidden="true" style={{ color: 'var(--primario)' }} /> {estado.texto}</span>;
  }
  if (estado.fase === 'hecha') {
    const [primera] = estado.r;
    return (
      <span className="fila" style={{ gap: '0.25rem' }}>
        {estado.r.length === 1
          ? <Resultado r={primera} />
          : <span className="etiqueta ok">{estado.r.length} variantes cargadas: pendientes de aprobación</span>}
        <Link className="boton pequeno" href={`/plantillas/${primera.id}`}>{estado.r.length === 1 ? `Abrir v${primera.version}` : 'Ver variantes'}</Link>
        {estado.aviso && <span className="texto-peligro">{estado.aviso}</span>}
      </span>
    );
  }
  return (
    <>
      <span className="fila" style={{ gap: '0.25rem' }}>
        {estado.fase === 'error' && <span className="texto-peligro">{estado.error}</span>}
        <button type="button" className="secundario pequeno" title="Puede elegir varios archivos: se cargan como variantes del tipo" onClick={() => entrada.current?.click()}>{estado.fase === 'error' ? 'Reintentar' : 'Cargar'}</button>
      </span>
      <input ref={entrada} type="file" hidden multiple accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(e) => { cargar(e.target.files); e.target.value = ''; }} />
    </>
  );
}
