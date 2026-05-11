from datetime import datetime, timedelta, timezone
from uuid import uuid4

import jwt
from django.conf import settings
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema, extend_schema_view
from jwt import InvalidTokenError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ClientApp, User
from .serializers import (
    LoginSerializer,
    ProfileUpdateSerializer,
    RefreshTokenSerializer,
    RegisterSerializer,
    TokenIntrospectSerializer,
    TokenRequestSerializer,
    UserSerializer,
)


def _error(code, message, http_status):
    return Response({'code': code, 'message': message}, status=http_status)


def _role_claims(user: User) -> list[str]:
    role = user.role or User.Role.CUSTOMER
    roles = [role]
    if role == User.Role.ADMIN:
        roles.append('MODERATOR')
    return roles


def _issue_token_pair(user: User, client: ClientApp | None = None, audience: str | None = None):
    now = datetime.now(timezone.utc)
    audience_value = audience or settings.JWT_AUDIENCE_DEFAULT
    client_id = client.client_id if client else 'first-party'
    roles = _role_claims(user)

    base_claims = {
        'iss': settings.JWT_ISSUER,
        'aud': audience_value,
        'sub': str(user.id),
        'user_id': str(user.id),
        'email': user.email,
        'preferred_username': user.username,
        'roles': roles,
        'client_id': client_id,
        'jti': str(uuid4()),
        'iat': int(now.timestamp()),
    }
    if user.role == User.Role.SELLER:
        base_claims['seller_id'] = str(user.id)

    access_payload = {
        **base_claims,
        'token_type': 'access',
        'exp': int((now + timedelta(seconds=settings.ACCESS_TOKEN_TTL_SECONDS)).timestamp()),
    }
    refresh_payload = {
        **base_claims,
        'token_type': 'refresh',
        'exp': int((now + timedelta(seconds=settings.REFRESH_TOKEN_TTL_SECONDS)).timestamp()),
    }

    access_token = jwt.encode(access_payload, settings.JWT_SIGNING_KEY, algorithm=settings.JWT_ALGORITHM)
    refresh_token = jwt.encode(refresh_payload, settings.JWT_SIGNING_KEY, algorithm=settings.JWT_ALGORITHM)

    return {
        'access_token': access_token,
        'refresh_token': refresh_token,
        'token_type': 'Bearer',
        'expires_in': settings.ACCESS_TOKEN_TTL_SECONDS,
        'issuer': settings.JWT_ISSUER,
        'audience': audience_value,
    }


def _decode_auth_token(token, verify_exp=True):
    try:
        return jwt.decode(
            token,
            key=settings.JWT_SIGNING_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            options={'verify_signature': True, 'verify_exp': verify_exp, 'verify_aud': False},
            issuer=settings.JWT_ISSUER,
        )
    except InvalidTokenError:
        return None


def _user_from_request(request):
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return None, _error('UNAUTHORIZED', 'Bearer token is required', status.HTTP_401_UNAUTHORIZED)

    claims = _decode_auth_token(auth_header.split(' ', 1)[1].strip())
    if not claims or claims.get('token_type') != 'access':
        return None, _error('UNAUTHORIZED', 'Invalid access token', status.HTTP_401_UNAUTHORIZED)

    user = User.objects.filter(id=claims.get('user_id')).first()
    if not user:
        return None, _error('UNAUTHORIZED', 'User not found', status.HTTP_401_UNAUTHORIZED)
    return user, None


@extend_schema_view(
    post=extend_schema(operation_id='auth_issue_token', request=TokenRequestSerializer, responses=OpenApiTypes.OBJECT),
)
class TokenView(APIView):
    def post(self, request):
        serializer = TokenRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return _error('BAD_REQUEST', 'Invalid token request payload', status.HTTP_400_BAD_REQUEST)

        client = ClientApp.objects.filter(
            client_id=serializer.validated_data['client_id'],
            client_secret=serializer.validated_data['client_secret'],
            is_active=True,
        ).first()
        if not client:
            return _error('UNAUTHORIZED', 'Client credentials are invalid', status.HTTP_401_UNAUTHORIZED)

        audience = serializer.validated_data.get('audience') or settings.JWT_AUDIENCE_DEFAULT
        user = User.objects.filter(id=serializer.validated_data['user_id']).first()
        if user:
            token_payload = _issue_token_pair(user, client=client, audience=audience)
        else:
            now = datetime.now(timezone.utc)
            roles = serializer.validated_data.get('roles', []) or ['CUSTOMER']
            base_claims = {
                'iss': settings.JWT_ISSUER,
                'aud': audience,
                'sub': str(serializer.validated_data['user_id']),
                'user_id': str(serializer.validated_data['user_id']),
                'roles': roles,
                'client_id': client.client_id,
                'jti': str(uuid4()),
                'iat': int(now.timestamp()),
            }
            access_payload = {
                **base_claims,
                'token_type': 'access',
                'exp': int((now + timedelta(seconds=settings.ACCESS_TOKEN_TTL_SECONDS)).timestamp()),
            }
            refresh_payload = {
                **base_claims,
                'token_type': 'refresh',
                'exp': int((now + timedelta(seconds=settings.REFRESH_TOKEN_TTL_SECONDS)).timestamp()),
            }
            token_payload = {
                'access_token': jwt.encode(access_payload, settings.JWT_SIGNING_KEY, algorithm=settings.JWT_ALGORITHM),
                'refresh_token': jwt.encode(refresh_payload, settings.JWT_SIGNING_KEY, algorithm=settings.JWT_ALGORITHM),
                'token_type': 'Bearer',
                'expires_in': settings.ACCESS_TOKEN_TTL_SECONDS,
                'issuer': settings.JWT_ISSUER,
                'audience': audience,
            }

        return Response(token_payload)


@extend_schema_view(
    post=extend_schema(operation_id='auth_introspect', request=TokenIntrospectSerializer, responses=OpenApiTypes.OBJECT),
)
class TokenIntrospectView(APIView):
    def post(self, request):
        serializer = TokenIntrospectSerializer(data=request.data)
        if not serializer.is_valid():
            return _error('BAD_REQUEST', 'Invalid introspection payload', status.HTTP_400_BAD_REQUEST)

        claims = _decode_auth_token(serializer.validated_data['token'])
        if not claims:
            return Response({'active': False})

        return Response(
            {
                'active': True,
                'sub': claims.get('sub'),
                'user_id': claims.get('user_id'),
                'roles': claims.get('roles', []),
                'scope': claims.get('scope', ''),
                'exp': claims.get('exp'),
                'iss': claims.get('iss'),
                'aud': claims.get('aud'),
                'token_type': claims.get('token_type', 'access'),
            }
        )


@extend_schema_view(
    get=extend_schema(operation_id='auth_oidc_config', responses=OpenApiTypes.OBJECT),
)
class OpenIdConfigurationView(APIView):
    def get(self, request):
        base = request.build_absolute_uri('/').rstrip('/')
        return Response(
            {
                'issuer': settings.JWT_ISSUER,
                'token_endpoint': f'{base}/api/v1/auth/token',
                'introspection_endpoint': f'{base}/api/v1/auth/introspect',
                'token_endpoint_auth_methods_supported': ['client_secret_post'],
                'grant_types_supported': ['client_credentials', 'custom_user_issue'],
                'response_types_supported': ['token'],
                'subject_types_supported': ['public'],
                'id_token_signing_alg_values_supported': [settings.JWT_ALGORITHM],
            }
        )


@extend_schema_view(
    post=extend_schema(operation_id='auth_register', request=RegisterSerializer, responses=UserSerializer),
)
class RegisterView(APIView):
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            client = ClientApp.objects.filter(client_id='neomarket-web', is_active=True).first()
            payload = {
                'user': UserSerializer(user).data,
                **_issue_token_pair(user, client=client),
            }
            return Response(payload, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@extend_schema_view(
    post=extend_schema(operation_id='auth_login', request=LoginSerializer, responses=OpenApiTypes.OBJECT),
)
class LoginView(APIView):
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.validated_data['user']
            client = ClientApp.objects.filter(client_id='neomarket-web', is_active=True).first()
            return Response({
                'user': UserSerializer(user).data,
                'message': 'Login successful',
                **_issue_token_pair(user, client=client),
            })
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@extend_schema_view(
    post=extend_schema(operation_id='auth_refresh', request=RefreshTokenSerializer, responses=OpenApiTypes.OBJECT),
)
class RefreshView(APIView):
    def post(self, request):
        serializer = RefreshTokenSerializer(data=request.data)
        if not serializer.is_valid():
            return _error('BAD_REQUEST', 'Invalid refresh payload', status.HTTP_400_BAD_REQUEST)

        claims = _decode_auth_token(serializer.validated_data['refresh_token'])
        if not claims or claims.get('token_type') != 'refresh':
            return _error('UNAUTHORIZED', 'Invalid refresh token', status.HTTP_401_UNAUTHORIZED)

        user = User.objects.filter(id=claims.get('user_id')).first()
        if not user:
            return _error('UNAUTHORIZED', 'User not found', status.HTTP_401_UNAUTHORIZED)

        client = ClientApp.objects.filter(client_id=claims.get('client_id'), is_active=True).first()
        return Response(_issue_token_pair(user, client=client, audience=claims.get('aud')))


@extend_schema_view(
    get=extend_schema(operation_id='auth_me', responses=UserSerializer),
    patch=extend_schema(operation_id='auth_update_profile', request=ProfileUpdateSerializer, responses=UserSerializer),
)
class MeView(APIView):
    def get(self, request):
        user, error = _user_from_request(request)
        if error:
            return error
        return Response(UserSerializer(user).data)

    def patch(self, request):
        user, error = _user_from_request(request)
        if error:
            return error

        serializer = ProfileUpdateSerializer(user, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(UserSerializer(user).data)
