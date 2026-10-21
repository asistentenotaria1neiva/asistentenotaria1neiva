# Asistente de escrituración – Notaría Primera del Círculo de Neiva

Aplicación web que asiste la elaboración de escrituras públicas: analiza los documentos soporte con la API de Claude (Anthropic), precarga los datos con su fuente y nivel de confianza, verifica cruces y advierte inconsistencias, y arma el borrador **únicamente** sobre plantillas aprobadas por el notario.

> La aplicación prepara, verifica y advierte. **No reemplaza al notario**: la firma, el control de legalidad y la responsabilidad siguen en cabeza del notario.

Desarrollado por Automind. Documentación: [`docs/`](docs/).

---

## Contenido

| Ruta | Qué hay |
| --- | --- |
| `src/` | Aplicación Next.js 16 (React 19 + TypeScript). Lógica de negocio en `src/lib/` |
| `src/lib/escritura/` | Datos del formulario, esquemas por tipo, fórmulas de personas e inmuebles, armado y generación del borrador |
| `src/lib/reglas/` | Reglas fijas de validación y cruce (sin IA) |
| `src/lib/ia/` | Integración con Claude: esquemas de extracción, instrucciones, cliente |
| `src/lib/servicios/` | Expedientes, documentos, revisión, borradores, plantillas, aprendizaje |
| `src/lib/seguridad/` | Cifrado, contraseñas, doble factor, red, límites de peticiones |
| `plantillas/fuentes/` | Fuente de las plantillas convertidas (texto con `{{variables}}`) |
| `plantillas/docx/` | Plantillas .docx generadas (se cargan a la base como **pendientes de aprobación**) |
| `plantillas/modelos/` | **Un modelo limpio por tipo de escritura** (el mejor ejemplo de la carpeta, sin datos personales): fuentes, .docx e `INDICE.md` |
| `prisma/` | Modelo de datos y migraciones (incluye el disparador que hace inmodificable la auditoría) |
| `docs/plantillas/` | **Fase 0**: checklist (xlsx y md) y fichas por tipo de escritura |
| `docs/` | Seguridad (OWASP), manuales, decisiones pendientes |
| `herramientas/fase0/` | Scripts reproducibles del inventario y la anonimización de la carpeta de plantillas |
| `herramientas/plantillas/` | Constructor de las plantillas .docx |
| `scripts/` | Carga de datos de prueba |
| `pruebas/` | Pruebas unitarias, de integración y de punta a punta |
| `datos_prueba/` | Casos **ficticios** para pruebas y capacitación |
| `datos_locales/` | Copias de trabajo con datos reales anonimizados – **excluida del repositorio** |

## Requisitos

- Node.js 24 y npm
- Un proyecto de Supabase (base de datos PostgreSQL y Storage para los documentos)
- Una cuenta de Vercel (producción)
- Una clave de la API de Claude (consola de Anthropic), para el análisis con IA

## Instalación para desarrollo

```bash
npm ci
cp .env.ejemplo .env            # complete las claves y las cadenas de Supabase (ver abajo)
npm run plantillas:construir
npm run dev                     # http://localhost:3000
```

Las migraciones se aplican con la cadena *Session pooler* (ver [Despliegue](#despliegue-en-vercel--supabase)).

Generar las claves de 32 bytes:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

La primera vez, la aplicación abre **/instalacion** para crear el administrador (solo mientras no exista ningún usuario y solo desde la red de la oficina). Al ingresar exige configurar el doble factor.

## Variables de entorno principales

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | Conexión a PostgreSQL de Supabase por el *Transaction pooler* (solo desde el servidor) |
| `SUPABASE_URL`, `SUPABASE_CLAVE_SERVICIO`, `SUPABASE_BUCKET` | Storage de Supabase para los documentos cifrados (vacías = carpeta local `RUTA_ALMACENAMIENTO`) |
| `LIMITE_CARGA_MB` | Tamaño máximo por documento (en Vercel, 4) |
| `CLAVE_MAESTRA` | Cifra documentos, borradores y secretos TOTP (AES-256-GCM). **Si se pierde, no se recuperan los documentos.** |
| `CLAVE_FIRMA` | Firma de los tokens de sesión y de equipo |
| `ANTHROPIC_API_KEY` | Clave de la API de Claude. **Solo en el servidor** |
| `CLAUDE_MODELO_EXTRACCION`, `CLAUDE_MODELO_REVISION` | Modelo por tarea (predeterminado `claude-opus-5-5`) |
| `CLAUDE_ESFUERZO_EXTRACCION`, `CLAUDE_ESFUERZO_REVISION` | `low` · `medium` · `high` · `xhigh` · `max` (predeterminado `high`) |
| `CLAUDE_FALLBACKS` | `default` activa el respaldo del servidor de Anthropic ante rechazos por política; vacío lo desactiva |
| `IPS_OFICINA` | IP públicas de la oficina (valor inicial; luego se administra en el panel) |
| `CONFIAR_EN_PROXY` | `true` en Vercel (toma la IP real de `X-Real-IP`) |
| `PDF_CONVERSOR_URL` | URL de un servicio Gotenberg externo (vacío = solo Word) |

## Despliegue en Vercel + Supabase

Base de datos PostgreSQL y documentos cifrados en Supabase (proyecto en `us-east-1`); la aplicación en Vercel (`vercel.json`, región `iad1`, junto a la base: si se cambia la región de una, cambie la de la otra).

1. **Supabase**: crear el proyecto y un bucket **privado** llamado `documentos` (Storage). No se usa la autenticación de Supabase: el acceso lo controla la aplicación, y la migración `bloquear_api_publica` retira el acceso de la API REST de Supabase a las tablas.
2. **Migraciones** (desde un equipo de administración, con la cadena *Session pooler* o *Direct* de Supabase, puerto 5432):
   ```bash
   DATABASE_URL="postgresql://...:5432/postgres" npx prisma migrate deploy
   ```
   Vercel no aplica migraciones: repita este paso cada vez que se agregue una.
3. **Vercel**: importar el repositorio y definir las variables de entorno:

   | Variable | Valor |
   | --- | --- |
   | `DATABASE_URL` | Cadena *Transaction pooler* (puerto 6543) terminada en `?pgbouncer=true&connection_limit=1` |
   | `CLAVE_MAESTRA`, `CLAVE_FIRMA` | Nuevas, generadas para producción (no las de desarrollo) |
   | `SUPABASE_URL`, `SUPABASE_CLAVE_SERVICIO` | URL del proyecto y clave *secret* / *service_role* |
   | `LIMITE_CARGA_MB` | `4` (Vercel limita cada petición a 4,5 MB) |
   | `CONFIAR_EN_PROXY` | `true` (Vercel entrega la IP real en `X-Real-IP`) |
   | `IPS_OFICINA` | IP pública de la oficina. **Obligatoria**: sin ella nadie puede ingresar en producción |
   | `ANTHROPIC_API_KEY` y `CLAUDE_*` | Como en desarrollo |
   | `PDF_CONVERSOR_URL` | Vacío: en Vercel los borradores se entregan solo en Word |
4. Ingresar a `/instalacion` desde la oficina, crear el administrador, configurar el doble factor, registrar la IP de la oficina en **Configuración**, crear usuarios y aprobar los equipos.
5. El notario revisa y el administrador **aprueba las plantillas** (Administración → Plantillas). Sin plantillas aprobadas no se generan borradores.

Al iniciar, la app carga el catálogo y las plantillas (pendientes de aprobación); las migraciones no se aplican solas.

Copias de seguridad: dependen del plan de Supabase (el plan gratuito **no** incluye copias descargables; el Pro incluye copias diarias). Los documentos del bucket ya están cifrados con `CLAVE_MAESTRA`, que debe custodiarse fuera de Vercel.

## Pruebas

```bash
npm run prueba               # 89 pruebas: validaciones, números a letras, concordancia, cruces, generación
npm run prueba:integracion   # 11 pruebas con PostgreSQL (base exclusiva *_prueba, se recrea; nunca la de producción)
npm run prueba:e2e           # 3 recorridos en navegador real (Playwright)
npm run tipos                # verificación de tipos
```

Las pruebas de integración y de punta a punta exigen `DATABASE_URL_PRUEBA` con una base cuyo nombre termine en `_prueba`; se niegan a correr contra otra base.

## Fase 0 (inventario de plantillas)

```bash
npm run fase0 -- "C:\Users\...\Plantillas Notaria 1"
```

Lee la carpeta (sin modificarla), clasifica cada archivo según el catálogo de `herramientas/fase0/catalogo.js`, anonimiza las copias de trabajo en `datos_locales/` y regenera la checklist y las fichas en `docs/plantillas/`. Cuando la notaría agregue minutas, se actualiza el catálogo y se vuelve a ejecutar.

### Modelos limpios por tipo de escritura

```bash
npm run plantillas:modelos
```

Para cada tipo encontrado toma el mejor ejemplo, reemplaza todos los datos del caso por `{{marcadores}}` conservando el texto literal de la notaría y genera `plantillas/modelos/` (fuente, .docx e índice con la elección y lo que hay que revisar). Las tablas de reemplazo contienen datos reales y viven solo en `datos_locales/modelos/`, por lo que este comando solo se puede ejecutar en el equipo que tiene esa carpeta. Cada ejecución verifica que no quede ningún dato real; si encuentra uno, no regenera el índice y termina con error.

## Agregar o modificar una plantilla

1. Escriba la plantilla en Word con variables `{{variable}}` y bloques `{{#condicion}} … {{/condicion}}` (vea las fuentes en `plantillas/fuentes/` como ejemplo y `docs/manual_administrador.md`).
2. Cárguela en Administración → Plantillas: queda **pendiente de aprobación del notario**.
3. Para un tipo de escritura nuevo también se necesita su esquema de formulario (`src/lib/escritura/esquemas.ts`) y su preparación (`src/lib/escritura/actos.ts`).

## Arquitectura

```
Navegador (equipo registrado) ──HTTPS──► Vercel (TLS, HSTS) ──► App Next.js (Node 24)
                                                               │  sesiones, roles, reglas, plantillas
                                                               ├──► Supabase PostgreSQL (sin acceso por su API pública)
                                                               ├──► Supabase Storage (bucket privado, archivos cifrados AES-256-GCM)
                                                               └──► API de Claude (solo análisis y revisión)
```

Flujo de cada escritura: crear expediente → cargar documentos → la IA extrae y precarga → formulario por pasos → reglas + revisión de la IA (críticas bloquean) → borrador sobre plantilla aprobada → revisor aprueba o devuelve → lista para firma del notario.
