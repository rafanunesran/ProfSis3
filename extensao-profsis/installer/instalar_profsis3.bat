@echo off
chcp 65001 >nul
title Instalador ProfSis3
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar_profsis3.ps1"
pause
