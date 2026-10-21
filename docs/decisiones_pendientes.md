# Decisiones pendientes y dudas registradas

Puntos que requieren aprobación del notario o información de la notaría. Mientras no se decidan, la aplicación usa el valor indicado como "provisional".

## Plantillas y contenido jurídico

| # | Pregunta | Provisional | Por qué importa |
| --- | --- | --- | --- |
| 1 | ¿Cuál es la versión vigente de cada minuta? Las 72 fuentes son escrituras reales, no minutas limpias; hay versiones distintas del mismo acto (p. ej. F52/F58, F27/F62, F02/F63/F64). | Se convirtió la fuente sugerida en cada ficha (`docs/plantillas/fichas/`). | Las 12 plantillas convertidas reproducen el texto de esas escrituras; deben revisarse palabra por palabra antes de aprobarlas. |
| 2 | Entrega de las 35 plantillas faltantes, empezando por prioridad alta: sucesiones (intestada, testada, con liquidación), poder general y poder especial. | Marcadas `❌ Falta`; no se redactaron. | La IA nunca redacta cláusulas. |
| 3 | Tipos con fuente pero aún sin convertir: compraventa con subsidio VIS, compraventa con hipoteca bancaria, hipoteca, liberación de hipoteca, declaración de construcción, aclaración, mejoras, derechos herenciales a título singular, cesación de efectos civiles, unión marital, partición en vida, directivas anticipadas, terminación de acuerdo de apoyo. | Fichas listas; se convierten en el periodo de ajuste (meses 1–6). | Se priorizan según volumen real. |
| 4 | Minutas bancarias: ¿se seguirán recibiendo de cada banco? ¿Se guardan versiones por entidad? | Se manejarán como "minuta externa" por entidad. | Son textos del banco ("HASTA AQUÍ LA MINUTA PRESENTADA"). |
| 5 | Cancelación de hipoteca: ¿con o sin cuantía? F16 va sin cuantía (art. 23 Ley 546 de 1999); F32 y F34 llevan cuantía. | Casilla "sin cuantía" marcada por defecto, editable. | Afecta derechos notariales y de registro. |
| 6 | Cancelación de patrimonio con beneficiarios menores (caso F68). | Observación CRÍTICA; la plantilla solo cubre beneficiarios mayores. | Requiere trámite y redacción distintos. |
| 7 | Divorcio con hijos menores. | Observación CRÍTICA (falta concepto del Defensor de Familia en la plantilla). | Igual que el anterior. |
| 8 | Referencias normativas de cada ficha. | "Referencia normativa – pendiente de validar por el notario". | No se afirma la vigencia de ninguna norma. |
| 9 | Estilo: números en letras sin tilde ("VEINTISEIS", "UN MILLON"), "M/CTE", número de escritura con punto de miles "(2.616)". | Así, como en la mayoría de escrituras de la notaría; configurable. | Uniformidad. |
| 10 | Relleno de líneas: las escrituras usan guiones escritos a mano; las plantillas usan una tabulación con relleno de guiones hasta el margen. "Hoja No." en el encabezado desde la hoja 2. | Así. | Control contra adiciones; confirmar que cumple el estándar de la notaría. |
| 11 | Notaria encargada: el texto asume género femenino ("cuya Notaria Encargada es la señora…", "LA NOTARIA E,"). | Configurable en `notaria.encargado_genero`. | |

## Operación y seguridad

| # | Pregunta | Provisional |
| --- | --- | --- |
| 12 | IP pública fija de la oficina (y si hay varias sedes). | Se registra en Configuración el día de la instalación. |
| 13 | Antigüedad máxima aceptable del certificado de tradición y del certificado de existencia. | 30 días (advertencia), configurable. |
| 14 | Horario permitido de acceso del personal. | Desactivado. |
| 15 | Proveedor de nube, región y ubicación de las copias de seguridad. | Elegido: Vercel (`iad1`) + Supabase (`us-east-1`, EE. UU.). Pendiente: aceptar la transferencia internacional de datos (Ley 1581) y contratar copias (plan Pro de Supabase o copia propia). |
| 16 | **Acuerdo de retención cero (ZDR) y DPA con Anthropic** antes de cargar casos reales; ajuste de la política de tratamiento de datos de la notaría y de la autorización de los comparecientes (transmisión a un encargado en el exterior). | Retención estándar de la API (ver `docs/seguridad.md` §4). |
| 17 | Custodia de `CLAVE_MAESTRA` (¿quién guarda el sobre sellado?). | Pendiente. |
| 18 | ¿El revisor puede descartar observaciones críticas de la IA como falsas alarmas? | Sí, con justificación registrada; las críticas de las reglas fijas solo se cierran corrigiendo el dato. |
| 19 | Modelo de IA: se usa `claude-opus-5-5` para extracción y revisión (máxima precisión). Si el costo mensual lo amerita, puede probarse un modelo más económico para la extracción. | Opus 5.5, esfuerzo `high`, cambiable por variable de entorno. |

## Hallazgos de la Fase 0 para corregir en la notaría (independientes de la app)

- F70 (directiva anticipada): la cédula del titular difiere entre carátula y cuerpo.
- F71 (partición en vida): total de la hijuela segunda mal escrito; numeral repetido; "causante" para persona viva.
- F72 (terminación de acuerdo de apoyo): texto arrastrado de otra minuta ("la MODIFICACIÓN").
- F21: encabezado del titular con firma de la encargada.

Si alguno de estos documentos ya se otorgó, el notario debe evaluar si requiere escritura aclaratoria.
