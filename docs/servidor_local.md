# Migración al servidor local (Windows)

Esta carpeta es la **versión para el servidor local** de la notaría (rama `servidor-local`). Es la misma
aplicación que corre hoy en Vercel + Supabase, con estos cambios:

- La base de datos es un **PostgreSQL instalado en el servidor** y los archivos cifrados van a una
  **carpeta del servidor** (`RUTA_ALMACENAMIENTO`), no a Supabase.
- Se entra desde la oficina y desde fuera por **Cloudflare Tunnel**, con HTTPS y sin abrir puertos del
  router. La aplicación escucha solo en `127.0.0.1:3000`.
- La IP real de cada usuario se lee de la cabecera `CF-Connecting-IP` del túnel (para la restricción por
  red de la oficina).
- La limpieza automática conserva los PDF 180 días y las escrituras 10 años (`.env.servidor.ejemplo`).
- Copias de seguridad diarias y cifradas a Google Drive (`servidor\copia-seguridad.ps1`).

No hay que descifrar nada: los archivos pasan tal cual, cifrados con la misma `CLAVE_MAESTRA`.

---

## 1. Lo que se necesita

| Qué | Detalle |
|---|---|
| Equipo | Windows 10/11 Pro (o Windows Server). Procesador i5/Ryzen 5 o mejor, **16 GB de RAM**, **SSD de 1 TB**. Conectado por **cable** al router. |
| UPS | De al menos 30 minutos para el servidor y el router. |
| Internet | Estable. La IA (Anthropic) y el túnel van por internet. |
| Dominio | Uno propio, por ejemplo `notaria1neiva.com.co` (unos 10–15 USD al año). |
| Cuenta de Cloudflare | Gratis, en <https://dash.cloudflare.com/sign-up>. |
| Cuenta de Google | Con espacio en Drive para las copias (15 GB gratis alcanzan para empezar; con Google One de 100 GB hay para años). |
| Claves de Vercel | En Vercel → proyecto → Settings → Environment Variables: copiar `CLAVE_MAESTRA`, `CLAVE_FIRMA`, `ANTHROPIC_*`, `CLAUDE_*`, `VAPID_*`, `SUPABASE_URL`, `SUPABASE_CLAVE_SERVICIO` e `IPS_OFICINA`. |
| Cadena de Supabase | Supabase → Connect → **Session pooler** (puerto **5432**), con la contraseña de la base. |

> **CLAVE_MAESTRA** debe ser **exactamente** la de Vercel. Si es otra, los documentos migrados no se pueden
> abrir. Guárdela también fuera del servidor (sobre sellado del notario).

## 2. Preparar Windows

1. **Energía**: Configuración → Sistema → Inicio/apagado y suspensión → **Nunca** en suspensión y en apagar pantalla.
2. **Actualizaciones**: Windows Update → Opciones avanzadas → **Horas activas** de 6:00 a. m. a 11:00 p. m. Reinicie a mano los domingos cuando haya actualizaciones.
3. Cree las carpetas `C:\Notaria` y `D:\Notaria`. Si no hay disco D:, use `C:\Notaria` y cambie las rutas de los scripts y del `.env`.
4. Instale:
   - **Git para Windows**: <https://git-scm.com/download/win> (opciones por defecto). Con él el servidor baja la aplicación y sus actualizaciones de GitHub.
   - **Node.js 24 LTS**: <https://nodejs.org> (instalador .msi, con las opciones por defecto).
   - **PostgreSQL 17**: <https://www.postgresql.org/download/windows/> (instalador de EDB). Anote la contraseña del usuario `postgres`. Después agregue `C:\Program Files\PostgreSQL\17\bin` al **PATH** del sistema.
   - **7-Zip**: <https://www.7-zip.org>.
   - **NSSM**: <https://nssm.cc/download>. Copie `win64\nssm.exe` a `C:\Notaria\nssm\nssm.exe`.
   - **cloudflared**: `winget install --id Cloudflare.cloudflared`.
   - **Google Drive para escritorio**: <https://www.google.com/drive/download/>. Inicie sesión con la cuenta de las copias y anote la letra de la unidad (normalmente `G:\Mi unidad`).

## 3. Crear la base de datos local

En PowerShell (cambie `CONTRASENA_BD` por una contraseña de solo letras y números, de 20 caracteres o más):

```powershell
psql -U postgres -c "CREATE ROLE notaria LOGIN PASSWORD 'CONTRASENA_BD';"
psql -U postgres -c "CREATE DATABASE escrituracion OWNER notaria ENCODING 'UTF8';"
```

PostgreSQL ya viene escuchando solo en el propio equipo: no abra el puerto 5432 en el firewall.

## 4. Instalar la aplicación

1. Baje la aplicación de GitHub, rama `servidor-local`:
   ```powershell
   git clone --branch servidor-local https://github.com/asistentenotaria1neiva/asistentenotaria1neiva.git C:\Notaria\app
   cd C:\Notaria\app
   ```
   Si el repositorio es privado, Git pide iniciar sesión en GitHub la primera vez, y Windows guarda el acceso.
2. Copie `.env.servidor.ejemplo` como `.env` y complete los valores (sección 1).
   Para la migración (paso 6), ponga **temporalmente** `SUPABASE_URL` y `SUPABASE_CLAVE_SERVICIO` de Vercel.
3. En PowerShell, dentro de `C:\Notaria\app`:

```powershell
npm ci
npx prisma generate
npm run build
```

## 5. Ensayo (con Vercel funcionando)

Primero se ensaya con una copia de los datos de hoy. Vercel sigue funcionando normal.

```powershell
.\servidor\migrar-base.ps1 -Supabase "postgresql://postgres.REF:CONTRASENA@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
npx tsx --tsconfig tsconfig.scripts.json --env-file=.env scripts/bajar-de-supabase.ts --confirmar
npm run servidor
```

`bajar-de-supabase.ts` debe terminar con **«Están todos»**. Abra <http://127.0.0.1:3000> en el navegador del
servidor e ingrese con el usuario administrador. Abra una escritura, vea un documento y descargue un Word.
Ciérrelo con Ctrl+C.

## 6. Dominio y Cloudflare Tunnel

1. Compre el dominio. Para un `.com`, Cloudflare Registrar lo vende a precio de costo. Para un `.com.co`,
   cómprelo en un registrador colombiano y cambie sus *nameservers* a los que indique Cloudflare.
2. En Cloudflare, agregue el dominio (plan **Free**).
3. En el servidor:

```powershell
cloudflared tunnel login
cloudflared tunnel create notaria
cloudflared tunnel route dns notaria escrituras.SU-DOMINIO.com.co
```

4. Copie `servidor\cloudflared-config.yml` a `C:\Users\<usuario>\.cloudflared\config.yml` y ponga el ID del
   túnel (lo mostró `tunnel create`) y el dominio.
5. Instálelo como servicio: `cloudflared service install` (PowerShell como administrador).
6. En `.env`, ponga `URL_APLICACION=https://escrituras.SU-DOMINIO.com.co`.

## 7. Día de la migración

Elija un momento sin trabajo (por ejemplo, un sábado), avise a todos y pida que nadie use la aplicación.

1. Vuelva a migrar, para traer lo último:
   ```powershell
   .\servidor\migrar-base.ps1 -Supabase "postgresql://...:5432/postgres"
   npx tsx --tsconfig tsconfig.scripts.json --env-file=.env scripts/bajar-de-supabase.ts --confirmar
   ```
2. En `.env`, **deje vacías** `SUPABASE_URL` y `SUPABASE_CLAVE_SERVICIO`.
3. Instale el servicio (PowerShell como administrador): `.\servidor\instalar-servicio.ps1`
4. Entre a `https://escrituras.SU-DOMINIO.com.co` y pruebe: ingreso, una escritura, un documento, generar una versión.
5. En **Configuración** del panel, confirme la IP pública de la oficina.

**Cada equipo debe registrarse de nuevo.** El registro del equipo vale para cada dirección por separado:
en la dirección nueva, cada usuario entra, pulsa «Registrar este equipo» y el administrador lo aprueba.
También hay que volver a activar los avisos de Windows («Avisarme en este equipo»). Las cuentas, las
contraseñas y el doble factor no cambian.

## 8. Copias de seguridad

1. Cree `C:\Notaria\clave-copias.txt` con una contraseña larga (una sola línea, 20 caracteres o más) y guárdela también en papel en el sobre del notario.
2. Pruebe la copia y prográmela:
   ```powershell
   .\servidor\copia-seguridad.ps1
   .\servidor\programar-copias.ps1
   ```
3. Revise `D:\Notaria\registros\copias.log`: cada noche debe aparecer una línea `OK`.
4. **Una vez al mes**, pruebe que una copia se puede restaurar en otro equipo (sección 10).

En Drive quedan dos cosas:
- `base\` guarda la base de datos cifrada con 7-Zip; se conservan las últimas 30.
- `archivos\` es un espejo de los documentos, ya cifrados por la aplicación.

## 9. Apagar Vercel y Supabase

Después de una o dos semanas funcionando bien en el servidor:
- En Vercel, pause o borre el proyecto.
- En Supabase, descargue una última copia y pause el proyecto.

No los borre antes de confirmar que las copias del servidor funcionan.

## 10. Restaurar una copia (si el servidor se daña)

1. Instale un equipo nuevo con los pasos 2 a 4. En el `.env` va **la misma** `CLAVE_MAESTRA`.
2. Copie `archivos\` de Drive a `D:\Notaria\almacenamiento`.
3. Descomprima la última `base\*.7z` con la contraseña de las copias y restaure:
   ```powershell
   pg_restore --dbname="postgresql://notaria:CONTRASENA_BD@127.0.0.1:5432/escrituracion" --clean --if-exists --no-owner escrituracion-AAAAMMDD-HHMM.dump
   ```
4. Instale el servicio y el túnel (pasos 6 y 7).

## Mantenimiento

| Tarea | Cuándo |
|---|---|
| Revisar `copias.log` | Cada semana |
| Probar una restauración | Cada mes |
| Revisar espacio en disco | Cada mes |
| Actualizaciones de Windows y reinicio | Domingos |
| Ver errores de la app | `D:\Notaria\registros\app-errores.log` |
| Reiniciar la app | `Restart-Service NotariaEscrituracion` |

### Actualizar la aplicación

Los cambios se suben a GitHub en la rama **`servidor-local`**. Vercel no la despliega (`vercel.json`), así
que no afecta la versión de Vercel. Para pasarlos al servidor, fuera del horario de trabajo:

```powershell
cd C:\Notaria\app
.\servidor\actualizar.ps1      # PowerShell como administrador
```

El script hace todo esto:
- Baja los cambios, instala dependencias, compila, aplica las migraciones y reinicia la app.
- La app queda detenida unos minutos mientras compila.
- Si algo falla, vuelve sola a la versión anterior y la deja funcionando.
- Registra lo que hizo en `D:\Notaria\registros\actualizaciones.log`.

El `.env` y la carpeta de archivos no se tocan.
