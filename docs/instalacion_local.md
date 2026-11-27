# Instalación local (sin Supabase ni Vercel)

La aplicación corre en el servidor de la notaría (**SERVIDOR**, `192.168.2.200`, Windows Server 2019) y se usa desde los equipos de la oficina en **https://servidor** (o https://192.168.2.200), y desde fuera por Tailscale. Solo la API de Claude sigue siendo externa.

```
Equipo de la oficina ──HTTPS :443──► Caddy (servicio de Windows) ──► Next.js en 127.0.0.1:3000
                                                                    ├──► PostgreSQL local (127.0.0.1:5432)
                                                                    ├──► C:\Escrituracion\almacenamiento (archivos cifrados AES-256-GCM)
                                                                    └──► API de Claude
```

| Antes | Ahora |
| --- | --- |
| Supabase PostgreSQL | PostgreSQL 17 en el servidor |
| Supabase Storage | Carpeta `C:\Escrituracion\almacenamiento` (el modo local que ya traía `src/lib/almacenamiento.ts`) |
| Vercel (hosting, HTTPS, IP real) | `next start` + Caddy (HTTPS con certificado propio, IP real en `X-Real-IP`) |
| Copias de Supabase | `local\respaldo.ps1`, todos los días a las 11:00 p. m. |
| Despliegue al subir a git | `local\actualizar.ps1` |

No cambia el código de negocio: el modo de almacenamiento local, los límites de 4,5 MB por petición y las etapas encadenadas siguen funcionando igual (localmente no hay límite de 5 minutos, pero no estorban).

---

## 1. Programas (una vez)

Instale en el servidor, como Administrador:

1. **Node.js 24 LTS** (instalador `.msi` de nodejs.org, opción por defecto: queda en el PATH del sistema).
2. **PostgreSQL 17** (instalador de EDB, enterprisedb.com). Anote la clave del superusuario `postgres`. Deje el puerto 5432. En «Stack Builder» no hace falta nada.
   - PostgreSQL debe escuchar solo en el propio servidor: en `C:\Program Files\PostgreSQL\17\data\postgresql.conf` deje `listen_addresses = 'localhost'` y reinicie el servicio `postgresql-x64-17`.
   - Si Supabase usa una versión mayor que 17 (Supabase → Settings → Infrastructure), instale esa versión o una más nueva: `pg_dump` no puede copiar una base de una versión mayor que la suya.
3. **Git** (ya está instalado).
4. **Caddy**: descargue `caddy.exe` (Windows amd64) de caddyserver.com/download y guárdelo como `C:\Escrituracion\caddy\caddy.exe`.

## 2. La aplicación, fuera de OneDrive

No la ejecute desde la carpeta de OneDrive: la sincronización choca con `node_modules`, `.next` y los archivos cifrados.

```powershell
git clone <url-del-repositorio> C:\Escrituracion\app
cd C:\Escrituracion\app
npm ci
copy local\env.local.ejemplo .env
notepad .env
```

En el `.env`:

- `DATABASE_URL`: cambie `CAMBIE_ESTA_CLAVE` por una clave nueva (solo letras y números).
- `CLAVE_MAESTRA`, `CLAVE_FIRMA`, `ANTHROPIC_*`, `CLAUDE_*`, `VAPID_*`: **copie los valores de Vercel** (Settings → Environment Variables). Con otra `CLAVE_MAESTRA` no se pueden abrir los archivos que vienen de Supabase.
- `IPS_OFICINA`: la red local (`192.168.2.0/24`). Ya no es la IP pública: los equipos llegan con su IP privada.

## 3. Pasar los datos de Supabase

Haga este paso fuera del horario de trabajo: lo que se cargue en Vercel después de copiar no queda en el servidor local.

**Base de datos.** Supabase → Connect → *Session pooler* (puerto **5432**):

```powershell
.\local\migrar-desde-supabase.ps1 -UrlSupabase "postgresql://postgres.xxxx:CLAVE@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
```

Crea el usuario y la base locales, copia el esquema `public` (tablas, datos, auditoría y el historial de migraciones de Prisma) y verifica con `prisma migrate status`. El aviso `schema "public" already exists` es normal.

**Archivos cifrados.** Copie `local\env.supabase.ejemplo` como `.env.supabase` y complételo con `SUPABASE_URL` y `SUPABASE_CLAVE_SERVICIO` de Vercel:

```powershell
npm run supabase:bajar                 # solo muestra cuántos archivos y MB hay que bajar
npm run supabase:bajar -- --confirmar  # los baja a RUTA_ALMACENAMIENTO
```

Se puede repetir: solo baja lo que falta. Al final compara con la base y debe decir `faltan en la carpeta local: 0`. Después **borre `.env.supabase`**.

## 4. Compilar y probar

```powershell
npm run build
npm run start:local
```

En el mismo servidor abra http://localhost:3000. Las cookies seguras no funcionan por HTTP, así que no podrá ingresar desde ahí: con que cargue la página de ingreso basta. Detenga con Ctrl+C.

## 5. Dejarla corriendo sola

PowerShell **como Administrador**, en `C:\Escrituracion\app`:

```powershell
.\local\instalar-servicios.ps1 -DestinoRespaldo 'F:\RespaldosEscrituracion'
```

Esto deja:

- el servicio **EscrituracionCaddy** (HTTPS en el 443; el 80 lo usa Windows en este servidor);
- la tarea **Escrituracion - Aplicacion** (inicia la app con Windows y la reinicia si se cae; registro en `C:\Escrituracion\app\logs\app.log`);
- la tarea **Escrituracion - Respaldo** (diaria);
- la regla de firewall del puerto 443, solo para la red local.

El destino del respaldo debe ser **otro disco** (aquí, F:). Además, saque una copia periódica fuera de la notaría.

## 6. Certificado en cada equipo de la oficina

Caddy firma su propio certificado. Para que los navegadores lo acepten sin advertencia, su certificado raíz se instala **una vez por equipo**. La red es un grupo de trabajo (`NOTARIA1`, sin dominio de Windows), así que no se puede repartir por GPO.

1. En el servidor (ya hecho): el certificado raíz y `local\instalar-certificado.cmd` están en la carpeta compartida `DATOS GENERAL\INSTALAR CERTIFICADO ESCRITURACION`. Si se reinstala Caddy, copie de nuevo `C:\Escrituracion\caddy\datos\pki\authorities\local\root.crt` allí con el nombre `certificado-raiz-escrituracion.crt`.
2. En cada equipo: abrir esa carpeta, doble clic en **`instalar-certificado.cmd`** y aceptar el permiso de administrador. Instala el certificado (Chrome, Edge y Firefox) y crea en el escritorio el acceso directo **«Escrituracion Notaria»**.
3. Cerrar el navegador y abrir el acceso directo: entra a **https://servidor**.

La dirección de la oficina es **https://servidor**: el nombre de red del servidor, el mismo de las carpetas compartidas, que todos los equipos ya resuelven. También funciona `https://192.168.2.200`. No se usa un nombre propio en el archivo `hosts`, porque Kaspersky bloquea a los scripts que lo modifican.

Los usuarios, los equipos aprobados y las sesiones vienen de la base copiada. Como la dirección cambió, cada navegador debe **registrar el equipo de nuevo**: las cookies eran del dominio de Vercel. El administrador los aprueba en **Dispositivos**. Los avisos push también se vuelven a activar en cada equipo.

## 7. Dar de baja Supabase y Vercel

Cuando haya trabajado unos días con la instalación local y un respaldo se haya restaurado bien en una base de prueba:

1. Vercel: borre el proyecto (o quite su dominio) para que nadie siga cargando datos allá.
2. Supabase: descargue un último volcado (`pg_dump`) para el archivo y elimine el proyecto.

---

## Operación

| Tarea | Cómo |
| --- | --- |
| Publicar una versión nueva | `.\local\actualizar.ps1` como Administrador (git pull, npm ci, respaldo, migraciones, compilación y reinicio) |
| Reiniciar la app | `Stop-ScheduledTask 'Escrituracion - Aplicacion'; Start-ScheduledTask 'Escrituracion - Aplicacion'` |
| Ver errores | `C:\Escrituracion\app\logs\app.log`; Caddy: `C:\Escrituracion\caddy\acceso.log` |
| Respaldo a mano | `.\local\respaldo.ps1 -Destino 'F:\RespaldosEscrituracion'` |
| Restaurar la base | `pg_restore -h 127.0.0.1 -U escrituracion -d escrituracion --clean --if-exists F:\RespaldosEscrituracion\base\escrituracion-AAAAMMDD-HHMM.dump`, y luego copiar `F:\RespaldosEscrituracion\almacenamiento` a `C:\Escrituracion\almacenamiento` |

**Limpieza automática.** Los valores de `env.local.ejemplo` conservan las escrituras 10 años y los PDF soporte 1 año. Los valores anteriores (30 días y 3 días) eran para no pasar del 1 GB gratis de Supabase. Ajústelos en el `.env` y reinicie la app.

**Entrar desde fuera de la oficina (Tailscale).** El servidor está en una red privada de Tailscale con el nombre `servidor.tail52cfb3.ts.net`. Desde un equipo de esa red se entra en **https://servidor.tail52cfb3.ts.net**, con certificado válido y sin instalar nada más. Para el resto de internet el servidor no existe: no se abre ningún puerto del router.

- Agregar un equipo: instalar Tailscale (tailscale.com/download) e iniciar sesión con la cuenta de la notaría. Quitarlo: consola de Tailscale → Machines → Remove.
- Por la configuración de la app, desde fuera de la red de la oficina solo entra el **administrador** (siempre con doble factor). Para que otro usuario entre desde su casa habría que agregar `100.64.0.0/10` a las IP de la oficina en Configuración.
- En el servidor, Tailscale corre como servicio en modo desatendido y no cambia el DNS del servidor (`--accept-dns=false`). En la consola de Tailscale deben quedar activados **MagicDNS** y **HTTPS Certificates**, y en la máquina `servidor` desactivado el vencimiento de la clave (**Disable key expiry**).
- Firewall: la regla «Escrituracion HTTPS (Tailscale)» abre el 443 solo para el rango de Tailscale (`100.64.0.0/10`).

No abra el puerto 443 del router a internet.

**Custodia.** `CLAVE_MAESTRA` sigue siendo indispensable: los archivos y sus respaldos están cifrados con ella. Guarde una copia fuera del servidor, en sobre sellado o en un gestor de secretos.
