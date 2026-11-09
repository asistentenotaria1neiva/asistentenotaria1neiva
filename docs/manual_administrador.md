# Manual del administrador

El administrador tiene control total: usuarios, equipos, plantillas, configuración y auditoría. Siempre ingresa con **doble factor**, y es el único rol que puede ingresar desde fuera de la oficina.

---

## 1. Instalación inicial (una sola vez)

1. Desde la oficina, abra la aplicación: aparece **Instalación**. Cree su cuenta.
2. Ingrese y **configure el doble factor**: escanee el código QR con Google Authenticator o Microsoft Authenticator y escriba el código. El doble factor solo se puede configurar por primera vez desde la red de la oficina.
3. En **Configuración → `red.ips_oficina`** registre la IP pública de la oficina (la pantalla muestra su IP actual). Ej.: `["190.85.10.20"]`. Sin esta lista el personal no puede ingresar.
4. Registre su propio equipo ("Registrar este equipo") y apruébelo en **Dispositivos**.
5. Cree los usuarios (sección 3).
6. Con el notario, revise y apruebe las plantillas (sección 5).

## 2. Dispositivos

- Cada computador se registra una vez desde su navegador y queda **pendiente**.
- **Aprobar**: el equipo puede usarse.
- **Desactivar**: cierra **de inmediato** todas sus sesiones y bloquea nuevos ingresos.
- **Eliminar**: borra el registro (el navegador tendría que registrarse de nuevo).
- Si un equipo se formatea o se cambia de navegador, debe registrarse otra vez (la autorización vive en una cookie segura del navegador).

## 3. Usuarios

- **Crear**: nombre, usuario y rol. La aplicación genera una **contraseña temporal** que se muestra una sola vez; entréguela personalmente. El usuario debe cambiarla al primer ingreso.
- Roles: **Digitador** (elabora expedientes), **Revisor** (elabora expedientes como un digitador; además aprueba o devuelve los de otros, resuelve observaciones, y revisa y carga plantillas, sin acceso a la administración), **Administrador**.
- **Suspender** cierra las sesiones del usuario al instante. Prefiera suspender a eliminar: un usuario con expedientes no se puede eliminar, para conservar la trazabilidad.
- **Desbloquear** tras 5 intentos fallidos; **restablecer contraseña**; **restablecer doble factor** (si un administrador pierde el teléfono); **cerrar sesiones**.

## 4. Expedientes

Desde el resumen de cualquier expediente puede **reasignar** el responsable, **reabrir** (con motivo) o **archivar**.

## 5. Plantillas

- **Checklist**: cuántos tipos tienen plantilla aprobada, cuántos pendientes y cuáles faltan por prioridad (la notaría debe entregarlos). Detalle en `docs/plantillas/`.
El panel está en **Plantillas** (menú principal) y lo usan el administrador y los revisores.

Cada plantilla es el **modelo de redacción** de su tipo de escritura: una escritura de la notaría tal como está en Word. **No lleva variables ni se llena**: la IA la toma como base (estructura, orden y texto de las cláusulas, fórmulas legales, constancias, estilo) y redacta cada escritura con los datos del caso. Los datos del caso que trae el modelo no se copian.

- **Cargar plantillas** (arriba de la lista): seleccione uno o varios .docx (hasta 6 a la vez) y elija el tipo de escritura de cada uno (si el nombre del archivo contiene el tipo, p. ej. `hipoteca.docx`, se elige solo). Un tipo sin plantilla recibe su primera versión; uno que ya tiene, una versión nueva. En la lista, **Cargar** sube un archivo para ese tipo. Cada versión queda **pendiente de aprobación**.
- **Revisar con IA**: la IA verifica que el modelo sea del tipo indicado, que traiga las partes que ese acto necesita, su redacción y los cambios frente a la versión aprobada. **Arreglar con IA** propone cambios de texto y crea una versión nueva, pendiente de aprobación.
- **Ver cada versión**: pestañas *Diseño* (como en Word) y *Solo texto* (lo que la IA lee como modelo). **Descargar plantilla** la abre en Word.
- **Aprobar** (solo el administrador): solo después de que el notario haya leído el texto y los hallazgos; para confirmar debe escribir `APROBADA POR EL NOTARIO`. La IA solo advierte: no aprueba. La versión aprobada anterior queda retirada automáticamente. Todo queda en la auditoría.
- **Descargar .docx** permite abrir la plantilla en Word (márgenes, encabezados y tablas se revisan allí).

### Varias plantillas para un mismo tipo (variantes)

Algunas escrituras cambian de estructura según el banco, la obra o la constructora (p. ej. la **compraventa con hipoteca**: la minuta de Bancolombia no es la del Banco de Bogotá, y una venta de Construespacios con fiduciaria no es la de un vendedor persona natural). Para esos tipos se aprueban **varias plantillas a la vez**, una por variante, y la IA elige la que corresponde a cada caso.

- **Activar**: en la página de cualquier plantilla del tipo, sección **Varias plantillas** → *Admitir varias plantillas* (solo el administrador). La compraventa con hipoteca ya viene activada.
- **Cada variante** tiene un **nombre** (p. ej. «Bancolombia · Construespacios Valle de Génova · subsidio Comfamiliar») y **cuándo usarla**: el banco o entidad, la obra o constructora, los actos que van juntos (cancelación de patrimonio, declaración de construcción…) y el subsidio. Mientras más claro, mejor elige la IA; si queda vacío, la IA se guía por la carátula del modelo. Se editan en la sección **Variante** de su página (no cambian el texto del modelo).
- **Agregar una variante nueva**: sección **Agregar otra variante** en la página de cualquier variante del tipo, o desde **Cargar plantillas** (varios archivos del mismo tipo a la vez, cada uno con su nombre). **Nueva versión de una variante**: desde su propia página; al aprobarla reemplaza solo a la versión anterior de esa variante.
- **Aprobar**: una por una o, en la tabla **Variantes**, *Aprobar las pendientes* en bloque (con la misma confirmación `APROBADA POR EL NOTARIO`). Retirar una variante solo la saca de las opciones de la IA.
- **Al generar la escritura**: después de leer los documentos, la IA compara el caso con las variantes aprobadas y elige una; el borrador muestra cuál usó, por qué y con qué confianza. Si la confianza es baja queda una alerta «Revisar». El funcionario puede fijar la variante en **Plantilla de «…»** antes de generar.
- **Carga por script** (una carpeta completa): `npx tsx --tsconfig tsconfig.scripts.json --env-file=.env scripts/cargar-variantes.ts <tipo> <carpeta> [--criterios archivo.json] [--prueba]`. Todo queda pendiente de aprobación.

### Cómo preparar una plantilla

- Use la mejor escritura de la notaría para ese tipo de acto, completa (encabezado, comparecencia, cláusulas, constancias, otorgamiento, firmas).
- Si el modelo trae cláusulas que solo aplican a algunos casos, déjelas: la IA las incluye solo cuando el caso lo pide (la revisión lo advierte).
- Para orientar a la IA en todos los casos de un tipo, el administrador puede agregar instrucciones en **Entrenamiento** con el propósito «Redacción de la escritura».
- Lo que la IA no encuentra queda escrito **«FALTA: dato»** en el borrador y genera una observación crítica hasta que se complete el dato y se redacte de nuevo.

## 6. Auditoría

- Muestra toda acción: ingresos y fallos, cambios en formularios, cargas y descargas, revisiones, aprobaciones, cambios de configuración. Filtre por usuario, equipo, fecha y acción.
- **Verificar integridad de la cadena** recalcula los hashes encadenados. Si aparece "cadena alterada", informe de inmediato al notario: alguien modificó la base de datos por fuera de la aplicación.
- Los registros no se pueden modificar ni borrar.

## 7. Alertas

Revise las alertas a diario: equipos no autorizados, intentos desde redes externas, bloqueos de cuentas, accesos remotos del administrador, códigos de doble factor errados y equipos pendientes. Marque cada una como atendida tras revisarla.

## 8. Estadísticas y entrenamiento de la IA (meses 1 a 6)

- **Estadísticas**: escrituras por tipo y por usuario, observaciones más frecuentes, tiempos y consumo de la API.
- **Informe mensual para el notario**: indicadores (% de datos sin corrección, observaciones acertadas frente a falsas alarmas, tiempo promedio, devoluciones) y patrones de corrección. Imprímalo o guárdelo como PDF.
- **Entrenamiento IA**: patrones de error por tipo de escritura y casos de aprendizaje anonimizados. Con ellos:
  1. Cree una **instrucción** nueva para la extracción o la revisión (general o por tipo de escritura), con el patrón que la motiva.
  2. Apruébela; la versión anterior queda retirada. Todas las versiones se conservan.
  3. Ajustes de reglas, formularios o plantillas se piden a Automind y también quedan versionados.
- El modelo de Anthropic no se reentrena con los datos de la notaría.

## 9. Configuración

Parámetros en formato JSON: IP de la oficina, minutos de inactividad, duración máxima de sesión, intentos y minutos de bloqueo, horario permitido, umbrales de las reglas (antigüedad del certificado de tradición, aviso del paz y salvo) y datos fijos de la notaría (código, notario titular, **resolución de tarifas del año** — actualícela cada enero). Cada cambio queda auditado con el valor anterior y el nuevo.

## 10. Copias de seguridad

- La base de datos y los documentos están en Supabase. Las copias dependen del plan contratado (el gratuito **no** incluye copias descargables; el Pro incluye copias diarias que se restauran desde el panel de Supabase).
- Restaurar una copia reemplaza los datos actuales: hágalo solo con autorización del notario.
- Guarde `CLAVE_MAESTRA` fuera de Vercel y de Supabase. Sin ella los documentos de cualquier copia son ilegibles.

## 11. Ante un incidente

1. Desactive el equipo o suspenda el usuario involucrado (corta la sesión al instante).
2. Revise la auditoría y verifique la cadena.
3. Informe al notario y a Automind. Si hubo exposición de datos personales, el notario evalúa las obligaciones de la Ley 1581 de 2012.
