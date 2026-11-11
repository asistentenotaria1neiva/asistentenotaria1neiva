# Decisiones pendientes y dudas registradas

Puntos que requieren aprobación del notario o información de la notaría. Mientras no se decidan, la aplicación usa el valor indicado como "provisional".

## Biblioteca de plantillas y contenido jurídico

| # | Pregunta | Provisional | Por qué importa |
| --- | --- | --- | --- |
| 1 | La biblioteca se cargó con todas las escrituras de la carpeta de minutas (2024–2026). ¿Hay escrituras que no deban usarse como modelo (con errores conocidos, normas derogadas, bancos que cambiaron su minuta)? | Todas quedan disponibles; el revisor retira las que no sirvan. | La IA sigue la plantilla al pie de la letra: un error en el modelo pasa a la escritura nueva. |
| 2 | Los `.doc` antiguos (2 archivos de 2026) no se cargaron. | Se abren en Word y se guardan como `.docx` para agregarlos desde la biblioteca. | |
| 3 | Estilo: números en letras sin tilde ("VEINTISEIS", "UN MILLON"), "M/CTE". | Se respeta el de cada plantilla. | Uniformidad. |
| 4 | Relleno de líneas con guiones escritos y "Hoja No." en el encabezado. | El sistema recalcula los guiones de relleno al generar (formato de la notaría). | Control contra adiciones. |
| 5 | Notaria encargada: género en el texto. | Configurable en `notaria.encargado_genero`. | |

## Operación y seguridad

| # | Pregunta | Provisional |
| --- | --- | --- |
| 6 | IP pública fija de la oficina (y si hay varias sedes). | Se registra en Configuración el día de la instalación. |
| 7 | Antigüedad máxima aceptable del certificado de tradición. | La IA advierte desde 30 días. |
| 8 | Horario permitido de acceso del personal. | Desactivado. |
| 9 | Proveedor de nube, región y copias de seguridad. | Vercel (`iad1`) + Supabase (`us-east-1`, EE. UU.). Pendiente: aceptar la transferencia internacional de datos (Ley 1581) y contratar copias. |
| 10 | **Acuerdo de retención cero (ZDR) y DPA con Anthropic**; ajuste de la política de tratamiento de datos y de la autorización de los comparecientes. Las plantillas de la biblioteca son escrituras reales y se envían a la API al generar. | Retención estándar de la API (ver `docs/seguridad.md` §4). |
| 11 | Custodia de `CLAVE_MAESTRA` (¿quién guarda el sobre sellado?). | Pendiente. |
| 12 | Modelos de IA: Haiku 5.5 lee los documentos (una sola vez) y Sonnet 5.5 adapta la plantilla. | Esfuerzo `medium`, cambiable por variable de entorno. |
