"""
Vistas de autenticación — sistema de token para 1 administrador.

POST /api/auth/login/   → { token, user } (AllowAny)
POST /api/auth/logout/  → elimina el token (IsAuthenticated)
GET  /api/auth/me/      → datos del usuario actual (IsAuthenticated)
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.authtoken.models import Token
from rest_framework import status
from django.contrib.auth import authenticate


class LoginView(APIView):
    """POST /api/auth/login/ — no requiere autenticación previa."""
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get('username', '').strip()
        password = request.data.get('password', '').strip()

        if not username or not password:
            return Response(
                {'error': 'Usuario y contraseña son obligatorios.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        user = authenticate(request, username=username, password=password)

        if not user:
            return Response(
                {'error': 'Credenciales incorrectas. Verifica tu usuario y contraseña.'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        if not user.is_active:
            return Response(
                {'error': 'Esta cuenta está desactivada.'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Obtener o crear token para el usuario
        token, _ = Token.objects.get_or_create(user=user)

        return Response({
            'token': token.key,
            'usuario': {
                'id':       user.id,
                'username': user.username,
                'nombre':   user.get_full_name() or user.username,
                'email':    user.email,
                'is_staff': user.is_staff,
            }
        })


class LogoutView(APIView):
    """POST /api/auth/logout/ — elimina el token del servidor."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # Eliminar token para invalidar todas las sesiones activas
        if hasattr(request, 'auth') and request.auth:
            request.auth.delete()
        return Response({'ok': True, 'mensaje': 'Sesión cerrada correctamente.'})


class MeView(APIView):
    """GET /api/auth/me/ — información del usuario autenticado."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response({
            'id':       user.id,
            'username': user.username,
            'nombre':   user.get_full_name() or user.username,
            'email':    user.email,
            'is_staff': user.is_staff,
        })
