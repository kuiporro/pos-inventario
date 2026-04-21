"""
Servicio OCR para procesamiento de facturas.

Diseño desacoplado: la extracción de texto se delega a un OCREngine
reemplazable (Tesseract local o API cloud).

Flujo:
    1. procesar_documento() → orquestador
    2. Extrae texto (imagen o PDF)
    3. Parsea texto → detecta tabla de productos
    4. Matching contra DB (código de barras → SKU → nombre)
    5. Retorna datos estructurados con scores de confianza
"""
import re
import logging
from abc import ABC, abstractmethod
from pathlib import Path

from django.conf import settings
from django.db.models import Q

from inventario.models import ProductoVariante, CodigoBarras
from .models import ProcesamientoDocumento

logger = logging.getLogger(__name__)

# Tamaño máximo de archivo: 20 MB
MAX_FILE_SIZE = 20 * 1024 * 1024
ALLOWED_MIME_TYPES = {
    'application/pdf': 'PDF',
    'image/jpeg': 'JPG',
    'image/jpg': 'JPG',
    'image/png': 'PNG',
}


# ─── OCR Engine (diseño desacoplado) ─────────────────────────────

class BaseOCREngine(ABC):
    """Interfaz abstracta para engines de OCR."""

    @abstractmethod
    def extraer_texto_imagen(self, image_path: str) -> str:
        """Extrae texto de una imagen."""
        pass

    @abstractmethod
    def extraer_texto_pdf(self, pdf_path: str) -> str:
        """Extrae texto de un PDF (todas las páginas)."""
        pass


class TesseractEngine(BaseOCREngine):
    """
    Engine OCR usando Tesseract (local, gratuito).
    Requiere: pip install pytesseract Pillow pdf2image
    Requiere: tesseract-ocr instalado en el sistema
    """

    def __init__(self):
        try:
            import pytesseract
            # Configurar path de Tesseract en Windows
            tesseract_path = getattr(settings, 'TESSERACT_CMD', None)
            if tesseract_path:
                pytesseract.pytesseract.tesseract_cmd = tesseract_path
            self._pytesseract = pytesseract
        except ImportError:
            logger.error('pytesseract no instalado. Ejecutar: pip install pytesseract')
            raise

    def extraer_texto_imagen(self, image_path: str) -> str:
        """Extrae texto de imagen usando Tesseract."""
        from PIL import Image, ImageEnhance, ImageFilter

        img = Image.open(image_path)

        # Pre-procesamiento para mejorar OCR
        # 1. Convertir a escala de grises
        img = img.convert('L')
        # 2. Aumentar contraste
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(2.0)
        # 3. Binarización (umbral)
        img = img.point(lambda x: 0 if x < 140 else 255, '1')
        # 4. Leve desenfoque para reducir ruido
        img = img.filter(ImageFilter.MedianFilter(size=3))

        # Configuración Tesseract optimizada para facturas
        config = '--oem 3 --psm 6 -l spa'

        texto = self._pytesseract.image_to_string(img, config=config)
        return texto.strip()

    def extraer_texto_pdf(self, pdf_path: str) -> str:
        """
        Extrae texto de PDF convirtiendo cada página a imagen.
        Maneja PDFs multipágina.
        """
        try:
            from pdf2image import convert_from_path

            poppler_path = getattr(settings, 'POPPLER_PATH', None)
            kwargs = {}
            if poppler_path:
                kwargs['poppler_path'] = poppler_path

            imagenes = convert_from_path(pdf_path, dpi=300, **kwargs)
        except ImportError:
            logger.error('pdf2image no instalado. Ejecutar: pip install pdf2image')
            raise
        except Exception as e:
            logger.error(f'Error convirtiendo PDF a imágenes: {e}')
            raise

        textos = []
        for i, img in enumerate(imagenes):
            # Guardar imagen temporal
            tmp_path = Path(pdf_path).parent / f'_ocr_page_{i}.png'
            img.save(str(tmp_path), 'PNG')
            try:
                texto_pagina = self.extraer_texto_imagen(str(tmp_path))
                textos.append(texto_pagina)
            finally:
                # Limpiar archivo temporal
                try:
                    tmp_path.unlink()
                except OSError:
                    pass

        return '\n--- PÁGINA ---\n'.join(textos)


# ─── Parser de texto OCR ─────────────────────────────────────────

class OCRParser:
    """
    Parsea texto extraído por OCR y estructura datos de factura.
    Tolerante a errores: usa heurísticas y regex.
    """

    # Regex para detectar número de factura
    RE_NUM_FACTURA = re.compile(
        r'(?:factura|boleta|n[°ºo]|folio|invoice)\s*[:#]?\s*(\d[\d\-\.]+)',
        re.IGNORECASE
    )

    # Regex para detectar RUT
    RE_RUT = re.compile(
        r'(?:rut|r\.u\.t\.?)\s*[:#]?\s*([\d]{1,2}\.?[\d]{3}\.?[\d]{3}\-?[\dkK])',
        re.IGNORECASE
    )

    # Regex para precios en formato chileno: $1.234, 1234, 1.234
    RE_PRECIO = re.compile(r'\$?\s*([\d]{1,3}(?:\.[\d]{3})*(?:,\d{1,2})?|\d+)')

    # Regex para códigos de barras (8-13 dígitos consecutivos)
    RE_BARCODE = re.compile(r'\b(\d{8,13})\b')

    # Regex para detectar líneas que parecen items de factura
    # Patrón: [cantidad] [descripción] [precio_unitario] [total]
    RE_LINEA_ITEM = re.compile(
        r'^\s*(\d+)\s+'           # cantidad
        r'(.+?)\s+'               # descripción
        r'\$?\s*([\d,.]+)\s*'     # precio unitario
        r'(?:\$?\s*([\d,.]+))?',  # total (opcional)
        re.MULTILINE
    )

    @staticmethod
    def parsear(texto_raw: str) -> dict:
        """
        Parsea texto OCR y retorna datos estructurados.

        Returns:
            {
                'numero_factura': str,
                'proveedor_nombre': str,
                'proveedor_rut': str,
                'productos': [
                    {
                        'descripcion': str,
                        'codigo_barras': str,
                        'cantidad': int,
                        'precio_unitario': int,
                        'confianza': int,  # 0-100
                    }
                ],
                'subtotal_detectado': int,
                'total_detectado': int,
                'confianza_global': int,
            }
        """
        resultado = {
            'numero_factura': '',
            'proveedor_nombre': '',
            'proveedor_rut': '',
            'productos': [],
            'subtotal_detectado': 0,
            'total_detectado': 0,
            'confianza_global': 0,
        }

        if not texto_raw:
            return resultado

        lineas = texto_raw.split('\n')

        # 1. Detectar número de factura
        m = OCRParser.RE_NUM_FACTURA.search(texto_raw)
        if m:
            resultado['numero_factura'] = m.group(1).strip()

        # 2. Detectar RUT proveedor
        m = OCRParser.RE_RUT.search(texto_raw)
        if m:
            resultado['proveedor_rut'] = m.group(1).strip()

        # 3. Detectar nombre proveedor (primeras líneas, heurística)
        for linea in lineas[:8]:
            linea_limpia = linea.strip()
            # Líneas en mayúsculas al inicio suelen ser nombre empresa
            if (linea_limpia
                and len(linea_limpia) > 5
                and not any(kw in linea_limpia.lower() for kw in
                            ['factura', 'boleta', 'folio', 'rut', 'fecha', 'direc', 'telef', 'fono'])):
                if linea_limpia.isupper() or (len(linea_limpia) > 10 and linea_limpia[0].isupper()):
                    resultado['proveedor_nombre'] = linea_limpia
                    break

        # 4. Detectar productos (líneas tabulares)
        productos = OCRParser._detectar_productos(texto_raw, lineas)
        resultado['productos'] = productos

        # 5. Detectar totales
        resultado['subtotal_detectado'] = OCRParser._detectar_monto(texto_raw, ['subtotal', 'sub total', 'neto'])
        resultado['total_detectado'] = OCRParser._detectar_monto(texto_raw, ['total', 'valor total', 'monto total'])

        # 6. Calcular confianza global
        campos_detectados = sum([
            1 if resultado['numero_factura'] else 0,
            1 if resultado['proveedor_nombre'] or resultado['proveedor_rut'] else 0,
            1 if len(productos) > 0 else 0,
            1 if resultado['total_detectado'] > 0 else 0,
        ])
        resultado['confianza_global'] = int((campos_detectados / 4) * 100)

        return resultado

    @staticmethod
    def _detectar_productos(texto: str, lineas: list) -> list:
        """
        Detecta productos en el texto usando múltiples estrategias.
        """
        productos = []

        # Estrategia 1: Regex para líneas con formato tabular
        matches = OCRParser.RE_LINEA_ITEM.findall(texto)
        for match in matches:
            cantidad_str, descripcion, precio_str, total_str = match
            try:
                cantidad = int(cantidad_str)
                precio = OCRParser._limpiar_precio(precio_str)

                if cantidad > 0 and precio > 0 and len(descripcion.strip()) > 2:
                    # Buscar código de barras en la descripción
                    barcode_match = OCRParser.RE_BARCODE.search(descripcion)
                    codigo = barcode_match.group(1) if barcode_match else ''

                    # Limpiar descripción (quitar código si estaba embebido)
                    desc_limpia = descripcion.strip()
                    if codigo:
                        desc_limpia = desc_limpia.replace(codigo, '').strip()

                    productos.append({
                        'descripcion': desc_limpia,
                        'codigo_barras': codigo,
                        'cantidad': cantidad,
                        'precio_unitario': precio,
                        'confianza': 70,
                    })
            except (ValueError, IndexError):
                continue

        # Estrategia 2: Si no encontró con regex, buscar líneas con precios
        if not productos:
            for linea in lineas:
                linea = linea.strip()
                if not linea or len(linea) < 5:
                    continue

                precios = OCRParser.RE_PRECIO.findall(linea)
                barcodes = OCRParser.RE_BARCODE.findall(linea)

                if precios and len(precios) >= 1:
                    # La línea parece tener un precio
                    precio = OCRParser._limpiar_precio(precios[-1])
                    if precio > 0:
                        # Quitar el precio de la descripción
                        desc = re.sub(r'\$?\s*[\d,.]+\s*$', '', linea).strip()
                        # Quitar cantidad al inicio si existe
                        m_cant = re.match(r'^(\d+)\s+', desc)
                        cantidad = 1
                        if m_cant:
                            cantidad = int(m_cant.group(1))
                            desc = desc[m_cant.end():].strip()

                        if len(desc) > 2:
                            productos.append({
                                'descripcion': desc,
                                'codigo_barras': barcodes[0] if barcodes else '',
                                'cantidad': cantidad,
                                'precio_unitario': precio,
                                'confianza': 40,  # Menor confianza en fallback
                            })

        # Calcular confianza individual
        for prod in productos:
            conf = prod['confianza']
            if prod['codigo_barras']:
                conf = min(conf + 20, 100)
            if prod['cantidad'] > 0 and prod['precio_unitario'] > 0:
                conf = min(conf + 10, 100)
            prod['confianza'] = conf

        return productos

    @staticmethod
    def _detectar_monto(texto: str, keywords: list) -> int:
        """Busca un monto asociado a una keyword (ej: 'total')."""
        for kw in keywords:
            pattern = re.compile(
                rf'{kw}\s*:?\s*\$?\s*([\d,.]+)',
                re.IGNORECASE
            )
            m = pattern.search(texto)
            if m:
                return OCRParser._limpiar_precio(m.group(1))
        return 0

    @staticmethod
    def _limpiar_precio(precio_str: str) -> int:
        """
        Convierte string de precio chileno a entero.
        '1.234' → 1234, '1,234' → 1234, '1234' → 1234
        """
        # Quitar espacios
        precio_str = precio_str.strip()
        # Si tiene coma decimal (ej: 1.234,56), quitar la parte decimal
        if ',' in precio_str and '.' in precio_str:
            precio_str = precio_str.split(',')[0]
        # Quitar puntos (separador de miles en CL)
        precio_str = precio_str.replace('.', '').replace(',', '')
        try:
            return int(precio_str)
        except ValueError:
            return 0


# ─── Matching de productos ────────────────────────────────────────

class ProductMatcher:
    """
    Busca productos en la DB en orden de prioridad:
    1. Código de barras exacto
    2. SKU exacto
    3. Nombre (icontains)
    4. Sin match → NUEVO
    """

    MATCH_EXACT_BARCODE = 'CODIGO_BARRAS'
    MATCH_SKU = 'SKU'
    MATCH_NOMBRE = 'NOMBRE'
    MATCH_NUEVO = 'NUEVO'

    @staticmethod
    def buscar(descripcion: str, codigo_barras: str = '') -> dict:
        """
        Busca un producto en la DB.

        Returns:
            {
                'match_tipo': str,    # CODIGO_BARRAS | SKU | NOMBRE | NUEVO
                'variante_id': int,   # ID si encontrado, None si nuevo
                'variante_info': {...},# Datos de la variante encontrada
                'confianza': int,     # 0-100
            }
        """
        # 1. Búsqueda por código de barras
        if codigo_barras:
            try:
                cb = CodigoBarras.objects.select_related(
                    'variante', 'variante__producto'
                ).get(codigo=codigo_barras)
                return {
                    'match_tipo': ProductMatcher.MATCH_EXACT_BARCODE,
                    'variante_id': cb.variante.pk,
                    'variante_info': {
                        'producto_nombre': cb.variante.producto.nombre,
                        'variante_nombre': cb.variante.nombre,
                        'sku': cb.variante.sku,
                        'precio_venta': int(cb.variante.precio_venta),
                        'precio_costo': int(cb.variante.precio_costo),
                    },
                    'confianza': 95,
                }
            except CodigoBarras.DoesNotExist:
                pass

        # 2. Búsqueda por SKU
        if descripcion:
            try:
                variante = ProductoVariante.objects.select_related(
                    'producto'
                ).get(sku__iexact=descripcion.strip())
                return {
                    'match_tipo': ProductMatcher.MATCH_SKU,
                    'variante_id': variante.pk,
                    'variante_info': {
                        'producto_nombre': variante.producto.nombre,
                        'variante_nombre': variante.nombre,
                        'sku': variante.sku,
                        'precio_venta': int(variante.precio_venta),
                        'precio_costo': int(variante.precio_costo),
                    },
                    'confianza': 85,
                }
            except ProductoVariante.DoesNotExist:
                pass

        # 3. Búsqueda por nombre (fuzzy)
        if descripcion and len(descripcion) > 3:
            # Buscar en nombre de producto o variante
            variantes = ProductoVariante.objects.select_related('producto').filter(
                Q(producto__nombre__icontains=descripcion.strip()) |
                Q(nombre__icontains=descripcion.strip())
            ).filter(activo=True)[:5]

            if variantes.exists():
                v = variantes.first()
                return {
                    'match_tipo': ProductMatcher.MATCH_NOMBRE,
                    'variante_id': v.pk,
                    'variante_info': {
                        'producto_nombre': v.producto.nombre,
                        'variante_nombre': v.nombre,
                        'sku': v.sku,
                        'precio_venta': int(v.precio_venta),
                        'precio_costo': int(v.precio_costo),
                    },
                    'confianza': 55,
                }

        # 4. Sin match → NUEVO
        return {
            'match_tipo': ProductMatcher.MATCH_NUEVO,
            'variante_id': None,
            'variante_info': None,
            'confianza': 0,
        }


# ─── Servicio principal OCR ──────────────────────────────────────

class OCRService:
    """
    Orquestador del proceso OCR completo.
    """

    def __init__(self, engine: BaseOCREngine = None):
        self.engine = engine or TesseractEngine()

    def procesar_documento(self, procesamiento_id: int) -> ProcesamientoDocumento:
        """
        Flujo principal: extrae texto → parsea → matching → guarda resultados.
        """
        proc = ProcesamientoDocumento.objects.get(pk=procesamiento_id)

        try:
            proc.estado = 'PROCESANDO'
            proc.save(update_fields=['estado', 'actualizado_en'])

            # 1. Extraer texto según tipo
            archivo_path = proc.archivo.path

            if proc.tipo_archivo == 'PDF':
                texto_raw = self.engine.extraer_texto_pdf(archivo_path)
            else:
                texto_raw = self.engine.extraer_texto_imagen(archivo_path)

            proc.texto_raw = texto_raw

            # 2. Parsear texto
            datos = OCRParser.parsear(texto_raw)

            # 3. Matching de productos contra DB
            for producto in datos.get('productos', []):
                match = ProductMatcher.buscar(
                    descripcion=producto.get('descripcion', ''),
                    codigo_barras=producto.get('codigo_barras', ''),
                )
                producto.update(match)

            # 4. Guardar resultados
            proc.datos_extraidos = datos
            proc.confianza_global = datos.get('confianza_global', 0)
            proc.estado = 'PROCESADO'
            proc.errores = []
            proc.save(update_fields=[
                'texto_raw', 'datos_extraidos', 'confianza_global',
                'estado', 'errores', 'actualizado_en'
            ])

            logger.info(
                f'OCR completado para documento #{proc.pk}: '
                f'{len(datos.get("productos", []))} productos, '
                f'confianza {proc.confianza_global}%'
            )

        except Exception as e:
            logger.exception(f'Error procesando documento #{proc.pk}: {e}')
            proc.estado = 'ERROR'
            proc.errores = [{'campo': 'general', 'mensaje': str(e), 'tipo': 'exception'}]
            proc.save(update_fields=['estado', 'errores', 'actualizado_en'])

        return proc

    @staticmethod
    def validar_archivo(archivo) -> tuple:
        """
        Valida tipo MIME y tamaño del archivo subido.

        Returns:
            (es_valido: bool, error: str, tipo_archivo: str)
        """
        # Validar tamaño
        if archivo.size > MAX_FILE_SIZE:
            return False, f'Archivo demasiado grande ({archivo.size // 1024 // 1024}MB). Máximo: 20MB.', ''

        # Validar tipo MIME
        content_type = getattr(archivo, 'content_type', '')
        tipo = ALLOWED_MIME_TYPES.get(content_type)

        if not tipo:
            # Fallback: validar por extensión
            nombre = archivo.name.lower()
            if nombre.endswith('.pdf'):
                tipo = 'PDF'
            elif nombre.endswith(('.jpg', '.jpeg')):
                tipo = 'JPG'
            elif nombre.endswith('.png'):
                tipo = 'PNG'
            else:
                return False, f'Tipo de archivo no soportado: {content_type}. Use PDF, JPG o PNG.', ''

        return True, '', tipo
