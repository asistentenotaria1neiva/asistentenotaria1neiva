# Prompt: rediseño completo de UI/UX – Escrituración Notaría 1 Neiva

> Pegar este texto completo en una sesión nueva del agente de código, abierta en la raíz del repositorio.

---

## Rol y objetivo

Eres un diseñador de producto y desarrollador frontend sénior. Vas a hacer un **rediseño completo de la interfaz y de la experiencia de uso** de esta aplicación web interna de la **Notaría Primera del Círculo de Neiva** (marca: **Notaría 1 · Neiva – Huila**), alineándola con su identidad de marca. Todo lo que hace la aplicación debe seguir funcionando exactamente igual: cambia la presentación y la experiencia, no la lógica de negocio.

Responde y escribe todos los textos de la interfaz en **español de Colombia** (`es-CO`), con trato de «usted», como ya está la aplicación.

## Antes de escribir código (obligatorio)

1. Lee `AGENTS.md`: esta versión de Next.js (16) tiene cambios incompatibles con lo que conoces. Consulta las guías en `node_modules/next/dist/docs/` antes de tocar `layout`, `loading`, `error`, `Link`, `next/font`, `next/image` o metadatos, y respeta los avisos de obsolescencia.
2. Lee `README.md`, `docs/manual_usuario.md` y `docs/manual_administrador.md` para entender el producto, los roles y el flujo.
3. Recorre **todas** las páginas de `src/app/` y su CSS (`src/app/globals.css`, ~520 líneas, con tokens en `:root`). Haz un inventario de pantallas, componentes y clases reutilizadas antes de proponer nada.
4. Ejecuta la aplicación (`npm run dev`) y observa cada pantalla en escritorio (1440 px) y móvil (390 px) para conocer el punto de partida.

## Qué es la aplicación

Asistente de escrituración con IA (Claude). El **digitador** busca en la **biblioteca** la escritura modelo (plantilla .docx) más parecida al negocio, la revisa en vista previa, carga los documentos del negocio (cédulas, certificado de tradición, escritura anterior, paz y salvos, cartas del banco…), escribe observaciones y genera la escritura. La IA adapta la plantilla **sin cambiar su estructura ni inventar**: lo que no encuentra queda «FALTA: …» resaltado en amarillo y lo dudoso «[VERIFICAR: …]». Entrega un resumen y **advertencias** (crítica 🔴 / advertencia 🟡 / informativa 🔵; algunas marcadas «verificación automática») y un Word descargable. Se pueden generar nuevas versiones; las anteriores se conservan. La generación tarda minutos, corre por etapas en segundo plano y avisa en **Notificaciones**.

La aplicación **prepara, verifica y advierte; no reemplaza al notario**. El diseño debe transmitir exactamente eso: rigor, confianza y control humano.

### Usuarios y roles
- **Digitador**: crea y genera sus escrituras. Uso intensivo, muchas horas al día, en computadores de escritorio de la oficina. Necesita velocidad, claridad y cero ambigüedad.
- **Revisor**: además ve todas las escrituras y alimenta la biblioteca (agregar, editar, retirar, eliminar plantillas; carga masiva).
- **Administrador**: usuarios, dispositivos (aprobación de equipos), auditoría, estadísticas, consumo de IA (costos), alertas y configuración (IP de la oficina, etc.).

### Mapa de pantallas
- **Acceso** `src/app/(acceso)/`: ingreso, verificación (doble factor), configurar 2FA (QR), cambiar contraseña, registrar equipo, instalación inicial.
- **App** `src/app/(app)/`:
  - `/` Inicio («Mis escrituras»).
  - `/expedientes/nuevo` Nueva escritura: buscador y filtros de la biblioteca (categoría, banco/subcategoría, año, fecha), vista previa del .docx (`VisorDocx`), «Usar esta plantilla» y «¿Tiene su propia plantilla?».
  - `/expedientes` Lista de escrituras con filtros.
  - `/expedientes/[id]` Detalle de la escritura con pasos numerados: documentos del negocio (estados *Por leer / Leyendo… / Leído / No se pudo leer*, «Ver lo que leyó la IA», retirar), observaciones, generar, progreso de la generación, revisión y advertencias, versiones y descarga. Pestañas (`PestanasExpediente`).
  - `/expedientes/[id]/plantilla` Cambiar la plantilla.
  - `/plantillas` Biblioteca: buscador, filtros, vista plegable, carga de plantillas (revisor).
  - `/notificaciones`.
  - `/admin/*`: panel (cifras y alertas recientes), dispositivos, usuarios, auditoría, estadísticas, consumo de IA, alertas, configuración.
  - Estados globales: `loading.tsx`, `error.tsx`, `not-found.tsx`, cierre de sesión por inactividad (20 min, `Actividad.tsx`).

## Identidad de marca

Logo: **«Notaría 1 – Neiva - Huila»**. Archivos fuente:
- `C:\Users\lufer\Downloads\Logo Notaria 1 Neiva.pdf` (vectorial; úsalo como fuente principal)
- `C:\Users\lufer\Downloads\WhatsApp Image 2026-11-11 at 2.16.04 PM.jpeg` (referencia)

Descripción del logo:
- **Isotipo**: un monograma de trazo grueso y uniforme con terminales redondeadas que fusiona una **«N»** y un **«1»** (la diagonal de la N termina formando el 1, con su remate inclinado arriba a la derecha).
- **Logotipo**: «Notaria 1» en una sans geométrica, redonda y pesada; la «o» lleva una hoja/gota estilizada y la tilde de la «í» es una gota.
- **Descriptor**: «Neiva - Huila» en una sans geométrica ligera con espaciado muy amplio, flanqueado por **tres líneas horizontales** a cada lado.
- **Color**: monocromo, **azul marino casi negro (≈ `#0E1A2C`)** sobre fondo blanco/gris muy claro (≈ `#F6F6F6`). Extrae el valor exacto del PDF.

Tareas de marca:
1. Extrae del PDF el logo en **SVG** limpio (sin fondo) y genera: logo completo, isotipo solo (N1), versión horizontal (isotipo + «Notaría 1» + descriptor) para la barra lateral, y versiones en negativo (blanco) para fondos oscuros. Guárdalos en `public/marca/`. Si no se puede vectorizar con fidelidad, avisa y usa el PDF/JPEG solo como referencia, sin inventar trazos.
2. Genera favicon e íconos (`src/app/icon.svg`, `apple-icon.png`) a partir del isotipo, siguiendo las convenciones de metadatos de archivo de Next 16.
3. Ajusta `themeColor` en `src/app/layout.tsx` al azul de la marca.

## Dirección de diseño

Concepto: **«protocolo notarial moderno»**. Sobrio, institucional y preciso, pero contemporáneo y cálido; nada de estética genérica de panel SaaS ni de plantilla de IA.

- **Paleta**: construye la escala completa desde el azul marino del logo (50 → 950) como color de marca. Neutros ligeramente fríos que armonicen con él. Un acento secundario sobrio solo si hace falta (justifícalo). Semánticos (éxito, advertencia, peligro, información) atenuados y con contraste AA. El **amarillo de «FALTA»** debe seguir siendo inconfundible y coherente con el resaltado del Word.
- **Tipografía**: busca una sans geométrica que dialogue con el logotipo para títulos y marca (p. ej. Outfit, Urbanist, Lexend o Manrope; compara y elige), y una sans muy legible para texto e interfaz densa (puede ser la misma). Conserva una monoespaciada para radicados y números (`.radicado`). Carga las fuentes **solo con `next/font`** (autoalojadas: la CSP con nonce no permite peticiones a Google).
- **Motivos gráficos**: usa con moderación las **tres líneas horizontales** del descriptor como separador o detalle de encabezados, y los **terminales redondeados** del isotipo como referencia para radios e íconos. No pongas el logo en todas partes.
- **Iconografía**: un solo set coherente de trazo redondeado, como SVG en línea o componentes propios (sin dependencias pesadas).
- **Modo oscuro**: opcional; si lo implementas, que sea completo y con tokens, no a medias.

## Objetivos de UX (lo más importante)

1. **El flujo de la escritura como protagonista**: en `/expedientes/[id]` deja claro en todo momento en qué paso está (plantilla → documentos → observaciones → generación → revisión), qué falta para avanzar y cuál es la acción principal. Un stepper/progreso claro y un único botón primario por pantalla.
2. **Elegir plantilla rápido**: el buscador y los filtros de la biblioteca deben sentirse inmediatos; resultados escaneables (nombre, categoría, banco, año, «cuándo usarla»), vista previa amplia lado a lado en escritorio y a pantalla completa en móvil.
3. **Carga de documentos**: zona de arrastrar y soltar evidente, carga múltiple, estado por documento muy visible (por leer / leyendo / leído / error) con progreso, y acciones de «ver lo leído» y «retirar» sin ambigüedad.
4. **Generación en segundo plano**: progreso por etapas legible (lectura, redacción, faltantes, Word), tiempo estimado, y mensaje claro de que puede salir de la página y le llegará un aviso.
5. **Revisión y advertencias**: jerarquía fuerte (críticas primero, con conteos), fácil de recorrer y de relacionar con la escritura; «FALTA» y «VERIFICAR» bien distinguidos; descarga en Word como acción destacada; versiones comparables y con fecha.
6. **Inicio útil**: escrituras recientes y en curso, accesos directos a «Nueva escritura», avisos pendientes.
7. **Administración**: tablas densas pero legibles (filas cebra o divisorias suaves, encabezados fijos, filtros), cifras del panel y del consumo de IA claras; acciones destructivas siempre con confirmación.
8. **Acceso**: pantallas de ingreso, 2FA y registro de equipo con la marca bien presentada, mensajes de error humanos y explicaciones breves de por qué se pide cada paso (red de la oficina, equipo aprobado, doble factor).
9. **Estados**: diseña vacío, cargando (esqueletos), error y éxito para cada pantalla; toasts o avisos no intrusivos; feedback inmediato al clic (ya existe `Pendiente` con `useLinkStatus`, mantenlo o mejóralo).
10. **Microcopia**: revisa los textos para que sean cortos, directos y consistentes, sin cambiar el significado jurídico ni las advertencias sobre la responsabilidad del notario.

## Restricciones técnicas (no negociables)

- **No cambies la lógica**: no toques `src/lib/`, `prisma/`, `src/app/api/`, `src/proxy.ts`, ni las server actions (`acciones.ts`) salvo que sea imprescindible para la UI, y en ese caso explícalo. Conserva todos los formularios, nombres de campos, `action`s y comportamiento.
- **Sin nuevas dependencias** salvo que lo justifiques y lo apruebe el usuario. El proyecto usa **CSS propio con tokens** (no Tailwind ni librerías de componentes); mantenlo así, reorganizando el CSS si conviene (tokens → base → layout → componentes → páginas), con nombres de clase en español como el resto del código.
- **Seguridad**: hay CSP con nonce por petición. Nada de scripts, estilos o fuentes desde CDN externos; nada de estilos en línea que rompan la CSP; nada de `dangerouslySetInnerHTML` nuevo.
- **Accesibilidad**: WCAG 2.2 AA (contraste, foco visible, navegación completa con teclado, `aria-current`, etiquetas en todos los campos, `prefers-reduced-motion`). Mantén el menú móvil accesible (Escape, velo, bloqueo de desplazamiento).
- **Responsivo**: escritorio primero (uso real en la oficina), pero impecable desde 360 px.
- **Rendimiento**: componentes de servidor por defecto; `'use client'` solo donde ya hace falta interacción.
- **Formato de la escritura**: la vista previa del Word (`VisorDocx`, `docx-preview`) debe seguir mostrando el documento fiel (Arial 12, interlineado 1,5, márgenes de la notaría). No apliques los estilos de la app dentro del documento.

## Forma de trabajo

1. **Propuesta primero**: antes de implementar, presenta (a) el inventario y los principales problemas de UX actuales, (b) el sistema de diseño propuesto (tokens de color con sus valores y contrastes, tipografía y escala, espaciado, radios, sombras, componentes base) y (c) la nueva arquitectura de navegación y el esquema de las pantallas clave (inicio, nueva escritura, detalle de la escritura, biblioteca, panel admin, ingreso). Espera aprobación.
2. **Implementa por fases**, cada una funcionando y verificada: (1) tokens, tipografía, marca y layout (barra lateral, barra superior móvil); (2) componentes base (botones, campos, tarjetas, tablas, insignias de estado, avisos, pestañas, stepper, zona de carga, esqueletos); (3) flujo de la escritura; (4) biblioteca de plantillas; (5) acceso; (6) administración y notificaciones; (7) estados vacíos/carga/error y pulido.
3. **Verifica en cada fase**: `npm run tipos`, `npm run prueba` y revisión visual en el navegador en 1440 px y 390 px, con los tres roles. Corrige antes de seguir.
4. Al terminar, entrega un resumen de cambios, capturas antes/después de las pantallas clave y una lista de decisiones pendientes. Actualiza `docs/manual_usuario.md` solo donde cambien nombres de botones o ubicaciones.
5. No hagas commits ni despliegues sin que el usuario lo pida.
