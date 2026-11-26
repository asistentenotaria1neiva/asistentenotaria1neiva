<#
  Prepara Windows Server 2019 para la aplicación y revisa que estén instalados los programas necesarios.
  Se puede ejecutar varias veces: la primera ajusta Windows; las siguientes sirven para ver qué falta.

  Uso (PowerShell como administrador): .\servidor\preparar-servidor.ps1
  (Si Windows no deja ejecutar scripts: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned)
#>
$ErrorActionPreference = 'Stop'
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Abra PowerShell como administrador.' }

Write-Host '== Ajustes de Windows =='
# Rutas largas (node_modules tiene rutas de más de 260 caracteres)
Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled -Value 1 -Type DWord
Write-Host '  Rutas largas: activadas'
# Plan de energía de alto rendimiento y sin suspensión
powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c | Out-Null
powercfg /change standby-timeout-ac 0 | Out-Null
powercfg /change hibernate-timeout-ac 0 | Out-Null
Write-Host '  Energía: alto rendimiento, sin suspensión'
# Actualizaciones: se descargan y avisan, pero NO se instalan ni reinician solas (se instalan a mano los domingos)
$wu = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU'
New-Item -Path $wu -Force | Out-Null
Set-ItemProperty -Path $wu -Name NoAutoUpdate -Value 0 -Type DWord
Set-ItemProperty -Path $wu -Name AUOptions -Value 3 -Type DWord
Set-ItemProperty -Path $wu -Name NoAutoRebootWithLoggedOnUsers -Value 1 -Type DWord
Write-Host '  Windows Update: descarga y avisa; sin reinicios automáticos'
# Hora de Colombia
Set-TimeZone -Id 'SA Pacific Standard Time'
Write-Host "  Zona horaria: $((Get-TimeZone).DisplayName)"
# Carpetas
$disco = if (Test-Path 'D:\') { 'D:' } else { 'C:' }
foreach ($c in 'C:\Notaria', 'C:\Notaria\nssm', 'C:\Notaria\rclone', "$disco\Notaria\almacenamiento", "$disco\Notaria\registros", "$disco\Notaria\copias") { New-Item -ItemType Directory -Force -Path $c | Out-Null }
Write-Host "  Carpetas creadas en C:\Notaria y $disco\Notaria"
if ($disco -eq 'C:') { Write-Warning 'No hay disco D: — cambie D:\Notaria por C:\Notaria en el .env y en los scripts de servidor\.' }

Write-Host ''
Write-Host '== Programas =='
$faltan = 0
function Revisar([string]$nombre, [scriptblock]$prueba, [string]$como) {
  $v = try { & $prueba } catch { $null }
  if ($v) { Write-Host ("  [OK]    {0,-28} {1}" -f $nombre, $v) } else { Write-Host ("  [FALTA] {0,-28} {1}" -f $nombre, $como) -ForegroundColor Yellow; $script:faltan++ }
}
Revisar 'Git' { (git --version) } 'https://git-scm.com/download/win'
Revisar 'Node.js 24' { $v = node --version; if ($v -match '^v(2[4-9]|[3-9]\d)\.') { $v } } 'https://nodejs.org (24 LTS, instalador .msi)'
Revisar 'PostgreSQL 17 (pg_dump)' { $v = pg_dump --version; if ($v -match ' 1[7-9]\.') { $v } } 'https://www.postgresql.org/download/windows/ y agregar C:\Program Files\PostgreSQL\17\bin al PATH'
Revisar 'Servicio de PostgreSQL' { (Get-Service postgresql* | Where-Object Status -eq Running | Select-Object -First 1).Name } 'el instalador de PostgreSQL lo crea; revise services.msc'
Revisar 'Visual C++ 2015-2022 x64' { (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64' -ErrorAction Stop).Version } 'https://aka.ms/vs/17/release/vc_redist.x64.exe'
Revisar '7-Zip' { if (Test-Path 'C:\Program Files\7-Zip\7z.exe') { 'C:\Program Files\7-Zip\7z.exe' } } 'https://www.7-zip.org (versión x64)'
Revisar 'NSSM' { if (Test-Path 'C:\Notaria\nssm\nssm.exe') { 'C:\Notaria\nssm\nssm.exe' } } 'https://nssm.cc/download → copiar win64\nssm.exe a C:\Notaria\nssm\'
Revisar 'rclone' { if (Test-Path 'C:\Notaria\rclone\rclone.exe') { & 'C:\Notaria\rclone\rclone.exe' version | Select-Object -First 1 } } 'https://rclone.org/downloads/ (Windows AMD64) → rclone.exe a C:\Notaria\rclone\'
Revisar 'cloudflared' { (cloudflared --version) } 'https://github.com/cloudflare/cloudflared/releases (cloudflared-windows-amd64.msi)'

Write-Host ''
if ($faltan) { Write-Host "Faltan $faltan programa(s). Instálelos y vuelva a ejecutar este script (cierre y abra PowerShell para que tome el PATH nuevo)." -ForegroundColor Yellow }
else { Write-Host 'Todo listo. Siga con el paso 3 de docs\servidor_local.md.' -ForegroundColor Green }
Write-Host 'Reinicie el servidor una vez para que se apliquen las rutas largas.'
