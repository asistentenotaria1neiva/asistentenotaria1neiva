@echo off
rem Inicia la aplicacion (solo en 127.0.0.1:3000; desde la red se entra por Caddy en HTTPS).
rem La ejecuta la tarea programada "Escrituracion - Aplicacion" al arrancar Windows. Si el proceso
rem termina, se vuelve a iniciar a los 10 segundos.
cd /d "%~dp0.."
if not exist logs mkdir logs
set NODE_ENV=production
:inicio
echo [%date% %time%] Iniciando >> logs\app.log
node node_modules\next\dist\bin\next start -H 127.0.0.1 -p 3000 >> logs\app.log 2>&1
echo [%date% %time%] La aplicacion se detuvo (codigo %errorlevel%); reinicio en 10 s >> logs\app.log
timeout /t 10 /nobreak > nul
goto inicio
