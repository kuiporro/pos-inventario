import os
import sys
import webbrowser
from threading import Timer
from django.core.management import execute_from_command_line
from waitress import serve
import socket

# -- Obtener la IP local
def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

# -- Configurar el entorno de Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

# -- Función principal
def main():
    print("=" * 60)
    print("  Iniciando POS Tienda (Servidor Local Integrado)")
    print("=" * 60)
    print("Configurando base de datos local...")

    # Ejecutar migraciones automáticamente
    try:
        execute_from_command_line(['manage.py', 'migrate'])
        print("[OK] Base de datos verificada/actualizada.")
    except Exception as e:
        print(f"[ERR] Error ejecutando migraciones: {e}")

    # Cargar la aplicación WSGI
    from config.wsgi import application

    ip_local = get_local_ip()
    port = 8000
    
    url_local = f"http://localhost:{port}"
    url_red = f"http://{ip_local}:{port}"

    print("-" * 60)
    print("SISTEMA EN EJECUCIÓN")
    print("-" * 60)
    print(f"• PC de la tienda: {url_local}")
    print(f"• Celulares/Otros: {url_red}")
    print("\nNo cierres esta ventana. Minimízala para seguir usando el sistema.")
    print("-" * 60)

    # Abrir navegador automáticamente tras 2 segundos
    Timer(2.0, lambda: webbrowser.open(url_local)).start()

    # Iniciar servidor con Waitress (robusto en Windows)
    serve(application, host='0.0.0.0', port=port, _quiet=True)

if __name__ == '__main__':
    main()
