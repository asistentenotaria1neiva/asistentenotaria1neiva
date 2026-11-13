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
- **Suspender** cierra las sesiones del usuario al instante. Prefiera suspender a eliminar: un usuario con escrituras no se puede eliminar, para conservar la trazabilidad.
- **Desbloquear** tras 5 intentos fallidos; **restablecer contraseña**; **restablecer doble factor** (si un administrador pierde el teléfono); **cerrar sesiones**.

## 4. Escrituras

Ve todas las escrituras (menú **Escrituras**) y puede abrirlas, generar versiones o eliminarlas. El digitador solo ve las suyas; el revisor ve todas.

Cuando un digitador **elimina** una escritura, desaparece de su lista, pero no se borra: usted la sigue viendo en **Escrituras** con la marca **«Borrada por el usuario»** (tachada), en solo lectura. Con el filtro **Eliminadas por el usuario** puede ver solo esas u ocultarlas. Al abrirla puede **Restaurar** (el responsable vuelve a verla) o **Borrar definitivamente** (se borran sus documentos y versiones; no se puede deshacer). Todo queda en la auditoría.

## 5. Biblioteca de plantillas

La biblioteca reúne las escrituras modelo de la notaría, con su **categoría** (la carpeta del acto: COMPRAVENTA, HIPOTECA, LEASING…), su **subcategoría** (el banco o la clase de oficio), el **año** y la **fecha** de modificación. El digitador busca en ella la plantilla, la ve en vista previa y la usa; la IA la adapta con los documentos sin cambiar su estructura.

- **Carga inicial** (desde la carpeta de minutas, una vez): `npm run biblioteca:cargar -- "C:\ruta\milan" --confirmar`. Sin `--confirmar` solo muestra lo que cargaría. Los archivos repetidos se cargan una sola vez; los `.doc` antiguos y los PDF se omiten (los `.doc` se abren en Word y se guardan como `.docx` para agregarlos).
- **El revisor alimenta la biblioteca** desde la página **Biblioteca de plantillas**: agrega plantillas (una o varias, con su categoría), corrige sus datos, o las **retira** (dejan de aparecer para los digitadores). El administrador puede hacer lo mismo y, además, es el único que puede **eliminarlas**.
- Cada plantilla se guarda cifrada; las descargas quedan en la auditoría.
- **Buena plantilla**: una escritura completa de la notaría (carátula, comparecencia, cláusulas, constancias, otorgamiento y firmas), del mismo acto, banco y tipo de negocio que se quiere redactar.

## 6. Auditoría

- Muestra toda acción: ingresos y fallos, cambios en formularios, cargas y descargas, revisiones, aprobaciones, cambios de configuración. Filtre por usuario, equipo, fecha y acción.
- **Verificar integridad de la cadena** recalcula los hashes encadenados. Si aparece "cadena alterada", informe de inmediato al notario: alguien modificó la base de datos por fuera de la aplicación.
- Los registros no se pueden modificar ni borrar.

## 7. Alertas

Revise las alertas a diario: equipos no autorizados, intentos desde redes externas, bloqueos de cuentas, accesos remotos del administrador, códigos de doble factor errados y equipos pendientes. Marque cada una como atendida tras revisarla.

## 8. Estadísticas y consumo de IA

- **Estadísticas**: escrituras y versiones generadas por mes, plantillas más usadas, datos «FALTA» y advertencias críticas por versión, versiones por usuario.
- **Consumo de IA**: tokens y costo por usuario, por escritura, por tarea (lectura de documentos con Haiku, adaptación de la plantilla con Sonnet) y por modelo.
- El modelo de Anthropic no se reentrena con los datos de la notaría.

## 9. Configuración

Parámetros en formato JSON: IP de la oficina, minutos de inactividad, duración máxima de sesión, intentos y minutos de bloqueo, horario permitido y datos fijos de la notaría (código, notario titular, **resolución de tarifas del año** — actualícela cada enero). Cada cambio queda auditado con el valor anterior y el nuevo.

## 10. Copias de seguridad

- La base de datos y los documentos están en Supabase. Las copias dependen del plan contratado (el gratuito **no** incluye copias descargables; el Pro incluye copias diarias que se restauran desde el panel de Supabase).
- Restaurar una copia reemplaza los datos actuales: hágalo solo con autorización del notario.
- Guarde `CLAVE_MAESTRA` fuera de Vercel y de Supabase. Sin ella los documentos de cualquier copia son ilegibles.

## 11. Ante un incidente

1. Desactive el equipo o suspenda el usuario involucrado (corta la sesión al instante).
2. Revise la auditoría y verifique la cadena.
3. Informe al notario y a Automind. Si hubo exposición de datos personales, el notario evalúa las obligaciones de la Ley 1581 de 2012.
