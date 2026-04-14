"""
ViewSets del módulo Inventario.
Cada ViewSet expone el CRUD estándar + acciones personalizadas (@action).
"""
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction
import threading
from datetime import datetime, timezone as dt_timezone

from .models import Producto, ProductoVariante, CodigoBarras, Stock, MovimientoStock
from .serializers import (
    ProductoListSerializer, ProductoDetailSerializer, ProductoWriteSerializer,
    ProductoVarianteListSerializer, ProductoVarianteWriteSerializer,
    CodigoBarrasSerializer, CodigoBarrasCreateSerializer,
    StockSerializer, StockUpdateSerializer,
    MovimientoStockSerializer, AjusteStockSerializer,
    BusquedaCodigoBarrasSerializer,
)
from .services import StockService


# ════════════════════════════════════════════════════════════════════════
# SCAN BRIDGE — Celular escanea → PC recibe automáticamente
# ════════════════════════════════════════════════════════════════════════
# Almacenamiento en memoria (local, sin BD, ideal para 1 servidor LAN)
_bridge_lock = threading.Lock()
_bridge_queue = []      # lista de dicts {id, codigo, tipo, timestamp, leido}
_bridge_counter = 0     # ID incremental para detectar nuevos scans


class ScanBridgeView(APIView):
    """
    Bridge celular → PC para el POS.

    POST /api/inventario/scan-bridge/
        Body: { "codigo": "7790001234567", "tipo": "EAN13" }
        → Almacena el código escaneado desde el celular.

    GET  /api/inventario/scan-bridge/?desde_id=N
        → Devuelve los códigos nuevos desde el ID N.
        → El PC hace polling cada 500ms con el último ID recibido.

    DELETE /api/inventario/scan-bridge/
        → Limpia la cola (útil al cerrar sesión).
    """
    MAX_QUEUE = 50  # Máximo de scans en memoria

    def post(self, request):
        global _bridge_counter
        codigo = request.data.get('codigo', '').strip()
        tipo   = request.data.get('tipo', 'DESCONOCIDO')

        if not codigo:
            return Response({'error': 'Se requiere "codigo".'}, status=status.HTTP_400_BAD_REQUEST)

        with _bridge_lock:
            _bridge_counter += 1
            _bridge_queue.append({
                'id':        _bridge_counter,
                'codigo':    codigo,
                'tipo':      tipo,
                'timestamp': datetime.now(dt_timezone.utc).isoformat(),
                'leido':     False,
            })
            # Mantener solo los últimos MAX_QUEUE
            if len(_bridge_queue) > self.MAX_QUEUE:
                _bridge_queue.pop(0)

        return Response({
            'ok':        True,
            'scan_id':   _bridge_counter,
            'codigo':    codigo,
            'mensaje':   f'Código "{codigo}" enviado al POS.',
        })

    def get(self, request):
        desde_id = int(request.query_params.get('desde_id', 0))

        with _bridge_lock:
            nuevos = [s for s in _bridge_queue if s['id'] > desde_id]
            # Marcar como leídos
            for s in _bridge_queue:
                if s['id'] > desde_id:
                    s['leido'] = True

        return Response({
            'scans':       nuevos,
            'ultimo_id':   _bridge_queue[-1]['id'] if _bridge_queue else 0,
            'total_queue': len(_bridge_queue),
        })

    def delete(self, request):
        global _bridge_counter
        with _bridge_lock:
            _bridge_queue.clear()
            _bridge_counter = 0
        return Response({'ok': True, 'mensaje': 'Cola de scans limpiada.'})




class ProductoViewSet(viewsets.ModelViewSet):
    """
    CRUD de productos.
    
    GET    /api/inventario/productos/          → lista
    POST   /api/inventario/productos/          → crear
    GET    /api/inventario/productos/{id}/     → detalle con variantes
    PUT    /api/inventario/productos/{id}/     → actualizar
    DELETE /api/inventario/productos/{id}/     → eliminar (soft: desactiva)
    """
    queryset = Producto.objects.prefetch_related('variantes').all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['activo', 'categoria']
    search_fields = ['nombre', 'descripcion', 'categoria']
    ordering_fields = ['nombre', 'creado_en']
    ordering = ['nombre']

    def get_serializer_class(self):
        if self.action == 'list':
            return ProductoListSerializer
        if self.action in ['create', 'update', 'partial_update']:
            return ProductoWriteSerializer
        return ProductoDetailSerializer  # retrieve

    def destroy(self, request, *args, **kwargs):
        """Soft delete: desactiva en lugar de borrar."""
        producto = self.get_object()
        producto.activo = False
        producto.save(update_fields=['activo', 'actualizado_en'])
        producto.variantes.update(activo=False)
        return Response(
            {'detail': f"Producto '{producto.nombre}' desactivado."},
            status=status.HTTP_200_OK
        )


class ProductoVarianteViewSet(viewsets.ModelViewSet):
    """
    CRUD de variantes.
    
    GET  /api/inventario/variantes/?producto=1   → variantes de un producto
    POST /api/inventario/variantes/              → crear variante (crea stock automáticamente)
    GET  /api/inventario/variantes/{id}/buscar_codigo/?codigo=123 → buscar por código (POS)
    """
    queryset = ProductoVariante.objects.select_related(
        'producto', 'stock'
    ).prefetch_related('codigos_barra').all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['producto', 'activo']
    search_fields = ['nombre', 'sku', 'producto__nombre', 'codigos_barra__codigo']
    ordering_fields = ['nombre', 'precio_venta', 'creado_en']

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return ProductoVarianteWriteSerializer
        return ProductoVarianteListSerializer

    def perform_create(self, serializer):
        """Al crear la variante, crear también su registro de stock."""
        with transaction.atomic():
            variante = serializer.save()
            StockService.obtener_o_crear_stock(variante)

    def destroy(self, request, *args, **kwargs):
        """Soft delete."""
        variante = self.get_object()
        variante.activo = False
        variante.save(update_fields=['activo', 'actualizado_en'])
        return Response(
            {'detail': f"Variante '{variante}' desactivada."},
            status=status.HTTP_200_OK
        )

    @action(detail=False, methods=['get'], url_path='buscar-codigo')
    def buscar_codigo(self, request):
        """
        Busca una variante por código de barras. Endpoint principal del POS.

        Optimizaciones aplicadas:
        - Una sola query SQL con JOIN a través de select_related
        - .only() limita los campos traídos de la BD (evita SELECT *)
        - El índice unique en codigo garantiza búsqueda O(log n)
        - Sin paginación ni serializer complejo: respuesta directa con Response()

        GET /api/inventario/variantes/buscar-codigo/?codigo=7790001234567

        Returns 200: { variante_id, nombre, producto, precio, stock, sku }
        Returns 404: { error: "..." }
        Returns 400: si falta el parámetro
        """
        codigo = request.query_params.get('codigo', '').strip()
        if not codigo:
            return Response(
                {'error': 'Debe proporcionar el parámetro ?codigo='},
                status=status.HTTP_400_BAD_REQUEST
            )

        # ── Query optimizada ────────────────────────────────────────────────
        # 1 sola query SQL que hace JOIN de codigobarras → variante → producto → stock
        # .only() descarta todos los campos que el POS no necesita
        try:
            cb = (
                CodigoBarras.objects
                .select_related(
                    'variante',
                    'variante__producto',
                    'variante__stock',
                )
                .only(
                    # CodigoBarras
                    'codigo',
                    # ProductoVariante
                    'variante__id',
                    'variante__nombre',
                    'variante__sku',
                    'variante__precio_venta',
                    'variante__activo',
                    # Producto
                    'variante__producto__nombre',
                    # Stock
                    'variante__stock__cantidad',
                    'variante__stock__stock_minimo',
                )
                .get(codigo=codigo)
            )
        except CodigoBarras.DoesNotExist:
            return Response(
                {'error': f"Código '{codigo}' no encontrado en el sistema."},
                status=status.HTTP_404_NOT_FOUND
            )

        variante = cb.variante

        # Verificar que la variante esté activa
        if not variante.activo:
            return Response(
                {'error': f"El producto asociado al código '{codigo}' no está disponible."},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            stock_actual  = variante.stock.cantidad
            stock_minimo  = variante.stock.stock_minimo
            bajo_stock    = stock_actual <= stock_minimo
        except Stock.DoesNotExist:
            stock_actual = 0
            stock_minimo = 0
            bajo_stock   = True

        # Respuesta mínima y directa — sin overhead de serializer complejo
        return Response({
            'codigo':          codigo,
            'variante_id':     variante.id,
            'variante_nombre': variante.nombre,
            'producto_nombre': variante.producto.nombre,
            'precio_venta':    str(variante.precio_venta),
            'stock_actual':    stock_actual,
            'stock_minimo':    stock_minimo,
            'bajo_stock':      bajo_stock,
            'sku':             variante.sku,
        })


class CodigoBarrasViewSet(viewsets.ModelViewSet):
    """
    CRUD de códigos de barras.
    
    GET  /api/inventario/codigos-barra/?variante=5   → códigos de una variante
    POST /api/inventario/codigos-barra/              → agregar código
    """
    queryset = CodigoBarras.objects.select_related('variante__producto').all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['variante', 'tipo', 'principal']
    search_fields = ['codigo', 'variante__nombre', 'variante__producto__nombre']

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return CodigoBarrasCreateSerializer
        return CodigoBarrasSerializer


class StockViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Vista de solo lectura del stock actual.
    El stock se modifica únicamente a través de ajustes y ventas.
    
    GET /api/inventario/stock/                    → listado completo
    GET /api/inventario/stock/?bajo_stock=true    → productos con bajo stock (filtro manual)
    GET /api/inventario/stock/{id}/               → stock de una variante
    POST /api/inventario/stock/{id}/ajustar/      → ajuste manual
    """
    queryset = Stock.objects.select_related('variante__producto').all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['variante__producto__categoria']
    search_fields = ['variante__nombre', 'variante__sku', 'variante__producto__nombre']
    ordering_fields = ['cantidad', 'actualizado_en']

    def get_serializer_class(self):
        return StockSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        # Filtro ?bajo_stock=true
        bajo_stock = self.request.query_params.get('bajo_stock', '').lower()
        if bajo_stock in ('true', '1', 'si', 'yes'):
            # Filtra donde cantidad <= stock_minimo usando expresión F
            from django.db.models import F
            qs = qs.filter(cantidad__lte=F('stock_minimo'))
        return qs

    @action(detail=True, methods=['post'], url_path='ajustar')
    def ajustar(self, request, pk=None):
        """
        Ajuste manual de stock.
        
        POST /api/inventario/stock/{id}/ajustar/
        Body: { "variante_id": 1, "tipo": "INGRESO", "cantidad": 10, "motivo": "Compra proveedor" }
        """
        stock = self.get_object()
        serializer = AjusteStockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data

        # Sobreescribir variante_id con la del objeto en la URL para mayor consistencia
        try:
            movimiento = StockService.ajuste_manual(
                variante_id=stock.variante_id,
                tipo=data['tipo'],
                cantidad=data['cantidad'],
                motivo=data.get('motivo', ''),
                usuario=request.user if request.user.is_authenticated else None,
            )
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        mov_serializer = MovimientoStockSerializer(movimiento)
        return Response({
            'detail': 'Ajuste aplicado correctamente.',
            'movimiento': mov_serializer.data,
            'stock_actual': movimiento.stock_posterior,
        }, status=status.HTTP_200_OK)


class MovimientoStockViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Kardex — historial de movimientos de stock.
    Solo lectura: los movimientos se crean automáticamente.
    
    GET /api/inventario/movimientos/                  → todos los movimientos
    GET /api/inventario/movimientos/?variante=3       → movimientos de una variante
    GET /api/inventario/movimientos/?tipo=VENTA       → filtrar por tipo
    """
    queryset = MovimientoStock.objects.select_related(
        'variante__producto', 'usuario', 'referencia_venta'
    ).all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['variante', 'tipo', 'referencia_venta']
    search_fields = ['variante__nombre', 'variante__producto__nombre', 'motivo']
    ordering_fields = ['creado_en']
    ordering = ['-creado_en']
    serializer_class = MovimientoStockSerializer


from rest_framework.views import APIView


class DecodificarImagenView(APIView):
    """
    POST /api/inventario/decodificar-imagen/

    Recibe un frame de cámara como base64 y usa pyzbar (ZBar) para detectar
    códigos de barras EAN-13, EAN-8, UPC, Code128, QR, etc.

    Body: { "imagen": "data:image/jpeg;base64,/9j/4AAQ..." }

    Returns 200: { "codigo": "7790001234567", "tipo": "EAN-13" }
    Returns 404: si no se detecta ningún código
    """

    def post(self, request):
        import base64
        import io

        imagen_b64 = request.data.get('imagen', '')
        if not imagen_b64:
            return Response(
                {'error': 'Se requiere el campo "imagen" como base64.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            from PIL import Image
            from pyzbar.pyzbar import decode as pyzbar_decode

            # Extraer solo la parte base64 (quitar el prefijo data:image/...)
            if ',' in imagen_b64:
                imagen_b64 = imagen_b64.split(',')[1]

            img_bytes = base64.b64decode(imagen_b64)
            img = Image.open(io.BytesIO(img_bytes)).convert('RGB')

            # Decodificar todos los códigos detectados en la imagen
            codigos = pyzbar_decode(img)

            if not codigos:
                return Response(
                    {'error': 'No se detectó ningún código de barras en la imagen.'},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Devolver el primer código detectado
            primer = codigos[0]
            return Response({
                'codigo': primer.data.decode('utf-8'),
                'tipo':   primer.type,                  # 'EAN13', 'CODE128', 'QRCODE', etc.
                'total_detectados': len(codigos),
            })

        except ImportError:
            return Response(
                {'error': 'pyzbar no instalado. Ejecuta: pip install pyzbar'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        except Exception as e:
            return Response(
                {'error': f'Error procesando imagen: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )



# ---- STOCK ALERTAS ------------------------------------------------------------

class StockAlertasView(APIView):
    def get(self, request):
        from django.db.models import F
        stocks_bajo = (
            Stock.objects
            .filter(cantidad__lte=F('stock_minimo'))
            .select_related('variante__producto')
            .order_by('cantidad')
        )
        alertas = [
            {
                'variante_id':     s.variante_id,
                'variante_nombre': str(s.variante),
                'producto':        s.variante.producto.nombre,
                'variante':        s.variante.nombre,
                'cantidad':        s.cantidad,
                'stock_minimo':    s.stock_minimo,
                'critico':         s.cantidad == 0,
            }
            for s in stocks_bajo
        ]
        return Response({'total': len(alertas), 'alertas': alertas})


# ---- FOTO BRIDGE --------------------------------------------------------------
_foto_bridge_lock   = threading.Lock()
_foto_bridge        = {}
_foto_bridge_seq    = 0

class FotoBridgeView(APIView):
    from rest_framework.permissions import AllowAny
    permission_classes = [AllowAny]

    def post(self, request):
        global _foto_bridge_seq
        imagen = request.data.get('imagen', '')
        if not imagen:
            return Response({'error': 'Falta "imagen".'}, status=400)
        with _foto_bridge_lock:
            _foto_bridge_seq += 1
            fid = _foto_bridge_seq
            _foto_bridge[fid] = {'imagen': imagen, 'ts': datetime.now(dt_timezone.utc).isoformat()}
        return Response({'foto_id': fid, 'ok': True})

    def get(self, request, foto_id=None):
        if foto_id is not None:
            with _foto_bridge_lock:
                foto = _foto_bridge.pop(int(foto_id), None)
            if not foto:
                return Response({'error': 'Foto no disponible.'}, status=404)
            return Response({'foto_id': foto_id, **foto})
        with _foto_bridge_lock:
            pendientes = list(_foto_bridge.keys())
        return Response({'pendientes': pendientes, 'total': len(pendientes)})
