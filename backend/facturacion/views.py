"""
Views del módulo Facturación.

Endpoints:
    /api/facturacion/proveedores/          → CRUD Proveedores
    /api/facturacion/facturas/             → Listar/Crear facturas
    /api/facturacion/facturas/{id}/        → Detalle
    /api/facturacion/facturas/{id}/confirmar/ → Confirmar borrador
    /api/facturacion/facturas/{id}/anular/    → Anular factura

    /api/facturacion/ocr/subir/            → Upload + procesamiento
    /api/facturacion/ocr/                  → Historial
    /api/facturacion/ocr/{id}/             → Detalle resultado
    /api/facturacion/ocr/{id}/confirmar/   → Confirmar → crear factura

    /api/reportes/financiero/ganancia/     → Ganancia por periodo
    /api/reportes/financiero/flujo-caja/   → Flujo de caja
    /api/reportes/financiero/margen/       → Margen por producto
    /api/reportes/financiero/top-rentables/ → Productos más rentables
"""
import threading
from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters

from .models import Proveedor, Factura, FacturaDetalle, ProcesamientoDocumento
from .serializers import (
    ProveedorSerializer,
    FacturaSerializer,
    FacturaListSerializer,
    FacturaDetalleSerializer,
    ProcesamientoDocumentoSerializer,
    CrearFacturaCompraSerializer,
    ConfirmarOCRSerializer,
)
from .services import FacturaService
from .ocr_service import OCRService


# ─── Proveedores ──────────────────────────────────────────────────

class ProveedorViewSet(viewsets.ModelViewSet):
    """CRUD de proveedores."""
    queryset = Proveedor.objects.all()
    serializer_class = ProveedorSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['nombre', 'rut']
    ordering_fields = ['nombre', 'creado_en']
    filterset_fields = ['activo']


# ─── Facturas ─────────────────────────────────────────────────────

class FacturaViewSet(viewsets.ModelViewSet):
    """
    CRUD de facturas + acciones: confirmar, anular.
    """
    queryset = (
        Factura.objects
        .select_related('proveedor', 'usuario')
        .prefetch_related('detalles__variante__producto')
        .all()
    )
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['numero_factura']
    ordering_fields = ['fecha', 'total', 'creado_en']
    filterset_fields = ['tipo', 'estado']

    def get_serializer_class(self):
        if self.action == 'list':
            return FacturaListSerializer
        return FacturaSerializer

    def create(self, request, *args, **kwargs):
        """Crear factura de compra manualmente."""
        ser = CrearFacturaCompraSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data

        try:
            factura = FacturaService.crear_factura_compra(
                numero_factura=data['numero_factura'],
                proveedor_id=data.get('proveedor_id'),
                items=data['items'],
                fecha=data.get('fecha'),
                observaciones=data.get('observaciones', ''),
                usuario=request.user if request.user.is_authenticated else None,
                como_borrador=True,
            )
            return Response(
                FacturaSerializer(factura).data,
                status=status.HTTP_201_CREATED
            )
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def confirmar(self, request, pk=None):
        """POST /api/facturacion/facturas/{id}/confirmar/"""
        try:
            factura = FacturaService.confirmar_factura(
                factura_id=pk,
                usuario=request.user if request.user.is_authenticated else None,
            )
            return Response(FacturaSerializer(factura).data)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Factura.DoesNotExist:
            return Response({'error': 'Factura no encontrada'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['post'])
    def anular(self, request, pk=None):
        """POST /api/facturacion/facturas/{id}/anular/"""
        motivo = request.data.get('motivo', '')
        try:
            factura = FacturaService.anular_factura(
                factura_id=pk,
                motivo=motivo,
                usuario=request.user if request.user.is_authenticated else None,
            )
            return Response(FacturaSerializer(factura).data)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Factura.DoesNotExist:
            return Response({'error': 'Factura no encontrada'}, status=status.HTTP_404_NOT_FOUND)


# ─── OCR ──────────────────────────────────────────────────────────

class OCRUploadView(APIView):
    """
    POST /api/facturacion/ocr/subir/
    Sube un documento y lanza procesamiento OCR.
    
    El procesamiento OCR se ejecuta en un hilo separado para no bloquear
    la respuesta HTTP. En producción se recomendaría Celery + Redis.
    """
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        archivo = request.FILES.get('archivo')
        if not archivo:
            return Response(
                {'error': 'No se recibió archivo. Envíe un campo "archivo".'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validar archivo
        es_valido, error, tipo_archivo = OCRService.validar_archivo(archivo)
        if not es_valido:
            return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)

        # Crear registro
        proc = ProcesamientoDocumento.objects.create(
            archivo=archivo,
            nombre_archivo=archivo.name,
            tipo_archivo=tipo_archivo,
            tamano_bytes=archivo.size,
            estado='PENDIENTE',
            usuario=request.user if request.user.is_authenticated else None,
        )

        # Procesar en hilo separado (lightweight async sin Celery)
        def _procesar():
            try:
                ocr = OCRService()
                ocr.procesar_documento(proc.pk)
            except Exception:
                import logging
                logging.getLogger(__name__).exception(f'Error OCR async #{proc.pk}')

        thread = threading.Thread(target=_procesar, daemon=True)
        thread.start()

        return Response(
            {
                'id': proc.pk,
                'estado': proc.estado,
                'mensaje': 'Documento recibido. Procesamiento OCR iniciado.',
            },
            status=status.HTTP_202_ACCEPTED
        )


class OCRListView(APIView):
    """GET /api/facturacion/ocr/ — historial de procesamientos."""

    def get(self, request):
        qs = ProcesamientoDocumento.objects.all()

        # Filtro por estado
        estado = request.query_params.get('estado')
        if estado:
            qs = qs.filter(estado=estado)

        # Paginación simple
        page_size = int(request.query_params.get('page_size', 20))
        page = int(request.query_params.get('page', 1))
        offset = (page - 1) * page_size

        total = qs.count()
        items = qs[offset:offset + page_size]

        return Response({
            'total': total,
            'page': page,
            'page_size': page_size,
            'results': ProcesamientoDocumentoSerializer(items, many=True).data,
        })


class OCRDetalleView(APIView):
    """GET /api/facturacion/ocr/{id}/ — resultado de procesamiento."""

    def get(self, request, pk):
        try:
            proc = ProcesamientoDocumento.objects.get(pk=pk)
        except ProcesamientoDocumento.DoesNotExist:
            return Response({'error': 'No encontrado'}, status=status.HTTP_404_NOT_FOUND)

        return Response(ProcesamientoDocumentoSerializer(proc).data)


class OCRConfirmarView(APIView):
    """
    POST /api/facturacion/ocr/{id}/confirmar/

    El usuario envía los productos revisados/corregidos.
    Para productos NUEVOS, envía los datos del nuevo producto.
    Crea factura + productos nuevos + aplica stock.
    """

    def post(self, request, pk):
        try:
            proc = ProcesamientoDocumento.objects.get(pk=pk)
        except ProcesamientoDocumento.DoesNotExist:
            return Response({'error': 'No encontrado'}, status=status.HTTP_404_NOT_FOUND)

        if proc.estado not in ('PROCESADO', 'ERROR'):
            return Response(
                {'error': f'El documento está en estado "{proc.get_estado_display()}" y no puede confirmarse.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        ser = ConfirmarOCRSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data

        try:
            factura = FacturaService.crear_factura_desde_ocr(
                procesamiento_id=pk,
                productos_confirmados=data['productos'],
                numero_factura=data['numero_factura'],
                proveedor_id=data.get('proveedor_id'),
                usuario=request.user if request.user.is_authenticated else None,
            )
            return Response({
                'factura': FacturaSerializer(factura).data,
                'mensaje': 'Factura creada y stock actualizado correctamente.',
            })
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response(
                {'error': f'Error al confirmar: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ─── Reportes Financieros ─────────────────────────────────────────

class ReporteGananciaView(APIView):
    """
    GET /api/reportes/financiero/ganancia/?periodo=diario|semanal|mensual
    
    ganancia = SUM((precio_venta - precio_costo) * cantidad) de ventas completadas
    Descuenta devoluciones procesadas.
    """

    def get(self, request):
        from django.db.models import Sum, F, IntegerField
        from django.db.models.functions import TruncDay, TruncWeek, TruncMonth, Coalesce
        from django.utils import timezone
        from datetime import timedelta
        from ventas.models import Venta, VentaDetalle, DevolucionDetalle

        periodo = request.query_params.get('periodo', 'diario')
        dias = int(request.query_params.get('dias', 30))
        fecha_desde = timezone.now() - timedelta(days=dias)

        trunc_fn = {
            'mensual': TruncMonth,
            'semanal': TruncWeek,
        }.get(periodo, TruncDay)

        # Ganancia bruta de ventas
        ganancia_ventas = list(
            VentaDetalle.objects
            .filter(
                venta__estado='COMPLETADA',
                venta__fecha__gte=fecha_desde,
            )
            .annotate(periodo=trunc_fn('venta__fecha'))
            .values('periodo')
            .annotate(
                ganancia=Coalesce(
                    Sum(
                        (F('precio_unitario') - F('variante__precio_costo')) * F('cantidad'),
                        output_field=IntegerField()
                    ),
                    0,
                ),
                ingresos=Coalesce(Sum('subtotal'), 0),
                unidades=Coalesce(Sum('cantidad'), 0),
            )
            .order_by('periodo')
        )

        # Devoluciones (restar)
        devoluciones = list(
            DevolucionDetalle.objects
            .filter(
                devolucion__estado='PROCESADA',
                devolucion__fecha__gte=fecha_desde,
            )
            .annotate(periodo=trunc_fn('devolucion__fecha'))
            .values('periodo')
            .annotate(
                total_devuelto=Coalesce(Sum('subtotal_devuelto'), 0),
            )
            .order_by('periodo')
        )

        # Merge
        dev_map = {d['periodo']: d['total_devuelto'] for d in devoluciones}

        resultado = []
        ganancia_total = 0
        for item in ganancia_ventas:
            dev = dev_map.get(item['periodo'], 0)
            ganancia_neta = item['ganancia'] - int(dev)
            ganancia_total += ganancia_neta
            resultado.append({
                'periodo': item['periodo'],
                'ingresos': int(item['ingresos']),
                'ganancia_bruta': int(item['ganancia']),
                'devoluciones': int(dev),
                'ganancia_neta': ganancia_neta,
                'unidades': item['unidades'],
            })

        return Response({
            'periodo_tipo': periodo,
            'dias': dias,
            'ganancia_total': ganancia_total,
            'detalle': resultado,
        })


class ReporteFlujoCajaView(APIView):
    """
    GET /api/reportes/financiero/flujo-caja/?dias=30

    Muestra ingresos (ventas) vs egresos (compras) por periodo.
    """

    def get(self, request):
        from django.db.models import Sum
        from django.db.models.functions import TruncDay, TruncWeek, TruncMonth, Coalesce
        from django.utils import timezone
        from datetime import timedelta
        from ventas.models import Venta

        periodo = request.query_params.get('periodo', 'diario')
        dias = int(request.query_params.get('dias', 30))
        fecha_desde = timezone.now() - timedelta(days=dias)

        trunc_fn = {
            'mensual': TruncMonth,
            'semanal': TruncWeek,
        }.get(periodo, TruncDay)

        # Ingresos: ventas completadas
        ingresos = list(
            Venta.objects
            .filter(estado='COMPLETADA', fecha__gte=fecha_desde)
            .annotate(periodo=trunc_fn('fecha'))
            .values('periodo')
            .annotate(total=Coalesce(Sum('total'), 0))
            .order_by('periodo')
        )

        # Egresos: facturas de compra confirmadas
        egresos = list(
            Factura.objects
            .filter(tipo='COMPRA', estado='CONFIRMADA', fecha__gte=fecha_desde)
            .annotate(periodo=trunc_fn('fecha'))
            .values('periodo')
            .annotate(total=Coalesce(Sum('total'), 0))
            .order_by('periodo')
        )

        # Merge periodos
        periodos_set = set()
        ing_map = {}
        egr_map = {}
        for i in ingresos:
            periodos_set.add(i['periodo'])
            ing_map[i['periodo']] = int(i['total'])
        for e in egresos:
            periodos_set.add(e['periodo'])
            egr_map[e['periodo']] = int(e['total'])

        resultado = []
        for p in sorted(periodos_set):
            ing = ing_map.get(p, 0)
            egr = egr_map.get(p, 0)
            resultado.append({
                'periodo': p,
                'ingresos': ing,
                'egresos': egr,
                'flujo_neto': ing - egr,
            })

        total_ingresos = sum(r['ingresos'] for r in resultado)
        total_egresos = sum(r['egresos'] for r in resultado)

        return Response({
            'periodo_tipo': periodo,
            'dias': dias,
            'total_ingresos': total_ingresos,
            'total_egresos': total_egresos,
            'flujo_neto': total_ingresos - total_egresos,
            'detalle': resultado,
        })


class ReporteMargenProductoView(APIView):
    """
    GET /api/reportes/financiero/margen/?dias=30&limite=20

    Margen por producto = (precio_venta_promedio - precio_costo) / precio_venta_promedio * 100
    """

    def get(self, request):
        from django.db.models import Sum, Avg, F, IntegerField
        from django.db.models.functions import Coalesce
        from django.utils import timezone
        from datetime import timedelta
        from ventas.models import VentaDetalle

        dias = int(request.query_params.get('dias', 30))
        limite = int(request.query_params.get('limite', 20))
        fecha_desde = timezone.now() - timedelta(days=dias)

        datos = list(
            VentaDetalle.objects
            .filter(
                venta__estado='COMPLETADA',
                venta__fecha__gte=fecha_desde,
            )
            .values(
                'variante__id',
                'variante__nombre',
                'variante__producto__nombre',
                'variante__sku',
                'variante__precio_costo',
            )
            .annotate(
                unidades_vendidas=Coalesce(Sum('cantidad'), 0),
                ingresos_totales=Coalesce(Sum('subtotal'), 0),
                precio_venta_promedio=Coalesce(Avg('precio_unitario'), 0),
                ganancia_total=Coalesce(
                    Sum(
                        (F('precio_unitario') - F('variante__precio_costo')) * F('cantidad'),
                        output_field=IntegerField()
                    ),
                    0,
                ),
            )
            .order_by('-ganancia_total')[:limite]
        )

        resultado = []
        for item in datos:
            precio_venta_prom = float(item['precio_venta_promedio'] or 0)
            precio_costo = float(item['variante__precio_costo'] or 0)
            margen_pct = 0
            if precio_venta_prom > 0:
                margen_pct = round((precio_venta_prom - precio_costo) / precio_venta_prom * 100, 1)

            resultado.append({
                'variante_id': item['variante__id'],
                'producto_nombre': item['variante__producto__nombre'],
                'variante_nombre': item['variante__nombre'],
                'sku': item['variante__sku'],
                'precio_costo': int(precio_costo),
                'precio_venta_promedio': int(precio_venta_prom),
                'margen_porcentaje': margen_pct,
                'unidades_vendidas': item['unidades_vendidas'],
                'ganancia_total': int(item['ganancia_total']),
                'ingresos_totales': int(item['ingresos_totales']),
            })

        return Response({
            'dias': dias,
            'productos': resultado,
        })


class ReporteTopRentablesView(APIView):
    """
    GET /api/reportes/financiero/top-rentables/?dias=30&limite=10

    Productos con mayor ganancia absoluta en el periodo.
    """

    def get(self, request):
        from django.db.models import Sum, F, IntegerField
        from django.db.models.functions import Coalesce
        from django.utils import timezone
        from datetime import timedelta
        from ventas.models import VentaDetalle

        dias = int(request.query_params.get('dias', 30))
        limite = int(request.query_params.get('limite', 10))
        fecha_desde = timezone.now() - timedelta(days=dias)

        datos = list(
            VentaDetalle.objects
            .filter(
                venta__estado='COMPLETADA',
                venta__fecha__gte=fecha_desde,
            )
            .values(
                'variante__id',
                'variante__nombre',
                'variante__producto__nombre',
                'variante__sku',
            )
            .annotate(
                unidades=Coalesce(Sum('cantidad'), 0),
                ingresos=Coalesce(Sum('subtotal'), 0),
                ganancia=Coalesce(
                    Sum(
                        (F('precio_unitario') - F('variante__precio_costo')) * F('cantidad'),
                        output_field=IntegerField()
                    ),
                    0,
                ),
            )
            .order_by('-ganancia')[:limite]
        )

        resultado = [
            {
                'variante_id': d['variante__id'],
                'producto_nombre': d['variante__producto__nombre'],
                'variante_nombre': d['variante__nombre'],
                'sku': d['variante__sku'],
                'unidades': d['unidades'],
                'ingresos': int(d['ingresos']),
                'ganancia': int(d['ganancia']),
            }
            for d in datos
        ]

        return Response({
            'dias': dias,
            'productos': resultado,
        })
