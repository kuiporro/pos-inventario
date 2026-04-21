"""
Servicios del módulo Facturación.

FacturaService: lógica transaccional para crear, confirmar y anular facturas.
Toda operación de stock se delega a inventario.services.StockService.

Reglas:
    - confirmar_factura() es IDEMPOTENTE (select_for_update + validación de estado)
    - anular_factura() revierte stock con movimientos inversos
    - Montos en IntegerField (CLP)
"""
import logging
from django.db import transaction
from django.utils import timezone

from .models import Factura, FacturaDetalle, Proveedor
from inventario.models import Producto, ProductoVariante, CodigoBarras, Stock
from inventario.services import StockService

logger = logging.getLogger(__name__)

# IVA Chile
IVA_RATE = 0.19


class FacturaService:
    """
    Servicio central para operaciones de facturación.
    """

    @staticmethod
    @transaction.atomic
    def crear_factura_compra(
        numero_factura: str,
        proveedor_id: int,
        items: list,
        fecha=None,
        observaciones: str = '',
        usuario=None,
        como_borrador: bool = True,
    ) -> Factura:
        """
        Crea una factura de compra con sus detalles.

        Args:
            numero_factura: Número único de la factura
            proveedor_id: ID del proveedor
            items: Lista de dicts: [{descripcion, codigo_barras, cantidad, precio_unitario, variante_id?}]
            fecha: Fecha de la factura (default: ahora)
            observaciones: Nota libre
            usuario: User que crea
            como_borrador: Si True, estado=BORRADOR (requiere confirmar después)

        Returns:
            Factura creada
        """
        proveedor = Proveedor.objects.get(pk=proveedor_id) if proveedor_id else None

        factura = Factura.objects.create(
            numero_factura=numero_factura,
            fecha=fecha or timezone.now(),
            tipo='COMPRA',
            proveedor=proveedor,
            estado='BORRADOR' if como_borrador else 'CONFIRMADA',
            observaciones=observaciones,
            usuario=usuario,
        )

        subtotal = 0
        for item in items:
            variante_id = item.get('variante_id')
            variante = None
            precio_costo = item.get('precio_unitario', 0)

            if variante_id:
                variante = ProductoVariante.objects.get(pk=variante_id)

            detalle = FacturaDetalle.objects.create(
                factura=factura,
                variante=variante,
                descripcion_raw=item.get('descripcion', ''),
                codigo_barras_raw=item.get('codigo_barras', ''),
                cantidad=item.get('cantidad', 1),
                precio_unitario=precio_costo,
                precio_costo_snapshot=precio_costo,
            )
            subtotal += detalle.subtotal

        # Calcular IVA y total
        impuesto = int(round(subtotal * IVA_RATE))
        total = subtotal + impuesto

        factura.subtotal = subtotal
        factura.impuesto = impuesto
        factura.total = total
        factura.save(update_fields=['subtotal', 'impuesto', 'total'])

        # Si se crea directamente como confirmada, aplicar stock
        if not como_borrador:
            FacturaService._aplicar_stock_compra(factura, usuario)

        logger.info(f'Factura compra {numero_factura} creada (estado={factura.estado})')
        return factura

    @staticmethod
    @transaction.atomic
    def confirmar_factura(factura_id: int, usuario=None) -> Factura:
        """
        Confirma una factura en estado BORRADOR.

        IDEMPOTENTE: si ya está confirmada, retorna sin error.
        Usa select_for_update para evitar condiciones de carrera.

        Al confirmar:
        - COMPRA: agrega stock + registra movimientos
        - VENTA: solo cambia estado (la venta POS ya descontó stock)
        """
        factura = (
            Factura.objects
            .select_for_update()
            .get(pk=factura_id)
        )

        # Idempotencia: ya confirmada → no hacer nada
        if factura.estado == 'CONFIRMADA':
            logger.info(f'Factura {factura.numero_factura} ya estaba confirmada (idempotente)')
            return factura

        if factura.estado == 'ANULADA':
            raise ValueError('No se puede confirmar una factura anulada.')

        if factura.estado != 'BORRADOR':
            raise ValueError(f'Estado inesperado: {factura.estado}')

        # Aplicar efectos según tipo
        if factura.tipo == 'COMPRA':
            FacturaService._aplicar_stock_compra(factura, usuario)

        factura.estado = 'CONFIRMADA'
        factura.save(update_fields=['estado', 'actualizado_en'])

        logger.info(f'Factura {factura.numero_factura} confirmada')
        return factura

    @staticmethod
    @transaction.atomic
    def anular_factura(factura_id: int, motivo: str = '', usuario=None) -> Factura:
        """
        Anula una factura. Si estaba confirmada (COMPRA), revierte stock
        con movimientos inversos.
        """
        factura = (
            Factura.objects
            .select_for_update()
            .get(pk=factura_id)
        )

        if factura.estado == 'ANULADA':
            logger.info(f'Factura {factura.numero_factura} ya estaba anulada (idempotente)')
            return factura

        # Si era COMPRA CONFIRMADA → revertir stock
        if factura.tipo == 'COMPRA' and factura.estado == 'CONFIRMADA':
            FacturaService._revertir_stock_compra(factura, motivo, usuario)

        factura.estado = 'ANULADA'
        if motivo:
            factura.observaciones += f'\n[ANULADA] {motivo}'
        factura.save(update_fields=['estado', 'observaciones', 'actualizado_en'])

        logger.info(f'Factura {factura.numero_factura} anulada')
        return factura

    @staticmethod
    def _aplicar_stock_compra(factura: Factura, usuario=None):
        """
        Para cada detalle de factura de compra que tenga variante vinculada,
        aplica ingreso de stock y registra movimiento.
        """
        detalles = factura.detalles.select_related(
            'variante', 'variante__stock'
        ).filter(variante__isnull=False)

        for detalle in detalles:
            StockService.aplicar_movimiento(
                variante=detalle.variante,
                tipo='INGRESO',
                cantidad=detalle.cantidad,
                motivo=f'Factura compra #{factura.numero_factura}',
                usuario=usuario,
            )

            # Actualizar precio de costo en la variante
            if detalle.precio_costo_snapshot > 0:
                detalle.variante.precio_costo = detalle.precio_costo_snapshot
                detalle.variante.save(update_fields=['precio_costo', 'actualizado_en'])

    @staticmethod
    def _revertir_stock_compra(factura: Factura, motivo: str, usuario=None):
        """
        Revierte stock con movimientos inversos (AJUSTE_NEGATIVO).
        NO recalcula — usa la cantidad exacta de cada detalle.
        """
        detalles = factura.detalles.select_related(
            'variante', 'variante__stock'
        ).filter(variante__isnull=False)

        for detalle in detalles:
            try:
                StockService.aplicar_movimiento(
                    variante=detalle.variante,
                    tipo='AJUSTE_NEGATIVO',
                    cantidad=detalle.cantidad,
                    motivo=f'Anulación factura #{factura.numero_factura}. {motivo}',
                    usuario=usuario,
                )
            except ValueError as e:
                logger.warning(
                    f'No se pudo revertir stock para {detalle.variante}: {e}. '
                    f'El stock actual puede ser menor que la cantidad de la factura.'
                )

    @staticmethod
    @transaction.atomic
    def crear_factura_desde_ocr(
        procesamiento_id: int,
        productos_confirmados: list,
        numero_factura: str,
        proveedor_id: int = None,
        usuario=None,
    ) -> Factura:
        """
        Crea una factura a partir de datos OCR confirmados por el usuario.

        productos_confirmados: Lista de dicts:
        [{
            variante_id: int | None,
            es_nuevo: bool,
            cantidad: int,
            precio_unitario: int,
            descripcion: str,
            codigo_barras: str,
            # Si es_nuevo=True, datos del producto nuevo:
            nuevo_producto_nombre: str,
            nuevo_variante_nombre: str,
            nuevo_precio_venta: int,
            nuevo_categoria: str,
        }]
        """
        from .models import ProcesamientoDocumento

        proc = ProcesamientoDocumento.objects.get(pk=procesamiento_id)

        if proc.estado == 'CONFIRMADO':
            raise ValueError('Este documento ya fue confirmado.')

        items_factura = []

        for prod in productos_confirmados:
            variante_id = prod.get('variante_id')

            # CASO B: Producto nuevo → crear
            if prod.get('es_nuevo') and not variante_id:
                variante = FacturaService._crear_producto_nuevo(
                    nombre=prod.get('nuevo_producto_nombre', prod.get('descripcion', 'Producto OCR')),
                    variante_nombre=prod.get('nuevo_variante_nombre', 'Única'),
                    precio_venta=prod.get('nuevo_precio_venta', 0),
                    precio_costo=prod.get('precio_unitario', 0),
                    categoria=prod.get('nuevo_categoria', ''),
                    codigo_barras=prod.get('codigo_barras', ''),
                )
                variante_id = variante.pk

            items_factura.append({
                'variante_id': variante_id,
                'descripcion': prod.get('descripcion', ''),
                'codigo_barras': prod.get('codigo_barras', ''),
                'cantidad': prod.get('cantidad', 1),
                'precio_unitario': prod.get('precio_unitario', 0),
            })

        # Crear factura como BORRADOR primero
        factura = FacturaService.crear_factura_compra(
            numero_factura=numero_factura,
            proveedor_id=proveedor_id,
            items=items_factura,
            observaciones=f'Generada desde OCR (documento #{proc.pk})',
            usuario=usuario,
            como_borrador=True,
        )

        # Vincular procesamiento con factura
        proc.factura_generada = factura
        proc.estado = 'CONFIRMADO'
        proc.save(update_fields=['factura_generada', 'estado', 'actualizado_en'])

        # Confirmar factura → aplica stock
        FacturaService.confirmar_factura(factura.pk, usuario=usuario)

        return factura

    @staticmethod
    @transaction.atomic
    def _crear_producto_nuevo(
        nombre: str,
        variante_nombre: str,
        precio_venta: int,
        precio_costo: int,
        categoria: str = '',
        codigo_barras: str = '',
    ) -> ProductoVariante:
        """
        Crea un producto nuevo con variante, stock y código de barras opcionales.
        Se llama cuando OCR detecta un producto que NO existe en la DB.
        """
        producto = Producto.objects.create(
            nombre=nombre,
            categoria=categoria,
        )

        variante = ProductoVariante.objects.create(
            producto=producto,
            nombre=variante_nombre,
            precio_venta=precio_venta,
            precio_costo=precio_costo,
        )

        # Crear stock inicial
        StockService.obtener_o_crear_stock(variante)

        # Crear código de barras si viene
        if codigo_barras:
            # Verificar que no exista ya
            if not CodigoBarras.objects.filter(codigo=codigo_barras).exists():
                CodigoBarras.objects.create(
                    variante=variante,
                    codigo=codigo_barras,
                    tipo='OTRO',
                    principal=True,
                )

        logger.info(f'Producto nuevo creado desde OCR: {producto.nombre} — {variante.nombre}')
        return variante
