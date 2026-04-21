"""
URLs principales del proyecto POS.
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

from django.views.generic import TemplateView
from django.urls import re_path

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('autenticacion.urls')),   # ← auth endpoints
    path('api/', include('inventario.urls')),
    path('api/', include('ventas.urls')),
    path('api/', include('reportes.urls')),
    path('api/', include('facturacion.urls')),
]

# Si NO estamos en producción DEBUG=False, y no cazó /api/, entonces lanzamos React
urlpatterns += [
    re_path(r'^(?!api/|admin/|media/|static/).*$', TemplateView.as_view(template_name="index.html"))
]

# Servir archivos media en desarrollo o producción (el proxy los servirá si no es nginx)
from django.urls import re_path
from django.views.static import serve
urlpatterns += [
    re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
    re_path(r'^static/(?P<path>.*)$', serve, {'document_root': settings.STATIC_ROOT}),
]
