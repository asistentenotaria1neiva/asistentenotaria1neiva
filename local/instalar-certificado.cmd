@echo off
rem Prepara este equipo para usar la aplicacion de escrituracion (servidor SERVIDOR, 192.168.2.200):
rem   1. instala el certificado raiz del servidor (sin advertencia "La conexion no es privada");
rem   2. crea en el escritorio el acceso directo "Escrituracion Notaria" (https://servidor).
rem El nombre "servidor" ya lo resuelve cada equipo por la red (es el de las carpetas compartidas):
rem no se toca el archivo hosts, que el antivirus (Kaspersky) protege contra scripts.
rem Se ejecuta UNA vez por equipo: doble clic y aceptar el permiso de administrador.
rem El archivo certificado-raiz-escrituracion.crt debe estar en la misma carpeta que este.

net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

set "CERT=%~dp0certificado-raiz-escrituracion.crt"
set "DIRECCION=https://servidor/"
if not exist "%CERT%" (
  echo No se encontro %CERT%
  pause
  exit /b 1
)

rem 1. Certificado
certutil -addstore -f Root "%CERT%" >nul
if %errorlevel% neq 0 (
  echo No se pudo instalar el certificado.
  pause
  exit /b 1
)
rem Firefox: que use los certificados de Windows (Chrome y Edge ya los usan)
reg add "HKLM\SOFTWARE\Policies\Mozilla\Firefox\Certificates" /v ImportEnterpriseRoots /t REG_DWORD /d 1 /f >nul

rem 2. Acceso directo en el escritorio de todos los usuarios del equipo
(
  echo [InternetShortcut]
  echo URL=%DIRECCION%
) > "%PUBLIC%\Desktop\Escrituracion Notaria.url"
if not exist "%PUBLIC%\Desktop\Escrituracion Notaria.url" (
  echo El certificado quedo instalado, pero no se pudo crear el acceso directo.
  echo Abra %DIRECCION% en el navegador.
  pause
  exit /b 1
)

echo.
echo Listo. Cierre el navegador por completo y abra el acceso directo
echo "Escrituracion Notaria" del escritorio (o %DIRECCION% ).
echo.
pause
