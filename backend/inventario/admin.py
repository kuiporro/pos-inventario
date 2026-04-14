"""
Admin del módulo Inventario.
"""
from django.contrib import admin
from .models import Producto, ProductoVariante, CodigoBarras, Stock, MovimientoStock


class CodigoBarrasInline(admin.TabularInline):
    model = CodigoBarras
    extra = 1
    fields = ['codigo', 'tipo', 'principal']


class StockInline(admin.StackedInline):
    model = Stock
    extra = 0
    fields = ['cantidad', 'stock_minimo']
    readonly_fields = []
    can_delete = False


class ProductoVarianteInline(admin.TabularInline):
    model = ProductoVariante
    extra = 1
    fields = ['nombre', 'sku', 'precio_venta', 'precio_costo', 'activo']
    show_change_link = True


@admin.register(Producto)
class ProductoAdmin(admin.ModelAdmin):
    list_display = ['nombre', 'categoria', 'activo', 'creado_en']
    list_filter = ['activo', 'categoria']
    search_fields = ['nombre', 'descripcion', 'categoria']
    inlines = [ProductoVarianteInline]
    list_editable = ['activo']


@admin.register(ProductoVariante)
class ProductoVarianteAdmin(admin.ModelAdmin):
    list_display = ['__str__', 'sku', 'precio_venta', 'activo', 'get_stock']
    list_filter = ['activo', 'producto__categoria']
    search_fields = ['nombre', 'sku', 'producto__nombre']
    inlines = [CodigoBarrasInline, StockInline]

    def get_stock(self, obj):
        try:
            return obj.stock.cantidad
        except Stock.DoesNotExist:
            return '—'
    get_stock.short_description = 'Stock'


@admin.register(CodigoBarras)
class CodigoBarrasAdmin(admin.ModelAdmin):
    list_display = ['codigo', 'variante', 'tipo', 'principal']
    search_fields = ['codigo', 'variante__nombre', 'variante__producto__nombre']
    list_filter = ['tipo', 'principal']


@admin.register(Stock)
class StockAdmin(admin.ModelAdmin):
    list_display = ['variante', 'cantidad', 'stock_minimo', 'bajo_stock', 'actualizado_en']
    list_filter = ['variante__producto__categoria']
    search_fields = ['variante__nombre', 'variante__producto__nombre']

    def bajo_stock(self, obj):
        return obj.bajo_stock
    bajo_stock.boolean = True
    bajo_stock.short_description = 'Bajo stock'


@admin.register(MovimientoStock)
class MovimientoStockAdmin(admin.ModelAdmin):
    list_display = ['creado_en', 'variante', 'tipo', 'cantidad', 'stock_anterior', 'stock_posterior']
    list_filter = ['tipo', 'creado_en']
    search_fields = ['variante__nombre', 'variante__producto__nombre', 'motivo']
    readonly_fields = ['creado_en', 'stock_anterior', 'stock_posterior']
    date_hierarchy = 'creado_en'
