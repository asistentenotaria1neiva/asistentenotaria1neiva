<#
  Copia de seguridad diaria a Google Drive (carpeta sincronizada por «Google Drive para escritorio»):
    1. la base de datos completa, comprimida y CIFRADA con 7-Zip (AES-256, también los nombres);
    2. la carpeta de archivos (ya cifrados por la aplicación con CLAVE_MAESTRA), en espejo.
  Conserva las últimas 30 copias de la base. Deja un registro en D:\Notaria\registros\copias.log.

  La contraseña de las copias va en el archivo -ClaveArchivo (una sola línea). Guárdela TAMBIÉN fuera del
  servidor (sobre sellado del notario): sin ella las copias de la base no se pueden abrir.
  Para restaurar hacen falta las copias, esa contraseña y la CLAVE_MAESTRA del .env.

  Uso: .\servidor\copia-seguridad.ps1   (lo programa servidor\programar-copias.ps1 cada noche)
#>
param(
  [string]$Destino = 'G:\Mi unidad\Respaldo Notaria',
  [string]$Almacenamiento = 'D:\Notaria\almacenamiento',
  [string]$ClaveArchivo = 'C:\Notaria\clave-copias.txt',
  [string]$SieteZip = 'C:\Program Files\7-Zip\7z.exe',
  [int]$Conservar = 30,
  [string]$Registro = 'D:\Notaria\registros\copias.log'
)
$ErrorActionPreference = 'Stop'
$app = Split-Path -Parent $PSScriptRoot
function Escribir-Registro([string]$m) { "{0:yyyy-MM-dd HH:mm:ss} $m" -f (Get-Date) | Out-File -FilePath $Registro -Append -Encoding utf8 }
New-Item -ItemType Directory -Force -Path (Split-Path $Registro), $Destino, (Join-Path $Destino 'base'), (Join-Path $Destino 'archivos') | Out-Null

try {
  if (-not (Test-Path $ClaveArchivo)) { throw "Falta la contraseña de las copias en $ClaveArchivo" }
  if (-not (Test-Path $SieteZip)) { throw "No encuentro 7-Zip en $SieteZip" }
  $clave = (Get-Content -Path $ClaveArchivo -Encoding utf8 -TotalCount 1).Trim()
  if ($clave.Length -lt 12) { throw 'La contraseña de las copias debe tener al menos 12 caracteres.' }
  $linea = Get-Content -Path (Join-Path $app '.env') -Encoding utf8 | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
  $base = ($linea -replace '^DATABASE_URL=', '').Trim('"')

  # 1. Base de datos → .dump temporal → .7z cifrado en Google Drive
  $tmp = Join-Path $env:TEMP ("escrituracion-{0:yyyyMMdd-HHmm}.dump" -f (Get-Date))
  & pg_dump --dbname=$base --format=custom --file=$tmp
  if ($LASTEXITCODE -ne 0) { throw 'pg_dump falló' }
  $zip = Join-Path (Join-Path $Destino 'base') ((Split-Path $tmp -Leaf) -replace '\.dump$', '.7z')
  & $SieteZip a -t7z -mhe=on -mx=5 "-p$clave" $zip $tmp | Out-Null
  if ($LASTEXITCODE -ne 0) { throw '7-Zip falló' }
  Remove-Item $tmp -Force

  # Solo las últimas $Conservar copias de la base
  Get-ChildItem (Join-Path $Destino 'base') -Filter *.7z | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Conservar | Remove-Item -Force

  # 2. Archivos cifrados: espejo (lo nuevo se copia; lo que la limpieza borró, se borra también)
  robocopy $Almacenamiento (Join-Path $Destino 'archivos') /MIR /R:2 /W:5 /NFL /NDL /NJH /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy falló (código $LASTEXITCODE)" }

  $tam = [math]::Round((Get-Item $zip).Length / 1MB, 1)
  Escribir-Registro "OK base $tam MB → $zip; archivos en espejo."
} catch {
  Escribir-Registro "ERROR $($_.Exception.Message)"
  throw
}
