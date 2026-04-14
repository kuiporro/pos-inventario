# =============================================================================
# backup.ps1 — Script de backup automático para POS Tienda
# =============================================================================
# USO:
#   .\backup.ps1
#   .\backup.ps1 -Destino "D:\Backups"
# =============================================================================

param(
    [string]$Destino = "$PSScriptRoot\backups"
)

$FechaHora   = Get-Date -Format "yyyy-MM-dd_HH-mm"
$ArchivoOrig = "$PSScriptRoot\backend\db.sqlite3"
$ArchivoBack = "$Destino\postienda_$FechaHora.sqlite3"

# Crear carpeta de backups si no existe
if (-not (Test-Path $Destino)) {
    New-Item -ItemType Directory -Path $Destino | Out-Null
    Write-Host "📁 Carpeta de backups creada: $Destino" -ForegroundColor Cyan
}

# Verificar que existe la BD
if (-not (Test-Path $ArchivoOrig)) {
    Write-Host "❌ No se encontró db.sqlite3 en $ArchivoOrig" -ForegroundColor Red
    exit 1
}

# Copiar el archivo
try {
    Copy-Item -Path $ArchivoOrig -Destination $ArchivoBack -Force
    $TamanoKB = [math]::Round((Get-Item $ArchivoBack).length / 1KB, 1)
    Write-Host "✅ Backup creado: $ArchivoBack ($TamanoKB KB)" -ForegroundColor Green
} catch {
    Write-Host "❌ Error al crear backup: $_" -ForegroundColor Red
    exit 1
}

# Mantener solo los últimos 30 backups (eliminar los más viejos)
$Backups = Get-ChildItem -Path $Destino -Filter "postienda_*.sqlite3" | Sort-Object LastWriteTime -Descending
if ($Backups.Count -gt 30) {
    $AEliminar = $Backups | Select-Object -Skip 30
    $AEliminar | ForEach-Object {
        Remove-Item $_.FullName -Force
        Write-Host "🗑️  Backup antiguo eliminado: $($_.Name)" -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "📦 Total backups guardados: $([Math]::Min($Backups.Count, 30))" -ForegroundColor Cyan
Write-Host "📂 Carpeta: $Destino" -ForegroundColor Cyan

# =============================================================================
# Para PostgreSQL: descomenta estas líneas y comenta el bloque SQLite arriba
# Requiere que pg_dump esté en el PATH (viene con PostgreSQL)
# =============================================================================
# $ArchivoBack = "$Destino\postienda_$FechaHora.sql"
# $env:PGPASSWORD = "tu_clave_aqui"
# pg_dump -U postgres -h localhost postienda > $ArchivoBack
# Write-Host "✅ Backup PostgreSQL: $ArchivoBack"
