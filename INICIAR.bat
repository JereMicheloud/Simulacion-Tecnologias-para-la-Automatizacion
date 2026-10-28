@echo off
REM TracePack PLC - menu de la entrega (TPI 2026, Grupo 1, H3)
title TracePack PLC - TPI 2026 Grupo 1
cd /d "%~dp0"

:menu
cls
echo.
echo   ==================================================
echo     TracePack PLC  -  Simulacion TPI 2026 (Grupo 1)
echo   ==================================================
echo.
echo     1. Abrir la simulacion web          (recomendado)
echo     2. Abrir el modelo 3D en Blender
echo     3. Abrir el modelo de FlexSim H3    (camion + AMR)
echo     4. Abrir el modelo de FlexSim H2    (carga manual)
echo     5. Actualizar en la web los resultados de FlexSim
echo     6. Salir
echo.
choice /c 123456 /n /m "   Elegi una opcion [1-6]: "
if errorlevel 6 exit /b 0
if errorlevel 5 goto datos
if errorlevel 4 goto fsh2
if errorlevel 3 goto fsh3
if errorlevel 2 goto blender
goto web

:web
echo.
echo   Abriendo la simulacion en el navegador...
echo   (se abre una ventana del servidor: dejala abierta mientras la usas)
start "TracePack - servidor web" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0web\servidor.ps1"
timeout /t 3 /nobreak >nul
goto menu

:blender
call :abrir "%~dp0blender\TracePack_Estacion.blend" "Blender"
goto menu

:fsh3
call :abrir "%~dp0flexsim\TracePack_H3_Camion_AMR.fsm" "FlexSim"
goto menu

:fsh2
call :abrir "%~dp0flexsim\TracePack_Estacion.fsm" "FlexSim"
goto menu

:datos
where python >nul 2>nul
if errorlevel 1 (
    echo.
    echo   Para este paso hace falta Python instalado ^(python.org^).
    pause
    goto menu
)
python "%~dp0flexsim\exportar_resultados_web.py"
pause
goto menu

:abrir
if not exist "%~1" (
    echo.
    echo   No se encontro el archivo %~1
    pause
    exit /b 1
)
start "" "%~1"
if errorlevel 1 (
    echo.
    echo   No se pudo abrir: hace falta tener %~2 instalado.
    pause
)
exit /b 0
