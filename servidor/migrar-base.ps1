<#
  Copia la base de datos de Supabase al PostgreSQL local del servidor (solo el esquema public: usuarios,
  escrituras, documentos leídos, auditoría, configuración). Se puede repetir: borra la base local y la
  vuelve a crear desde Supabase, así que el ensayo y el día de la migración usan el mismo script.

  Uso (PowerShell como administrador, en la carpeta de la aplicación):
    .\servidor\migrar-base.ps1 -Supabase "postgresql://postgres.REF:CONTRASENA@aws-0-us-east-1.pooler.supabase.com:5432/postgres"

  -Supabase: cadena del *Session pooler* (puerto 5432, NO el 6543). Está en Supabase → Connect.
  La base local sale de DATABASE_URL del .env.
#>
param(
  [Parameter(Mandatory = $true)][string]$Supabase,
  [string]$Carpeta = 'D:\Notaria\migracion'
)
$ErrorActionPreference = 'Stop'

$env_ = Get-Content -Path '.env' -Encoding utf8 | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
if (-not $env_) { throw 'No encontré DATABASE_URL en el .env de esta carpeta.' }
$local = ($env_ -replace '^DATABASE_URL=', '').Trim('"')
if ($local -match 'supabase') { throw 'DATABASE_URL del .env apunta a Supabase: debe ser la base LOCAL (127.0.0.1).' }
foreach ($h in 'pg_dump', 'pg_restore', 'psql') { if (-not (Get-Command $h -ErrorAction SilentlyContinue)) { throw "No encuentro $h. Agregue C:\Program Files\PostgreSQL\17\bin al PATH." } }

New-Item -ItemType Directory -Force -Path $Carpeta | Out-Null
$archivo = Join-Path $Carpeta ("supabase-{0:yyyyMMdd-HHmm}.dump" -f (Get-Date))

Write-Host '1/3 Bajando la base de Supabase…'
& pg_dump --dbname=$Supabase --schema=public --no-owner --no-privileges --format=custom --file=$archivo
if ($LASTEXITCODE -ne 0) { throw 'pg_dump falló (¿cadena del Session pooler, puerto 5432, y contraseña correctas?).' }

Write-Host '2/3 Vaciando la base local…'
& psql --dbname=$local -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'
if ($LASTEXITCODE -ne 0) { throw 'No se pudo vaciar la base local.' }

Write-Host '3/3 Restaurando en la base local…'
& pg_restore --dbname=$local --no-owner --no-privileges --schema=public $archivo
if ($LASTEXITCODE -ne 0) { Write-Warning 'pg_restore terminó con avisos: revise arriba. Los avisos sobre roles de Supabase (anon, authenticated, service_role) no importan.' }

Write-Host ''
& psql --dbname=$local -c 'SELECT (SELECT count(*) FROM usuarios) AS usuarios, (SELECT count(*) FROM expedientes) AS escrituras, (SELECT count(*) FROM documentos) AS documentos, (SELECT count(*) FROM plantillas) AS plantillas, (SELECT count(*) FROM auditoria) AS auditoria;'
Write-Host "Copia guardada en $archivo (contiene datos personales: bórrela cuando termine la migración)."
