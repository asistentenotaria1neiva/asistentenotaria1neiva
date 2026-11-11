# Asistente de escrituración – Notaría Primera del Círculo de Neiva

Aplicación web que asiste la elaboración de escrituras públicas: el digitador **busca en la biblioteca la escritura modelo (plantilla) que necesita**, la revisa en vista previa (o carga una plantilla personal), carga los documentos del negocio y escribe sus observaciones; la IA (Claude, de Anthropic) **adapta la plantilla con los datos de los documentos sin cambiar su estructura ni inventar nada** (lo que no encuentra queda «FALTA» resaltado en amarillo) y entrega la revisión con sus advertencias. El revisor alimenta la biblioteca.

> La aplicación prepara, verifica y advierte. **No reemplaza al notario**: la firma, el control de legalidad y la responsabilidad siguen en cabeza del notario.

Desarrollado por Automind. Documentación: [`docs/`](docs/).

---

## Contenido

| Ruta | Qué hay |
| --- | --- |
| `src/` | Aplicación Next.js 16 (React 19 + TypeScript). Lógica de negocio en `src/lib/` |
| `src/lib/escritura/` | La plantilla en Word como párrafos numerados y los cambios de la IA aplicados sobre ella (`docx.ts`), formato de impresión de la notaría, verificaciones sin IA, datos de la biblioteca |
| `src/lib/ia/` | Integración con Claude: instrucciones y esquemas (lectura de documentos, redacción, búsqueda de faltantes), cliente, precios |
| `src/lib/servicios/` | Biblioteca de plantillas, escrituras, documentos, generación por etapas (`generacion.ts`), notificaciones, consumo |
| `src/lib/seguridad/` | Cifrado, contraseñas, doble factor, red, límites de peticiones |
| `prisma/` | Modelo de datos y migraciones (incluye el disparador que hace inmodificable la auditoría) |
| `scripts/` | Carga de la biblioteca (`cargar-biblioteca.ts`) y limpieza de los archivos del sistema anterior |
| `pruebas/` | Pruebas unitarias |
| `docs/` | Seguridad (OWASP), manuales, decisiones pendientes |

## Requisitos

- Node.js 24 y npm
- Un proyecto de Supabase (base de datos PostgreSQL y Storage para los archivos cifrados)
- Una cuenta de Vercel (producción)
- Una clave de la API de Claude (consola de Anthropic)

## Instalación para desarrollo

```bash
npm ci
cp .env.ejemplo .env            # complete las claves y las cadenas de Supabase (ver abajo)
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
| `SUPABASE_URL`, `SUPABASE_CLAVE_SERVICIO`, `SUPABASE_BUCKET` | Storage de Supabase para los archivos cifrados (vacías = carpeta local `RUTA_ALMACENAMIENTO`) |
| `CLAVE_MAESTRA` | Cifra plantillas, documentos, escrituras y secretos TOTP (AES-256-GCM). **Si se pierde, no se recuperan los archivos.** |
| `CLAVE_FIRMA` | Firma de los tokens de sesión, de equipo y de las etapas en segundo plano |
| `ANTHROPIC_API_KEY` | Clave de la API de Claude. **Solo en el servidor** |
| `ANTHROPIC_WORKSPACE_ID` | Opcional. ID del workspace (`wrkspc_...`) cuando la clave no está asignada a uno |
| `ANTHROPIC_ADMIN_KEY` | Opcional. Clave de administrador (`sk-ant-admin...`) para mostrar el costo real y los créditos restantes |
| `CLAUDE_MODELO_DOCUMENTOS`, `CLAUDE_MODELO_REDACCION` | Modelo por tarea (predeterminados: `claude-haiku-5-5` para leer cada documento una sola vez; `claude-sonnet-5-5` para adaptar la plantilla y revisar) |
| `CLAUDE_MODELO_RESPALDO` | Modelo que repite la lectura si Haiku declina el documento (predeterminado `claude-sonnet-5-5`) |
| `CLAUDE_ESFUERZO_DOCUMENTOS`, `CLAUDE_ESFUERZO_REDACCION` | `low` · `medium` · `high` · `xhigh` · `max` (predeterminado `medium`) |
| `CLAUDE_FALLBACKS` | `default` activa el respaldo del servidor de Anthropic ante rechazos por política; vacío lo desactiva |
| `CLAUDE_CONCURRENCIA` | Documentos que se leen a la vez al generar (1 a 8; 5 por defecto) |
| `IPS_OFICINA` | IP públicas de la oficina (valor inicial; luego se administra en el panel) |
| `CONFIAR_EN_PROXY` | `true` en Vercel (toma la IP real de `X-Real-IP`) |
| `URL_APLICACION` | Dirección pública de la aplicación; la generación la usa para encadenar sus etapas (vacío = el dominio de la petición) |
| `PDF_CONVERSOR_URL` | URL de un servicio Gotenberg externo (vacío = solo Word) |

## Despliegue en Vercel + Supabase

Base de datos PostgreSQL y archivos cifrados en Supabase (proyecto en `us-east-1`); la aplicación en Vercel (`vercel.json`, región `iad1`, junto a la base: si se cambia la región de una, cambie la de la otra).

1. **Supabase**: crear el proyecto y un bucket **privado** llamado `documentos` (Storage). No se usa la autenticación de Supabase: el acceso lo controla la aplicación, y las migraciones retiran el acceso de la API REST de Supabase a las tablas.
2. **Migraciones** (desde un equipo de administración, con la cadena *Session pooler* o *Direct* de Supabase, puerto 5432):
   ```bash
   DATABASE_URL="postgresql://...:5432/postgres" npx prisma migrate deploy
   ```
   Vercel no aplica migraciones: repita este paso cada vez que se agregue una.
3. **Vercel**: importar el repositorio y definir las variables de entorno (`DATABASE_URL` con el *Transaction pooler*, puerto 6543, terminada en `?pgbouncer=true&connection_limit=1`; `CLAVE_MAESTRA` y `CLAVE_FIRMA` nuevas para producción; `SUPABASE_URL` y `SUPABASE_CLAVE_SERVICIO`; `CONFIAR_EN_PROXY=true`; `IPS_OFICINA` obligatoria; `ANTHROPIC_API_KEY` y `CLAUDE_*`).
4. Ingresar a `/instalacion` desde la oficina, crear el administrador, configurar el doble factor, registrar la IP de la oficina en **Configuración**, crear usuarios y aprobar los equipos.
5. Cargar la biblioteca de plantillas desde la carpeta de minutas (volver a ejecutarlo solo agrega lo nuevo; sin `--confirmar` solo muestra lo que cargaría):
   ```bash
   npm run biblioteca:cargar -- "C:\ruta\milan" --confirmar
   ```
   La carpeta va organizada por `<año>/<CATEGORÍA>/[<BANCO o subcategoría>/]archivo.docx`: la categoría y el año salen de las carpetas y la fecha de la última modificación del archivo. Después el **revisor** alimenta la biblioteca desde la aplicación.

Copias de seguridad: dependen del plan de Supabase. Los archivos del bucket ya están cifrados con `CLAVE_MAESTRA`, que debe custodiarse fuera de Vercel.

## Pruebas

```bash
npm run prueba               # unitarias: edición del Word, verificaciones, formato notarial, números a letras, precios
npm run tipos                # verificación de tipos
```

## Cómo se genera una escritura (y por qué gasta pocos tokens)

1. **Lectura** (Haiku, centavos): cada documento se lee una sola vez, apenas se carga, y lo leído se guarda; generar otra versión no lo vuelve a pagar.
2. **Redacción** (Sonnet): recibe los párrafos numerados de la plantilla (sin los guiones de relleno), lo leído y las observaciones, y devuelve **solo los cambios** (fragmentos a reemplazar, párrafos a reescribir, eliminar o repetir) y la revisión. La salida es una fracción de la escritura; la plantilla y lo leído van en caché.
3. **Faltantes** (Haiku): lo que quedó «FALTA» se busca en los documentos originales.
4. **Word**: los cambios se aplican sobre el Word de la plantilla (estilos, tablas y encabezados intactos), se aplica el formato de la notaría (márgenes, Arial 12, 1,5, guiones de relleno) y se suman verificaciones sin IA: datos de la plantilla anterior que siguen en la escritura, valores en letras que no cuadran con la cifra y marcas pendientes.

Cada etapa corre en su propia invocación (Vercel corta a los 5 minutos) y se encadena por `/api/tareas`; si una se corta, la página de la escritura la reanuda.

## Arquitectura

```
Navegador (equipo registrado) ──HTTPS──► Vercel (TLS, HSTS) ──► App Next.js (Node 24)
                                                               │  sesiones, roles, biblioteca de plantillas
                                                               ├──► Supabase PostgreSQL (sin acceso por su API pública)
                                                               ├──► Supabase Storage (bucket privado, archivos cifrados AES-256-GCM)
                                                               └──► API de Claude (lectura de documentos y redacción)
```

Roles: el **digitador** crea y genera sus escrituras; el **revisor** además ve todas las escrituras y alimenta la biblioteca (agrega, corrige, retira o elimina plantillas); el **administrador** gestiona usuarios, equipos, configuración y auditoría.
