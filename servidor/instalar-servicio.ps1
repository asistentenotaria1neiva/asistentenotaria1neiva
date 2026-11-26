<#
  Deja la aplicación como servicio de Windows: arranca sola con el equipo, se reinicia sola si se cae y
  escucha SOLO en 127.0.0.1:3000 (desde fuera se llega únicamente por Cloudflare Tunnel).

  Requiere NSSM (https://nssm.cc/download): copie nssm.exe (carpeta win64) a C:\Notaria\nssm\nssm.exe.
  Uso (PowerShell como administrador, en la carpeta de la aplicación, después de npm run build):
    .\servidor\instalar-servicio.ps1
#>
param(
  [string]$Nssm = 'C:\Notaria\nssm\nssm.exe',
  [string]$Servicio = 'NotariaEscrituracion',
  [string]$Registros = 'D:\Notaria\registros'
)
$ErrorActionPreference = 'Stop'
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Abra PowerShell como administrador.' }
if (-not (Test-Path $Nssm)) { throw "No encuentro NSSM en $Nssm." }
if (-not (Test-Path '.env')) { throw 'Falta el .env en esta carpeta (cópielo de .env.servidor.ejemplo).' }
if (-not (Test-Path '.next')) { throw 'Falta compilar: ejecute npm ci, npx prisma generate y npm run build.' }

$app = (Get-Location).Path
$node = (Get-Command node).Source
$next = Join-Path $app 'node_modules\next\dist\bin\next'
New-Item -ItemType Directory -Force -Path $Registros | Out-Null

if (Get-Service $Servicio -ErrorAction SilentlyContinue) { & $Nssm stop $Servicio | Out-Null; & $Nssm remove $Servicio confirm | Out-Null }
& $Nssm install $Servicio $node "`"$next`" start -H 127.0.0.1 -p 3000"
& $Nssm set $Servicio AppDirectory $app
& $Nssm set $Servicio AppEnvironmentExtra 'NODE_ENV=production'
& $Nssm set $Servicio DisplayName 'Notaría - Escrituración'
& $Nssm set $Servicio Description 'Aplicación de escrituración (Next.js) en 127.0.0.1:3000'
& $Nssm set $Servicio Start SERVICE_AUTO_START
& $Nssm set $Servicio AppExit Default Restart
& $Nssm set $Servicio AppRestartDelay 5000
& $Nssm set $Servicio AppStdout (Join-Path $Registros 'app.log')
& $Nssm set $Servicio AppStderr (Join-Path $Registros 'app-errores.log')
& $Nssm set $Servicio AppRotateFiles 1
& $Nssm set $Servicio AppRotateBytes 10485760
& $Nssm start $Servicio

Start-Sleep -Seconds 8
try {
  $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/ingreso' -UseBasicParsing -TimeoutSec 20
  Write-Host "Servicio $Servicio en marcha (respuesta $($r.StatusCode))."
} catch {
  Write-Warning "El servicio no respondió todavía. Revise $Registros\app-errores.log"
}
