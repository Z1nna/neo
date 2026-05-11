const AUTH_API_BASE = '/api/v1/auth';
const AUTH_STORAGE_KEY = 'neomarket-auth-session';
const AUTH_RETURN_URL_KEY = 'neomarket-auth-return-url';

const $ = (id) => document.getElementById(id);

const state = {
  mode: 'login',
};

function requestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.random() * 16 | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function flattenErrorMessages(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenErrorMessages(item));
  }
  if (typeof value === 'object') {
    return Object.values(value).flatMap((item) => flattenErrorMessages(item));
  }
  return [String(value)];
}

function getApiErrorMessage(data, status) {
  const directMessage = [data?.message, data?.detail, data?.code]
    .find((value) => typeof value === 'string' && value.trim());
  if (directMessage) {
    return directMessage;
  }

  const serializerErrors = flattenErrorMessages(data).filter(Boolean);
  if (serializerErrors.length) {
    return serializerErrors.join('; ');
  }

  return `HTTP ${status}`;
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, response.status));
  }

  return data;
}

async function authRequest(path, { method = 'GET', body } = {}) {
  return api(`${AUTH_API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function setMessage(text, isError = false) {
  const node = $('authPageMessage');
  node.textContent = text;
  node.style.color = isError ? '#be123c' : '#5f6774';
}

function storeSession(payload) {
  const session = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    tokenType: payload.token_type || 'Bearer',
    user: payload.user || null,
  };
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

function getReturnUrl() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get('next');
  return next || localStorage.getItem(AUTH_RETURN_URL_KEY) || './index.html';
}

function finishAuth() {
  const target = getReturnUrl();
  localStorage.removeItem(AUTH_RETURN_URL_KEY);
  window.location.href = target;
}

function setMode(mode) {
  state.mode = mode === 'register' ? 'register' : 'login';

  $('switchLoginBtn').classList.toggle('is-active', state.mode === 'login');
  $('switchRegisterBtn').classList.toggle('is-active', state.mode === 'register');

  $('authPageTitle').textContent = state.mode === 'login' ? 'Вход в аккаунт' : 'Регистрация покупателя';
  $('authPageSubtitle').textContent = state.mode === 'login'
    ? 'Для входа нужны только почта и пароль.'
    : 'Создай покупательский аккаунт по почте и паролю, затем вернешься на витрину.';
  $('authPageSubmitBtn').textContent = state.mode === 'login' ? 'Войти' : 'Создать аккаунт';
  $('registerOnlyFields').style.display = state.mode === 'register' ? 'block' : 'none';
  $('authPagePasswordInput').setAttribute('autocomplete', state.mode === 'login' ? 'current-password' : 'new-password');
  setMessage('');
}

function buildRegistrationPayload(email, password) {
  return {
    username: email.split('@')[0] || `buyer-${requestId().slice(0, 8)}`,
    email,
    password,
    password_confirm: password,
    first_name: 'Buyer',
    last_name: 'NeoMarket',
    role: 'CUSTOMER',
  };
}

async function submitAuth(event) {
  event.preventDefault();

  const email = $('authPageEmailInput').value.trim().toLowerCase();
  const password = $('authPagePasswordInput').value;

  if (!email || !password) {
    setMessage('Укажите почту и пароль', true);
    return;
  }

  try {
    const payload = state.mode === 'login'
      ? await authRequest('/login/', {
          method: 'POST',
          body: { email, password },
        })
      : await authRequest('/register/', {
          method: 'POST',
          body: buildRegistrationPayload(email, password),
        });

    storeSession(payload);
    setMessage(state.mode === 'login' ? 'Вход выполнен. Перенаправляю на витрину...' : 'Аккаунт создан. Перенаправляю на витрину...');
    window.setTimeout(finishAuth, 250);
  } catch (error) {
    setMessage(error.message, true);
  }
}

function bindEvents() {
  $('switchLoginBtn').addEventListener('click', () => setMode('login'));
  $('switchRegisterBtn').addEventListener('click', () => setMode('register'));
  $('authPageForm').addEventListener('submit', submitAuth);
}

function boot() {
  const params = new URLSearchParams(window.location.search);
  setMode(params.get('mode') || 'login');
  bindEvents();
}

boot();
