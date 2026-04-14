@echo off
:: Lanzador rápido — doble click para iniciar el POS
:: Ejecuta iniciar.ps1 con permisos correctos de PowerShell

title POS Tienda — Iniciando...
echo.
echo  Iniciando sistema POS...
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0iniciar.ps1"
