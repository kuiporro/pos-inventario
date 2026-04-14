<#
.SYNOPSIS
    Inicia el sistema POS — Backend Django + Frontend React
.DESCRIPTION
    Abre 2 ventanas de terminal separadas:
      - Backend:  Django en http://0.0.0.0:8000
      - Frontend: Vite   en https://0.0.0.0:5173
    Luego abre el navegador automáticamente.
.USAGE
    Doble-click en iniciar.ps1  O  .\iniciar.ps1
#>

$ROOT      = $PSScriptRoot
$BACKEND   = Join-Path $ROOT "backend"
$FRONTEND  = Join-Path $ROOT "frontend"
$PYTHON    = Join-Path $ROOT "venv\Scripts\python.exe"
$ACTIVATE  = Join-Path $ROOT "venv\Scripts\Activate.ps1"
$NODE      = "npm"

# ── Colores ────────────────────────────────────────────────────────────────
function Write-Header($msg) {
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Cyan
    Write-Host "  $msg" -ForegroundColor Cyan
    Write-Host ("=" * 60) -ForegroundColor Cyan
}
function Write-OK($msg)   { Write-Host "  [OK]  $msg" -ForegroundColor Green   }
function Write-ERR($msg)  { Write-Host "  [ERR] $msg" -ForegroundColor Red     }
function Write-INFO($msg) { Write-Host "  [>>]  $msg" -ForegroundColor Yellow  }

# ── Verificar que existe el venv ───────────────────────────────────────────
Write-Header "POS Tienda — Iniciando servicios"

if (-not (Test-Path $PYTHON)) {
    Write-ERR "No se encontro el entorno virtual en: $PYTHON"
    Write-INFO "Corriendo setup inicial..."
    Set-Location $BACKEND
    python -m venv "..\venv"
    & $ACTIVATE
    pip install -r requirements.txt
}

# ── Aplicar migraciones pendientes ────────────────────────────────────────
Write-INFO "Verificando migraciones de base de datos..."
& $PYTHON (Join-Path $BACKEND "manage.py") migrate --run-syncdb 2>&1 | Where-Object { $_ -match "Applying|OK|No migrations" }
Write-OK  "Base de datos lista"

# ── Verificar node_modules ────────────────────────────────────────────────
if (-not (Test-Path (Join-Path $FRONTEND "node_modules"))) {
    Write-INFO "Instalando dependencias del frontend (primera vez)..."
    Set-Location $FRONTEND
    npm install
    Set-Location $ROOT
}

# ── Obtener IP local de la red ─────────────────────────────────────────────
$IP = (Get-NetIPAddress -AddressFamily IPv4 |
       Where-Object { $_.IPAddress -notmatch '^127\.' -and $_.IPAddress -notmatch '^169\.' } |
       Select-Object -First 1).IPAddress

Write-OK "IP local detectada: $IP"

# ── Iniciar Backend en nueva ventana ──────────────────────────────────────
Write-INFO "Iniciando Backend Django (puerto 8000)..."
$backendCmd = @"
cd '$BACKEND'
Write-Host '╔══════════════════════════════════════════╗' -ForegroundColor Cyan
Write-Host '║     BACKEND — Django  :8000              ║' -ForegroundColor Cyan
Write-Host '║     Ctrl+C para detener                  ║' -ForegroundColor Cyan
Write-Host '╚══════════════════════════════════════════╝' -ForegroundColor Cyan
& '$PYTHON' manage.py runserver 0.0.0.0:8000
"@
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd -WindowStyle Normal

Start-Sleep -Seconds 2   # Dar tiempo al backend para arrancar

# ── Iniciar Frontend en nueva ventana ─────────────────────────────────────
Write-INFO "Iniciando Frontend Vite (puerto 5173 HTTPS)..."
$frontendCmd = @"
cd '$FRONTEND'
Write-Host '╔══════════════════════════════════════════╗' -ForegroundColor Magenta
Write-Host '║     FRONTEND — Vite HTTPS :5173          ║' -ForegroundColor Magenta
Write-Host '║     Ctrl+C para detener                  ║' -ForegroundColor Magenta
Write-Host '╚══════════════════════════════════════════╝' -ForegroundColor Magenta
npm run dev
"@
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd -WindowStyle Normal

Start-Sleep -Seconds 3   # Dar tiempo a Vite para compilar

# ── Abrir navegador ────────────────────────────────────────────────────────
Write-INFO "Abriendo navegador..."
Start-Process "https://localhost:5173"

# ── Resumen ────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host ("─" * 60) -ForegroundColor DarkGray
Write-Host "  SISTEMA POS INICIADO" -ForegroundColor Green -BackgroundColor DarkGreen
Write-Host ("─" * 60) -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Local PC:" -ForegroundColor White
Write-Host "    POS (frontend)  →  https://localhost:5173" -ForegroundColor Cyan
Write-Host "    API (backend)   →  http://localhost:8000/api/" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Desde celular / red local:" -ForegroundColor White
Write-Host "    POS             →  https://${IP}:5173" -ForegroundColor Yellow
Write-Host "    Escaner movil   →  https://${IP}:5173/scanner-movil" -ForegroundColor Yellow
Write-Host "    API             →  http://${IP}:8000/api/" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Credenciales: admin / admin1234" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  [Esta ventana puede cerrarse — los servicios siguen corriendo]" -ForegroundColor DarkGray
Write-Host ""
