"""
Serializers del módulo Ventas.
"""
from decimal import Decimal
from rest_framework import serializers
from .models import Venta, VentaDetalle, Devolucion, DevolucionDetalle
from inventario.models import ProductoVariante, Stock
from inventario.serializers import ProductoVarianteListSerializer


# ─────────────────────────────────────────────
# VentaDetalle
# ─────────────────────────────────────────────

class VentaDetalleReadSerializer(serializers.ModelSerializer):
    variante_info = ProductoVarianteListSerializer(source='variante', read_only=True)

    class Meta:
        model = VentaDetalle
        fields = [
            'id', 'variante', 'variante_info',
            'cantidad', 'precio_unitario', 'descuento_unitario', 'subtotal',
        ]
        read_only_fields = ['subtotal']


class VentaDetalleWriteSerializer(serializers.Serializer):
    """
    Validación de línea de venta recibida desde el POS.
    Se usa dentro de VentaCreateSerializer.
    """
    variante_id = serializers.IntegerField()
    cantidad = serializers.IntegerField(min_value=1)
    precio_unitario = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False
    )
    descuento_unitario = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, default=Decimal('0')
    )

    def validate_variante_id(self, value):
        try:
            variante = ProductoVariante.objects.select_related('stock').get(pk=value)
        except ProductoVariante.DoesNotExist:
            raise serializers.ValidationError(f"No existe la variante con id={value}.")
        if not variante.activo:
            raise serializers.ValidationError(f"La variante '{variante}' no está activa.")
        return value


# ─────────────────────────────────────────────
# Venta
# ─────────────────────────────────────────────

class VentaListSerializer(serializers.ModelSerializer):
    estado_display = serializers.CharField(source='get_estado_display', read_only=True)
    metodo_pago_display = serializers.CharField(source='get_metodo_pago_display', read_only=True)
    cantidad_items = serializers.IntegerField(source='detalles.count', read_only=True)

    class Meta:
        model = Venta
        fields = [
            'id', 'numero_comprobante', 'fecha',
            'subtotal', 'descuento', 'total',
            'metodo_pago', 'metodo_pago_display',
            'estado', 'estado_display',
            'cantidad_items', 'pagos', 'creado_en',
        ]


class VentaDetailSerializer(serializers.ModelSerializer):
    detalles = VentaDetalleReadSerializer(many=True, read_only=True)
    estado_display = serializers.CharField(source='get_estado_display', read_only=True)
    metodo_pago_display = serializers.CharField(source='get_metodo_pago_display', read_only=True)

    class Meta:
        model = Venta
        fields = [
            'id', 'numero_comprobante', 'fecha',
            'subtotal', 'descuento', 'total',
            'metodo_pago', 'metodo_pago_display',
            'estado', 'estado_display',
            'observaciones', 'usuario', 'pagos',
            'detalles', 'creado_en', 'actualizado_en',
        ]


class VentaCreateSerializer(serializers.Serializer):
    """
    Serializer principal para crear una venta desde el POS.
    Contiene toda la validación de negocio antes de ejecutar la transacción.
    """
    items = VentaDetalleWriteSerializer(many=True)
    metodo_pago = serializers.ChoiceField(
        choices=Venta.METODO_PAGO_CHOICES,
        default='EFECTIVO'
    )
    pagos = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        default=list,
        help_text='[{"metodo": "EFECTIVO", "monto": 5000}, {"metodo": "TARJETA_DEBITO", "monto": 3000}]'
    )
    descuento_global = serializers.DecimalField(
        max_digits=10, decimal_places=2,
        required=False, default=Decimal('0')
    )
    observaciones = serializers.CharField(required=False, default='', allow_blank=True)

    def validate_items(self, items):
        if not items:
            raise serializers.ValidationError("La venta debe tener al menos un producto.")

        # Verificar stock disponible para cada ítem
        errores = []
        for item in items:
            try:
                variante = ProductoVariante.objects.select_related('stock').get(
                    pk=item['variante_id']
                )
                stock = variante.stock
                if stock.cantidad < item['cantidad']:
                    errores.append(
                        f"Stock insuficiente para '{variante}': "
                        f"disponible={stock.cantidad}, solicitado={item['cantidad']}"
                    )
            except (ProductoVariante.DoesNotExist, Stock.DoesNotExist):
                errores.append(f"Variante id={item['variante_id']} no tiene stock registrado.")

        if errores:
            raise serializers.ValidationError(errores)

        return items


# ─────────────────────────────────────────────
# DevolucionDetalle
# ─────────────────────────────────────────────

class DevolucionDetalleReadSerializer(serializers.ModelSerializer):
    variante_nombre = serializers.CharField(
        source='venta_detalle.variante.__str__', read_only=True
    )

    class Meta:
        model = DevolucionDetalle
        fields = [
            'id', 'venta_detalle', 'variante_nombre',
            'cantidad_devuelta', 'subtotal_devuelto',
        ]
        read_only_fields = ['subtotal_devuelto']


class DevolucionDetalleWriteSerializer(serializers.Serializer):
    venta_detalle_id = serializers.IntegerField()
    cantidad_devuelta = serializers.IntegerField(min_value=1)

    def validate(self, data):
        try:
            detalle = VentaDetalle.objects.get(pk=data['venta_detalle_id'])
        except VentaDetalle.DoesNotExist:
            raise serializers.ValidationError(
                {'venta_detalle_id': 'El detalle de venta no existe.'}
            )

        # Calcular cuánto ya fue devuelto de este detalle
        ya_devuelto = sum(
            dd.cantidad_devuelta
            for dd in detalle.devoluciones_detalle.filter(
                devolucion__estado='PROCESADA'
            )
        )
        disponible = detalle.cantidad - ya_devuelto

        if data['cantidad_devuelta'] > disponible:
            raise serializers.ValidationError({
                'cantidad_devuelta': (
                    f"Solo se pueden devolver {disponible} unidades de este ítem "
                    f"(ya devueltas: {ya_devuelto}/{detalle.cantidad})."
                )
            })

        data['_detalle'] = detalle  # para reusar en el servicio
        return data


# ─────────────────────────────────────────────
# Devolucion
# ─────────────────────────────────────────────

class DevolucionListSerializer(serializers.ModelSerializer):
    venta_comprobante = serializers.CharField(
        source='venta.numero_comprobante', read_only=True
    )
    estado_display = serializers.CharField(source='get_estado_display', read_only=True)

    class Meta:
        model = Devolucion
        fields = [
            'id', 'venta', 'venta_comprobante', 'fecha',
            'motivo', 'total_devuelto', 'estado', 'estado_display',
            'metodo_reembolso', 'creado_en',
        ]


class DevolucionDetailSerializer(serializers.ModelSerializer):
    detalles = DevolucionDetalleReadSerializer(many=True, read_only=True)
    venta_comprobante = serializers.CharField(
        source='venta.numero_comprobante', read_only=True
    )

    class Meta:
        model = Devolucion
        fields = [
            'id', 'venta', 'venta_comprobante', 'fecha',
            'motivo', 'total_devuelto', 'estado',
            'metodo_reembolso', 'observaciones',
            'usuario', 'detalles', 'creado_en',
        ]


class DevolucionCreateSerializer(serializers.Serializer):
    """
    Serializer para crear una devolución.
    Valida que los ítems devueltos pertenezcan a la venta indicada.
    """
    venta_id = serializers.IntegerField()
    motivo = serializers.CharField(max_length=1000)
    metodo_reembolso = serializers.ChoiceField(
        choices=Venta.METODO_PAGO_CHOICES,
        default='EFECTIVO'
    )
    observaciones = serializers.CharField(required=False, default='', allow_blank=True)
    items = DevolucionDetalleWriteSerializer(many=True)

    def validate_venta_id(self, value):
        try:
            venta = Venta.objects.get(pk=value)
        except Venta.DoesNotExist:
            raise serializers.ValidationError(f"No existe la venta con id={value}.")
        if venta.estado == 'ANULADA':
            raise serializers.ValidationError("No se puede devolver una venta anulada.")
        if venta.estado == 'DEVOLUCION_TOTAL':
            raise serializers.ValidationError("Esta venta ya fue devuelta completamente.")
        return value

    def validate(self, data):
        if not data.get('items'):
            raise serializers.ValidationError(
                {'items': 'Debe especificar al menos un ítem a devolver.'}
            )
        # Verificar que todos los detalles pertenezcan a la venta
        venta_id = data['venta_id']
        for item in data['items']:
            if '_detalle' in item:
                detalle = item['_detalle']
                if detalle.venta_id != venta_id:
                    raise serializers.ValidationError({
                        'items': f"El detalle id={detalle.id} no pertenece a la venta id={venta_id}."
                    })
        return data
