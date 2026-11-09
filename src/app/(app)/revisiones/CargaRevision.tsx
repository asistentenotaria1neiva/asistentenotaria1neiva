'use client';
/**
 * Carga del PDF de una revisión (la escritura y sus soportes en un solo archivo). Se envía en partes
 * de 3 MB, varias a la vez (Vercel limita cada petición a 4,5 MB), y al final se inicia la revisión.
 */
import { useState, useTransition } from 'react';
import { Mensaje } from '../expedientes/formularios';
import type { ResultadoRevision } from './acciones';

const TAMANO_PARTE = 3 * 1024 * 1024;
const PARTES_EN_PARALELO = 4;

async function subirParte(carga: string, indice: number, parte: Blob): Promise<string | null> {
  for (let intento = 0; ; intento++) {
    const f = new FormData();
    f.set('carga', carga);
    f.set('indice', String(indice));
    f.set('parte', parte);
    try {
      const r = await fetch('/api/revisiones/partes', { method: 'POST', body: f });
      if (r.ok) return null;
      if (r.status < 500 || intento) return ((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'No se pudo subir el archivo.';
    } catch {
      if (intento) return 'Se perdió la conexión con el servidor.';
    }
  }
}

export function CargaRevision({ tipos, iniciar, deshabilitada }: {
  tipos: { id: string; nombre: string }[];
  iniciar: (datos: { carga: string; partes: number; nombre: string; tipoId: string; notas: string }) => Promise<ResultadoRevision>;
  deshabilitada?: boolean;
}) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [tipoId, setTipoId] = useState(tipos.find((t) => t.id === 'sucesion_intestada')?.id ?? tipos[0]?.id ?? '');
  const [notas, setNotas] = useState('');
  const [avance, setAvance] = useState('');
  const [r, setR] = useState<ResultadoRevision>();
  const [pendiente, empezar] = useTransition();

  const enviar = () => empezar(async () => {
    setR(undefined);
    if (!archivo) return setR({ error: 'Seleccione el PDF con la escritura y sus documentos soporte.' });
    if (!/\.pdf$/i.test(archivo.name) && archivo.type !== 'application/pdf') return setR({ error: 'El archivo debe ser un PDF.' });
    const carga = crypto.randomUUID();
    const partes = Math.max(1, Math.ceil(archivo.size / TAMANO_PARTE));
    let siguiente = 0;
    let hechas = 0;
    let error: string | null = null;
    setAvance('Cargando el PDF…');
    await Promise.all(Array.from({ length: Math.min(PARTES_EN_PARALELO, partes) }, async () => {
      while (!error && siguiente < partes) {
        const i = siguiente++;
        const e = await subirParte(carga, i, archivo.slice(i * TAMANO_PARTE, (i + 1) * TAMANO_PARTE));
        if (e) error = e;
        else setAvance(`Cargando el PDF · ${Math.round((++hechas / partes) * 100)} %`);
      }
    }));
    if (error) { setAvance(''); return setR({ error }); }
    setAvance('Iniciando la revisión…');
    // Si se inicia bien, la acción lleva a la página de la revisión
    const res = await iniciar({ carga, partes, nombre: archivo.name, tipoId, notas });
    setAvance('');
    setR(res);
  });

  return (
    <div>
      {avance ? <div className="aviso info" role="status"><span className="girador pequeno" aria-hidden="true" /> {avance}</div> : <Mensaje r={r} />}
      <div className="campos-columnas">
        <div className="campo">
          <label htmlFor="rev-archivo">Escritura y documentos soporte (PDF)</label>
          <input id="rev-archivo" type="file" accept=".pdf,application/pdf" disabled={pendiente || deshabilitada} onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
          <div className="ayuda">Un solo PDF con la escritura ya redactada y todos sus soportes (registros civiles, cédulas, poder, certificados de tradición, paz y salvos, edicto, respuestas DIAN y UGPP…). Hasta 400 páginas.</div>
        </div>
        <div className="campo">
          <label htmlFor="rev-tipo">Tipo de escritura</label>
          <select id="rev-tipo" value={tipoId} disabled={pendiente || deshabilitada} onChange={(e) => setTipoId(e.target.value)}>
            {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
          <div className="ayuda">Se compara con su plantilla aprobada, que también da el formato de la escritura generada.</div>
        </div>
        <div className="campo">
          <label htmlFor="rev-notas">¿Algo en especial que revisar? (opcional)</label>
          <textarea id="rev-notas" value={notas} disabled={pendiente || deshabilitada} onChange={(e) => setNotas(e.target.value)} />
          <div className="ayuda">P. ej.: «Verificar que las hijuelas sumen el activo» o «Revisar los linderos del lote».</div>
        </div>
      </div>
      <button type="button" disabled={pendiente || deshabilitada || !archivo || !tipoId} aria-busy={pendiente} onClick={enviar}>
        {pendiente && <span className="girador pequeno" aria-hidden="true" />}
        {pendiente ? 'Cargando…' : 'Cargar y revisar con IA'}
      </button>
    </div>
  );
}
