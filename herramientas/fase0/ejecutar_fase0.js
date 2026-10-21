/**
 * FASE 0 – Orquestador.
 *
 * 1. Extrae el texto de cada .docx de la carpeta de plantillas (solo lectura).
 * 2. Genera versiones compactas (sin rellenos de guiones).
 * 3. Corre los análisis: rasgos, consistencia, normas citadas y similitud.
 * 4. Anonimiza las copias de trabajo.
 * 5. Genera la checklist (xlsx + md) y las fichas por tipo.
 *
 * Todo lo que contiene datos reales queda en datos_locales/ (excluida del repositorio).
 *
 * Uso: node herramientas/fase0/ejecutar_fase0.js ["C:\\ruta\\Plantillas Notaria 1"]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..', '..');
const ORIGEN = process.argv[2] || 'C:\\Users\\lufer\\OneDrive\\Documentos\\Plantillas Notaria 1';
const LOCAL = path.join(RAIZ, 'datos_locales', 'fase0');
const TXT = path.join(LOCAL, 'txt');
const COMPACTO = path.join(LOCAL, 'compacto');
const COPIAS = path.join(RAIZ, 'datos_locales', 'copias_trabajo');

if (!fs.existsSync(ORIGEN)) {
  console.error(`No existe la carpeta de origen: ${ORIGEN}`);
  process.exit(1);
}
for (const d of [TXT, COMPACTO, COPIAS]) fs.mkdirSync(d, { recursive: true });

const correr = (script, args, cwd = LOCAL) =>
  execFileSync(process.execPath, [path.join(__dirname, script), ...args], { cwd, stdio: ['ignore', 'pipe', 'inherit'] }).toString();

console.log('1/5 Extrayendo texto (los originales no se modifican)…');
correr('extract.js', [ORIGEN, TXT]);

console.log('2/5 Generando versiones compactas…');
for (const f of fs.readdirSync(TXT).filter((x) => x.endsWith('.txt'))) {
  const t = fs.readFileSync(path.join(TXT, f), 'utf8')
    .replace(/[-_=.…]{4,}/g, ' ').replace(/[ \t]+/g, ' ')
    .split('\n').filter((l) => l.trim()).join('\n');
  fs.writeFileSync(path.join(COMPACTO, f), t);
}

console.log('3/5 Analizando rasgos, consistencia, normas y similitud…');
correr('rasgos.js', [COMPACTO]);
correr('consistencia.js', [COMPACTO]);
correr('normas.js', [COMPACTO]);
correr('simil.js', [COMPACTO]);

console.log('4/5 Anonimizando copias de trabajo…');
process.stdout.write(correr('anonimizar.js', [COMPACTO, COPIAS]));

console.log('5/5 Generando checklist y fichas…');
process.stdout.write(correr('generar_entregables.js', [ORIGEN, LOCAL], RAIZ));
console.log('Fase 0 terminada.');
