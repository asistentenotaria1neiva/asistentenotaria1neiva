'use client';
/**
 * Asistente por pasos generado a partir de los esquemas de formulario.
 *  - Valida obligatoriedad y formato en el navegador (mismas reglas que el servidor).
 *  - Muestra los valores en letras generados automáticamente.
 *  - Muestra las sugerencias de la IA con su fuente (documento, página, fragmento) y confianza.
 */
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Campo, Paso } from '@/lib/escritura/esquemas';
import type { DatosExpediente, Persona, Inmueble } from '@/lib/escritura/tipos';
import { validarPaso, campoVisible, leerRuta, escribirRuta, type Errores } from '@/lib/escritura/validar-formulario';
import { pesosEnLetras, medidaEnLetras } from '@/lib/texto/numeros-a-letras';
import type { Resultado } from '../../acciones';
import type { ActualizacionPaso } from '@/lib/servicios/tipos-acciones';

export interface SugerenciaVista {
  id: string; campo: string; valor: unknown; pagina: number | null; fragmento: string | null;
  confianza: 'ALTA' | 'MEDIA' | 'BAJA'; revisionManual: boolean; documento: string;
}

interface Props {
  expedienteId: string;
  pasoInicial: number;
  pasos: { paso: Paso; acto?: string }[];
  datosIniciales: DatosExpediente;
  sugerencias: SugerenciaVista[];
  editable: boolean;
  guardar: (id: string, act: ActualizacionPaso) => Promise<Resultado>;
  aplicar: (expedienteId: string, datoId: string) => Promise<Resultado>;
  descartar: (expedienteId: string, datoId: string, motivo: string) => Promise<Resultado>;
}

const digitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');

/** Sugerencias que apuntan a una persona/inmueble concreto o a un acto */
function sugerenciasPara(sugs: SugerenciaVista[], base: 'persona' | 'inmueble' | 'acto', entidad: Persona | Inmueble | string | null, subcampo: string) {
  return sugs.filter((s) => {
    const m = /^(persona|inmueble|catastral|acto):([^.]+)\.(.+)$/.exec(s.campo);
    if (!m || m[3] !== subcampo) return false;
    if (base === 'acto') return m[1] === 'acto' && m[2] === entidad;
    if (base === 'persona') return m[1] === 'persona' && !!entidad && digitos((entidad as Persona).numero_documento) === digitos(m[2]);
    const i = entidad as Inmueble;
    if (m[1] === 'inmueble') return (i.matricula ?? '').toUpperCase() === m[2].toUpperCase();
    if (m[1] === 'catastral') return [i.cedula_catastral, i.cedula_catastral_paz_salvo].some((c) => digitos(c) && (digitos(c).endsWith(m[2]) || m[2].endsWith(digitos(c))));
    return false;
  });
}

function Sugerencias({ sugs, actual, onAplicar, onDescartar, editable }: { sugs: SugerenciaVista[]; actual: unknown; onAplicar: (s: SugerenciaVista) => void; onDescartar: (s: SugerenciaVista) => void; editable: boolean }) {
  return (
    <>
      {sugs.map((s) => {
        const igual = String(s.valor) === String(actual ?? '');
        return (
          <div key={s.id} className={`sugerencia ${s.revisionManual ? 'revision' : ''}`}>
            <div className="fila entre">
              <span><strong>IA sugiere:</strong> {String(s.valor)} {igual && <span className="etiqueta ok">coincide</span>}</span>
              <span className={`etiqueta ${s.confianza.toLowerCase()}`}>Confianza {s.confianza.toLowerCase()}</span>
            </div>
            <div className="suave">Fuente: {s.documento}{s.pagina ? `, página ${s.pagina}` : ''}{s.revisionManual ? ' · REQUIERE REVISIÓN MANUAL' : ''}</div>
            {s.fragmento && <blockquote>«{s.fragmento}»</blockquote>}
            {editable && !igual && (
              <div className="fila">
                <button type="button" className="pequeno" onClick={() => onAplicar(s)}>Usar este valor</button>
                <button type="button" className="secundario pequeno" onClick={() => onDescartar(s)}>Descartar</button>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function Entrada({ campo, valor, onCambio, error, datos, propioId, deshabilitado }: {
  campo: Campo; valor: unknown; onCambio: (v: unknown) => void; error?: string; datos: DatosExpediente; propioId?: string; deshabilitado: boolean;
}) {
  const id = `c-${propioId ?? 'x'}-${campo.id}`;
  const clase = error ? 'invalido' : undefined;
  const nombrePersona = (p: Persona) => `${p.nombre || '(sin nombre)'} · ${p.numero_documento || 's/d'}`;
  const nombreInmueble = (i: Inmueble) => `${i.matricula || 's/matrícula'} · ${i.direccion || ''}`;
  let control: React.ReactNode;
  switch (campo.tipo) {
    case 'textoLargo':
      control = <textarea id={id} className={clase} value={String(valor ?? '')} disabled={deshabilitado} onChange={(e) => onCambio(e.target.value)} />;
      break;
    case 'booleano':
      control = <label className="casilla"><input id={id} type="checkbox" checked={valor === true} disabled={deshabilitado} onChange={(e) => onCambio(e.target.checked)} /> {campo.etiqueta}</label>;
      break;
    case 'opciones':
      control = (
        <select id={id} className={clase} value={valor === undefined || valor === null ? '' : String(valor)} disabled={deshabilitado} onChange={(e) => onCambio(e.target.value || undefined)}>
          <option value="">— Seleccione —</option>
          {campo.opciones?.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
        </select>
      );
      break;
    case 'fecha':
      control = <input id={id} type="date" className={clase} value={String(valor ?? '')} disabled={deshabilitado} onChange={(e) => onCambio(e.target.value)} />;
      break;
    case 'entero':
      control = <input id={id} type="number" className={clase} value={valor === undefined ? '' : String(valor)} disabled={deshabilitado} onChange={(e) => onCambio(e.target.value === '' ? undefined : Number(e.target.value))} />;
      break;
    case 'moneda': {
      const n = Number(digitos(valor));
      control = (
        <>
          <input id={id} type="text" inputMode="numeric" className={clase} value={valor === undefined ? '' : (n ? '$' + n.toLocaleString('es-CO') : String(valor))} disabled={deshabilitado}
            onChange={(e) => onCambio(digitos(e.target.value) ? Number(digitos(e.target.value)) : undefined)} />
          {n > 0 && <div className="ayuda">En letras (automático): {pesosEnLetras(n)}</div>}
        </>
      );
      break;
    }
    case 'medida': {
      const n = Number(String(valor ?? '').replace(',', '.'));
      control = (
        <>
          <input id={id} type="text" inputMode="decimal" className={clase} value={String(valor ?? '')} disabled={deshabilitado} onChange={(e) => onCambio(e.target.value)} />
          {n > 0 && <div className="ayuda">En letras: {medidaEnLetras(n, 'METROS CUADRADOS', 'M2')}</div>}
        </>
      );
      break;
    }
    case 'persona':
      control = (
        <select id={id} className={clase} value={String(valor ?? '')} disabled={deshabilitado} onChange={(e) => onCambio(e.target.value || undefined)}>
          <option value="">— Ninguna —</option>
          {datos.personas.filter((p) => p.id !== propioId).map((p) => <option key={p.id} value={p.id}>{nombrePersona(p)}</option>)}
        </select>
      );
      break;
    case 'personas':
    case 'inmuebles': {
      const lista = campo.tipo === 'personas' ? datos.personas : datos.inmuebles;
      const sel = Array.isArray(valor) ? (valor as string[]) : [];
      control = (
        <div className={clase}>
          {!lista.length && <p className="suave">Primero registre {campo.tipo === 'personas' ? 'las personas' : 'los inmuebles'} en su paso.</p>}
          {lista.map((x) => (
            <label key={x.id} className="casilla">
              <input type="checkbox" checked={sel.includes(x.id)} disabled={deshabilitado}
                onChange={(e) => onCambio(e.target.checked ? [...sel, x.id] : sel.filter((s) => s !== x.id))} />
              {campo.tipo === 'personas' ? nombrePersona(x as Persona) : nombreInmueble(x as Inmueble)}
            </label>
          ))}
        </div>
      );
      break;
    }
    case 'inmueble':
      control = (
        <select id={id} className={clase} value={String(valor ?? '')} disabled={deshabilitado} onChange={(e) => onCambio(e.target.value || undefined)}>
          <option value="">— Seleccione —</option>
          {datos.inmuebles.map((i) => <option key={i.id} value={i.id}>{nombreInmueble(i)}</option>)}
        </select>
      );
      break;
    default:
      control = <input id={id} type="text" className={clase} value={String(valor ?? '')} disabled={deshabilitado} onChange={(e) => onCambio(e.target.value)} />;
  }
  return (
    <div className="campo">
      {campo.tipo !== 'booleano' && <label htmlFor={id}>{campo.etiqueta}{campo.obligatorio ? ' *' : ''}</label>}
      {control}
      {campo.ayuda && <div className="ayuda">{campo.ayuda}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
}

function Grupo({ campos, valores, onCambio, errores, prefijo, datos, propioId, deshabilitado, sugerenciasDe, onAplicar, onDescartar }: {
  campos: Campo[]; valores: Record<string, unknown>; onCambio: (ruta: string, v: unknown) => void; errores: Errores; prefijo: string;
  datos: DatosExpediente; propioId?: string; deshabilitado: boolean; sugerenciasDe?: (subcampo: string) => SugerenciaVista[];
  onAplicar: (s: SugerenciaVista) => void; onDescartar: (s: SugerenciaVista) => void;
}) {
  return (
    <div className="rejilla dos">
      {campos.filter((c) => campoVisible(c, valores)).map((c) => (
        <div key={c.id} style={c.tipo === 'textoLargo' || c.tipo === 'lista' || c.tipo === 'personas' ? { gridColumn: '1 / -1' } : undefined}>
          {c.tipo === 'lista' ? (
            <ListaSimple campo={c} valor={leerRuta(valores, c.id)} onCambio={(v) => onCambio(c.id, v)} errores={errores} prefijo={`${prefijo}${c.id}.`} datos={datos} deshabilitado={deshabilitado} />
          ) : (
            <Entrada campo={c} valor={leerRuta(valores, c.id)} onCambio={(v) => onCambio(c.id, v)} error={errores[`${prefijo}${c.id}`]} datos={datos} propioId={propioId} deshabilitado={deshabilitado} />
          )}
          {sugerenciasDe && <Sugerencias sugs={sugerenciasDe(c.id)} actual={leerRuta(valores, c.id)} onAplicar={onAplicar} onDescartar={onDescartar} editable={!deshabilitado} />}
        </div>
      ))}
    </div>
  );
}

function ListaSimple({ campo, valor, onCambio, errores, prefijo, datos, deshabilitado }: { campo: Campo; valor: unknown; onCambio: (v: unknown) => void; errores: Errores; prefijo: string; datos: DatosExpediente; deshabilitado: boolean }) {
  const items = Array.isArray(valor) ? (valor as Record<string, unknown>[]) : [];
  const predeterminados = () => Object.fromEntries((campo.subcampos ?? []).filter((s) => s.predeterminado !== undefined).map((s) => [s.id, s.predeterminado]));
  return (
    <fieldset className="tarjeta">
      <legend><strong>{campo.etiqueta}{campo.obligatorio ? ' *' : ''}</strong></legend>
      {items.map((it, i) => (
        <div key={i} className="tarjeta">
          <Grupo campos={campo.subcampos ?? []} valores={it} errores={errores} prefijo={`${prefijo}${i}.`} datos={datos} deshabilitado={deshabilitado}
            onCambio={(ruta, v) => { const n = structuredClone(items); escribirRuta(n[i], ruta, v); onCambio(n); }} onAplicar={() => {}} onDescartar={() => {}} />
          {!deshabilitado && <button type="button" className="secundario pequeno" onClick={() => onCambio(items.filter((_, j) => j !== i))}>Quitar</button>}
        </div>
      ))}
      {errores[prefijo.slice(0, -1)] && <div className="error">{errores[prefijo.slice(0, -1)]}</div>}
      {!deshabilitado && <button type="button" className="secundario pequeno" onClick={() => onCambio([...items, predeterminados()])}>Agregar</button>}
    </fieldset>
  );
}

export default function FormularioPasos({ expedienteId, pasoInicial, pasos, datosIniciales, sugerencias, editable, guardar, aplicar, descartar }: Props) {
  const router = useRouter();
  const [datos, setDatos] = useState<DatosExpediente>(datosIniciales);
  const [indice, setIndiceEstado] = useState(Math.min(pasoInicial, pasos.length - 1));
  // El paso actual queda en la URL para no perderlo al recargar
  const setIndice = (n: number | ((i: number) => number)) => setIndiceEstado((actual) => {
    const nuevo = typeof n === 'function' ? n(actual) : n;
    window.history.replaceState(null, '', `?paso=${nuevo}`);
    return nuevo;
  });
  const [errores, setErrores] = useState<Errores>({});
  const [mensaje, setMensaje] = useState<Resultado>();
  const [sucio, setSucio] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const { paso, acto } = pasos[indice];
  const seccion = useRef<HTMLElement>(null);
  const listaPasos = useRef<HTMLOListElement>(null);
  const indiceMostrado = useRef(indice);

  // Al cambiar de paso se vuelve al inicio del paso y el paso activo queda visible en la lista (en móvil se desplaza a lo ancho)
  useEffect(() => {
    if (indiceMostrado.current === indice) return;
    indiceMostrado.current = indice;
    const s = seccion.current;
    if (s && s.getBoundingClientRect().top < 0) s.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const lista = listaPasos.current;
    const activo = lista?.querySelector<HTMLElement>('[aria-current="step"]');
    if (lista && activo && lista.scrollWidth > lista.clientWidth) lista.scrollBy({ left: activo.getBoundingClientRect().left - lista.getBoundingClientRect().left - 16, behavior: 'smooth' });
  }, [indice]);

  // Advierte antes de cerrar o recargar la página con cambios sin guardar
  useEffect(() => {
    if (!sucio || !editable) return;
    const alSalir = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', alSalir);
    return () => window.removeEventListener('beforeunload', alSalir);
  }, [sucio, editable]);

  const valorPaso = useMemo(() => {
    if (paso.id === 'escritura') return datos.escritura;
    if (paso.id === 'personas') return datos.personas;
    if (paso.id === 'inmuebles') return datos.inmuebles;
    return datos.actos[acto!] ?? {};
  }, [datos, paso.id, acto]);

  const actualizar = (fn: (d: DatosExpediente) => void) => {
    setDatos((d) => { const n = structuredClone(d); fn(n); return n; });
    setSucio(true);
  };

  const actualizacion = (): ActualizacionPaso => {
    if (paso.id === 'escritura') return { paso: 'escritura', valor: datos.escritura };
    if (paso.id === 'personas') return { paso: 'personas', valor: datos.personas };
    if (paso.id === 'inmuebles') return { paso: 'inmuebles', valor: datos.inmuebles };
    return { paso: 'acto', acto: acto!, valor: (datos.actos[acto!] ?? {}) as Record<string, unknown> };
  };

  const guardarPaso = (avanzar: number) => iniciar(async () => {
    const locales = validarPaso(paso, valorPaso);
    const r = editable ? await guardar(expedienteId, actualizacion()) : { ok: 'Solo lectura.' };
    const servidor = r.errores ?? {};
    const todos = { ...remapear(locales, paso, acto), ...servidor };
    setErrores(todos);
    setMensaje(r);
    setSucio(false);
    if (!Object.keys(todos).length && !r.error && avanzar) setIndice((i) => Math.min(pasos.length - 1, Math.max(0, i + avanzar)));
  });

  const onAplicar = (s: SugerenciaVista) => iniciar(async () => {
    if (sucio && editable) await guardar(expedienteId, actualizacion());
    const r = await aplicar(expedienteId, s.id);
    setMensaje(r);
    router.refresh();
  });
  const onDescartar = (s: SugerenciaVista) => {
    const motivo = window.prompt('¿Por qué descarta la sugerencia? (queda registrado como caso de aprendizaje)');
    if (!motivo) return;
    iniciar(async () => { setMensaje(await descartar(expedienteId, s.id, motivo)); router.refresh(); });
  };

  // Sugerencias de personas/inmuebles que aún no existen en el formulario
  const nuevas = sugerencias.filter((s) => {
    const m = /^(persona|inmueble|catastral):([^.]+)\.(nombre|matricula|cedula_catastral_paz_salvo)$/.exec(s.campo);
    if (!m) return false;
    if (m[1] === 'persona') return !datos.personas.some((p) => digitos(p.numero_documento) === digitos(m[2]));
    if (m[1] === 'inmueble') return !datos.inmuebles.some((i) => (i.matricula ?? '').toUpperCase() === m[2].toUpperCase());
    return !datos.inmuebles.some((i) => [i.cedula_catastral, i.cedula_catastral_paz_salvo].some((c) => digitos(c) && (digitos(c).endsWith(m[2]) || m[2].endsWith(digitos(c)))));
  });

  return (
    <div className="formulario-pasos">
      <nav aria-label="Pasos del formulario">
        <ol className="pasos-formulario" ref={listaPasos}>
          {pasos.map((p, i) => (
            <li key={`${p.acto ?? ''}${p.paso.id}`}>
              <button type="button" className={`paso ${i === indice ? 'activo' : ''}`} aria-current={i === indice ? 'step' : undefined} onClick={() => { if (i === indice) return; if (sucio && editable) guardarPaso(0); setIndice(i); }}>
                <span className="numero-paso" aria-hidden="true">{i + 1}</span><span className="solo-lectores">{`${i + 1}. `}</span>{p.paso.titulo}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <section className="tarjeta" ref={seccion} style={{ scrollMarginTop: 'calc(var(--alto-barra) + 1rem)' }}>
        <p className="suave" style={{ marginBottom: '0.15rem' }}>Paso {indice + 1} de {pasos.length}</p>
        <h2 style={{ marginTop: 0 }}>{paso.titulo}</h2>
        {paso.descripcion && <p className="suave">{paso.descripcion}</p>}
        {!editable && <div className="aviso info">Solo lectura: el expediente no está en elaboración.</div>}
        {mensaje?.error && <div className="aviso error" role="alert">{mensaje.error}</div>}
        {mensaje?.ok && !mensaje.error && <div className="aviso exito" role="status">{mensaje.ok}</div>}

        {paso.id === 'escritura' && (
          <Grupo campos={paso.campos} valores={datos.escritura as unknown as Record<string, unknown>} errores={errores} prefijo="escritura." datos={datos} deshabilitado={!editable}
            onCambio={(r, v) => actualizar((d) => escribirRuta(d.escritura as unknown as Record<string, unknown>, r, v))} onAplicar={onAplicar} onDescartar={onDescartar} />
        )}

        {(paso.id === 'personas' || paso.id === 'inmuebles') && (
          <>
            {nuevas.filter((s) => (paso.id === 'personas') === s.campo.startsWith('persona:')).length > 0 && (
              <div className="aviso info">
                <strong>La IA encontró {paso.id === 'personas' ? 'personas' : 'inmuebles'} en los documentos que aún no están en el formulario:</strong>
                <Sugerencias sugs={nuevas.filter((s) => (paso.id === 'personas') === s.campo.startsWith('persona:'))} actual={undefined} onAplicar={onAplicar} onDescartar={onDescartar} editable={editable} />
              </div>
            )}
            {(paso.id === 'personas' ? datos.personas : datos.inmuebles).map((item, i) => {
              const titulo = paso.id === 'personas' ? ((item as Persona).nombre || `Persona ${i + 1}`) : ((item as Inmueble).matricula || `Inmueble ${i + 1}`);
              return (
                <details key={item.id} className="persona-inmueble" open={Object.keys(errores).some((k) => k.startsWith(`${paso.id}.${i}.`)) || !titulo || i === (paso.id === 'personas' ? datos.personas.length : datos.inmuebles.length) - 1}>
                  <summary>{titulo}</summary>
                  <Grupo campos={paso.campos} valores={item as unknown as Record<string, unknown>} errores={errores} prefijo={`${paso.id}.${i}.`} datos={datos} propioId={item.id} deshabilitado={!editable}
                    sugerenciasDe={(sub) => sugerenciasPara(sugerencias, paso.id === 'personas' ? 'persona' : 'inmueble', item, sub)}
                    onCambio={(r, v) => actualizar((d) => escribirRuta((paso.id === 'personas' ? d.personas : d.inmuebles)[i] as unknown as Record<string, unknown>, r, v))}
                    onAplicar={onAplicar} onDescartar={onDescartar} />
                  {editable && <button type="button" className="peligro pequeno" onClick={() => {
                    const usado = JSON.stringify(datos.actos).includes(`"${item.id}"`) || datos.personas.some((p) => [p.apoderado_id, p.representante_id, p.representante_legal_id].includes(item.id));
                    if (usado && !window.confirm('Este registro se usa en un acto o como representante. ¿Eliminarlo de todos modos?')) return;
                    actualizar((d) => { if (paso.id === 'personas') d.personas.splice(i, 1); else d.inmuebles.splice(i, 1); });
                  }}>Eliminar</button>}
                </details>
              );
            })}
            {editable && (
              <button type="button" className="secundario" onClick={() => actualizar((d) => {
                const predet = Object.fromEntries(paso.campos.filter((c) => c.predeterminado !== undefined).map((c) => [c.id, c.predeterminado]));
                const nuevo = { id: crypto.randomUUID() } as Record<string, unknown>;
                for (const [k, v] of Object.entries(predet)) escribirRuta(nuevo, k, v);
                if (paso.id === 'personas') d.personas.push(nuevo as unknown as Persona); else d.inmuebles.push(nuevo as unknown as Inmueble);
              })}>+ Agregar {paso.id === 'personas' ? 'persona' : 'inmueble'}</button>
            )}
          </>
        )}

        {acto && (
          <Grupo campos={paso.campos} valores={(datos.actos[acto] ?? {}) as Record<string, unknown>} errores={errores} prefijo={`actos.${acto}.`} datos={datos} deshabilitado={!editable}
            sugerenciasDe={(sub) => sugerenciasPara(sugerencias, 'acto', acto, sub)}
            onCambio={(r, v) => actualizar((d) => { d.actos[acto] = d.actos[acto] ?? {}; escribirRuta(d.actos[acto] as Record<string, unknown>, r, v); })}
            onAplicar={onAplicar} onDescartar={onDescartar} />
        )}

        <div className="barra-acciones">
          {sucio && editable && <span className="sin-guardar" role="status">● Hay cambios sin guardar</span>}
          <button type="button" className="secundario compacto" aria-label="Anterior" disabled={pendiente || indice === 0} onClick={() => guardarPaso(-1)}>←<span className="texto-largo"> Anterior</span></button>
          {editable && <button type="button" className="secundario" disabled={pendiente} onClick={() => guardarPaso(0)}>{pendiente ? 'Guardando…' : 'Guardar'}</button>}
          {indice < pasos.length - 1
            ? <button type="button" disabled={pendiente} onClick={() => guardarPaso(1)}>{editable ? 'Guardar y continuar →' : 'Siguiente →'}</button>
            : <a className="boton" href={`/expedientes/${expedienteId}/observaciones`}>Ir a la revisión →</a>}
        </div>
      </section>
    </div>
  );
}

/** Los errores locales de pasos de actos usan el prefijo "<paso>." y el servidor usa "actos.<acto>."; se unifican */
function remapear(errores: Errores, paso: Paso, acto?: string): Errores {
  if (!acto) return errores;
  return Object.fromEntries(Object.entries(errores).map(([k, v]) => [k.replace(new RegExp(`^${paso.id}\\.`), `actos.${acto}.`), v]));
}
