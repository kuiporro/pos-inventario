# POS Sistema — Guía de inicio rápido

## Estructura del proyecto

```
antigravity/
├── backend/          ← Django + DRF
│   ├── config/       ← Settings, URLs raíz
│   ├── inventario/   ← Modelos, API, servicios de inventario
│   ├── ventas/       ← Modelos, API, servicios de ventas
│   ├── reportes/     ← Vistas de reportes
│   ├── venv/         ← Entorno virtual Python (un nivel arriba)
│   └── db.sqlite3    ← Base de datos local
└── frontend/         ← React + Vite
    └── src/
        ├── pages/    ← POS, Inventario, Reportes, Movimientos
        └── components/ ← Modal, EscanerCamara, etc.
```

---

## PASO 1 — Instalar Node.js (solo una vez)

Descarga e instala Node.js LTS desde:
👉 https://nodejs.org/es/download

Reinicia la consola después de instalarlo.

---

## PASO 2 — Instalar dependencias del frontend

```powershell
cd c:\Users\luis\Desktop\Nueva carpeta\antigravity\frontend
npm install
```

---

## PASO 3 — Arrancar el backend (en una consola)

```powershell
cd c:\Users\luis\Desktop\Nueva carpeta\antigravity\backend
..\venv\Scripts\python manage.py runserver 0.0.0.0:8000
```

- Accessible en: http://localhost:8000
- API Browser: http://localhost:8000/api/
- Admin Django: http://localhost:8000/admin/
  - Usuario: `admin` / Contraseña: `admin1234`

---

## PASO 4 — Arrancar el frontend (en otra consola)

```powershell
cd c:\Users\luis\Desktop\Nueva carpeta\antigravity\frontend
npm run dev
```

- App React: http://localhost:5173
- Desde celular en la misma red: http://[TU_IP_LOCAL]:5173

---

## PASO 5 — Acceso desde celular (Fase 6)

Para saber tu IP local en Windows:

```powershell
ipconfig | findstr "IPv4"
```

Luego en el celular abre: `http://192.168.X.X:5173`

Para exposición del backend a la red ya está configurado:
`runserver 0.0.0.0:8000` acepta conexiones de cualquier dispositivo en la red.

---

## Endpoints de la API

| Módulo | Endpoint | Descripción |
|--------|----------|-------------|
| Inventario | `GET /api/inventario/variantes/buscar-codigo/?codigo=XXX` | **POS** — buscar por código de barras |
| Inventario | `GET/POST /api/inventario/productos/` | CRUD productos |
| Inventario | `GET/POST /api/inventario/variantes/` | CRUD variantes |
| Inventario | `GET/POST /api/inventario/codigos-barra/` | CRUD códigos |
| Inventario | `GET /api/inventario/stock/` | Stock actual |
| Inventario | `GET /api/inventario/stock/?bajo_stock=true` | Alertas stock |
| Inventario | `POST /api/inventario/stock/{id}/ajustar/` | Ajuste manual |
| Inventario | `GET /api/inventario/movimientos/` | Kardex completo |
| Ventas | `POST /api/ventas/ventas/` | Crear venta |
| Ventas | `POST /api/ventas/ventas/{id}/anular/` | Anular venta |
| Ventas | `GET /api/ventas/ventas/hoy/` | Ventas del día |
| Ventas | `POST /api/ventas/devoluciones/` | Procesar devolución |
| Reportes | `GET /api/reportes/dashboard/` | KPIs generales |
| Reportes | `GET /api/reportes/ventas/?periodo=diario` | Ventas por período |
| Reportes | `GET /api/reportes/mas-vendidos/` | Top productos |
| Reportes | `GET /api/reportes/stock/?bajo_stock=true` | Stock bajo |

---

## Flujo típico de uso

1. **Agregar productos**: Inventario → Nuevo producto → Agregar variante → Ajustar stock (Carga inicial)
2. **Vender**: POS → Escanear código → Confirmar → Cobrar
3. **Devolver**: (próxima fase — endpoint ya disponible en API)
4. **Ver reportes**: Dashboard con KPIs, gráficos, top productos y alertas
