# Manual de usuario

Para el personal de la Notaría Primera del Círculo de Neiva (digitadores, auxiliares y revisores).

La aplicación **prepara, verifica y advierte**. Usted decide qué dato es correcto. El notario firma y responde por la escritura.

---

## 1. Ingresar

1. Use un computador de la oficina **registrado y aprobado**. Si el equipo es nuevo, en la pantalla de ingreso elija **"Registrar este equipo"**, escriba un nombre (p. ej. "Recepción – equipo 2") y avise al administrador para que lo apruebe.
2. Escriba su usuario y contraseña.
3. La primera vez debe cambiar la contraseña temporal: mínimo 12 caracteres, con mayúsculas, minúsculas y números.

Tenga en cuenta:
- Solo se puede ingresar desde la red de la oficina.
- Después de 5 contraseñas erradas la cuenta se bloquea 30 minutos (el administrador puede desbloquearla).
- La sesión se cierra sola tras 20 minutos sin uso. Si ingresa en otro equipo, la sesión anterior se cierra.
- Cierre sesión al terminar ("Cerrar sesión", abajo a la izquierda).

## 2. Flujo de una escritura

| Paso | Dónde | Qué hacer |
| --- | --- | --- |
| 1 | **Nuevo expediente** | Marque los actos de la escritura y ordénelos como deben aparecer (p. ej. cancelación de patrimonio y luego compraventa). |
| 2 | **Documentos** | Cargue los documentos soporte (PDF o fotos): cédulas, certificado de tradición, paz y salvo, poderes, etc. Si no sabe qué tipo es un documento, elija **"Detectar automáticamente"**. Un documento equivocado se puede **retirar** y cargar el correcto. |
| 3 | **Asistente IA** | Pulse **"Analizar documentos y preparar preguntas"** (ver abajo). Revise el tipo de escritura, atienda las inconsistencias y responda las preguntas. |
| 4 | **Observaciones** | Ejecute **"Reglas + revisión de la IA"** y atienda cada observación. |
| 5 | **Asistente IA** o **Borrador** | Genere la escritura en Word; descárguela y léala completa. |
| 6 | **Resumen y flujo → Enviar a revisión** | El revisor lo aprueba o lo devuelve con comentarios. |
| 7 | Lista para firma | El expediente queda listo para la firma del notario. |

### Asistente IA

Al pulsar **"Analizar documentos y preparar preguntas"** la IA, en segundo plano (puede salir de la página y volver):

1. Lee los documentos que aún no se han analizado e identifica los que se cargaron como "Detectar automáticamente".
2. Lleva al expediente los datos que leyó con confianza. Los dudosos (borrosos, de formato inválido o que no coinciden entre documentos) no se aplican: se convierten en preguntas.
3. Verifica que los documentos correspondan a los actos elegidos: si indican otro tipo de escritura, lo advierte y propone los actos que corresponden para que usted confirme o los deje como están. También indica los documentos que faltan.
4. Señala las **inconsistencias** entre documentos (nombres o cédulas distintos, vendedor que no es el titular, certificados vencidos, gravámenes vigentes…). Para cada una puede:
   - **Recargar el documento**: retírelo en *Documentos*, cargue el correcto y pulse **"Analizar de nuevo"**.
   - **Continuar con los datos actuales**: la inconsistencia queda registrada como aceptada y el revisor la verá.
5. Hace las **preguntas** necesarias para completar la escritura (estado civil, quién vende y quién compra, precio, afectación a vivienda familiar…). Cuando un documento sugiere la respuesta, aparece ya escrita con su fuente: verifíquela. Las preguntas marcadas como *obligatorio* deben responderse; las demás pueden dejarse sin respuesta. Si al guardar falta algún dato obligatorio, el asistente agrega la pregunta.

La IA no redacta la escritura: el Word se arma con las plantillas aprobadas por el notario y con el formato de la notaría. Quedan **en blanco** para el funcionario que hace la terminación: número y fecha de la escritura, hojas de papel notarial, derechos notariales y retención en la fuente, y los datos de firma de cada otorgante.

### Revisar y corregir datos

Todo se resuelve en el asistente; no hay formulario aparte.

- **Datos de la escritura** muestra todo lo que irá en la escritura (lo leído de los documentos y lo respondido), agrupado por acto, persona e inmueble. Si algo no es correcto, pulse **Corregir**: el asistente agrega la pregunta con el valor actual para que lo cambie.
- En **Respuestas guardadas**, **Cambiar** vuelve a hacer una pregunta ya respondida.
- En **Observaciones**, las que se refieren a un dato tienen el botón **Corregir en el asistente**.
- Las respuestas se validan: la cédula solo números, el NIT con dígito de verificación, la matrícula con formato 200-12345, la cédula catastral de 15, 20, 25 o 30 dígitos. Los valores se escriben solo en número; el valor en letras se genera automáticamente.
- Si falta una persona (p. ej. el comprador), cargue su cédula en *Documentos* y pulse **Analizar de nuevo**.
- Ninguna respuesta sugerida por la IA se guarda sola: usted la verifica antes de guardar. Si cambia un valor que la IA leyó de un documento, el cambio queda registrado (anonimizado) para el entrenamiento.

## 3. Observaciones

| Nivel | Qué significa | Qué hacer |
| --- | --- | --- |
| 🔴 **Crítica** | Impide avanzar. Ej.: la cédula del vendedor no coincide con la del certificado de tradición. | Use **Corregir en el asistente** y ejecute de nuevo las reglas. |
| 🟡 **Advertencia** | Exige revisión. Ej.: hipoteca vigente no mencionada. | Corrija el dato o escriba una **justificación** (mínimo 15 caracteres). |
| 🔵 **Informativa** | Sugerencia. Ej.: el paz y salvo vence en 5 días. | Tómela en cuenta. |

- Las observaciones de **reglas** se cierran solas cuando el dato queda corregido y se vuelve a ejecutar la revisión.
- Las de la **IA** se marcan "Corregí el dato", "Justificar" o "Descartar (falsa alarma)". Si fue una falsa alarma, márquelo: así se mide la calidad de la IA.
- Las críticas de la IA solo puede descartarlas un revisor.

## 4. Borrador

- Se arma reemplazando los datos en la **plantilla aprobada por el notario**. La IA no redacta ni cambia el texto.
- No se genera si hay observaciones críticas abiertas o si falta un dato que la plantilla necesita.
- Si cambia un dato después de generar el borrador, debe generarlo de nuevo antes de enviarlo a revisión.
- Cada descarga queda registrada.

## 5. Para el revisor

- Usted también puede crear y elaborar expedientes, igual que un digitador.
- En **Inicio** aparecen los expedientes pendientes de revisión.
- Lea el borrador completo y las observaciones resueltas (con sus justificaciones).
- **Aprobar** lo deja listo para firma. **Devolver** exige un comentario que explique qué corregir.
- Usted no puede aprobar expedientes que elaboró.
- Después de la firma del notario, registre el número de escritura con **"Marcar como firmada"**.
- En **Plantillas** puede ver cada plantilla con sus variables resaltadas, probarla con datos de ejemplo, cargar una versión nueva y leer la revisión de la IA. La aprobación la hace el administrador por indicación del notario.

## 6. Buenas prácticas

- Verifique siempre contra el documento original: la IA puede equivocarse.
- No cargue documentos de un caso en otro expediente.
- No comparta su usuario. Toda acción queda registrada a su nombre.
- Si algo se ve extraño (un equipo desconocido, un mensaje de bloqueo inesperado), avise al administrador.
