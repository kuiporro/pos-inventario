"""
Servicios de inventario.
Contiene la lógica de negocio para movimientos de stock.
Las vistas (ViewSets) llaman a estos servicios, NUNCA manipulan el stock directamente.
"""
from django.db import transaction
from django.utils import timezone
from .models import ProductoVariante, Stock, MovimientoStock


class StockService:
    """
    Servicio central para todas las operaciones que afectan el stock.
    Garantiza atomicidad y registro de movimientos (kardex).
    """

    @staticmethod
    @transaction.atomic
    def obtener_o_crear_stock(variante: ProductoVariante) -> Stock:
        """
        Obtiene o crea el registro de stock para una variante.
        Se llama automáticamente al crear una variante.
        """
        stock, created = Stock.objects.get_or_create(
            variante=variante,
            defaults={'cantidad': 0, 'stock_minimo': 5}
        )
        return stock

    @staticmethod
    @transaction.atomic
    def aplicar_movimiento(
        variante: ProductoVariante,
        tipo: str,
        cantidad: int,
        motivo: str = '',
        usuario=None,
        referencia_venta=None,
        referencia_devolucion=None,
    ) -> MovimientoStock:
        """
        Método central para TODOS los movimientos de stock.
        
        Args:
            variante: La variante afectada
            tipo: Tipo de movimiento (INGRESO, VENTA, DEVOLUCION_CLIENTE, etc.)
            cantidad: Siempre positivo; el tipo determina si suma o resta
            motivo: Descripción opcional del movimiento
            usuario: User que ejecuta la acción
            referencia_venta: Venta relacionada (si aplica)
            referencia_devolucion: Devolución relacionada (si aplica)
        
        Returns:
            MovimientoStock creado
        
        Raises:
            ValueError: Si el stock resultante sería negativo
        """
        # Tipos que RESTAN stock
        TIPOS_SALIDA = {'VENTA', 'DEVOLUCION_PROVEEDOR', 'AJUSTE_NEGATIVO'}
        # Tipos que SUMAN stock
        TIPOS_ENTRADA = {'INGRESO', 'DEVOLUCION_CLIENTE', 'AJUSTE_POSITIVO', 'INICIAL'}

        # Obtener stock con lock para evitar condiciones de carrera
        stock = Stock.objects.select_for_update().get(variante=variante)
        stock_anterior = stock.cantidad

        if tipo in TIPOS_SALIDA:
            cantidad_ajuste = -abs(cantidad)
        elif tipo in TIPOS_ENTRADA:
            cantidad_ajuste = abs(cantidad)
        else:
            raise ValueError(f"Tipo de movimiento desconocido: '{tipo}'")

        stock_nuevo = stock_anterior + cantidad_ajuste

        if stock_nuevo < 0:
            raise ValueError(
                f"Stock insuficiente para '{variante}'. "
                f"Actual: {stock_anterior}, solicitado: {abs(cantidad_ajuste)}"
            )

        # Actualizar stock
        stock.cantidad = stock_nuevo
        stock.save(update_fields=['cantidad', 'actualizado_en'])

        # Registrar movimiento (kardex)
        movimiento = MovimientoStock.objects.create(
            variante=variante,
            tipo=tipo,
            cantidad=cantidad_ajuste,
            stock_anterior=stock_anterior,
            stock_posterior=stock_nuevo,
            motivo=motivo,
            usuario=usuario,
            referencia_venta=referencia_venta,
            referencia_devolucion=referencia_devolucion,
            creado_en=timezone.now(),
        )

        return movimiento

    @staticmethod
    @transaction.atomic
    def ajuste_manual(variante_id: int, tipo: str, cantidad: int, motivo: str, usuario=None):
        """
        Punto de entrada para ajustes manuales de stock desde la API.
        """
        variante = ProductoVariante.objects.select_related('stock').get(pk=variante_id)
        movimiento = StockService.aplicar_movimiento(
            variante=variante,
            tipo=tipo,
            cantidad=cantidad,
            motivo=motivo,
            usuario=usuario,
        )
        return movimiento
