@echo off
REM Abre la simulacion web de TracePack (servidor local con PowerShell, no hace falta Python)
title TracePack - servidor web
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1"
if errorlevel 1 pause
