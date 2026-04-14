<#
.SYNOPSIS
    Genera el ejecutable final (POS_Tienda.exe) usando PyInstaller
#>

$ROOT = $PSScriptRoot
$BACKEND = Join-Path $ROOT "backend"
$FRONTEND = Join-Path $ROOT "frontend"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Empaquetando POS Tienda v1.0" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Frontend Build
Write-Host "`n[1/4] Compilando Frontend (React/Vite)..." -ForegroundColor Yellow
cd $FRONTEND
npm run build

# 2. PyInstaller
Write-Host "`n[2/4] Generando ejecutable con PyInstaller (esto puede tardar varios minutos)..." -ForegroundColor Yellow
cd $BACKEND

# Aseguramos que waitress y pyinstaller estén instalados
..\venv\Scripts\python -m pip install -r requirements.txt
..\venv\Scripts\python -m pip install waitress pyinstaller whitenoise

# Comando de PyInstaller
$PYINSTALLER = "..\venv\Scripts\pyinstaller.exe"

& $PYINSTALLER --noconfirm --onefile --log-level WARN --name "POS_Tienda" `
    --add-data "../frontend/dist;frontend_dist" `
    --hidden-import "django.contrib.admin.apps" `
    --hidden-import "django.contrib.auth.apps" `
    --hidden-import "django.contrib.contenttypes.apps" `
    --hidden-import "django.contrib.sessions.apps" `
    --hidden-import "django.contrib.messages.apps" `
    --hidden-import "django.contrib.staticfiles.apps" `
    --hidden-import "rest_framework" `
    --hidden-import "rest_framework.authtoken" `
    --hidden-import "django_filters" `
    --hidden-import "corsheaders" `
    --hidden-import "inventario" `
    --hidden-import "inventario.apps" `
    --hidden-import "ventas" `
    --hidden-import "ventas.apps" `
    --hidden-import "reportes" `
    --hidden-import "reportes.apps" `
    --hidden-import "autenticacion" `
    --hidden-import "autenticacion.apps" `
    --hidden-import "whitenoise.middleware" `
    server.py

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n[3/4] Limpiando archivos temporales..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force "build" -ErrorAction SilentlyContinue
    Remove-Item "POS_Tienda.spec" -ErrorAction SilentlyContinue
    
    $SALIDA = Join-Path $ROOT "produccion"
    if (!(Test-Path $SALIDA)) { New-Item -ItemType Directory -Path $SALIDA | Out-Null }
    
    Move-Item -Path "dist\POS_Tienda.exe" -Destination (Join-Path $SALIDA "POS_Tienda.exe") -Force
    Remove-Item -Recurse -Force "dist" -ErrorAction SilentlyContinue

    Write-Host "`n[4/4] Copiando base de datos y media iniciales..." -ForegroundColor Yellow
    if (Test-Path "db.sqlite3") {
        Copy-Item "db.sqlite3" -Destination (Join-Path $SALIDA "db.sqlite3") -Force
    }
    if (Test-Path "media") {
        Copy-Item -Recurse "media" -Destination (Join-Path $SALIDA "media") -Force
    }

    Write-Host "`n==========================================" -ForegroundColor Green
    Write-Host "  ¡EMPAQUETADO EXITOSO!" -ForegroundColor Green
    Write-Host "  Archivo listo en: .\produccion\POS_Tienda.exe" -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Green
} else {
    Write-Host "`n[!] Hubo un error durante la generación del ejecutable." -ForegroundColor Red
}

Start-Sleep -Seconds 3
