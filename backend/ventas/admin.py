"""
Admin del módulo Ventas.
"""
from django.contrib import admin
from .models import Venta, VentaDetalle, Devolucion, DevolucionDetalle


class VentaDetalleInline(admin.TabularInline):
    model = VentaDetalle
    extra = 0
    fields = ['variante', 'cantidad', 'precio_unitario', 'descuento_unitario', 'subtotal']
    readonly_fields = ['subtotal']
    can_delete = False


class DevolucionDetalleInline(admin.TabularInline):
    model = DevolucionDetalle
    extra = 0
    fields = ['venta_detalle', 'cantidad_devuelta', 'subtotal_devuelto']
    readonly_fields = ['subtotal_devuelto']


@admin.register(Venta)
class VentaAdmin(admin.ModelAdmin):
    list_display = ['numero_comprobante', 'fecha', 'total', 'metodo_pago', 'estado']
    list_filter = ['estado', 'metodo_pago', 'fecha']
    search_fields = ['numero_comprobante']
    readonly_fields = ['numero_comprobante', 'creado_en', 'actualizado_en']
    date_hierarchy = 'fecha'
    inlines = [VentaDetalleInline]


@admin.register(Devolucion)
class DevolucionAdmin(admin.ModelAdmin):
    list_display = ['venta', 'fecha', 'total_devuelto', 'estado', 'metodo_reembolso']
    list_filter = ['estado', 'fecha']
    readonly_fields = ['creado_en']
    date_hierarchy = 'fecha'
    inlines = [DevolucionDetalleInline]
