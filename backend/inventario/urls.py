"""
URLs del módulo Inventario.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ProductoViewSet,
    ProductoVarianteViewSet,
    CodigoBarrasViewSet,
    StockViewSet,
    MovimientoStockViewSet,
    ScanBridgeView,
    DecodificarImagenView,
    StockAlertasView,
    FotoBridgeView,
)

router = DefaultRouter()
router.register(r'productos',      ProductoViewSet,          basename='producto')
router.register(r'variantes',      ProductoVarianteViewSet,  basename='variante')
router.register(r'codigos-barra',  CodigoBarrasViewSet,      basename='codigobarras')
router.register(r'stock',          StockViewSet,             basename='stock')
router.register(r'movimientos',    MovimientoStockViewSet,   basename='movimiento')

urlpatterns = [
    path('inventario/',                        include(router.urls)),
    path('inventario/scan-bridge/',            ScanBridgeView.as_view(),     name='scan-bridge'),
    path('inventario/decodificar-imagen/',     DecodificarImagenView.as_view(), name='decodificar-imagen'),
    path('inventario/stock-alertas/',          StockAlertasView.as_view(),   name='stock-alertas'),
    path('inventario/foto-bridge/',            FotoBridgeView.as_view(),     name='foto-bridge'),
    path('inventario/foto-bridge/<int:foto_id>/', FotoBridgeView.as_view(), name='foto-bridge-get'),
]
