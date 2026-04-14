"""
Modelos del módulo Ventas.

Entidades:
    - Venta
    - VentaDetalle
    - Devolucion
    - DevolucionDetalle
"""
from django.db import models
from django.core.validators import MinValueValidator
from django.utils import timezone
from inventario.models import ProductoVariante


class Venta(models.Model):
    """
    Cabecera de una venta. Una venta tiene múltiples detalles (VentaDetalle).
    """
    METODO_PAGO_CHOICES = [
        ('EFECTIVO', 'Efectivo'),
        ('TARJETA_DEBITO', 'Tarjeta de débito'),
        ('TARJETA_CREDITO', 'Tarjeta de crédito'),
        ('TRANSFERENCIA', 'Transferencia bancaria'),
        ('OTRO', 'Otro'),
    ]

    ESTADO_CHOICES = [
        ('COMPLETADA', 'Completada'),
        ('ANULADA', 'Anulada'),
        ('DEVOLUCION_PARCIAL', 'Devolución parcial'),
        ('DEVOLUCION_TOTAL', 'Devolución total'),
    ]

    numero_comprobante = models.CharField(
        max_length=50,
        unique=True,
        verbose_name='Número de comprobante',
        help_text='Ej: 0001-00000001'
    )
    fecha = models.DateTimeField(
        default=timezone.now,
        verbose_name='Fecha y hora de venta'
    )
    subtotal = models.DecimalField(
        max_digits=14,
        decimal_places=0,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name='Subtotal'
    )
    descuento = models.DecimalField(
        max_digits=14,
        decimal_places=0,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name='Descuento total'
    )
    total = models.DecimalField(
        max_digits=14,
        decimal_places=0,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name='Total'
    )
    metodo_pago = models.CharField(
        max_length=20,
        choices=METODO_PAGO_CHOICES,
        default='EFECTIVO',
        verbose_name='Método de pago'
    )
    estado = models.CharField(
        max_length=20,
        choices=ESTADO_CHOICES,
        default='COMPLETADA',
        verbose_name='Estado'
    )
    observaciones = models.TextField(
        blank=True,
        default='',
        verbose_name='Observaciones'
    )
    pagos = models.JSONField(
        default=list,
        blank=True,
        verbose_name='Detalle de pagos',
        help_text='Lista: [{"metodo": "EFECTIVO", "monto": 5000}, ...]'
    )
    usuario = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name='Usuario (vendedor)'
    )
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Venta'
        verbose_name_plural = 'Ventas'
        ordering = ['-fecha']

    def __str__(self):
        return f'Venta {self.numero_comprobante} — ${self.total} ({self.fecha:%d/%m/%Y %H:%M})'

    @classmethod
    def generar_numero_comprobante(cls):
        """
        Genera el próximo número de comprobante en formato 0001-XXXXXXXX.
        """
        ultimo = cls.objects.order_by('-id').first()
        if ultimo:
            try:
                numero = int(ultimo.numero_comprobante.split('-')[-1]) + 1
            except (ValueError, IndexError):
                numero = 1
        else:
            numero = 1
        return f'0001-{numero:08d}'


class VentaDetalle(models.Model):
    """
    Detalle (línea) de una venta. Guarda el precio al momento de la venta
    para que históricos no se afecten si cambia el precio del producto.
    """
    venta = models.ForeignKey(
        Venta,
        on_delete=models.CASCADE,
        related_name='detalles',
        verbose_name='Venta'
    )
    variante = models.ForeignKey(
        ProductoVariante,
        on_delete=models.PROTECT,
        related_name='ventas_detalle',
        verbose_name='Variante vendida'
    )
    cantidad = models.IntegerField(
        validators=[MinValueValidator(1)],
        verbose_name='Cantidad'
    )
    precio_unitario = models.DecimalField(
        max_digits=14,
        decimal_places=0,
        verbose_name='Precio unitario al momento de la venta'
    )
    descuento_unitario = models.DecimalField(
        max_digits=14,
        decimal_places=0,
        default=0,
        verbose_name='Descuento por unidad'
    )
    subtotal = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name='Subtotal de la línea'
    )

    class Meta:
        verbose_name = 'Detalle de venta'
        verbose_name_plural = 'Detalles de venta'

    def __str__(self):
        return f'{self.variante} x{self.cantidad} = ${self.subtotal}'

    def save(self, *args, **kwargs):
        # Calcular subtotal de la línea automáticamente
        self.subtotal = (self.precio_unitario - self.descuento_unitario) * self.cantidad
        super().save(*args, **kwargs)


class Devolucion(models.Model):
    """
    Cabecera de una devolución. Puede ser total o parcial de una venta.
    Al confirmar, se aumenta el stock de las variantes devueltas.
    """
    ESTADO_CHOICES = [
        ('PENDIENTE', 'Pendiente'),
        ('PROCESADA', 'Procesada'),
        ('RECHAZADA', 'Rechazada'),
    ]

    venta = models.ForeignKey(
        Venta,
        on_delete=models.PROTECT,
        related_name='devoluciones',
        verbose_name='Venta original'
    )
    fecha = models.DateTimeField(
        default=timezone.now,
        verbose_name='Fecha de devolución'
    )
    motivo = models.TextField(
        verbose_name='Motivo de devolución',
        help_text='Ej: Producto defectuoso, cliente no conforme, error de cobro'
    )
    total_devuelto = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        verbose_name='Total devuelto al cliente'
    )
    estado = models.CharField(
        max_length=20,
        choices=ESTADO_CHOICES,
        default='PROCESADA',
        verbose_name='Estado'
    )
    metodo_reembolso = models.CharField(
        max_length=20,
        choices=Venta.METODO_PAGO_CHOICES,
        default='EFECTIVO',
        verbose_name='Método de reembolso'
    )
    observaciones = models.TextField(
        blank=True,
        default='',
        verbose_name='Observaciones internas'
    )
    usuario = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name='Usuario que procesó la devolución'
    )
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Devolución'
        verbose_name_plural = 'Devoluciones'
        ordering = ['-fecha']

    def __str__(self):
        return f'Devolución de {self.venta} — ${self.total_devuelto}'


class DevolucionDetalle(models.Model):
    """
    Detalle de qué productos/cantidades se devuelven en una devolución.
    """
    devolucion = models.ForeignKey(
        Devolucion,
        on_delete=models.CASCADE,
        related_name='detalles',
        verbose_name='Devolución'
    )
    venta_detalle = models.ForeignKey(
        VentaDetalle,
        on_delete=models.PROTECT,
        related_name='devoluciones_detalle',
        verbose_name='Línea de venta original'
    )
    cantidad_devuelta = models.IntegerField(
        validators=[MinValueValidator(1)],
        verbose_name='Cantidad devuelta'
    )
    subtotal_devuelto = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name='Monto devuelto por esta línea'
    )

    class Meta:
        verbose_name = 'Detalle de devolución'
        verbose_name_plural = 'Detalles de devolución'

    def __str__(self):
        return f'{self.venta_detalle.variante} x{self.cantidad_devuelta} devueltos'

    def save(self, *args, **kwargs):
        # Calcular subtotal devuelto: precio original * cantidad devuelta
        self.subtotal_devuelto = self.venta_detalle.precio_unitario * self.cantidad_devuelta
        super().save(*args, **kwargs)
