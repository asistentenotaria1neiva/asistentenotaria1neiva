<#
  Programa la copia de seguridad todas las noches a las 11:00 p. m. con el Programador de tareas.
  Corre como SYSTEM: no hace falta dejar una sesión abierta en el servidor.
  Uso (PowerShell como administrador, en la carpeta de la aplicación): .\servidor\programar-copias.ps1
#>
param([string]$Hora = '23:00')
$ErrorActionPreference = 'Stop'
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Abra PowerShell como administrador.' }
$script = Join-Path $PSScriptRoot 'copia-seguridad.ps1'
$accion = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`"" -WorkingDirectory (Split-Path -Parent $PSScriptRoot)
$cuando = New-ScheduledTaskTrigger -Daily -At $Hora
$quien = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 3) -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName 'Notaria - Copia de seguridad' -Action $accion -Trigger $cuando -Principal $quien -Settings $ajustes -Force | Out-Null
Write-Host "Copia programada todos los días a las $Hora. Pruébela ya con: Start-ScheduledTask -TaskName 'Notaria - Copia de seguridad'"
Write-Host 'y revise D:\Notaria\registros\copias.log'
