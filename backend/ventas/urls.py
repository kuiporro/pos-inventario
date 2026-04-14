"""
URLs del módulo Ventas.

Endpoints disponibles:
    GET/POST   /api/ventas/ventas/
    GET        /api/ventas/ventas/{id}/
    POST       /api/ventas/ventas/{id}/anular/
    GET        /api/ventas/ventas/hoy/
    
    GET/POST   /api/ventas/devoluciones/
    GET        /api/ventas/devoluciones/{id}/
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import VentaViewSet, DevolucionViewSet

router = DefaultRouter()
router.register(r'ventas', VentaViewSet, basename='venta')
router.register(r'devoluciones', DevolucionViewSet, basename='devolucion')

urlpatterns = [
    path('ventas/', include(router.urls)),
]
