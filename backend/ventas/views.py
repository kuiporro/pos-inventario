"""
ViewSets del módulo Ventas.
"""
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from .models import Venta, Devolucion
from .serializers import (
    VentaListSerializer, VentaDetailSerializer, VentaCreateSerializer,
    DevolucionListSerializer, DevolucionDetailSerializer, DevolucionCreateSerializer,
)
from .services import VentaService, DevolucionService


class VentaViewSet(viewsets.ModelViewSet):
    """
    Gestión de ventas.
    
    GET    /api/ventas/ventas/          → lista de ventas
    POST   /api/ventas/ventas/          → crear nueva venta (POS)
    GET    /api/ventas/ventas/{id}/     → detalle con ítems
    POST   /api/ventas/ventas/{id}/anular/   → anular venta
    """
    queryset = Venta.objects.prefetch_related('detalles__variante__producto').all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['estado', 'metodo_pago']
    search_fields = ['numero_comprobante']
    ordering_fields = ['fecha', 'total']
    ordering = ['-fecha']

    def get_queryset(self):
        qs = super().get_queryset()
        fecha_inicio = self.request.query_params.get('fecha_inicio')
        fecha_fin    = self.request.query_params.get('fecha_fin')
        if fecha_inicio:
            qs = qs.filter(fecha__date__gte=fecha_inicio)
        if fecha_fin:
            qs = qs.filter(fecha__date__lte=fecha_fin)
        return qs

    # No permitir PUT/PATCH/DELETE directos en ventas (son inmutables)
    http_method_names = ['get', 'post', 'head', 'options']

    def get_serializer_class(self):
        if self.action == 'list':
            return VentaListSerializer
        if self.action == 'create':
            return VentaCreateSerializer
        return VentaDetailSerializer

    def create(self, request, *args, **kwargs):
        """
        Crear venta desde el POS.
        
        Body:
        {
            "items": [
                {"variante_id": 1, "cantidad": 2},
                {"variante_id": 3, "cantidad": 1, "descuento_unitario": "5.00"}
            ],
            "metodo_pago": "EFECTIVO",
            "descuento_global": "0",
            "observaciones": ""
        }
        """
        serializer = VentaCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            venta = VentaService.crear_venta(
                items=data['items'],
                metodo_pago=data['metodo_pago'],
                descuento_global=data.get('descuento_global', 0),
                observaciones=data.get('observaciones', ''),
                pagos=data.get('pagos', []),
                usuario=request.user if request.user.is_authenticated else None,
            )
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        response_data = VentaDetailSerializer(venta).data
        return Response(response_data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='anular')
    def anular(self, request, pk=None):
        """
        Anular una venta y reponer stock.
        
        POST /api/ventas/ventas/{id}/anular/
        Body: { "motivo": "Error en cobro" }
        """
        venta = self.get_object()
        motivo = request.data.get('motivo', '')

        try:
            venta = VentaService.anular_venta(
                venta=venta,
                motivo=motivo,
                usuario=request.user if request.user.is_authenticated else None,
            )
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {'detail': f'Venta {venta.numero_comprobante} anulada correctamente.'},
            status=status.HTTP_200_OK
        )

    @action(detail=False, methods=['get'], url_path='hoy')
    def ventas_hoy(self, request):
        """
        GET /api/ventas/ventas/hoy/  → ventas del día actual
        """
        from django.utils import timezone
        hoy = timezone.localdate()
        qs = self.get_queryset().filter(fecha__date=hoy)
        serializer = VentaListSerializer(qs, many=True)
        total = sum(v.total for v in qs)
        return Response({
            'fecha': str(hoy),
            'cantidad': qs.count(),
            'total': total,
            'ventas': serializer.data,
        })


class DevolucionViewSet(viewsets.ModelViewSet):
    """
    Gestión de devoluciones.
    
    GET    /api/ventas/devoluciones/             → lista
    POST   /api/ventas/devoluciones/             → procesar devolución
    GET    /api/ventas/devoluciones/{id}/        → detalle
    """
    queryset = Devolucion.objects.prefetch_related(
        'detalles__venta_detalle__variante__producto'
    ).select_related('venta').all()
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['venta', 'estado', 'metodo_reembolso']
    ordering_fields = ['fecha']
    ordering = ['-fecha']
    http_method_names = ['get', 'post', 'head', 'options']

    def get_serializer_class(self):
        if self.action == 'list':
            return DevolucionListSerializer
        if self.action == 'create':
            return DevolucionCreateSerializer
        return DevolucionDetailSerializer

    def create(self, request, *args, **kwargs):
        """
        Procesar una devolución.
        
        Body:
        {
            "venta_id": 1,
            "motivo": "Producto defectuoso",
            "metodo_reembolso": "EFECTIVO",
            "items": [
                {"venta_detalle_id": 2, "cantidad_devuelta": 1}
            ]
        }
        """
        serializer = DevolucionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            devolucion = DevolucionService.crear_devolucion(
                venta_id=data['venta_id'],
                items=data['items'],
                motivo=data['motivo'],
                metodo_reembolso=data.get('metodo_reembolso', 'EFECTIVO'),
                observaciones=data.get('observaciones', ''),
                usuario=request.user if request.user.is_authenticated else None,
            )
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        response_data = DevolucionDetailSerializer(devolucion).data
        return Response(response_data, status=status.HTTP_201_CREATED)
