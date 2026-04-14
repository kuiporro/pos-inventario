"""
Django settings para sistema POS local.
"""

import os
import sys
from pathlib import Path

# --- Rutas del Proyecto ---
# Si corre como .exe (PyInstaller), sys.frozen es True y la app extrae sus archivos en sys._MEIPASS
# Pero queremos que la BD y Media se guarden en la carpeta DONDE ESTÁ el .exe original, no en TEMP.
IS_FROZEN = getattr(sys, 'frozen', False)

if IS_FROZEN:
    # Carpeta temporal donde PyInstaller extrae el código
    BUNDLE_DIR = Path(sys._MEIPASS)
    # Carpeta real donde el usuario hizo doble clic al .exe
    EXE_DIR = Path(sys.executable).parent
    
    BASE_DIR = BUNDLE_DIR
    DATA_DIR = EXE_DIR
else:
    BASE_DIR = Path(__file__).resolve().parent.parent
    DATA_DIR = BASE_DIR

FRONTEND_DIST = BASE_DIR.parent / 'frontend' / 'dist' if not IS_FROZEN else BUNDLE_DIR / 'frontend_dist'

SECRET_KEY = 'django-insecure-pos-local-tienda-decoraciones-2024-cambiar-en-produccion'

DEBUG = True

# Permite acceso desde cualquier dispositivo en la red local
ALLOWED_HOSTS = ['*']

# --- Apps ---
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Terceros
    'rest_framework',
    'rest_framework.authtoken',   # ← Token auth
    'django_filters',
    'corsheaders',
    # Propias
    'inventario',
    'ventas',
    'reportes',
    'autenticacion',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',  # Debe ir PRIMERO
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware', # Sirve estáticos en producción
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [FRONTEND_DIST] if os.path.exists(FRONTEND_DIST) else [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# --- Base de datos ---
# SQLite (desarrollo local) — comentar este bloque y descomentar PostgreSQL cuando esté listo
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': DATA_DIR / 'db.sqlite3',
        'OPTIONS': {
            'timeout': 20,
        },
    }
}

# ── PostgreSQL (producción) ───────────────────────────────────────────
# Instala primero: https://www.postgresql.org/download/windows/
# Luego crea la DB: psql -U postgres -c "CREATE DATABASE postienda;"
# Descomenta este bloque y comenta el SQLite de arriba:
#
# DATABASES = {
#     'default': {
#         'ENGINE':   'django.db.backends.postgresql',
#         'NAME':     'postienda',
#         'USER':     'postgres',
#         'PASSWORD': 'tu_clave_aqui',  # ← cambiar
#         'HOST':     'localhost',
#         'PORT':     '5432',
#         'OPTIONS':  {'connect_timeout': 10},
#     }
# }
# Luego ejecuta: python manage.py migrate

# --- Validación de contraseñas ---
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# --- Internacionalización ---
LANGUAGE_CODE = 'es-cl'
TIME_ZONE = 'America/Santiago'
USE_I18N = True
USE_TZ = True

# --- Archivos estáticos y media ---
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_DIRS = [FRONTEND_DIST] if os.path.exists(FRONTEND_DIST) else []

# Whitenoise config para servir React
WHITENOISE_INDEX_FILE = True
WHITENOISE_ROOT = FRONTEND_DIST

MEDIA_URL = '/media/'
MEDIA_ROOT = DATA_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# --- Django REST Framework ---
REST_FRAMEWORK = {
    # ── Autenticación global ────────────────────────────────────────────
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.TokenAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        # Todas las vistas requieren Token válido.
        # Vistas públicas (login, bridge) usan permission_classes = [AllowAny]
        'rest_framework.permissions.IsAuthenticated',
    ],
    # ── Filtros y paginación ────────────────────────────────────────────
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 50,
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
        'rest_framework.renderers.BrowsableAPIRenderer',
    ],
}

# --- CORS: permite que React (en el mismo equipo o red local) acceda a la API ---
CORS_ALLOW_ALL_ORIGINS = True  # En producción real restringir por IP
CORS_ALLOW_CREDENTIALS = True

# --- Logs básicos para debugging ---
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'WARNING',
    },
    'loggers': {
        'django.db.backends': {
            'level': 'DEBUG' if DEBUG else 'WARNING',
            'handlers': ['console'],
            'propagate': False,
        },
    },
}
