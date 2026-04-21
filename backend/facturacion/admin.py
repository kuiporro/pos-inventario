"""
Admin del módulo Facturación.
"""
from django.contrib import admin
from .models import Proveedor, Factura, FacturaDetalle, ProcesamientoDocumento


class FacturaDetalleInline(admin.TabularInline):
    model = FacturaDetalle
    extra = 0
    readonly_fields = ('subtotal',)


@admin.register(Proveedor)
class ProveedorAdmin(admin.ModelAdmin):
    list_display = ('nombre', 'rut', 'telefono', 'email', 'activo')
    search_fields = ('nombre', 'rut')
    list_filter = ('activo',)


@admin.register(Factura)
class FacturaAdmin(admin.ModelAdmin):
    list_display = ('numero_factura', 'tipo', 'proveedor', 'total', 'estado', 'fecha')
    list_filter = ('tipo', 'estado', 'fecha')
    search_fields = ('numero_factura',)
    date_hierarchy = 'fecha'
    inlines = [FacturaDetalleInline]
    readonly_fields = ('subtotal', 'impuesto', 'total', 'creado_en', 'actualizado_en')


@admin.register(ProcesamientoDocumento)
class ProcesamientoDocumentoAdmin(admin.ModelAdmin):
    list_display = ('nombre_archivo', 'estado', 'confianza_global', 'usuario', 'creado_en')
    list_filter = ('estado', 'tipo_archivo')
    readonly_fields = ('texto_raw', 'datos_extraidos', 'errores', 'creado_en', 'actualizado_en')
