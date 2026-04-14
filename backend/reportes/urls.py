"""
URLs del módulo Reportes.
"""
from django.urls import path
from .views import (
    ReporteVentasView,
    ReporteStockActualView,
    ReporteProductosMasVendidosView,
    ResumenDashboardView,
    ExportarVentasExcelView,
    ExportarStockExcelView,
)

urlpatterns = [
    path('reportes/ventas/',        ReporteVentasView.as_view(),               name='reporte-ventas'),
    path('reportes/stock/',         ReporteStockActualView.as_view(),           name='reporte-stock'),
    path('reportes/mas-vendidos/',  ReporteProductosMasVendidosView.as_view(), name='reporte-mas-vendidos'),
    path('reportes/dashboard/',     ResumenDashboardView.as_view(),             name='dashboard'),
    path('reportes/exportar/ventas/', ExportarVentasExcelView.as_view(),       name='exportar-ventas-excel'),
    path('reportes/exportar/stock/',  ExportarStockExcelView.as_view(),         name='exportar-stock-excel'),
]
