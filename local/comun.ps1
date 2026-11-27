# Funciones compartidas por los scripts de local/. Se carga con: . "$PSScriptRoot\comun.ps1"
$ErrorActionPreference = 'Stop'

$Script:RaizApp = Split-Path -Parent $PSScriptRoot

# Ejecuta un programa externo (git, npm, pg_dump, caddy...). Windows PowerShell 5.1 convierte lo que el
# programa escribe en stderr (avisos, progreso) en errores que, con 'Stop', cortan el script. El éxito se
# juzga por $LASTEXITCODE, que queda disponible después de la llamada.
function Invoke-Externo([scriptblock]$bloque) {
  $anterior = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $bloque 2>&1 | ForEach-Object { "$_" } } finally { $ErrorActionPreference = $anterior }
}

function Get-BinPostgres {
  $base = 'C:\Program Files\PostgreSQL'
  if (-not (Test-Path $base)) { throw "No se encontró PostgreSQL en $base. Instálelo primero (docs/instalacion_local.md, paso 1)." }
  $version = Get-ChildItem $base -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'bin\pg_dump.exe') } |
    Sort-Object { [int]($_.Name -replace '\D.*$', '') } -Descending | Select-Object -First 1
  if (-not $version) { throw "No se encontró pg_dump.exe dentro de $base." }
  return Join-Path $version.FullName 'bin'
}

# Lee el .env de la aplicación como tabla clave -> valor (sin comentarios ni comillas)
function Read-EnvArchivo([string]$ruta) {
  $tabla = @{}
  if (-not (Test-Path $ruta)) { return $tabla }
  foreach ($linea in Get-Content -LiteralPath $ruta -Encoding UTF8) {
    if ($linea -match '^\s*#' -or $linea -notmatch '=') { continue }
    $i = $linea.IndexOf('=')
    $clave = $linea.Substring(0, $i).Trim()
    $valor = $linea.Substring($i + 1).Trim().Trim('"').Trim("'")
    $tabla[$clave] = $valor
  }
  return $tabla
}

# postgresql://usuario:clave@host:puerto/base?... -> partes (la clave decodificada)
function Split-UrlPostgres([string]$url) {
  if ($url -notmatch '^postgres(?:ql)?://([^:@/]+)(?::([^@/]*))?@([^:/?]+)(?::(\d+))?/([^?]+)') { throw "DATABASE_URL no tiene el formato postgresql://usuario:clave@host:puerto/base" }
  return @{
    Usuario = [uri]::UnescapeDataString($Matches[1])
    Clave   = [uri]::UnescapeDataString($Matches[2])
    Host    = $Matches[3]
    Puerto  = if ($Matches[4]) { $Matches[4] } else { '5432' }
    Base    = $Matches[5]
  }
}
