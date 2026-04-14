"""
Serializers del módulo Inventario.

Estrategia:
- Serializers anidados (read) + planos (write) para mejor rendimiento
- Validaciones de negocio en validate_*
- Campos calculados como SerializerMethodField
"""
from rest_framework import serializers
from .models import Producto, ProductoVariante, CodigoBarras, Stock, MovimientoStock


# ─────────────────────────────────────────────
# CodigoBarras
# ─────────────────────────────────────────────

class CodigoBarrasSerializer(serializers.ModelSerializer):
    class Meta:
        model = CodigoBarras
        fields = ['id', 'codigo', 'tipo', 'principal', 'creado_en']
        read_only_fields = ['creado_en']


class CodigoBarrasCreateSerializer(serializers.ModelSerializer):
    """Usado para crear/actualizar códigos desde el endpoint de variantes."""
    class Meta:
        model = CodigoBarras
        fields = ['id', 'variante', 'codigo', 'tipo', 'principal']

    def validate_codigo(self, value):
        # Validar unicidad excluyendo la instancia actual (en updates)
        qs = CodigoBarras.objects.filter(codigo=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                f"El código de barras '{value}' ya está registrado en el sistema."
            )
        return value


# ─────────────────────────────────────────────
# Stock
# ─────────────────────────────────────────────

class StockSerializer(serializers.ModelSerializer):
    bajo_stock = serializers.SerializerMethodField()

    class Meta:
        model = Stock
        fields = ['id', 'cantidad', 'stock_minimo', 'bajo_stock', 'actualizado_en']
        read_only_fields = ['actualizado_en']

    def get_bajo_stock(self, obj):
        return obj.bajo_stock


class StockUpdateSerializer(serializers.ModelSerializer):
    """Solo permite actualizar stock_minimo desde la API (la cantidad se maneja por movimientos)."""
    class Meta:
        model = Stock
        fields = ['stock_minimo']


# ─────────────────────────────────────────────
# ProductoVariante
# ─────────────────────────────────────────────

class ProductoVarianteListSerializer(serializers.ModelSerializer):
    """Versión compacta para listar variantes dentro de un producto."""
    codigos_barra = CodigoBarrasSerializer(many=True, read_only=True)
    stock = StockSerializer(read_only=True)
    producto_nombre = serializers.CharField(source='producto.nombre', read_only=True)

    foto_url = serializers.SerializerMethodField()

    class Meta:
        model = ProductoVariante
        fields = [
            'id', 'producto', 'producto_nombre', 'nombre', 'sku',
            'precio_venta', 'precio_costo', 'activo', 'foto', 'foto_url',
            'codigos_barra', 'stock',
            'creado_en', 'actualizado_en',
        ]
        read_only_fields = ['sku', 'foto_url', 'creado_en', 'actualizado_en']

    def get_foto_url(self, obj):
        if not obj.foto:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.foto.url)
        return obj.foto.url


class ProductoVarianteWriteSerializer(serializers.ModelSerializer):
    """Para crear/actualizar variantes."""
    class Meta:
        model = ProductoVariante
        fields = [
            'id', 'producto', 'nombre', 'sku',
            'precio_venta', 'precio_costo', 'activo', 'foto',
        ]
        read_only_fields = ['sku']

    def validate(self, data):
        # Verificar que no exista ya una variante con ese nombre para el mismo producto
        producto = data.get('producto', getattr(self.instance, 'producto', None))
        nombre = data.get('nombre', getattr(self.instance, 'nombre', None))
        qs = ProductoVariante.objects.filter(producto=producto, nombre=nombre)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                {'nombre': f"Ya existe una variante '{nombre}' para este producto."}
            )
        return data


# ─────────────────────────────────────────────
# Producto
# ─────────────────────────────────────────────

class ProductoListSerializer(serializers.ModelSerializer):
    """Versión compacta para listados."""
    cantidad_variantes = serializers.IntegerField(
        source='variantes.count', read_only=True
    )

    class Meta:
        model = Producto
        fields = [
            'id', 'nombre', 'descripcion', 'categoria',
            'imagen', 'activo', 'cantidad_variantes',
            'creado_en', 'actualizado_en',
        ]
        read_only_fields = ['creado_en', 'actualizado_en']


class ProductoDetailSerializer(serializers.ModelSerializer):
    """Versión completa con variantes anidadas."""
    variantes = ProductoVarianteListSerializer(many=True, read_only=True)

    class Meta:
        model = Producto
        fields = [
            'id', 'nombre', 'descripcion', 'categoria',
            'imagen', 'activo', 'variantes',
            'creado_en', 'actualizado_en',
        ]
        read_only_fields = ['creado_en', 'actualizado_en']


class ProductoWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Producto
        fields = ['id', 'nombre', 'descripcion', 'categoria', 'imagen', 'activo']


# ─────────────────────────────────────────────
# MovimientoStock
# ─────────────────────────────────────────────

class MovimientoStockSerializer(serializers.ModelSerializer):
    variante_nombre = serializers.CharField(source='variante.__str__', read_only=True)
    tipo_display = serializers.CharField(source='get_tipo_display', read_only=True)

    class Meta:
        model = MovimientoStock
        fields = [
            'id', 'variante', 'variante_nombre', 'tipo', 'tipo_display',
            'cantidad', 'stock_anterior', 'stock_posterior',
            'motivo', 'referencia_venta', 'referencia_devolucion',
            'usuario', 'creado_en',
        ]
        read_only_fields = [
            'stock_anterior', 'stock_posterior',
            'referencia_venta', 'referencia_devolucion',
            'creado_en',
        ]


class AjusteStockSerializer(serializers.Serializer):
    """
    Serializer para el endpoint de ajuste manual de stock.
    No es un ModelSerializer porque encapsula lógica de negocio.
    """
    variante_id = serializers.IntegerField()
    tipo = serializers.ChoiceField(choices=[
        ('INGRESO', 'Ingreso de mercadería'),
        ('AJUSTE_POSITIVO', 'Ajuste positivo'),
        ('AJUSTE_NEGATIVO', 'Ajuste negativo'),
        ('INICIAL', 'Carga inicial'),
        ('DEVOLUCION_PROVEEDOR', 'Devolución a proveedor'),
    ])
    cantidad = serializers.IntegerField(min_value=1)
    motivo = serializers.CharField(max_length=500, required=False, default='')

    def validate_variante_id(self, value):
        try:
            ProductoVariante.objects.get(pk=value)
        except ProductoVariante.DoesNotExist:
            raise serializers.ValidationError(f"No existe la variante con id={value}.")
        return value


# ─────────────────────────────────────────────
# Búsqueda por código de barras (endpoint especial)
# ─────────────────────────────────────────────

class BusquedaCodigoBarrasSerializer(serializers.Serializer):
    """Resultado de buscar por código de barras en el POS."""
    codigo = serializers.CharField(read_only=True)
    variante_id = serializers.IntegerField(read_only=True)
    variante_nombre = serializers.CharField(read_only=True)
    producto_nombre = serializers.CharField(read_only=True)
    precio_venta = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    stock_actual = serializers.IntegerField(read_only=True)
    sku = serializers.CharField(read_only=True)
