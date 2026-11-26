<#
  Actualiza el servidor con lo último de la rama «servidor-local» de GitHub: baja los cambios, instala
  dependencias, aplica las migraciones de la base, compila y reinicia el servicio. La app queda detenida
  unos minutos mientras compila (hágalo fuera del horario de trabajo). Si algo falla, vuelve sola a la
  versión anterior y la deja funcionando.

  Uso (PowerShell como administrador, en C:\Notaria\app): .\servidor\actualizar.ps1
#>
param(
  [string]$Rama = 'servidor-local',
  [string]$Servicio = 'NotariaEscrituracion',
  [string]$Registro = 'D:\Notaria\registros\actualizaciones.log'
)
$ErrorActionPreference = 'Stop'
$app = Split-Path -Parent $PSScriptRoot
Set-Location $app
function Escribir-Registro([string]$m) { New-Item -ItemType Directory -Force -Path (Split-Path $Registro) | Out-Null; "{0:yyyy-MM-dd HH:mm:ss} $m" -f (Get-Date) | Out-File -FilePath $Registro -Append -Encoding utf8; Write-Host $m }
function Ejecutar([string]$que, [scriptblock]$paso) { Write-Host "→ $que"; & $paso; if ($LASTEXITCODE -ne 0) { throw "Falló: $que (código $LASTEXITCODE)" } }

try {
  if (git status --porcelain --untracked-files=no) { throw 'Hay archivos de la aplicación modificados a mano en el servidor. Revíselos (git status) antes de actualizar.' }
  $antes = git rev-parse --short HEAD
  Ejecutar 'Bajando cambios de GitHub' { git fetch origin $Rama }
  Ejecutar "Pasando a la rama $Rama" { git checkout $Rama }
  Ejecutar 'Aplicando cambios' { git merge --ff-only "origin/$Rama" }
  $despues = git rev-parse --short HEAD
  if ($antes -eq $despues) { Escribir-Registro "Sin cambios ($despues)."; return }

  $compilar = {
    Ejecutar 'Instalando dependencias' { npm ci }
    Ejecutar 'Preparando Prisma' { npx prisma generate }
    Ejecutar 'Compilando' { npm run build }
  }
  # npm ci y la compilación reemplazan node_modules y .next: con la app detenida
  Stop-Service $Servicio
  try {
    & $compilar
    Ejecutar 'Migraciones de la base' { npx prisma migrate deploy }
  } catch {
    Escribir-Registro "ERROR al actualizar a ${despues}: $($_.Exception.Message). Volviendo a $antes…"
    git checkout --detach $antes | Out-Null
    & $compilar
    Start-Service $Servicio
    Escribir-Registro "Quedó funcionando la versión anterior ($antes). Revise el error antes de volver a intentar."
    throw
  }
  Start-Service $Servicio
  Start-Sleep -Seconds 8
  $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/ingreso' -UseBasicParsing -TimeoutSec 30
  Escribir-Registro "OK $antes → $despues (respuesta $($r.StatusCode))."
} catch {
  Escribir-Registro "ERROR $($_.Exception.Message)"
  throw
}
