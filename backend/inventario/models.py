"""
Modelos del módulo Inventario.

Entidades:
    - Producto
    - ProductoVariante
    - CodigoBarras
    - Stock
    - MovimientoStock
"""
from django.db import models
from django.core.validators import MinValueValidator
from django.utils import timezone


class Producto(models.Model):
    """
    Producto base. No contiene stock ni precio, eso va en la variante.
    Ejemplo: 'Vela aromática', 'Cuadro decorativo', 'Jarrón'
    """
    nombre = models.CharField(max_length=200, verbose_name='Nombre')
    descripcion = models.TextField(blank=True, default='', verbose_name='Descripción')
    categoria = models.CharField(max_length=100, blank=True, default='', verbose_name='Categoría')
    imagen = models.ImageField(
        upload_to='productos/',
        blank=True,
        null=True,
        verbose_name='Imagen'
    )
    activo = models.BooleanField(default=True, verbose_name='Activo')
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Producto'
        verbose_name_plural = 'Productos'
        ordering = ['nombre']

    def __str__(self):
        return self.nombre


class ProductoVariante(models.Model):
    """
    Variante de un producto. Ej: Vela aromática → color Rojo, color Azul.
    El stock, precio y códigos de barra se asocian a la VARIANTE, no al producto.
    """
    producto = models.ForeignKey(
        Producto,
        on_delete=models.CASCADE,
        related_name='variantes',
        verbose_name='Producto'
    )
    nombre = models.CharField(
        max_length=100,
        verbose_name='Nombre de variante',
        help_text='Ej: Rojo, Grande, Vainilla'
    )
    sku = models.CharField(
        max_length=100,
        unique=True,
        blank=True,
        verbose_name='SKU interno',
        help_text='Se auto-genera si se deja vacío'
    )
    precio_venta = models.DecimalField(
        max_digits=12,
        decimal_places=0,
        validators=[MinValueValidator(0)],
        verbose_name='Precio de venta (CLP)'
    )
    precio_costo = models.DecimalField(
        max_digits=12,
        decimal_places=0,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name='Precio de costo (CLP)'
    )
    activo = models.BooleanField(default=True, verbose_name='Activo')
    foto = models.ImageField(
        upload_to='variantes/',
        blank=True,
        null=True,
        verbose_name='Foto del producto'
    )
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Variante de producto'
        verbose_name_plural = 'Variantes de producto'
        ordering = ['producto__nombre', 'nombre']
        unique_together = [['producto', 'nombre']]

    def __str__(self):
        return f'{self.producto.nombre} — {self.nombre}'

    def save(self, *args, **kwargs):
        # Auto-generar SKU si no se proporcionó
        if not self.sku:
            # Guardamos primero para obtener el ID
            super().save(*args, **kwargs)
            self.sku = f'SKU-{self.pk:06d}'
            # Actualizamos solo el campo SKU
            ProductoVariante.objects.filter(pk=self.pk).update(sku=self.sku)
        else:
            super().save(*args, **kwargs)


class CodigoBarras(models.Model):
    """
    Código de barras asociado a una variante.
    Una variante puede tener múltiples códigos (ej: código interno + código de fabricante).
    Cada código debe ser ÚNICO en todo el sistema.
    """
    variante = models.ForeignKey(
        ProductoVariante,
        on_delete=models.CASCADE,
        related_name='codigos_barra',
        verbose_name='Variante'
    )
    codigo = models.CharField(
        max_length=100,
        unique=True,
        verbose_name='Código de barras',
        help_text='EAN-13, EAN-8, UPC-A, QR, o código personalizado'
    )
    tipo = models.CharField(
        max_length=50,
        default='EAN-13',
        choices=[
            ('EAN-13', 'EAN-13'),
            ('EAN-8', 'EAN-8'),
            ('UPC-A', 'UPC-A'),
            ('QR', 'QR Code'),
            ('INTERNO', 'Código Interno'),
            ('OTRO', 'Otro'),
        ],
        verbose_name='Tipo de código'
    )
    principal = models.BooleanField(
        default=False,
        verbose_name='Es principal',
        help_text='Si hay múltiples códigos, indica cuál es el principal'
    )
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Código de barras'
        verbose_name_plural = 'Códigos de barras'
        ordering = ['-principal', 'codigo']
        # El campo `codigo` ya tiene unique=True (que implica un índice B-tree).
        # Índice adicional para búsquedas por variante+principal simultáneas.
        indexes = [
            models.Index(fields=['codigo'],               name='idx_cb_codigo'),
            models.Index(fields=['variante', 'principal'],name='idx_cb_variante_pri'),
        ]

    def __str__(self):
        return f'{self.codigo} → {self.variante}'

    def save(self, *args, **kwargs):
        # Si se marca como principal, desmarcar los otros de esa variante
        if self.principal:
            CodigoBarras.objects.filter(
                variante=self.variante,
                principal=True
            ).exclude(pk=self.pk).update(principal=False)
        super().save(*args, **kwargs)


class Stock(models.Model):
    """
    Stock actual de una variante. Tabla 1-a-1 con ProductoVariante.
    La cantidad nunca baja de 0 (validación en la lógica de negocio).
    """
    variante = models.OneToOneField(
        ProductoVariante,
        on_delete=models.CASCADE,
        related_name='stock',
        verbose_name='Variante'
    )
    cantidad = models.IntegerField(
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name='Cantidad en stock'
    )
    stock_minimo = models.IntegerField(
        default=5,
        validators=[MinValueValidator(0)],
        verbose_name='Stock mínimo (alerta)',
        help_text='Se emitirá alerta cuando el stock baje de este valor'
    )
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Stock'
        verbose_name_plural = 'Stocks'

    def __str__(self):
        return f'Stock de {self.variante}: {self.cantidad} unidades'

    @property
    def bajo_stock(self):
        """Retorna True si el stock está en o por debajo del mínimo."""
        return self.cantidad <= self.stock_minimo


class MovimientoStock(models.Model):
    """
    Historial de todos los movimientos de stock (Kardex).
    Cada operación que afecte el stock genera un registro aquí.
    """
    TIPO_CHOICES = [
        ('INGRESO', 'Ingreso de mercadería'),
        ('VENTA', 'Venta'),
        ('DEVOLUCION_CLIENTE', 'Devolución de cliente'),
        ('DEVOLUCION_PROVEEDOR', 'Devolución a proveedor'),
        ('AJUSTE_POSITIVO', 'Ajuste positivo (inventario)'),
        ('AJUSTE_NEGATIVO', 'Ajuste negativo (inventario)'),
        ('INICIAL', 'Carga inicial'),
    ]

    variante = models.ForeignKey(
        ProductoVariante,
        on_delete=models.CASCADE,
        related_name='movimientos',
        verbose_name='Variante'
    )
    tipo = models.CharField(
        max_length=30,
        choices=TIPO_CHOICES,
        verbose_name='Tipo de movimiento'
    )
    cantidad = models.IntegerField(
        verbose_name='Cantidad',
        help_text='Positivo = entrada, Negativo = salida'
    )
    stock_anterior = models.IntegerField(verbose_name='Stock anterior')
    stock_posterior = models.IntegerField(verbose_name='Stock posterior')
    motivo = models.TextField(
        blank=True,
        default='',
        verbose_name='Motivo / Observación'
    )
    # Referencia opcional a la venta o devolución que generó el movimiento
    referencia_venta = models.ForeignKey(
        'ventas.Venta',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='movimientos_stock',
        verbose_name='Venta relacionada'
    )
    referencia_devolucion = models.ForeignKey(
        'ventas.Devolucion',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='movimientos_stock',
        verbose_name='Devolución relacionada'
    )
    usuario = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name='Usuario que realizó el movimiento'
    )
    creado_en = models.DateTimeField(default=timezone.now, verbose_name='Fecha y hora')

    class Meta:
        verbose_name = 'Movimiento de stock'
        verbose_name_plural = 'Movimientos de stock'
        ordering = ['-creado_en']
        indexes = [
            models.Index(fields=['variante', '-creado_en'], name='idx_mov_variante_fecha'),
            models.Index(fields=['tipo', '-creado_en'],    name='idx_mov_tipo_fecha'),
            models.Index(fields=['-creado_en'],            name='idx_mov_fecha'),
        ]

    def __str__(self):
        signo = '+' if self.cantidad > 0 else ''
        return f'[{self.get_tipo_display()}] {self.variante} {signo}{self.cantidad} ({self.creado_en:%d/%m/%Y %H:%M})'
