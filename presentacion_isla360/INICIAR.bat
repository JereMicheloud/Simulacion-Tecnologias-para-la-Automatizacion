@echo off
REM Abre la presentacion FACULTAD TracePack isla 360 (servidor local con PowerShell, no hace falta Python)
title TracePack - Isla 360 - presentacion FACULTAD
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1" -Puerto 8201
if errorlevel 1 pause
