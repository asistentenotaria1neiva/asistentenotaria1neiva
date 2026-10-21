# Seguridad – Asistente de escrituración

Notaría Primera del Círculo de Neiva · Documento técnico para el notario, el administrador y el auditor de sistemas.

La aplicación **prepara, verifica y advierte**. No reemplaza al notario: la firma, el control de legalidad y la responsabilidad siguen en cabeza del notario.

---

## 1. Resumen de medidas

| Área | Medida | Dónde está |
| --- | --- | --- |
| Transporte | HTTPS obligatorio (TLS automático en Vercel), HSTS de 2 años con preload | `next.config.ts` |
| Cabeceras | CSP con *nonce* por petición, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy`, COOP/CORP, `Cache-Control: no-store` | `src/proxy.ts`, `next.config.ts` |
| Contraseñas | Argon2id (19 MiB, t=2, p=1); mínimo 12 caracteres con mayúsculas, minúsculas y números; cambio obligatorio de la contraseña temporal | `src/lib/seguridad/contrasenas.ts` |
| Bloqueo | 5 intentos fallidos → bloqueo de 30 min (configurable), alerta ALTA; límite de 20 intentos por IP y 10 por usuario cada 15 min | `src/lib/sesion.ts` |
| Doble factor | TOTP obligatorio para el administrador; secreto cifrado; un código no se acepta dos veces; el alta del doble factor solo desde la red de la oficina | `src/lib/seguridad/totp.ts` |
| Sesiones | Una sola sesión activa por usuario; cierre por inactividad (20 min) y duración máxima (10 h); token aleatorio de 256 bits; en la base solo se guarda su huella HMAC | `src/lib/sesion.ts` |
| Equipos | Token de equipo firmado en cookie `HttpOnly`, `Secure`, `SameSite=Strict` (`__Host-` en producción); huella HMAC en la base; huella del navegador como dato complementario; equipo nuevo = PENDIENTE hasta aprobación | `src/lib/sesion.ts`, `/admin/dispositivos` |
| Red | El personal solo entra desde la IP pública de la oficina (lista blanca configurable, admite CIDR). El administrador puede entrar desde fuera, siempre con doble factor; cada acceso remoto genera alerta | `src/lib/seguridad/red.ts` |
| Revocación inmediata | Cada petición revalida sesión, usuario, equipo y red: desactivar un equipo o suspender un usuario corta su sesión en la siguiente petición | `leerSesion()` en `src/lib/sesion.ts` |
| Documentos | Cifrado AES-256-GCM en reposo, con verificación de integridad (SHA-256) al descargar; bucket privado de Supabase Storage (sin URL pública; el proveedor solo recibe bytes ya cifrados); se valida el tipo real del archivo por su firma (PDF, JPG, PNG, WEBP) | `src/lib/almacenamiento.ts`, `src/lib/servicios/documentos.ts` |
| Base de datos | PostgreSQL de Supabase (cifrado en reposo del proveedor); solo la app se conecta, con su usuario. Se retiró el acceso de la API REST pública de Supabase (roles `anon`/`authenticated`) y RLS está activo en todas las tablas | `prisma/migrations/*_bloquear_api_publica` |
| Clave de la API de Claude | Solo en el servidor (`ANTHROPIC_API_KEY` en `.env` o gestor de secretos). Nunca en el navegador ni en el repositorio (`.gitignore`) | `src/lib/ia/cliente.ts` (`server-only`) |
| Autorización | Toda la lógica corre en el servidor; cada acción verifica rol y propiedad del expediente; el navegador nunca decide qué está permitido | `src/lib/servicios/*` |
| CSRF | Acciones de servidor de Next verifican `Origin` contra `Host`; cookies `SameSite=Strict` | Next.js + `src/lib/sesion.ts` |
| Exportaciones | No existe exportación masiva. Las descargas son individuales (documento, borrador, plantilla) y quedan auditadas | `src/app/api/*` |
| Auditoría | Registro inmodificable: disparadores de PostgreSQL bloquean UPDATE, DELETE y TRUNCATE; cada fila encadena el hash de la anterior y la cadena se verifica desde el panel | `prisma/migrations/*_auditoria_inmodificable`, `src/lib/auditoria.ts` |
| Alertas | Equipo no autorizado, IP no permitida, bloqueos, acceso remoto, códigos de doble factor errados, huella de navegador distinta, límites de peticiones | `/admin/alertas` |
| Copias | **Pendiente.** Dependen del plan de Supabase (el gratuito no incluye copias descargables; el Pro, diarias). Ver decisión pendiente n.º 15 | Panel de Supabase |
| Frontend | Compilado y minificado, sin mapas de código en producción | `next.config.ts` |

## 2. Cobertura del OWASP Top 10 (2021)

| Riesgo | Cómo se cubre |
| --- | --- |
| **A01 – Control de acceso roto** | Roles en el servidor (`requerirSesion({ roles })`); el digitador solo ve sus expedientes; quien elabora no aprueba su propio expediente; descargas verifican permiso; estados del flujo validados en el servidor. Pruebas: `pruebas/integracion/flujo.test.ts` (otro digitador no accede). |
| **A02 – Fallas criptográficas** | TLS + HSTS; AES-256-GCM para documentos, borradores y secretos TOTP; Argon2id para contraseñas; HMAC-SHA256 para tokens; claves de 32 bytes en variables de entorno. |
| **A03 – Inyección** | Prisma con consultas parametrizadas (no hay SQL concatenado); CSP con *nonce* y `strict-dynamic`; React escapa la salida; plantillas con analizador de expresiones en modo CSP (sin `eval`); nombres de archivo saneados. Los textos de los documentos se tratan como datos y no como instrucciones para la IA (instrucción explícita en el prompt). |
| **A04 – Diseño inseguro** | Flujo con controles obligatorios: críticas bloquean, advertencias exigen justificación, revisor distinto del elaborador, plantillas solo aprobadas, la IA advierte y la persona decide. |
| **A05 – Configuración insegura** | Cabeceras de seguridad, `poweredByHeader: false`, base de datos sin exposición, contenedor sin privilegios (usuario `app`), sin lista de IP en producción no entra nadie del personal. |
| **A06 – Componentes vulnerables** | Dependencias fijadas en `package-lock.json`; `npm audit` en cada entrega. Estado actual: la única alerta (`deepmerge-ts`, vía la CLI de Prisma 6) afecta solo la herramienta de migraciones en el servidor de compilación, no la aplicación en ejecución; se resolverá al migrar a Prisma 7. Next.js actualizado a 16.4 para corregir la alerta de PostCSS. |
| **A07 – Fallas de identificación y autenticación** | Bloqueo por intentos, límites por IP/usuario, doble factor, sesión única, inactividad, mensajes genéricos, tiempo constante cuando el usuario no existe. |
| **A08 – Integridad de software y datos** | Hash SHA-256 de documentos, borradores y plantillas; auditoría encadenada; compilación en Vercel desde el lockfile (`npm ci`). |
| **A09 – Registro y monitoreo** | Auditoría de toda acción (ingresos, fallos, cambios de datos, descargas, aprobaciones, configuración); alertas; verificación de la cadena. |
| **A10 – SSRF** | La app solo hace peticiones salientes a la API de Anthropic y a Supabase Storage (y a Gotenberg, si se configura); ninguna URL proviene del usuario. |

## 3. Datos personales (Ley 1581 de 2012)

- **Finalidad y minimización:** solo se recolectan los datos necesarios para elaborar la escritura (los mismos que hoy contienen las minutas).
- **Fase 0:** las 72 escrituras de la carpeta de plantillas contenían datos reales. Se trabajó sobre copias anonimizadas en `datos_locales/` (excluida del repositorio); la checklist y las fichas usan alias con iniciales.
- **Casos de aprendizaje:** se guardan anonimizados (nombres, documentos, matrículas y direcciones enmascarados).
- **Datos de prueba:** ficticios (`datos_prueba/casos.json`).
- **Registros de error:** no se registran contenidos de documentos ni datos del formulario.
- **Transmisión a un tercero:** los documentos se envían a la API de Claude únicamente para su análisis (ver sección 4). Esta transmisión debe constar en la política de tratamiento de datos de la notaría y en la autorización de los comparecientes. **Decisión pendiente del notario** (ver `docs/decisiones_pendientes.md`).

## 4. API de Claude: uso y retención de datos (consultado el 19 de octubre de 2026)

Fuentes oficiales: [API and data retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention) y [How long do you store my organization's data?](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data).

- **Entrenamiento:** según la documentación de la API, los datos retenidos *no se usan para entrenar modelos sin permiso expreso*. Ningún "entrenamiento" de este proyecto reentrena modelos de Anthropic: se ajustan instrucciones, reglas, formularios y plantillas dentro de la aplicación.
- **Retención estándar (cuenta comercial):** el artículo de privacidad indica que Anthropic elimina automáticamente las entradas y salidas de la API **dentro de los 30 días** siguientes a su recepción o generación. Hay excepciones: servicios con retención controlada por el cliente (p. ej. Files API, que esta aplicación **no** usa), acuerdos distintos, cumplimiento de la ley y cumplimiento de la Política de Uso; si una solicitud se marca como violación de la política, puede conservarse **hasta 2 años** (y las puntuaciones de clasificación hasta 7 años).
- **Retención cero (ZDR):** disponible por acuerdo con Anthropic, por organización; con ZDR no se almacenan los prompts ni las respuestas después de devolver la respuesta (salvo exigencias legales o abuso). Las funciones que usa esta app son elegibles: Messages, soporte de PDF y salidas estructuradas (estas últimas "calificadas": el esquema puede guardarse en caché; nuestros esquemas no contienen datos personales).
- **Modelos:** el modelo predeterminado (`claude-opus-5-5`) **no** es un "Covered Model"; los modelos Fable/Mythos sí exigen retención de 30 días y no admiten ZDR. Si se cambia el modelo por variable de entorno, debe revisarse este punto.
- **Respaldo ante rechazos (`fallbacks: "default"`):** está activado. Si un modelo declina una solicitud por política, el servidor de Anthropic la reintenta con otro modelo en la misma llamada. Se desactiva con `CLAUDE_FALLBACKS=` (vacío).
- **Recomendación:** antes de cargar casos reales, la notaría debería **solicitar a Anthropic un acuerdo de ZDR** y un Anexo de Tratamiento de Datos (DPA) para su organización. Mientras tanto aplica la retención estándar descrita arriba.

> Nota: un blog de terceros reporta que la retención estándar habría bajado a 7 días; no se encontró confirmación oficial, por lo que se documenta el valor oficial de 30 días.

## 5. Mejora opcional documentada: certificado de cliente (mTLS)

Para un control de equipos más fuerte, se puede exigir un certificado de cliente emitido por la notaría e instalado en cada computador. Vercel no lo ofrece en sus planes estándar: requiere un proxy propio delante (p. ej. Caddy o Cloudflare):

1. Crear una CA interna (p. ej. `step-ca` u OpenSSL) y emitir un certificado por equipo.
2. En el proxy (p. ej. Caddy), agregar `tls { client_auth { mode require_and_verify trusted_ca_cert_file /ruta/ca.crt } }`.
3. Para el acceso remoto del administrador, emitir su certificado aparte o usar un subdominio sin mTLS restringido al rol administrador.
4. Revocar un equipo = revocar su certificado (CRL) además de desactivarlo en el panel.

## 6. Custodia de claves

- `CLAVE_MAESTRA` cifra documentos, borradores y secretos TOTP. **Si se pierde, no se pueden recuperar.** Guardar una copia fuera de Vercel (gestor de secretos o sobre sellado bajo custodia del notario).
- Rotación: cambiar `CLAVE_FIRMA` invalida todas las sesiones y obliga a registrar de nuevo los equipos.

## 7. Pruebas de seguridad automatizadas

- `npm run prueba` – validaciones, cruces y generación (89 pruebas).
- `npm run prueba:integracion` – flujo completo, cifrado en disco, archivos falsos rechazados, auditoría inmodificable e íntegra (11 pruebas).
- `npm run prueba:e2e` – navegador real: instalación, doble factor, contraseña errada, equipo no autorizado bloqueado, cambio obligatorio de contraseña, permisos y verificación de la auditoría (3 recorridos).
