<#
  Copia de seguridad diaria a Google Drive con rclone (funciona en Windows Server, sin sesión abierta):
    1. la base de datos completa, comprimida y CIFRADA con 7-Zip (AES-256, también los nombres);
       se conservan las últimas 30, en el servidor y en Drive;
    2. la carpeta de archivos (ya cifrados por la aplicación con CLAVE_MAESTRA), en espejo. Lo que se
       borre en el servidor NO se pierde en Drive: pasa a «archivos-borrados\<fecha>» (protege contra
       borrados por error o un virus que dañe archivos).
  Deja un registro en D:\Notaria\registros\copias.log.

  La contraseña de las copias va en -ClaveArchivo (una sola línea). Guárdela TAMBIÉN fuera del servidor
  (sobre sellado del notario): sin ella las copias de la base no se pueden abrir.
  Para restaurar hacen falta las copias, esa contraseña y la CLAVE_MAESTRA del .env.

  Uso: .\servidor\copia-seguridad.ps1   (lo programa servidor\programar-copias.ps1 cada noche)
#>
param(
  [string]$Remoto = 'gdrive:Respaldo Notaria',
  [string]$Rclone = 'C:\Notaria\rclone\rclone.exe',
  [string]$RcloneConfig = 'C:\Notaria\rclone\rclone.conf',
  [string]$Local = 'D:\Notaria\copias',
  [string]$Almacenamiento = 'D:\Notaria\almacenamiento',
  [string]$ClaveArchivo = 'C:\Notaria\clave-copias.txt',
  [string]$SieteZip = 'C:\Program Files\7-Zip\7z.exe',
  [int]$Conservar = 30,
  [string]$Registro = 'D:\Notaria\registros\copias.log'
)
$ErrorActionPreference = 'Stop'
$app = Split-Path -Parent $PSScriptRoot
function Escribir-Registro([string]$m) { "{0:yyyy-MM-dd HH:mm:ss} $m" -f (Get-Date) | Out-File -FilePath $Registro -Append -Encoding utf8 }
New-Item -ItemType Directory -Force -Path (Split-Path $Registro), (Join-Path $Local 'base') | Out-Null

try {
  foreach ($x in @($ClaveArchivo, $SieteZip, $Rclone, $RcloneConfig)) { if (-not (Test-Path $x)) { throw "Falta $x (vea la sección 8 de docs\servidor_local.md)" } }
  $clave = (Get-Content -Path $ClaveArchivo -Encoding utf8 -TotalCount 1).Trim()
  if ($clave.Length -lt 12) { throw 'La contraseña de las copias debe tener al menos 12 caracteres.' }
  $linea = Get-Content -Path (Join-Path $app '.env') -Encoding utf8 | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
  $base = ($linea -replace '^DATABASE_URL=', '').Trim('"')
  $fecha = '{0:yyyyMMdd-HHmm}' -f (Get-Date)

  # 1. Base de datos → .dump temporal → .7z cifrado
  $tmp = Join-Path $env:TEMP "escrituracion-$fecha.dump"
  & pg_dump --dbname=$base --format=custom --file=$tmp
  if ($LASTEXITCODE -ne 0) { throw 'pg_dump falló' }
  $zip = Join-Path (Join-Path $Local 'base') "escrituracion-$fecha.7z"
  & $SieteZip a -t7z -mhe=on -mx=5 "-p$clave" $zip $tmp | Out-Null
  if ($LASTEXITCODE -ne 0) { throw '7-Zip falló' }
  Remove-Item $tmp -Force
  Get-ChildItem (Join-Path $Local 'base') -Filter *.7z | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Conservar | Remove-Item -Force

  # 2. A Google Drive: las copias de la base (espejo de las 30 locales) y los archivos cifrados
  & $Rclone --config $RcloneConfig sync (Join-Path $Local 'base') "$Remoto/base" --retries 3
  if ($LASTEXITCODE -ne 0) { throw "rclone (base) falló (código $LASTEXITCODE)" }
  & $Rclone --config $RcloneConfig sync $Almacenamiento "$Remoto/archivos" --backup-dir "$Remoto/archivos-borrados/$fecha" --transfers 4 --retries 3
  if ($LASTEXITCODE -ne 0) { throw "rclone (archivos) falló (código $LASTEXITCODE)" }

  $tam = [math]::Round((Get-Item $zip).Length / 1MB, 1)
  Escribir-Registro "OK base $tam MB ($zip) y archivos subidos a $Remoto."
} catch {
  Escribir-Registro "ERROR $($_.Exception.Message)"
  throw
}
