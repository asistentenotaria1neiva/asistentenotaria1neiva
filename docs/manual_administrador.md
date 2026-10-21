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
- Roles: **Digitador** (elabora expedientes), **Revisor** (aprueba o devuelve, resuelve observaciones), **Administrador**.
- **Suspender** cierra las sesiones del usuario al instante. Prefiera suspender a eliminar: un usuario con expedientes no se puede eliminar, para conservar la trazabilidad.
- **Desbloquear** tras 5 intentos fallidos; **restablecer contraseña**; **restablecer doble factor** (si un administrador pierde el teléfono); **cerrar sesiones**.

## 4. Expedientes

Desde el resumen de cualquier expediente puede **reasignar** el responsable, **reabrir** (con motivo) o **archivar**.

## 5. Plantillas

- **Checklist**: cuántos tipos tienen plantilla aprobada, cuántos pendientes y cuáles faltan por prioridad (la notaría debe entregarlos). Detalle en `docs/plantillas/`.
- **Cargar nueva versión**: suba un .docx. Queda **pendiente de aprobación**. La aplicación verifica que las etiquetas estén bien formadas.
- **Aprobar**: solo después de que el notario haya leído el texto; para confirmar debe escribir `APROBADA POR EL NOTARIO`. La versión aprobada anterior queda retirada automáticamente. Todo queda en la auditoría.
- **Descargar para revisar** permite abrir la plantilla en Word.

### Cómo escribir una plantilla

- Variables entre llaves dobles: `{{a.precio_letras}}`, `{{escritura.fecha_letras}}`.
- Bloques condicionales: `{{#a.afecta_si}} … {{/a.afecta_si}}`; contrarios: `{{^a.afecta_si}} … {{/a.afecta_si}}`.
- Repeticiones: `{{#a.inmuebles}} … {{matricula}} … {{/a.inmuebles}}`.
- Concordancia automática: `{{a.vendedores | el:'vendedor'}}` → "la vendedora / los vendedores"; `{{a.compradores | v:'pagó':'pagaron'}}`; `{{a.conyuges | nombres}}` → "A y B".
- Cláusulas numeradas solas: `{{ord()}}` → PRIMERO, SEGUNDO…
- Use las fuentes de `plantillas/fuentes/` como referencia de las variables disponibles por acto.
- Si una variable queda vacía, el borrador muestra **«FALTA: nombre»** y genera una observación crítica.

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

- Diarias y cifradas (`scripts/respaldo.sh --probar`, programado en el servidor), con copia en una ubicación separada y **prueba de restauración automática**.
- Restauración real: `scripts/restaurar.sh <archivo> --produccion` (pide confirmación escrita). Úsela solo con autorización del notario.
- Guarde `CLAVE_MAESTRA` y `CLAVE_RESPALDO` fuera del servidor y separadas de las copias. Sin ellas no hay recuperación posible.

## 11. Ante un incidente

1. Desactive el equipo o suspenda el usuario involucrado (corta la sesión al instante).
2. Revise la auditoría y verifique la cadena.
3. Informe al notario y a Automind. Si hubo exposición de datos personales, el notario evalúa las obligaciones de la Ley 1581 de 2012.
