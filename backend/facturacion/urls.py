"""
URLs del módulo Facturación.

Endpoints:
    /api/facturacion/proveedores/              → CRUD
    /api/facturacion/facturas/                 → Listar/Crear
    /api/facturacion/facturas/{id}/            → Detalle
    /api/facturacion/facturas/{id}/confirmar/  → Confirmar
    /api/facturacion/facturas/{id}/anular/     → Anular

    /api/facturacion/ocr/subir/               → Upload documento
    /api/facturacion/ocr/                     → Historial
    /api/facturacion/ocr/{id}/                → Detalle resultado
    /api/facturacion/ocr/{id}/confirmar/      → Confirmar → crear factura

    /api/reportes/financiero/ganancia/        → Ganancia por periodo
    /api/reportes/financiero/flujo-caja/      → Flujo de caja
    /api/reportes/financiero/margen/          → Margen por producto
    /api/reportes/financiero/top-rentables/   → Top productos rentables
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ProveedorViewSet,
    FacturaViewSet,
    OCRUploadView,
    OCRListView,
    OCRDetalleView,
    OCRConfirmarView,
    ReporteGananciaView,
    ReporteFlujoCajaView,
    ReporteMargenProductoView,
    ReporteTopRentablesView,
)

router = DefaultRouter()
router.register(r'proveedores', ProveedorViewSet, basename='proveedor')
router.register(r'facturas', FacturaViewSet, basename='factura')

urlpatterns = [
    # CRUD via router (proveedores, facturas + acciones confirmar/anular)
    path('facturacion/', include(router.urls)),

    # OCR
    path('facturacion/ocr/subir/', OCRUploadView.as_view(), name='ocr-subir'),
    path('facturacion/ocr/', OCRListView.as_view(), name='ocr-lista'),
    path('facturacion/ocr/<int:pk>/', OCRDetalleView.as_view(), name='ocr-detalle'),
    path('facturacion/ocr/<int:pk>/confirmar/', OCRConfirmarView.as_view(), name='ocr-confirmar'),

    # Reportes financieros
    path('reportes/financiero/ganancia/', ReporteGananciaView.as_view(), name='reporte-ganancia'),
    path('reportes/financiero/flujo-caja/', ReporteFlujoCajaView.as_view(), name='reporte-flujo-caja'),
    path('reportes/financiero/margen/', ReporteMargenProductoView.as_view(), name='reporte-margen'),
    path('reportes/financiero/top-rentables/', ReporteTopRentablesView.as_view(), name='reporte-top-rentables'),
]
