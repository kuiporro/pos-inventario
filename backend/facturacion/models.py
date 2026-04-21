"""
Modelos del módulo Facturación.

Entidades:
    - Proveedor
    - Factura
    - FacturaDetalle
    - ProcesamientoDocumento
"""
from django.db import models
from django.core.validators import MinValueValidator
from django.utils import timezone


class Proveedor(models.Model):
    """
    Proveedor de mercadería. Se asocia a facturas de compra.
    """
    nombre = models.CharField(max_length=200, verbose_name='Nombre / Razón social')
    rut = models.CharField(
        max_length=20,
        blank=True,
        default='',
        verbose_name='RUT',
        help_text='Ej: 76.123.456-7'
    )
    direccion = models.CharField(max_length=300, blank=True, default='', verbose_name='Dirección')
    telefono = models.CharField(max_length=30, blank=True, default='', verbose_name='Teléfono')
    email = models.EmailField(blank=True, default='', verbose_name='Email')
    contacto = models.CharField(
        max_length=200,
        blank=True,
        default='',
        verbose_name='Persona de contacto'
    )
    activo = models.BooleanField(default=True, verbose_name='Activo')
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Proveedor'
        verbose_name_plural = 'Proveedores'
        ordering = ['nombre']

    def __str__(self):
        return f'{self.nombre} ({self.rut})' if self.rut else self.nombre


class Factura(models.Model):
    """
    Factura de compra o venta.
    - COMPRA: productos ingresados al inventario desde un proveedor.
    - VENTA: factura emitida vinculada a una Venta POS existente.
    """
    TIPO_CHOICES = [
        ('COMPRA', 'Factura de compra'),
        ('VENTA', 'Factura de venta'),
    ]
    ESTADO_CHOICES = [
        ('BORRADOR', 'Borrador'),
        ('CONFIRMADA', 'Confirmada'),
        ('ANULADA', 'Anulada'),
    ]

    numero_factura = models.CharField(
        max_length=50,
        unique=True,
        verbose_name='Número de factura'
    )
    fecha = models.DateTimeField(
        default=timezone.now,
        verbose_name='Fecha de factura'
    )
    tipo = models.CharField(
        max_length=10,
        choices=TIPO_CHOICES,
        verbose_name='Tipo'
    )
    proveedor = models.ForeignKey(
        Proveedor,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='facturas',
        verbose_name='Proveedor',
        help_text='Solo para facturas de compra'
    )
    # Referencia opcional a venta POS (solo para facturas de venta)
    referencia_venta = models.ForeignKey(
        'ventas.Venta',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='facturas',
        verbose_name='Venta POS vinculada'
    )

    # --- Montos (CLP, sin decimales) ---
    subtotal = models.IntegerField(
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name='Subtotal (neto)'
    )
    impuesto = models.IntegerField(
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name='IVA 19%'
    )
    total = models.IntegerField(
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name='Total'
    )

    estado = models.CharField(
        max_length=15,
        choices=ESTADO_CHOICES,
        default='BORRADOR',
        verbose_name='Estado'
    )
    observaciones = models.TextField(
        blank=True,
        default='',
        verbose_name='Observaciones'
    )
    usuario = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name='Usuario'
    )
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Factura'
        verbose_name_plural = 'Facturas'
        ordering = ['-fecha']
        indexes = [
            models.Index(fields=['fecha', 'tipo', 'estado'], name='idx_fact_fecha_tipo_est'),
            models.Index(fields=['tipo', '-fecha'], name='idx_fact_tipo_fecha'),
            models.Index(fields=['estado'], name='idx_fact_estado'),
            models.Index(fields=['numero_factura'], name='idx_fact_numero'),
        ]

    def __str__(self):
        return f'Factura {self.numero_factura} ({self.get_tipo_display()}) — ${self.total:,}'


class FacturaDetalle(models.Model):
    """
    Línea de detalle de una factura.

    - variante: FK a ProductoVariante, nullable. Se llena al confirmar matching
      con producto existente o crear producto nuevo.
    - descripcion_raw / codigo_barras_raw: texto original del OCR para auditoría.
    - precio_costo_snapshot: captura del costo al momento de la factura (no cambia
      si se actualiza el precio del producto después).
    """
    factura = models.ForeignKey(
        Factura,
        on_delete=models.CASCADE,
        related_name='detalles',
        verbose_name='Factura'
    )
    variante = models.ForeignKey(
        'inventario.ProductoVariante',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='facturas_detalle',
        verbose_name='Variante vinculada'
    )

    # --- Datos crudos del OCR / ingreso manual ---
    descripcion_raw = models.CharField(
        max_length=500,
        blank=True,
        default='',
        verbose_name='Descripción (texto original)'
    )
    codigo_barras_raw = models.CharField(
        max_length=100,
        blank=True,
        default='',
        verbose_name='Código de barras (texto original)'
    )

    cantidad = models.IntegerField(
        default=1,
        validators=[MinValueValidator(1)],
        verbose_name='Cantidad'
    )
    precio_unitario = models.IntegerField(
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name='Precio unitario'
    )
    subtotal = models.IntegerField(
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name='Subtotal línea'
    )
    precio_costo_snapshot = models.IntegerField(
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name='Precio de costo (snapshot)',
        help_text='Costo al momento de la factura, no se actualiza retroactivamente'
    )

    class Meta:
        verbose_name = 'Detalle de factura'
        verbose_name_plural = 'Detalles de factura'
        indexes = [
            models.Index(fields=['variante'], name='idx_factdet_variante'),
        ]

    def __str__(self):
        desc = self.descripcion_raw or (str(self.variante) if self.variante else '—')
        return f'{desc} x{self.cantidad} = ${self.subtotal:,}'

    def save(self, *args, **kwargs):
        self.subtotal = self.precio_unitario * self.cantidad
        super().save(*args, **kwargs)


class ProcesamientoDocumento(models.Model):
    """
    Registro de un documento procesado por OCR.
    Almacena el archivo original, texto extraído y datos estructurados.
    """
    ESTADO_CHOICES = [
        ('PENDIENTE', 'Pendiente de procesar'),
        ('PROCESANDO', 'Procesando OCR'),
        ('PROCESADO', 'Procesado — pendiente de revisión'),
        ('CONFIRMADO', 'Confirmado por usuario'),
        ('ERROR', 'Error en procesamiento'),
    ]
    TIPO_ARCHIVO_CHOICES = [
        ('PDF', 'PDF'),
        ('JPG', 'JPEG'),
        ('PNG', 'PNG'),
    ]

    archivo = models.FileField(
        upload_to='ocr_documentos/%Y/%m/',
        verbose_name='Archivo original'
    )
    nombre_archivo = models.CharField(
        max_length=255,
        blank=True,
        default='',
        verbose_name='Nombre del archivo'
    )
    tipo_archivo = models.CharField(
        max_length=5,
        choices=TIPO_ARCHIVO_CHOICES,
        default='PDF',
        verbose_name='Tipo de archivo'
    )
    tamano_bytes = models.IntegerField(
        default=0,
        verbose_name='Tamaño (bytes)'
    )

    estado = models.CharField(
        max_length=15,
        choices=ESTADO_CHOICES,
        default='PENDIENTE',
        verbose_name='Estado'
    )

    # --- Resultado OCR ---
    texto_raw = models.TextField(
        blank=True,
        default='',
        verbose_name='Texto extraído (OCR crudo)'
    )
    datos_extraidos = models.JSONField(
        default=dict,
        blank=True,
        verbose_name='Datos estructurados extraídos',
        help_text='JSON: {numero_factura, proveedor, productos: [{descripcion, codigo, cantidad, precio, confianza, match_tipo, variante_id}]}'
    )
    confianza_global = models.IntegerField(
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name='Confianza global (%)',
        help_text='0-100, promedio de confianza de todos los campos'
    )

    # --- Vinculación ---
    factura_generada = models.OneToOneField(
        Factura,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='documento_origen',
        verbose_name='Factura generada'
    )

    # --- Errores ---
    errores = models.JSONField(
        default=list,
        blank=True,
        verbose_name='Errores de procesamiento',
        help_text='Lista de errores: [{campo, mensaje, tipo}]'
    )

    usuario = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name='Usuario que subió'
    )
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Procesamiento de documento'
        verbose_name_plural = 'Procesamientos de documentos'
        ordering = ['-creado_en']
        indexes = [
            models.Index(fields=['estado', 'usuario', '-creado_en'], name='idx_procdoc_est_usr_fch'),
            models.Index(fields=['-creado_en'], name='idx_procdoc_fecha'),
        ]

    def __str__(self):
        return f'[{self.get_estado_display()}] {self.nombre_archivo} ({self.creado_en:%d/%m/%Y %H:%M})'
