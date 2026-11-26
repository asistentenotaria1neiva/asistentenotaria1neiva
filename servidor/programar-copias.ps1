<#
  Programa la copia de seguridad todas las noches a las 11:00 p. m. con el Programador de tareas.
  Corre con el usuario actual (el que tiene abierta la sesión y Google Drive para escritorio): el servidor
  debe quedar con esa sesión iniciada (puede estar bloqueado).
  Uso (PowerShell, en la carpeta de la aplicación): .\servidor\programar-copias.ps1
#>
param([string]$Hora = '23:00')
$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'copia-seguridad.ps1'
$accion = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`"" -WorkingDirectory (Split-Path -Parent $PSScriptRoot)
$cuando = New-ScheduledTaskTrigger -Daily -At $Hora
$quien = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive
$ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 3) -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName 'Notaria - Copia de seguridad' -Action $accion -Trigger $cuando -Principal $quien -Settings $ajustes -Force | Out-Null
Write-Host "Copia programada todos los días a las $Hora. Pruébela ya con: Start-ScheduledTask -TaskName 'Notaria - Copia de seguridad'"
