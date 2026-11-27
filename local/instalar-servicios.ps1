<#
  Deja la aplicación corriendo sola en este servidor (ejecutar UNA vez, como Administrador):
    - Servicio de Windows "EscrituracionCaddy": HTTPS en el puerto 443 (local\Caddyfile).
    - Tarea programada "Escrituracion - Aplicacion": inicia la app al arrancar Windows (local\iniciar-app.cmd).
    - Tarea programada "Escrituracion - Respaldo": respaldo diario a las 11:00 p. m. (local\respaldo.ps1).
    - Regla del firewall: puerto 443 solo desde la red local.

  Requiere: caddy.exe en C:\Escrituracion\caddy\caddy.exe, el .env completo y la app compilada (npm run build).
  Uso: .\local\instalar-servicios.ps1 [-DestinoRespaldo 'F:\RespaldosEscrituracion']
#>
param(
  [string]$DestinoRespaldo = 'F:\RespaldosEscrituracion',
  [string]$CarpetaCaddy = 'C:\Escrituracion\caddy'
)
. "$PSScriptRoot\comun.ps1"

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Ejecute PowerShell como Administrador.'
}
if (-not (Test-Path (Join-Path $RaizApp '.env'))) { throw 'Falta el .env en la carpeta de la aplicación.' }
if (-not (Test-Path (Join-Path $RaizApp '.next\BUILD_ID'))) { throw 'La aplicación no está compilada: ejecute npm run build.' }
$caddy = Join-Path $CarpetaCaddy 'caddy.exe'
if (-not (Test-Path $caddy)) { throw "No se encontró $caddy (descárguelo de https://caddyserver.com/download, Windows amd64)." }

New-Item -ItemType Directory -Force (Join-Path $CarpetaCaddy 'datos') | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'Caddyfile') (Join-Path $CarpetaCaddy 'Caddyfile') -Force
Invoke-Externo { & $caddy validate --config (Join-Path $CarpetaCaddy 'Caddyfile') --adapter caddyfile } | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'El Caddyfile no es válido.' }

# --- Caddy como servicio ---
if (Get-Service EscrituracionCaddy -ErrorAction SilentlyContinue) {
  Stop-Service EscrituracionCaddy -Force
  Invoke-Externo { sc.exe delete EscrituracionCaddy } | Out-Null
  Start-Sleep -Seconds 2
}
$binCaddy = "`"$caddy`" run --config `"$(Join-Path $CarpetaCaddy 'Caddyfile')`" --adapter caddyfile"
New-Service -Name EscrituracionCaddy -DisplayName 'Escrituracion - HTTPS (Caddy)' -BinaryPathName $binCaddy -StartupType Automatic | Out-Null
Invoke-Externo { sc.exe failure EscrituracionCaddy reset= 86400 actions= restart/5000/restart/5000/restart/30000 } | Out-Null
# Al arrancar Windows, Caddy a veces no responde en los 30 s que da el sistema: inicio retrasado, y
# reintentar también cuando falla al iniciar (no solo cuando se cae)
Invoke-Externo { sc.exe config EscrituracionCaddy start= delayed-auto } | Out-Null
Invoke-Externo { sc.exe failureflag EscrituracionCaddy 1 } | Out-Null
Start-Service EscrituracionCaddy
Write-Host 'Servicio EscrituracionCaddy iniciado.'

# --- Aplicación al arrancar Windows ---
$accionApp = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$(Join-Path $PSScriptRoot 'iniciar-app.cmd')`"" -WorkingDirectory $RaizApp
$ajustes = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -StartWhenAvailable
$sistema = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName 'Escrituracion - Aplicacion' -Action $accionApp -Trigger (New-ScheduledTaskTrigger -AtStartup) -Settings $ajustes -Principal $sistema -Force | Out-Null
Start-ScheduledTask -TaskName 'Escrituracion - Aplicacion'
Write-Host 'Tarea "Escrituracion - Aplicacion" registrada e iniciada.'

# --- Respaldo diario ---
$accionRespaldo = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $PSScriptRoot 'respaldo.ps1')`" -Destino `"$DestinoRespaldo`""
$ajustesRespaldo = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 4) -StartWhenAvailable
Register-ScheduledTask -TaskName 'Escrituracion - Respaldo' -Action $accionRespaldo -Trigger (New-ScheduledTaskTrigger -Daily -At '23:00') -Settings $ajustesRespaldo -Principal $sistema -Force | Out-Null
Write-Host "Tarea 'Escrituracion - Respaldo' registrada (diaria, 11:00 p. m., destino $DestinoRespaldo)."

# --- Firewall ---
if (-not (Get-NetFirewallRule -DisplayName 'Escrituracion HTTPS' -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName 'Escrituracion HTTPS' -Direction Inbound -Protocol TCP -LocalPort 443 -RemoteAddress LocalSubnet -Action Allow | Out-Null
}
Write-Host 'Firewall: puerto 443 abierto solo para la red local.'

Write-Host ''
Write-Host 'Listo. Exporte el certificado raíz para los equipos de la oficina con:' -ForegroundColor Green
Write-Host "  Copy-Item '$CarpetaCaddy\datos\pki\authorities\local\root.crt' 'C:\Escrituracion\certificado-raiz-escrituracion.crt'"
