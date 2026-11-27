<#
  Respaldo diario de la instalación local (antes lo hacía Supabase):
    - base de datos completa (pg_dump, formato custom) -> <Destino>\base\escrituracion-AAAAMMDD-HHMM.dump
    - archivos cifrados (RUTA_ALMACENAMIENTO)          -> <Destino>\almacenamiento (copia acumulativa)
  Conserva los últimos -Dias volcados de la base. Los archivos ya van cifrados con CLAVE_MAESTRA:
  sin esa clave el respaldo no sirve, así que guárdela también fuera del servidor.

  Lo ejecuta la tarea programada "Escrituracion - Respaldo". A mano:
    .\local\respaldo.ps1 -Destino 'F:\RespaldosEscrituracion'
  Restaurar la base: pg_restore -h 127.0.0.1 -U escrituracion -d escrituracion --clean --if-exists <archivo.dump>
#>
param(
  [string]$Destino = 'F:\RespaldosEscrituracion',
  [int]$Dias = 30
)
. "$PSScriptRoot\comun.ps1"

$envApp = Read-EnvArchivo (Join-Path $RaizApp '.env')
$bd = Split-UrlPostgres $envApp['DATABASE_URL']
$almacenamiento = if ($envApp['RUTA_ALMACENAMIENTO']) { $envApp['RUTA_ALMACENAMIENTO'] } else { Join-Path $RaizApp 'almacenamiento' }

$carpetaBase = Join-Path $Destino 'base'
New-Item -ItemType Directory -Force $carpetaBase | Out-Null
$registro = Join-Path $Destino 'respaldo.log'
function Write-Registro([string]$texto) { "[{0:yyyy-MM-dd HH:mm}] $texto" -f (Get-Date) | Add-Content -LiteralPath $registro -Encoding UTF8; Write-Host $texto }

try {
  $archivo = Join-Path $carpetaBase ("escrituracion-{0:yyyyMMdd-HHmm}.dump" -f (Get-Date))
  $env:PGPASSWORD = $bd.Clave
  $pgDump = Join-Path (Get-BinPostgres) 'pg_dump.exe'
  Invoke-Externo { & $pgDump -h $bd.Host -p $bd.Puerto -U $bd.Usuario -d $bd.Base --format=custom --file=$archivo }
  if ($LASTEXITCODE -ne 0) { throw "pg_dump terminó con código $LASTEXITCODE" }
  Write-Registro ("Base: {0} ({1:N1} MB)" -f $archivo, ((Get-Item $archivo).Length / 1MB))

  # /E copia subcarpetas; sin /MIR, para que un borrado en el servidor no borre también el respaldo
  Invoke-Externo { robocopy $almacenamiento (Join-Path $Destino 'almacenamiento') /E /XO /R:2 /W:5 /NFL /NDL /NP /NJH } | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy terminó con código $LASTEXITCODE" }
  Write-Registro "Archivos copiados desde $almacenamiento"

  Get-ChildItem $carpetaBase -Filter 'escrituracion-*.dump' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$Dias) } | Remove-Item -Force
} catch {
  Write-Registro "ERROR: $($_.Exception.Message)"
  exit 1
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
