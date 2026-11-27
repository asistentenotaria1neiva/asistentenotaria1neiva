<#
  Trae la base de datos de Supabase al PostgreSQL local (una sola vez, al pasar a la instalación local).

  1. Crea el usuario y la base locales que indica DATABASE_URL del .env (si no existen).
  2. Copia el esquema "public" de Supabase (tablas, datos, auditoría, historial de migraciones de Prisma).
  3. Verifica con Prisma que las migraciones estén al día.

  Después baje los archivos: npm run supabase:bajar -- --confirmar

  Uso (PowerShell, en la carpeta de la aplicación):
    .\local\migrar-desde-supabase.ps1 -UrlSupabase "postgresql://postgres.xxxx:CLAVE@aws-0-us-east-1.pooler.supabase.com:5432/postgres"

  La URL de Supabase debe ser la "Session pooler" o "Direct" (puerto 5432), NO la de Vercel (6543).
  Pida la clave del superusuario "postgres" local (la que se definió al instalar PostgreSQL).
#>
param(
  [Parameter(Mandatory = $true)][string]$UrlSupabase,
  [string]$CarpetaVolcado = 'C:\Escrituracion\respaldos',
  # Archivo con la clave del superusuario postgres local (si no se da, se pregunta)
  [string]$ArchivoClaveSuperusuario
)
. "$PSScriptRoot\comun.ps1"

$bin = Get-BinPostgres
$envApp = Read-EnvArchivo (Join-Path $RaizApp '.env')
if (-not $envApp['DATABASE_URL']) { throw 'Falta DATABASE_URL en el .env (copie local\env.local.ejemplo como .env).' }
$local = Split-UrlPostgres $envApp['DATABASE_URL']
if ($local.Host -notin @('127.0.0.1', 'localhost')) { throw "DATABASE_URL apunta a $($local.Host): debe ser el PostgreSQL local." }
if ($local.Usuario -notmatch '^[a-z_][a-z0-9_]*$' -or $local.Base -notmatch '^[a-z_][a-z0-9_]*$') { throw 'Use solo minúsculas, números y _ en el usuario y la base de DATABASE_URL.' }

# --- 1. Usuario y base locales ---
if ($ArchivoClaveSuperusuario) {
  $env:PGPASSWORD = (Get-Content -LiteralPath $ArchivoClaveSuperusuario -TotalCount 1).Trim()
} else {
  $claveSuper = Read-Host -AsSecureString 'Clave del superusuario postgres local'
  $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($claveSuper))
}
$psql = Join-Path $bin 'psql.exe'
$comun = @('-h', $local.Host, '-p', $local.Puerto, '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tAq')

$existeRol = & $psql @comun -d postgres -c "SELECT 1 FROM pg_roles WHERE rolname = '$($local.Usuario)'"
$claveSql = $local.Clave.Replace("'", "''")
if (-not $existeRol) {
  & $psql @comun -d postgres -c "CREATE ROLE $($local.Usuario) LOGIN PASSWORD '$claveSql'"
  Write-Host "Usuario $($local.Usuario) creado."
}
$existeBase = & $psql @comun -d postgres -c "SELECT 1 FROM pg_database WHERE datname = '$($local.Base)'"
if ($existeBase) {
  $tablas = & $psql @comun -d $local.Base -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'"
  if ([int]$tablas -gt 0) { throw "La base local $($local.Base) ya tiene $tablas tabla(s). Para repetir la migración, bórrela primero (DROP DATABASE $($local.Base))." }
} else {
  & $psql @comun -d postgres -c "CREATE DATABASE $($local.Base) OWNER $($local.Usuario) ENCODING 'UTF8' TEMPLATE template0"
  Write-Host "Base $($local.Base) creada."
}
& $psql @comun -d $local.Base -c "ALTER SCHEMA public OWNER TO $($local.Usuario)"

# --- 2. Volcado de Supabase y restauración ---
New-Item -ItemType Directory -Force $CarpetaVolcado | Out-Null
$volcado = Join-Path $CarpetaVolcado ("supabase-{0:yyyyMMdd-HHmm}.dump" -f (Get-Date))
Remove-Item Env:PGPASSWORD
Write-Host "Copiando la base de Supabase a $volcado ..."
$ErrorActionPreference = 'Continue'
& (Join-Path $bin 'pg_dump.exe') --dbname=$UrlSupabase --schema=public --no-owner --no-privileges --format=custom --file=$volcado 2>&1 | ForEach-Object { "$_" }
$ErrorActionPreference = 'Stop'
if ($LASTEXITCODE -ne 0) { throw 'pg_dump falló. Revise la URL de Supabase (puerto 5432) y que la versión de PostgreSQL local sea igual o mayor que la de Supabase.' }

Write-Host 'Restaurando en la base local ...'
$env:PGPASSWORD = $local.Clave
# El esquema public ya existe en la base nueva: se omite su creación (y su comentario) del volcado
$lista = "$volcado.lista"
& (Join-Path $bin 'pg_restore.exe') -l $volcado | Where-Object { $_ -notmatch ' SCHEMA - public ' -and $_ -notmatch ' COMMENT - SCHEMA public ' } | Set-Content -LiteralPath $lista -Encoding ASCII
# pg_restore escribe sus avisos en stderr: no deben cortar el script (PowerShell 5.1 los trata como errores)
$ErrorActionPreference = 'Continue'
& (Join-Path $bin 'pg_restore.exe') -h $local.Host -p $local.Puerto -U $local.Usuario -d $local.Base --no-owner --no-privileges --exit-on-error --single-transaction -L $lista $volcado 2>&1 | ForEach-Object { "$_" }
$codigo = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
Remove-Item Env:PGPASSWORD
Remove-Item -LiteralPath $lista
if ($codigo -ne 0) { throw 'pg_restore falló (la transacción se revirtió: la base local quedó vacía). Revise el error de arriba.' }

# --- 3. Verificación ---
Push-Location $RaizApp
$ErrorActionPreference = 'Continue'
try {
  npx prisma migrate status 2>&1 | ForEach-Object { "$_" }
  if ($LASTEXITCODE -ne 0) { Write-Warning 'Prisma ve migraciones pendientes: ejecute npx prisma migrate deploy.' }
} finally { Pop-Location }

Write-Host ''
Write-Host 'Base copiada. Siguiente paso: npm run supabase:bajar -- --confirmar (archivos cifrados).' -ForegroundColor Green
