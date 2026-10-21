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
| 2 | **Documentos** | Cargue los documentos soporte (PDF o fotos): cédulas, certificado de tradición, paz y salvo, poderes, etc. Elija el tipo correcto de cada uno. La lista superior muestra cuáles faltan. |
| 3 | **Documentos → Analizar con IA** | La IA lee cada documento y propone los datos. Abra "Datos extraídos" para ver de dónde salió cada dato (página y texto) y con qué confianza. |
| 4 | **Formulario** | Complete y corrija los pasos: datos de la escritura, personas, inmuebles y el paso de cada acto. |
| 5 | **Observaciones** | Ejecute **"Reglas + revisión de la IA"** y atienda cada observación. |
| 6 | **Borrador** | Genere el borrador; descárguelo en Word o PDF y léalo completo. |
| 7 | **Resumen y flujo → Enviar a revisión** | El revisor lo aprueba o lo devuelve con comentarios. |
| 8 | Lista para firma | El expediente queda listo para la firma del notario. |

## 3. Formulario por pasos

- Los campos con **\*** son obligatorios. El botón **"Guardar y continuar"** no avanza mientras haya datos faltantes o mal escritos; los errores aparecen en rojo bajo cada campo.
- **Guardar** guarda lo digitado aunque falten datos (no se pierde nada).
- **Personas:** registre una sola vez a cada persona o entidad, incluidos apoderados, representantes legales y el cónyuge que coadyuva. Luego, en cada acto, selecciónelas (vendedor, comprador…). El **género** se usa para que el texto concuerde ("la vendedora", "domiciliado").
- **Documentos:** la cédula se valida (solo números); el NIT exige el dígito de verificación correcto; la matrícula debe tener el formato 200-12345; la cédula catastral debe tener 15, 20, 25 o 30 dígitos.
- **Valores:** escriba solo el número. El valor en letras se genera automáticamente y se muestra debajo ("CIEN MILLONES DE PESOS M/CTE ($100.000.000)"). Nunca escriba valores en letras a mano.

### Sugerencias de la IA

Debajo de los campos pueden aparecer recuadros **"IA sugiere"** con:
- el valor propuesto y el documento, la página y el fragmento de donde salió;
- la confianza (alta, media o baja).

Recuadros en **rojo** = confianza baja o formato dudoso: **revise el documento original**. La IA no adivina; si no puede leer un dato, lo deja para revisión manual.

- **Usar este valor** lo copia al formulario.
- **Descartar** pide el motivo (queda como caso de aprendizaje para mejorar la IA).
- Ninguna sugerencia se aplica sola. Si usted cambia un valor sugerido, el cambio queda registrado (anonimizado) para el entrenamiento.

## 4. Observaciones

| Nivel | Qué significa | Qué hacer |
| --- | --- | --- |
| 🔴 **Crítica** | Impide avanzar. Ej.: la cédula del vendedor no coincide con la del certificado de tradición. | Corrija el dato en el formulario y ejecute de nuevo las reglas. |
| 🟡 **Advertencia** | Exige revisión. Ej.: hipoteca vigente no mencionada. | Corrija el dato o escriba una **justificación** (mínimo 15 caracteres). |
| 🔵 **Informativa** | Sugerencia. Ej.: el paz y salvo vence en 5 días. | Tómela en cuenta. |

- Las observaciones de **reglas** se cierran solas cuando el dato queda corregido y se vuelve a ejecutar la revisión.
- Las de la **IA** se marcan "Corregí el dato", "Justificar" o "Descartar (falsa alarma)". Si fue una falsa alarma, márquelo: así se mide la calidad de la IA.
- Las críticas de la IA solo puede descartarlas un revisor.

## 5. Borrador

- Se arma reemplazando los datos en la **plantilla aprobada por el notario**. La IA no redacta ni cambia el texto.
- No se genera si hay observaciones críticas abiertas o si falta un dato que la plantilla necesita.
- Si cambia un dato después de generar el borrador, debe generarlo de nuevo antes de enviarlo a revisión.
- Cada descarga queda registrada.

## 6. Para el revisor

- En **Inicio** aparecen los expedientes pendientes de revisión.
- Lea el borrador completo y las observaciones resueltas (con sus justificaciones).
- **Aprobar** lo deja listo para firma. **Devolver** exige un comentario que explique qué corregir.
- Usted no puede aprobar expedientes que elaboró.
- Después de la firma del notario, registre el número de escritura con **"Marcar como firmada"**.

## 7. Buenas prácticas

- Verifique siempre contra el documento original: la IA puede equivocarse.
- No cargue documentos de un caso en otro expediente.
- No comparta su usuario. Toda acción queda registrada a su nombre.
- Si algo se ve extraño (un equipo desconocido, un mensaje de bloqueo inesperado), avise al administrador.
