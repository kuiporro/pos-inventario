"""
Servicios del módulo Ventas.
Toda la lógica transaccional de ventas y devoluciones vive aquí.
"""
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from .models import Venta, VentaDetalle, Devolucion, DevolucionDetalle
from inventario.models import ProductoVariante
from inventario.services import StockService


class VentaService:
    """
    Servicio para procesar ventas desde el POS.
    Garantiza atomicidad total: si algo falla, revierte TODO.
    """

    @staticmethod
    @transaction.atomic
    def crear_venta(items: list, metodo_pago: str, descuento_global: Decimal = Decimal('0'),
                    observaciones: str = '', pagos: list = None, usuario=None) -> Venta:
        """
        Crea una venta completa desde el POS.

        Flujo:
        1. Genera número de comprobante
        2. Crea cabecera de Venta
        3. Por cada ítem: crea VentaDetalle + descuenta stock + registra movimiento
        4. Actualiza totales en la cabecera

        Args:
            items: Lista de dicts con variante_id, cantidad, precio_unitario?, descuento_unitario?
            metodo_pago: Clave del método de pago
            descuento_global: Descuento global adicional sobre el total
            observaciones: Nota libre
            usuario: Usuario que hace la venta

        Returns:
            Venta creada y confirmada
        """
        numero_comprobante = Venta.generar_numero_comprobante()

        # Crear cabecera de venta (sin totales aún)
        venta = Venta.objects.create(
            numero_comprobante=numero_comprobante,
            fecha=timezone.now(),
            metodo_pago=metodo_pago,
            descuento=descuento_global,
            observaciones=observaciones,
            pagos=pagos or [],
            usuario=usuario,
            estado='COMPLETADA',
        )

        subtotal_total = Decimal('0')

        for item in items:
            variante = ProductoVariante.objects.select_related(
                'producto', 'stock'
            ).get(pk=item['variante_id'])

            # Usar precio del producto si no se envía uno explícito
            precio_unitario = item.get('precio_unitario') or variante.precio_venta
            precio_unitario = Decimal(str(precio_unitario))
            descuento_unitario = Decimal(str(item.get('descuento_unitario', '0')))
            cantidad = item['cantidad']

            # Crear detalle de venta
            detalle = VentaDetalle.objects.create(
                venta=venta,
                variante=variante,
                cantidad=cantidad,
                precio_unitario=precio_unitario,
                descuento_unitario=descuento_unitario,
            )
            subtotal_total += detalle.subtotal

            # Descontar stock y registrar movimiento
            StockService.aplicar_movimiento(
                variante=variante,
                tipo='VENTA',
                cantidad=cantidad,
                motivo=f'Venta #{numero_comprobante}',
                usuario=usuario,
                referencia_venta=venta,
            )

        # Calcular y guardar totales finales
        total = subtotal_total - descuento_global
        if total < 0:
            total = Decimal('0')

        venta.subtotal = subtotal_total
        venta.total = total
        venta.save(update_fields=['subtotal', 'total', 'actualizado_en'])

        return venta

    @staticmethod
    @transaction.atomic
    def anular_venta(venta: Venta, motivo: str = '', usuario=None) -> Venta:
        """
        Anula una venta y repone el stock de todos los ítems.
        Solo se puede anular si no tiene devoluciones procesadas.
        """
        if venta.estado == 'ANULADA':
            raise ValueError("La venta ya está anulada.")
        if venta.devoluciones.filter(estado='PROCESADA').exists():
            raise ValueError(
                "No se puede anular: la venta tiene devoluciones procesadas. "
                "Use devolución total en su lugar."
            )

        # Reponer stock de cada ítem
        for detalle in venta.detalles.select_related('variante', 'variante__stock').all():
            StockService.aplicar_movimiento(
                variante=detalle.variante,
                tipo='AJUSTE_POSITIVO',
                cantidad=detalle.cantidad,
                motivo=f'Anulación venta #{venta.numero_comprobante}. {motivo}',
                usuario=usuario,
                referencia_venta=venta,
            )

        venta.estado = 'ANULADA'
        venta.observaciones += f'\n[ANULADA] {motivo}'.strip()
        venta.save(update_fields=['estado', 'observaciones', 'actualizado_en'])
        return venta


class DevolucionService:
    """
    Servicio para procesar devoluciones de clientes.
    """

    @staticmethod
    @transaction.atomic
    def crear_devolucion(venta_id: int, items: list, motivo: str,
                         metodo_reembolso: str = 'EFECTIVO',
                         observaciones: str = '', usuario=None) -> Devolucion:
        """
        Procesa una devolución parcial o total de una venta.

        Flujo:
        1. Valida la venta y los ítems
        2. Crea cabecera de Devolución
        3. Por cada ítem: crea DevolucionDetalle + aumenta stock + registra movimiento
        4. Actualiza estado de la venta original

        Args:
            venta_id: ID de la venta original
            items: Lista de dicts con venta_detalle_id y cantidad_devuelta
            motivo: Razón de la devolución
            metodo_reembolso: Cómo se reintegra el dinero
            observaciones: Nota interna
            usuario: Usuario que procesa

        Returns:
            Devolucion creada
        """
        venta = Venta.objects.prefetch_related('detalles__variante__stock').get(pk=venta_id)

        devolucion = Devolucion.objects.create(
            venta=venta,
            fecha=timezone.now(),
            motivo=motivo,
            metodo_reembolso=metodo_reembolso,
            observaciones=observaciones,
            usuario=usuario,
            estado='PROCESADA',
        )

        total_devuelto = Decimal('0')

        for item in items:
            detalle_venta = VentaDetalle.objects.select_related(
                'variante', 'variante__stock'
            ).get(pk=item['venta_detalle_id'])

            cantidad_devuelta = item['cantidad_devuelta']

            # Crear detalle de devolución
            dev_detalle = DevolucionDetalle.objects.create(
                devolucion=devolucion,
                venta_detalle=detalle_venta,
                cantidad_devuelta=cantidad_devuelta,
            )
            total_devuelto += dev_detalle.subtotal_devuelto

            # Reponer stock
            StockService.aplicar_movimiento(
                variante=detalle_venta.variante,
                tipo='DEVOLUCION_CLIENTE',
                cantidad=cantidad_devuelta,
                motivo=f'Devolución de venta #{venta.numero_comprobante}. {motivo}',
                usuario=usuario,
                referencia_devolucion=devolucion,
            )

        # Guardar total devuelto
        devolucion.total_devuelto = total_devuelto
        devolucion.save(update_fields=['total_devuelto'])

        # Actualizar estado de la venta original
        DevolucionService._actualizar_estado_venta(venta)

        return devolucion

    @staticmethod
    def _actualizar_estado_venta(venta: Venta):
        """
        Calcula si la venta quedó en devolución parcial o total.
        """
        total_cantidad_vendida = sum(d.cantidad for d in venta.detalles.all())
        total_cantidad_devuelta = sum(
            dd.cantidad_devuelta
            for dev in venta.devoluciones.filter(estado='PROCESADA')
            for dd in dev.detalles.all()
        )

        if total_cantidad_devuelta == 0:
            return
        elif total_cantidad_devuelta >= total_cantidad_vendida:
            venta.estado = 'DEVOLUCION_TOTAL'
        else:
            venta.estado = 'DEVOLUCION_PARCIAL'

        venta.save(update_fields=['estado', 'actualizado_en'])
