<#
  Publica una versión nueva de la aplicación en el servidor local (lo que antes hacía Vercel al subir a git).
  Ejecutar como Administrador en la carpeta de la aplicación:  .\local\actualizar.ps1
  Hace: git pull, npm ci, migraciones de la base, compilación y reinicio. Respalda la base antes de migrar.
#>
param([string]$DestinoRespaldo = 'F:\RespaldosEscrituracion')
. "$PSScriptRoot\comun.ps1"
Push-Location $RaizApp
try {
  Invoke-Externo { git pull --ff-only }
  if ($LASTEXITCODE -ne 0) { throw 'git pull falló (¿hay cambios locales sin subir?).' }
  Invoke-Externo { npm ci }
  if ($LASTEXITCODE -ne 0) { throw 'npm ci falló.' }
  & "$PSScriptRoot\respaldo.ps1" -Destino $DestinoRespaldo
  Invoke-Externo { npx prisma migrate deploy }
  if ($LASTEXITCODE -ne 0) { throw 'Las migraciones fallaron: la aplicación anterior sigue corriendo.' }

  # Se compila con la app detenida: next build reemplaza la carpeta .next que usa el proceso en marcha
  Stop-ScheduledTask -TaskName 'Escrituracion - Aplicacion' -ErrorAction SilentlyContinue
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -like '*next*start*-H 127.0.0.1*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Invoke-Externo { npx prisma generate }
  Invoke-Externo { npm run build }
  if ($LASTEXITCODE -ne 0) { throw 'La compilación falló: corrija y vuelva a ejecutar (la app quedó detenida).' }
  Start-ScheduledTask -TaskName 'Escrituracion - Aplicacion'
  Write-Host 'Versión nueva publicada.' -ForegroundColor Green
} finally { Pop-Location }
