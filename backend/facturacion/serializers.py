"""
Serializers del módulo Facturación.
"""
from rest_framework import serializers
from .models import Proveedor, Factura, FacturaDetalle, ProcesamientoDocumento


class ProveedorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Proveedor
        fields = '__all__'
        read_only_fields = ('creado_en', 'actualizado_en')


class FacturaDetalleSerializer(serializers.ModelSerializer):
    variante_nombre = serializers.SerializerMethodField()
    producto_nombre = serializers.SerializerMethodField()

    class Meta:
        model = FacturaDetalle
        fields = [
            'id', 'factura', 'variante', 'variante_nombre', 'producto_nombre',
            'descripcion_raw', 'codigo_barras_raw',
            'cantidad', 'precio_unitario', 'subtotal', 'precio_costo_snapshot',
        ]
        read_only_fields = ('subtotal',)

    def get_variante_nombre(self, obj):
        return str(obj.variante) if obj.variante else None

    def get_producto_nombre(self, obj):
        if obj.variante and obj.variante.producto:
            return obj.variante.producto.nombre
        return None


class FacturaSerializer(serializers.ModelSerializer):
    detalles = FacturaDetalleSerializer(many=True, read_only=True)
    proveedor_nombre = serializers.SerializerMethodField()
    tipo_display = serializers.CharField(source='get_tipo_display', read_only=True)
    estado_display = serializers.CharField(source='get_estado_display', read_only=True)

    class Meta:
        model = Factura
        fields = [
            'id', 'numero_factura', 'fecha', 'tipo', 'tipo_display',
            'proveedor', 'proveedor_nombre', 'referencia_venta',
            'subtotal', 'impuesto', 'total',
            'estado', 'estado_display', 'observaciones',
            'usuario', 'creado_en', 'actualizado_en',
            'detalles',
        ]
        read_only_fields = ('subtotal', 'impuesto', 'total', 'creado_en', 'actualizado_en')

    def get_proveedor_nombre(self, obj):
        return obj.proveedor.nombre if obj.proveedor else None


class FacturaListSerializer(serializers.ModelSerializer):
    """Serializer ligero para listados (sin detalles)."""
    proveedor_nombre = serializers.SerializerMethodField()
    tipo_display = serializers.CharField(source='get_tipo_display', read_only=True)
    estado_display = serializers.CharField(source='get_estado_display', read_only=True)

    class Meta:
        model = Factura
        fields = [
            'id', 'numero_factura', 'fecha', 'tipo', 'tipo_display',
            'proveedor', 'proveedor_nombre',
            'subtotal', 'impuesto', 'total',
            'estado', 'estado_display',
            'creado_en',
        ]

    def get_proveedor_nombre(self, obj):
        return obj.proveedor.nombre if obj.proveedor else None


class ProcesamientoDocumentoSerializer(serializers.ModelSerializer):
    estado_display = serializers.CharField(source='get_estado_display', read_only=True)

    class Meta:
        model = ProcesamientoDocumento
        fields = [
            'id', 'archivo', 'nombre_archivo', 'tipo_archivo', 'tamano_bytes',
            'estado', 'estado_display',
            'texto_raw', 'datos_extraidos', 'confianza_global',
            'factura_generada', 'errores',
            'usuario', 'creado_en', 'actualizado_en',
        ]
        read_only_fields = (
            'nombre_archivo', 'tipo_archivo', 'tamano_bytes',
            'estado', 'texto_raw', 'datos_extraidos', 'confianza_global',
            'factura_generada', 'errores',
            'creado_en', 'actualizado_en',
        )


class CrearFacturaCompraSerializer(serializers.Serializer):
    """Serializer para crear factura de compra manual."""
    numero_factura = serializers.CharField(max_length=50)
    proveedor_id = serializers.IntegerField(required=False, allow_null=True)
    fecha = serializers.DateTimeField(required=False)
    observaciones = serializers.CharField(required=False, default='', allow_blank=True)
    items = serializers.ListField(
        child=serializers.DictField(),
        min_length=1,
        help_text='[{descripcion, codigo_barras, cantidad, precio_unitario, variante_id?}]'
    )


class ConfirmarOCRSerializer(serializers.Serializer):
    """
    Serializer para confirmar datos OCR y crear factura.
    El usuario envía la lista de productos revisada/corregida.
    """
    numero_factura = serializers.CharField(max_length=50)
    proveedor_id = serializers.IntegerField(required=False, allow_null=True)
    productos = serializers.ListField(
        child=serializers.DictField(),
        min_length=1,
        help_text='[{variante_id, es_nuevo, cantidad, precio_unitario, descripcion, codigo_barras, nuevo_*}]'
    )
