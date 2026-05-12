const AUTH_API_BASE = '/api/v1/auth';
const AUTH_STORAGE_KEY = 'neomarket-auth-session';
const AUTH_RETURN_URL_KEY = 'neomarket-auth-return-url';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return UUID_RE.test(String(value || '').trim());
}

const state = {
  authToken: '',
  refreshToken: '',
  roles: [],
  email: '',
  fullName: '',
  roleMode: 'CUSTOMER',
  userId: '',

  products: [],
  categories: [],
  homeProducts: [],
  skuMap: JSON.parse(localStorage.getItem('nm_sku_map') || '{}'),
  currentProductId: null,
  currentProduct: null,

  currentModerationCard: null,
  blockingReasons: [],

  promo: null,
  selectedSlotId: '',
  lastPayment: null,
  selectedQaQuestionId: '',
  addressBook: JSON.parse(localStorage.getItem('nm_address_book') || '[]'),
  selectedAddressId: localStorage.getItem('nm_selected_address_id') || '',
  shipmentIdsByUser: JSON.parse(localStorage.getItem('nm_shipment_ids_by_user') || '{}'),
};

/** Совпадает с UUID в b2b_api/migrations/0007_promo_lifestyle_products.py */
const TOPBAR_PROMO_SLIDES = [
  {
    productId: 'b320c101-1010-4a10-b101-000000000001',
    eyebrow: 'Частный авиа',
    cta: 'Купить самолёт',
    image:
      'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1200&q=80',
  },
  {
    productId: 'b320c101-1010-4a10-b102-000000000002',
    eyebrow: 'Авто',
    cta: 'Купить машину',
    image:
      'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=1200&q=80',
  },
  {
    productId: 'b320c101-1010-4a10-b103-000000000003',
    eyebrow: 'Недвижимость',
    cta: 'Купить дом',
    image:
      'https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=1200&q=80',
  },
  {
    productId: 'b320c101-1010-4a10-b104-000000000004',
    eyebrow: 'Авиа',
    cta: 'Купить вертолёт',
    image:
      'https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=1200&q=80',
  },
];

let topbarPromoIndex = 0;
let topbarPromoTimer = null;

const $ = (id) => document.getElementById(id);

function parseJson(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch (_error) {
    return fallback;
  }
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

function authSession() {
  return parseJson(localStorage.getItem(AUTH_STORAGE_KEY), null);
}

function authPageUrl(mode = 'login') {
  const params = new URLSearchParams();
  params.set('mode', mode === 'register' ? 'register' : 'login');
  return `./auth.html?${params.toString()}`;
}

function openAuthPage(mode = 'login') {
  const currentLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  localStorage.setItem(AUTH_RETURN_URL_KEY, currentLocation || './index.html');
  window.location.href = authPageUrl(mode);
}

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

function storeSession(payload) {
  const session = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    tokenType: payload.token_type || 'Bearer',
    user: payload.user || null,
  };
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  state.authToken = session.accessToken || '';
  state.refreshToken = session.refreshToken || '';
  state.email = session.user?.email || '';
  state.userId = session.user?.id || '';
  state.fullName = [session.user?.first_name, session.user?.last_name].filter(Boolean).join(' ') || session.user?.email || '';
  state.roles = session.user?.role ? [session.user.role] : [];
  state.roleMode = ['MODERATOR', 'ADMIN'].includes(String(session.user?.role || '').toUpperCase()) ? 'MODERATOR' : 'CUSTOMER';
}

function clearSession() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  state.authToken = '';
  state.refreshToken = '';
  state.roles = [];
  state.email = '';
  state.fullName = '';
  state.roleMode = 'CUSTOMER';
  state.userId = '';
}

function hydrateSession() {
  const session = authSession();
  if (!session?.accessToken) {
    clearSession();
    return;
  }
  storeSession({
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
    token_type: session.tokenType,
    user: session.user,
  });
}

function persistAuth() {
  if (!state.authToken) {
    clearSession();
    return;
  }
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
    accessToken: state.authToken,
    refreshToken: state.refreshToken,
    tokenType: 'Bearer',
    user: {
      id: state.userId,
      email: state.email,
      first_name: state.fullName.split(' ')[0] || '',
      last_name: state.fullName.split(' ').slice(1).join(' '),
      role: state.roles[0] || state.roleMode,
    },
  }));
}

function persistLocalData() {
  localStorage.setItem('nm_sku_map', JSON.stringify(state.skuMap || {}));
  localStorage.setItem('nm_address_book', JSON.stringify(state.addressBook || []));
  localStorage.setItem('nm_selected_address_id', state.selectedAddressId || '');
  localStorage.setItem('nm_shipment_ids_by_user', JSON.stringify(state.shipmentIdsByUser || {}));
}

function formatRub(amount) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));
}

function goToProductPage(productId) {
  if (!productId) {
    return;
  }
  window.location.href = `./product.html?id=${encodeURIComponent(productId)}`;
}

function setMessage(nodeId, text, isError = false) {
  const node = $(nodeId);
  if (!node) {
    return;
  }
  node.textContent = text;
  node.style.color = isError ? '#be123c' : '#5f6774';
}

function isModeratorMode() {
  return (state.roles || []).some((role) => ['MODERATOR', 'ADMIN'].includes(String(role).toUpperCase()));
}

function activeUserRoleLabel() {
  if (isModeratorMode()) {
    return 'MODERATOR';
  }
  return 'CUSTOMER';
}

function setRoleVisibility() {
  const showModeration = isModeratorMode();

  document.querySelectorAll('.role-customer').forEach((node) => {
    node.style.display = showModeration ? 'none' : '';
  });
  document.querySelectorAll('.role-moderation').forEach((node) => {
    node.style.display = showModeration ? '' : 'none';
  });

  if (showModeration) {
    activateTab('moderation');
  } else {
    const activeTab = document.querySelector('.tab.active');
    if (!activeTab || activeTab.dataset.tab === 'moderation') {
      activateTab('home');
    }
  }
}

const KNOWN_MAIN_TABS = new Set(['home', 'catalog', 'cart', 'checkout', 'account', 'moderation']);

function activateTab(tabId) {
  let id = String(tabId || 'home').trim();
  if (!KNOWN_MAIN_TABS.has(id)) {
    id = 'home';
  }
  if (isModeratorMode() && id !== 'moderation') {
    id = 'moderation';
  }
  if (!isModeratorMode() && id === 'moderation') {
    id = 'home';
  }

  document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
  document.querySelectorAll('.panel').forEach((panel) => panel.classList.remove('active'));

  const tab = document.querySelector(`.tab[data-tab="${id}"]`);
  const panel = $(id);
  if (tab && tab.style.display !== 'none') {
    tab.classList.add('active');
  }
  if (panel) {
    panel.classList.add('active');
  }
}

function wireTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      if (tab.style.display === 'none') {
        return;
      }
      activateTab(tab.dataset.tab);
      if (tab.dataset.tab === 'account' && state.authToken && !isModeratorMode()) {
        void loadFavorites();
      }
    });
  });
}

function apiHeaders(extra = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...extra,
  };
  if (state.userId) {
    headers['X-User-Id'] = state.userId;
  }
  if (state.authToken) {
    headers.Authorization = `Bearer ${state.authToken}`;
  }
  if (state.roles?.length) {
    headers['X-Roles'] = state.roles.join(',');
  }
  return headers;
}

let authRefreshPromise = null;

async function tryRefreshAuthSession() {
  const session = authSession();
  const refreshToken = session?.refreshToken;
  if (!refreshToken) {
    return false;
  }
  if (!authRefreshPromise) {
    authRefreshPromise = (async () => {
      try {
        const response = await fetch(`${AUTH_API_BASE}/refresh/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        const contentType = response.headers.get('content-type') || '';
        const data = contentType.includes('application/json') ? await response.json() : null;
        if (!response.ok) {
          if (response.status === 401 || response.status === 400) {
            clearSession();
          }
          return false;
        }
        const next = {
          ...session,
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          tokenType: data.token_type || 'Bearer',
        };
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next));
        hydrateSession();
        return true;
      } catch {
        return false;
      } finally {
        authRefreshPromise = null;
      }
    })();
  }
  return authRefreshPromise;
}

function moderationHeaders(extra = {}) {
  return apiHeaders(extra);
}

async function api(path, options = {}, allowAuthRetry = true) {
  const response = await fetch(path, options);
  if (response.status === 204) {
    return null;
  }
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    if (
      allowAuthRetry
      && response.status === 401
      && authSession()?.refreshToken
      && !String(path).includes('/auth/refresh/')
    ) {
      const refreshed = await tryRefreshAuthSession();
      if (refreshed) {
        const baseHeaders = options.headers && typeof options.headers === 'object' && !(options.headers instanceof Headers)
          ? { ...options.headers }
          : {};
        return api(
          path,
          {
            ...options,
            headers: { ...baseHeaders, ...apiHeaders() },
          },
          false,
        );
      }
    }
    const message = getApiErrorMessage(data, response.status);
    throw new Error(message);
  }
  return data;
}

async function authRequest(path, { method = 'GET', body, headers = {} } = {}) {
  return api(`${AUTH_API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function renderAuthState() {
  const node = $('authState');
  if (!state.authToken) {
    node.textContent = 'Вы не авторизованы. Откройте отдельную страницу входа, чтобы войти или зарегистрироваться.';
    renderHeaderAuthActions();
    renderAccountAuthActions();
    return;
  }

  node.textContent = `${state.fullName || state.email} (${activeUserRoleLabel()}) • ${state.userId}`;
  renderHeaderAuthActions();
  renderAccountAuthActions();
}

function renderHeaderAuthActions() {
  const loginBtn = $('authLoginBtn');
  const registerBtn = $('authRegisterBtn');
  const logoutBtn = $('authLogoutBtn');
  const refreshBtn = $('refreshAll');
  const hint = $('authHint');
  if (!loginBtn || !registerBtn || !logoutBtn || !refreshBtn || !hint) {
    return;
  }

  const isLoggedIn = Boolean(state.authToken);
  const isModerator = isModeratorMode();

  loginBtn.style.display = isLoggedIn ? 'none' : '';
  registerBtn.style.display = isLoggedIn ? 'none' : '';
  logoutBtn.style.display = isLoggedIn ? '' : 'none';
  refreshBtn.style.display = '';

  if (!isLoggedIn) {
    hint.textContent = 'Вход и регистрация теперь открываются на отдельной странице. Для входа нужны только почта и пароль.';
    return;
  }

  hint.textContent = isModerator
    ? 'Режим модератора активен. Оставлены только действия обновления данных и выхода.'
    : 'Вы уже вошли в аккаунт. Можно обновить данные или выйти.';
}

function renderAccountAuthActions() {
  const panel = $('accountAuthPanel');
  const loginBtn = $('accountLoginBtn');
  const registerBtn = $('accountRegisterBtn');
  const logoutBtn = $('accountLogoutBtn');
  const hint = $('accountAuthHint');
  if (!panel || !loginBtn || !registerBtn || !logoutBtn || !hint) {
    return;
  }

  const isLoggedInCustomer = Boolean(state.authToken) && !isModeratorMode();
  panel.style.display = '';
  loginBtn.style.display = isLoggedInCustomer ? 'none' : '';
  registerBtn.style.display = isLoggedInCustomer ? 'none' : '';
  logoutBtn.style.display = isLoggedInCustomer ? '' : 'none';
  hint.textContent = isLoggedInCustomer
    ? 'Вы уже вошли в аккаунт. При необходимости можно безопасно выйти прямо из личного кабинета.'
    : 'Если вы еще не вошли в аккаунт, откройте страницу авторизации прямо из личного кабинета.';
}

function readInputValue(primaryId, fallbackId = '', { normalize = false } = {}) {
  const primary = $(primaryId);
  const fallback = fallbackId ? $(fallbackId) : null;
  const normalizeValue = (value) => {
    const text = String(value || '').trim();
    return normalize ? text.toLowerCase() : text;
  };

  const primaryValue = normalizeValue(primary?.value);
  if (primaryValue) {
    return primaryValue;
  }

  return normalizeValue(fallback?.value);
}

function setInputValue(id, value) {
  const node = $(id);
  if (node) {
    node.value = value;
  }
}

function setAuthFeedback(text, isError = false) {
  setMessage('authEntryMsg', text, isError);
  setMessage('accountMsg', text, isError);
}

function getAuthFormData(source = 'main') {
  const useEntryCard = source === 'entry';

  return {
    email: useEntryCard
      ? readInputValue('authEntryEmailInput', 'authEmailInput', { normalize: true })
      : readInputValue('authEmailInput', 'authEntryEmailInput', { normalize: true }),
    password: useEntryCard
      ? readInputValue('authEntryPasswordInput', 'authPasswordInput')
      : readInputValue('authPasswordInput', 'authEntryPasswordInput'),
    roleMode: useEntryCard ? 'CUSTOMER' : ($('authRoleSelect').value || 'CUSTOMER'),
    username: useEntryCard
      ? readInputValue('authEntryUsernameInput', 'authUsernameInput')
      : readInputValue('authUsernameInput', 'authEntryUsernameInput'),
    firstName: useEntryCard
      ? readInputValue('authEntryFirstNameInput', 'authFirstNameInput')
      : readInputValue('authFirstNameInput', 'authEntryFirstNameInput'),
    lastName: useEntryCard
      ? readInputValue('authEntryLastNameInput', 'authLastNameInput')
      : readInputValue('authLastNameInput', 'authEntryLastNameInput'),
  };
}

function syncAuthInputs({
  email = '',
  password = '',
  username = '',
  firstName = '',
  lastName = '',
  roleMode = $('authRoleSelect')?.value || 'CUSTOMER',
} = {}) {
  setInputValue('authEmailInput', email);
  setInputValue('authPasswordInput', password);
  setInputValue('authRoleSelect', roleMode);
  setInputValue('authUsernameInput', username);
  setInputValue('authFirstNameInput', firstName);
  setInputValue('authLastNameInput', lastName);

  setInputValue('authEntryEmailInput', email);
  setInputValue('authEntryPasswordInput', password);
  setInputValue('authEntryUsernameInput', username);
  setInputValue('authEntryFirstNameInput', firstName);
  setInputValue('authEntryLastNameInput', lastName);
}

function getAuthRegistrationPayload(roleMode, email, password, formData = {}) {
  const usernameInput = formData.username || '';
  const firstNameInput = formData.firstName || '';
  const lastNameInput = formData.lastName || '';

  return {
    username: usernameInput || email.split('@')[0] || `user-${requestId().slice(0, 8)}`,
    email,
    password,
    password_confirm: password,
    first_name: firstNameInput || (roleMode === 'MODERATOR' ? 'Moderator' : 'Buyer'),
    last_name: lastNameInput || 'NeoMarket',
    role: roleMode,
  };
}

function clearAuthForm() {
  syncAuthInputs();
  setInputValue('authRoleSelect', 'CUSTOMER');
}

async function refreshCurrentProductDetailsIfNeeded() {
  /* Детальная карточка — на product.html */
}

async function login(source = 'main') {
  try {
    const { email, password, roleMode } = getAuthFormData(source);

    if (!email || !password) {
      setAuthFeedback('Укажите email и пароль', true);
      return;
    }

    const payload = await authRequest('/login/', {
      method: 'POST',
      body: { email, password },
    });
    const userRole = String(payload.user?.role || '').toUpperCase();
    if (roleMode === 'MODERATOR' && !['MODERATOR', 'ADMIN'].includes(userRole)) {
      setAuthFeedback('Этот аккаунт не имеет прав модератора', true);
      return;
    }

    storeSession(payload);
    persistAuth();
    renderAuthState();
    setRoleVisibility();
    syncAuthInputs({ email: state.email, password: '', roleMode });
    setAuthFeedback(`Вход выполнен: ${state.fullName || state.email}`);

    await bootData();
    await refreshCurrentProductDetailsIfNeeded();
  } catch (error) {
    setAuthFeedback(`Ошибка авторизации: ${error.message}`, true);
  }
}

async function registerAccount(source = 'main') {
  try {
    const formData = getAuthFormData(source);
    const { email, password, roleMode } = formData;
    if (!email || !password) {
      setAuthFeedback('Укажите email и пароль', true);
      return;
    }

    const payload = await authRequest('/register/', {
      method: 'POST',
      body: getAuthRegistrationPayload(roleMode, email, password, formData),
    });

    storeSession(payload);
    persistAuth();
    renderAuthState();
    setRoleVisibility();
    syncAuthInputs({ email: state.email, password: '', roleMode });
    setAuthFeedback(`Аккаунт создан: ${state.email}`);
    await bootData();
    await refreshCurrentProductDetailsIfNeeded();
  } catch (error) {
    setAuthFeedback(`Ошибка регистрации: ${error.message}`, true);
  }
}

async function logout() {
  clearSession();
  persistAuth();
  renderAuthState();
  setRoleVisibility();
  activateTab('home');

  clearAuthForm();
  renderProfile();
  await Promise.all([
    loadFavorites(),
    loadCart(),
    renderCheckoutPreview(),
    loadOrders(),
    loadShipments(),
  ]);
  await refreshCurrentProductDetailsIfNeeded();

  setAuthFeedback('Вы вышли из аккаунта');
}

async function loadCategories() {
  const data = await api('/api/v1/catalog/categories/');
  const roots = data?.items || [];
  const flattened = [];

  function walk(items, prefix = '') {
    items.forEach((item) => {
      flattened.push({ id: item.id, name: prefix ? `${prefix} / ${item.name}` : item.name });
      if (item.children?.length) {
        walk(item.children, item.name);
      }
    });
  }

  walk(roots);
  state.categories = flattened;

  const select = $('categorySelect');
  select.innerHTML = '<option value="">Все категории</option>';
  flattened.forEach((category) => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    select.appendChild(option);
  });
}

function looksLikeMojibakeSkuName(name) {
  const t = String(name || '').trim();
  if (!t) {
    return true;
  }
  if (/^[\uFFFD?]{2,}/.test(t) || /^\?{2,}/.test(t)) {
    return true;
  }
  const q = (t.match(/\?/g) || []).length;
  return t.length > 3 && q / t.length > 0.3;
}

function skuDisplayLabel(sku, product) {
  const raw = sku?.name != null ? String(sku.name) : '';
  if (looksLikeMojibakeSkuName(raw)) {
    const title = product?.title ? String(product.title) : 'Товар';
    return `${title} · вариант`;
  }
  return raw;
}

async function loadProductSkus(productId, product) {
  const skus = await api(`/api/v1/catalog/products/${productId}/skus/`);
  skus.forEach((sku) => {
    const label = skuDisplayLabel(sku, product);
    state.skuMap[sku.id] = {
      product_id: productId,
      sku_id: sku.id,
      title: label,
      unit_price: sku.price,
    };
  });
  persistLocalData();
  return skus;
}

async function addToCart(product, skuId, quantity = 1) {
  if (!state.authToken) {
    openAuthPage('login');
    throw new Error('Открываю страницу входа, чтобы можно было добавить товар в корзину');
  }
  if (!skuId || !isUuid(skuId)) {
    throw new Error('Выберите SKU из списка');
  }

  const skuData = state.skuMap[skuId] || {};
  skuData.product_id = product.id;
  skuData.product_title = product.title;
  state.skuMap[skuId] = skuData;
  persistLocalData();

  await api('/api/v1/cart/items/', {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ sku_id: skuId, quantity }),
  });
  invalidatePromoState();
}

function productCardNode(product) {
  const node = $('productTemplate').content.firstElementChild.cloneNode(true);
  node.classList.add('product-card--clickable');
  node.dataset.productId = product.id;
  node.querySelector('.product-title').textContent = product.title;
  node.querySelector('.product-price').textContent = formatRub(product.price);
  node.querySelector('.product-meta').textContent = product.in_stock ? 'В наличии' : 'Нет в наличии';

  const skuSelect = node.querySelector('.sku-select');
  const addCartButton = node.querySelector('.add-cart-btn');
  skuSelect.innerHTML = '<option>Загрузка SKU...</option>';
  addCartButton.disabled = true;
  addCartButton.textContent = 'Загрузка SKU...';

  loadProductSkus(product.id, product)
    .then((skus) => {
      skuSelect.innerHTML = '';
      if (!skus.length) {
        skuSelect.innerHTML = '<option value="">SKU отсутствуют</option>';
        addCartButton.textContent = 'Нет SKU';
        return;
      }
      skus.forEach((sku) => {
        const option = document.createElement('option');
        option.value = sku.id;
        option.textContent = `${skuDisplayLabel(sku, product)} — ${formatRub(sku.price)}`;
        skuSelect.appendChild(option);
      });
      addCartButton.disabled = false;
      addCartButton.textContent = 'В корзину';
    })
    .catch(() => {
      skuSelect.innerHTML = '<option value="">Не удалось загрузить SKU</option>';
      addCartButton.textContent = 'Ошибка SKU';
    });

  node.addEventListener('click', (e) => {
    if (e.target.closest('button, select')) {
      return;
    }
    goToProductPage(product.id);
  });

  node.querySelector('.favorite-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      if (!state.authToken) {
        openAuthPage('login');
        return;
      }
      await api(`/api/v1/favorites/${product.id}/`, {
        method: 'POST',
        headers: apiHeaders(),
      });
      await loadFavorites();
      setMessage('checkoutMsg', 'Товар добавлен в избранное');
    } catch (error) {
      setMessage('checkoutMsg', error.message, true);
    }
  });

  addCartButton.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await addToCart(product, skuSelect.value, 1);
      await Promise.all([loadCart(), renderCheckoutPreview()]);
      setMessage('checkoutMsg', 'Товар добавлен в корзину');
    } catch (error) {
      setMessage('checkoutMsg', error.message, true);
    }
  });

  node.querySelector('.details-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    goToProductPage(product.id);
  });

  return node;
}

function renderProducts(products) {
  const grid = $('productsGrid');
  grid.innerHTML = '';
  products.forEach((product) => grid.appendChild(productCardNode(product)));
}

async function loadProducts() {
  const params = new URLSearchParams();
  const search = $('searchInput').value.trim();
  const category = $('categorySelect').value;
  const sort = $('sortSelect').value;

  if (search) params.set('search', search);
  if (category) params.set('category_id', category);
  if (sort) params.set('sort', sort);

  const data = await api(`/api/v1/catalog/products/?${params.toString()}`);
  state.products = data.items || [];
  $('productsMeta').textContent = `Найдено товаров: ${data.total_count}`;
  renderProducts(state.products);
}

async function openCatalogProductFromPromo(productId) {
  goToProductPage(productId);
}

function renderQaModerationQueue(payload) {
  const root = $('qaModerationList');
  root.innerHTML = '';
  state.selectedQaQuestionId = '';
  $('submitQaAnswerBtn').disabled = true;
  const items = payload?.items || [];
  if (!items.length) {
    root.innerHTML = '<p class="muted">Открытых вопросов нет</p>';
    return;
  }

  items.forEach((item) => {
    const node = document.createElement('article');
    node.className = 'qa-item';
    node.innerHTML = `
      <p><strong>Product:</strong> ${item.product_id}</p>
      <p><strong>Вопрос:</strong> ${item.question}</p>
      <p class="muted">Пользователь: ${item.user_id}</p>
      <button class="btn btn-ghost select-qa" data-id="${item.id}">Выбрать для ответа</button>
    `;
    node.querySelector('.select-qa').addEventListener('click', () => {
      state.selectedQaQuestionId = item.id;
      $('submitQaAnswerBtn').disabled = false;
      setMessage('qaModerationMsg', `Выбран вопрос ${item.id}`);
    });
    root.appendChild(node);
  });
}

async function loadQaModerationQueue() {
  try {
    const productId = $('qaModerationProductId').value.trim();
    const params = new URLSearchParams();
    params.set('status', 'OPEN');
    if (productId) {
      params.set('product_id', productId);
    }
    const payload = await api(`/api/v1/reviews/qa/questions/?${params.toString()}`, {
      headers: moderationHeaders(),
    });
    renderQaModerationQueue(payload);
  } catch (error) {
    setMessage('qaModerationMsg', error.message, true);
  }
}

async function submitQaAnswer() {
  if (!state.selectedQaQuestionId) {
    setMessage('qaModerationMsg', 'Сначала выберите вопрос', true);
    return;
  }
  const answer = $('qaAnswerInput').value.trim();
  if (!answer) {
    setMessage('qaModerationMsg', 'Введите ответ', true);
    return;
  }

  try {
    await api(`/api/v1/reviews/qa/questions/${state.selectedQaQuestionId}/answer/`, {
      method: 'POST',
      headers: moderationHeaders(),
      body: JSON.stringify({
        moderator_id: state.userId,
        answer,
      }),
    });
    $('qaAnswerInput').value = '';
    state.selectedQaQuestionId = '';
    $('submitQaAnswerBtn').disabled = true;
    setMessage('qaModerationMsg', 'Ответ отправлен');
    await loadQaModerationQueue();
  } catch (error) {
    setMessage('qaModerationMsg', error.message, true);
  }
}


function renderTopbarPromoSlides() {
  const track = $('topbarPromoSlides');
  if (!track) {
    return;
  }
  track.innerHTML = TOPBAR_PROMO_SLIDES.map((slide, i) => {
    const bg = `linear-gradient(90deg, rgba(15,23,42,0.78) 0%, rgba(15,23,42,0.4) 55%, rgba(15,23,42,0.25) 100%), url('${slide.image}')`;
    return `<button type="button" class="topbar-promo__slide${i === 0 ? ' is-active' : ''}" data-index="${i}" data-product-id="${slide.productId}" style="background-image:${bg}">
      <span class="topbar-promo__eyebrow">${escapeHtml(slide.eyebrow)}</span>
      <span class="topbar-promo__cta">${escapeHtml(slide.cta)}</span>
    </button>`;
  }).join('');
}

function setTopbarPromoIndex(nextIdx) {
  const n = TOPBAR_PROMO_SLIDES.length;
  if (!n) {
    return;
  }
  topbarPromoIndex = ((nextIdx % n) + n) % n;
  document.querySelectorAll('.topbar-promo__slide').forEach((el, i) => {
    el.classList.toggle('is-active', i === topbarPromoIndex);
  });
}

function stopTopbarPromoAuto() {
  if (topbarPromoTimer) {
    window.clearInterval(topbarPromoTimer);
    topbarPromoTimer = null;
  }
}

function startTopbarPromoAuto() {
  stopTopbarPromoAuto();
  topbarPromoTimer = window.setInterval(() => {
    setTopbarPromoIndex(topbarPromoIndex + 1);
  }, 10000);
}

function initTopbarPromoCarousel() {
  const root = $('topbarPromo');
  const track = $('topbarPromoSlides');
  if (!root || !track || !TOPBAR_PROMO_SLIDES.length) {
    return;
  }
  renderTopbarPromoSlides();
  topbarPromoIndex = 0;
  setTopbarPromoIndex(0);

  const prev = $('topbarPromoPrev');
  const next = $('topbarPromoNext');
  const bump = (delta) => {
    setTopbarPromoIndex(topbarPromoIndex + delta);
    startTopbarPromoAuto();
  };
  if (prev) {
    prev.addEventListener('click', () => bump(-1));
  }
  if (next) {
    next.addEventListener('click', () => bump(1));
  }

  track.querySelectorAll('.topbar-promo__slide').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      if (event.currentTarget !== btn) {
        return;
      }
      const id = btn.getAttribute('data-product-id');
      if (id) {
        void openCatalogProductFromPromo(id);
      }
    });
  });

  root.addEventListener('mouseenter', stopTopbarPromoAuto);
  root.addEventListener('mouseleave', startTopbarPromoAuto);

  startTopbarPromoAuto();
}

function clearProductDetails() {
  state.currentProductId = null;
  state.currentProduct = null;
}

function invalidatePromoState() {
  state.promo = null;
  const el = $('promoResult');
  if (el) {
    el.textContent = '';
  }
}

function clearModerationDeclineForm() {
  const reason = $('declineReason');
  if (reason && reason.options.length) {
    reason.selectedIndex = 0;
  }
  const comment = $('declineComment');
  if (comment) {
    comment.value = '';
  }
}

async function loadBanners() {
  const data = await api('/api/v1/home/banners/');
  const root = $('heroBanners');
  const wrap = $('heroBannersWrap');
  root.innerHTML = '';

  const items = data.items || [];
  if (!items.length) {
    wrap.style.display = 'none';
    return;
  }

  wrap.style.display = '';
  items.forEach((banner) => {
    const node = document.createElement('article');
    node.className = 'banner-item';
    node.style.backgroundImage = `url('${banner.image}')`;
    node.innerHTML = `<div class="banner-copy"><strong>${banner.title}</strong><p>${banner.subtitle || ''}</p></div>`;
    root.appendChild(node);
  });
}

async function loadCollections() {
  const data = await api('/api/v1/main/collections/');
  const grid = $('collectionsGrid');
  grid.innerHTML = '';

  (data.items || []).forEach((collection) => {
    const node = document.createElement('article');
    node.className = 'collection-card';
    node.innerHTML = `
      <h3>${collection.title}</h3>
      <p class="muted">${collection.description || ''}</p>
      <button class="btn btn-ghost">Открыть подборку</button>
    `;
    node.querySelector('button').addEventListener('click', async () => {
      const payload = await api(`/api/v1/collections/${collection.id}/products/`);
      state.homeProducts = payload.items || [];
      renderHomeProducts();
      activateTab('catalog');
      renderProducts(state.homeProducts);
    });
    grid.appendChild(node);
  });
}

function renderHomeProducts() {
  const grid = $('homeProductsGrid');
  grid.innerHTML = '';
  state.homeProducts.forEach((product) => grid.appendChild(productCardNode(product)));
}

async function loadHomeProducts() {
  const data = await api('/api/v1/cart/also_bought/');
  state.homeProducts = data.items || [];
  renderHomeProducts();
}

function calculateCartTotals(items) {
  let amount = 0;
  const normalized = items.map((item) => {
    const skuData = state.skuMap[item.sku_id] || {};
    const unitPrice = Number(item.unit_price ?? skuData.unit_price ?? 0);
    const lineTotal = Number(item.line_total ?? (unitPrice * Number(item.quantity || 0)));
    if (item.available !== false) {
      amount += lineTotal;
    }
    return {
      ...item,
      title: item.product_title || skuData.product_title || skuData.title || item.sku_id,
      unitPrice,
      lineTotal,
    };
  });

  return { normalized, amount };
}

async function loadCart() {
  if (!state.authToken) {
    $('cartItems').innerHTML = '<p class="muted">Войдите как покупатель, чтобы использовать корзину</p>';
    $('cartSummary').textContent = '';
    return;
  }

  const data = await api('/api/v1/cart/', { headers: apiHeaders() });
  const cartItems = data.items || [];
  const root = $('cartItems');
  root.innerHTML = '';

  if (!cartItems.length) {
    root.innerHTML = '<p class="muted">Корзина пуста</p>';
    $('cartSummary').textContent = 'Добавьте товары, чтобы перейти к оформлению.';
    await renderCheckoutPreview();
    return;
  }

  const totals = calculateCartTotals(cartItems);

  totals.normalized.forEach((item) => {
    const row = document.createElement('article');
    row.className = 'cart-item';
    const availabilityHint = item.available === false
      ? `<div class="muted" style="color:#be123c">Недоступно: ${item.unavailable_reason || 'UNKNOWN'}</div>`
      : item.available_stock < item.quantity
        ? `<div class="muted" style="color:#be123c">На складе осталось ${item.available_stock} шт.</div>`
        : '';
    row.innerHTML = `
      <strong>${item.title}</strong>
      <div class="muted">SKU: ${item.sku_id}</div>
      ${availabilityHint}
      <div class="cart-line">
        <button class="btn btn-ghost qty-dec">-</button>
        <span>${item.quantity}</span>
        <button class="btn btn-ghost qty-inc">+</button>
        <span>Итого: ${formatRub(item.lineTotal)}</span>
        <button class="btn btn-ghost remove">Удалить</button>
      </div>
    `;

    row.querySelector('.qty-dec').addEventListener('click', async () => {
      if (item.quantity <= 1) {
        return;
      }
      await api(`/api/v1/cart/items/${item.item_id}/`, {
        method: 'PUT',
        headers: apiHeaders(),
        body: JSON.stringify({ quantity: item.quantity - 1 }),
      });
      invalidatePromoState();
      await Promise.all([loadCart(), renderCheckoutPreview()]);
    });

    row.querySelector('.qty-inc').addEventListener('click', async () => {
      await api(`/api/v1/cart/items/${item.item_id}/`, {
        method: 'PUT',
        headers: apiHeaders(),
        body: JSON.stringify({ quantity: item.quantity + 1 }),
      });
      invalidatePromoState();
      await Promise.all([loadCart(), renderCheckoutPreview()]);
    });

    row.querySelector('.remove').addEventListener('click', async () => {
      await api(`/api/v1/cart/items/${item.item_id}/`, {
        method: 'DELETE',
        headers: apiHeaders(),
      });
      invalidatePromoState();
      await Promise.all([loadCart(), renderCheckoutPreview()]);
    });

    root.appendChild(row);
  });

  $('cartSummary').textContent = `Позиций: ${data.summary.total_items}. Товаров: ${data.summary.total_quantity}. Сумма: ${formatRub(data.summary.total_amount ?? totals.amount)}`;
  await renderCheckoutPreview();
}

function renderFavoritesInto(target, items) {
  if (!target) {
    return;
  }
  target.innerHTML = '';

  if (!items.length) {
    target.innerHTML = '<p class="muted">Избранное пока пусто</p>';
    return;
  }

  items.forEach((favorite) => {
    const productId = favorite.product?.id || favorite.product_id;
    const productTitle = favorite.product?.title || productId;
    const node = document.createElement('article');
    node.className = 'favorite-item';
    node.innerHTML = `
      <strong>${escapeHtml(productTitle)}</strong>
      <div class="muted">UID: ${escapeHtml(productId)}</div>
      <div class="muted">Добавлено: ${escapeHtml(new Date(favorite.added_at).toLocaleString('ru-RU'))}</div>
      <div class="product-actions">
        <button type="button" class="btn btn-ghost open-product">К товару</button>
        <button type="button" class="btn btn-ghost remove-fav">Удалить</button>
      </div>
    `;

    node.querySelector('.open-product').addEventListener('click', () => {
      goToProductPage(productId);
    });

    node.querySelector('.remove-fav').addEventListener('click', async () => {
      await api(`/api/v1/favorites/${productId}/`, {
        method: 'DELETE',
        headers: apiHeaders(),
      });
      await loadFavorites();
    });

    target.appendChild(node);
  });
}

async function fetchAllFavoriteItems() {
  const limit = 100;
  let offset = 0;
  const all = [];
  for (;;) {
    const data = await api(`/api/v1/favorites/?limit=${limit}&offset=${offset}`, { headers: apiHeaders() });
    const batch = data.items || [];
    all.push(...batch);
    if (batch.length < limit) {
      break;
    }
    offset += limit;
  }
  return all;
}

async function loadFavorites() {
  const cartList = $('favoritesList');
  const accountList = $('accountFavoritesList');
  const emptyHint = '<p class="muted">Избранное доступно после входа</p>';

  if (!state.authToken) {
    if (cartList) {
      cartList.innerHTML = emptyHint;
    }
    if (accountList) {
      accountList.innerHTML = emptyHint;
    }
    return;
  }

  try {
    const items = await fetchAllFavoriteItems();
    renderFavoritesInto(cartList, items);
    renderFavoritesInto(accountList, items);
  } catch (error) {
    const errHtml = `<p class="muted" style="color:#be123c">${escapeHtml(error.message)}</p>`;
    if (cartList) {
      cartList.innerHTML = errHtml;
    }
    if (accountList) {
      accountList.innerHTML = errHtml;
    }
  }
}

function getActiveAddress() {
  const id = state.selectedAddressId;
  if (!id) {
    return null;
  }
  return state.addressBook.find((item) => item.id === id) || null;
}

function applyAddressToCheckout(address) {
  if (!address) {
    return;
  }
  $('deliveryCity').value = address.city;
  $('deliveryStreet').value = address.street;
  $('deliveryApartment').value = address.apartment;
}

function renderAddressBook() {
  const root = $('addressList');
  const accountRoot = $('accountAddressList');
  root.innerHTML = '';
  accountRoot.innerHTML = '';

  if (!state.addressBook.length) {
    root.innerHTML = '<p class="muted">Адресов пока нет</p>';
    accountRoot.innerHTML = '<p class="muted">Адресная книга пуста</p>';
    return;
  }

  state.addressBook.forEach((address) => {
    const markup = `
      <article class="order-item">
        <div class="panel-head">
          <h3>${address.label}</h3>
          <span class="muted">${address.city}</span>
        </div>
        <p>${address.street}, кв. ${address.apartment}</p>
        <div class="product-actions">
          <button class="btn btn-ghost use-address" data-id="${address.id}">Выбрать</button>
          <button class="btn btn-ghost remove-address" data-id="${address.id}">Удалить</button>
        </div>
      </article>
    `;

    const wrapperA = document.createElement('div');
    wrapperA.innerHTML = markup;
    const nodeA = wrapperA.firstElementChild;

    const wrapperB = document.createElement('div');
    wrapperB.innerHTML = markup;
    const nodeB = wrapperB.firstElementChild;

    [nodeA, nodeB].forEach((node) => {
      node.querySelector('.use-address').addEventListener('click', () => {
        state.selectedAddressId = address.id;
        persistLocalData();
        applyAddressToCheckout(address);
        setMessage('addressMsg', `Выбран адрес: ${address.label}`);
      });
      node.querySelector('.remove-address').addEventListener('click', () => {
        state.addressBook = state.addressBook.filter((item) => item.id !== address.id);
        if (state.selectedAddressId === address.id) {
          state.selectedAddressId = '';
        }
        persistLocalData();
        renderAddressBook();
      });
    });

    root.appendChild(nodeA);
    accountRoot.appendChild(nodeB);
  });
}

function saveAddress() {
  if (!state.authToken) {
    setMessage('addressMsg', 'Сначала войдите как покупатель', true);
    return;
  }

  const label = $('addressLabelInput').value.trim();
  const city = $('addressCityInput').value.trim();
  const street = $('addressStreetInput').value.trim();
  const apartment = $('addressApartmentInput').value.trim();

  if (!label || !city || !street || !apartment) {
    setMessage('addressMsg', 'Заполните все поля адреса', true);
    return;
  }

  const address = {
    id: crypto.randomUUID(),
    label,
    city,
    street,
    apartment,
  };
  state.addressBook.unshift(address);
  state.selectedAddressId = address.id;
  persistLocalData();
  renderAddressBook();
  applyAddressToCheckout(address);
  setMessage('addressMsg', 'Адрес сохранен');

  $('addressLabelInput').value = '';
  $('addressCityInput').value = '';
  $('addressStreetInput').value = '';
  $('addressApartmentInput').value = '';
}

function parseDeliveryAddress() {
  const city = $('deliveryCity').value.trim() || 'Moscow';
  const street = $('deliveryStreet').value.trim() || 'Tverskaya 1';
  const apartment = $('deliveryApartment').value.trim() || '1';
  const comment = $('deliveryComment').value.trim();
  return `${city}, ${street}, кв. ${apartment}${comment ? `, ${comment}` : ''}`;
}

async function renderCheckoutPreview() {
  const root = $('checkoutItems');
  root.innerHTML = '';

  if (!state.authToken) {
    root.innerHTML = '<p class="muted">Для оформления нужно войти как покупатель</p>';
    $('checkoutTotal').textContent = '0 ₽';
    return;
  }

  const cart = await api('/api/v1/cart/', { headers: apiHeaders() });
  const items = cart.items || [];

  if (!items.length) {
    root.innerHTML = '<p class="muted">Корзина пуста</p>';
    $('checkoutTotal').textContent = '0 ₽';
    return;
  }

  const totals = calculateCartTotals(items);
  items.forEach((item) => {
    const row = document.createElement('article');
    row.className = 'order-item';
    const unavailableHint = item.available === false
      ? `<p class="muted" style="color:#be123c">Недоступно: ${item.unavailable_reason || 'UNKNOWN'}</p>`
      : '';
    row.innerHTML = `
      <h3>${item.product_title || item.sku_id}</h3>
      <p class="muted">SKU: ${item.sku_id}</p>
      <p>Количество: ${item.quantity}</p>
      <p>Цена: ${formatRub(item.line_total ?? 0)}</p>
      ${unavailableHint}
    `;
    root.appendChild(row);
  });

  const finalAmount = state.promo?.final_amount ?? (cart.summary?.total_amount ?? totals.amount);
  $('checkoutTotal').textContent = formatRub(finalAmount);
}

async function applyPromo() {
  if (!state.authToken) {
    setMessage('promoResult', 'Сначала войдите как покупатель', true);
    return;
  }

  const cart = await api('/api/v1/cart/', { headers: apiHeaders() });
  const totals = calculateCartTotals(cart.items || []);
  if (!totals.amount) {
    setMessage('promoResult', 'Корзина пуста', true);
    return;
  }

  const code = $('promoCodeInput').value.trim();
  if (!code) {
    setMessage('promoResult', 'Введите промокод', true);
    return;
  }

  try {
    const result = await api('/api/v1/promo/promo/preview/', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ code, amount: totals.amount }),
    });

    if (!result.valid) {
      state.promo = null;
      setMessage('promoResult', `Промокод не применен: ${result.reason || 'unknown'}`, true);
      await renderCheckoutPreview();
      return;
    }

    state.promo = result;
    setMessage('promoResult', `Скидка ${formatRub(result.discount)}. Итого ${formatRub(result.final_amount)}`);
    await renderCheckoutPreview();
  } catch (error) {
    state.promo = null;
    setMessage('promoResult', error.message, true);
  }
}

async function loadDeliverySlots() {
  const city = $('slotCityInput').value.trim();
  const select = $('slotSelect');
  select.innerHTML = '<option value="">Загрузка...</option>';

  try {
    const params = new URLSearchParams();
    if (city) {
      params.set('city', city);
    }

    const slots = await api(`/api/v1/logistics/logistics/slots/?${params.toString()}`);
    select.innerHTML = '<option value="">Выберите слот</option>';
    if (!slots.length) {
      select.innerHTML = '<option value="">Слоты не найдены</option>';
      return;
    }

    slots.forEach((slot) => {
      const free = Number(slot.capacity) - Number(slot.booked);
      const option = document.createElement('option');
      option.value = slot.id;
      option.textContent = `${slot.city} ${slot.date} ${slot.window_from}-${slot.window_to} (свободно: ${free})`;
      select.appendChild(option);
    });
  } catch (error) {
    select.innerHTML = `<option value="">Ошибка: ${error.message}</option>`;
  }
}

function rememberShipmentId(shipmentId) {
  if (!state.userId) {
    return;
  }
  const key = state.userId;
  const existing = state.shipmentIdsByUser[key] || [];
  if (!existing.includes(shipmentId)) {
    state.shipmentIdsByUser[key] = [shipmentId, ...existing];
    persistLocalData();
  }
}

async function runCheckoutFlow() {
  if (!state.authToken) {
    setMessage('checkoutFlowMsg', 'Для оформления нужно войти как покупатель', true);
    return;
  }
  if (isModeratorMode()) {
    setMessage('checkoutFlowMsg', 'Модератор не может оформлять заказы в этом режиме', true);
    return;
  }

  const slotId = $('slotSelect').value;
  if (!slotId) {
    setMessage('checkoutFlowMsg', 'Выберите слот доставки', true);
    return;
  }

  try {
    const cart = await api('/api/v1/cart/', { headers: apiHeaders() });
    if (!cart.items?.length) {
      setMessage('checkoutFlowMsg', 'Корзина пуста', true);
      return;
    }
    if (!cart.summary?.checkout_ready) {
      setMessage('checkoutFlowMsg', 'В корзине есть недоступные позиции или не хватает остатков', true);
      return;
    }

    const orderItems = (cart.checkout_payload?.items || []).map((item) => ({
      sku_id: item.sku_id,
      quantity: item.quantity,
    }));
    if (!orderItems.length) {
      setMessage('checkoutFlowMsg', 'Нет доступных позиций для оформления', true);
      return;
    }

    const order = await api('/api/v1/orders/orders/', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        idempotency_key: crypto.randomUUID(),
        items: orderItems,
        delivery_address: parseDeliveryAddress(),
        promo_code: state.promo?.promo_code || '',
      }),
    });
    const finalAmount = Number(order.total_amount || cart.summary?.total_amount || 0);

    const paymentHold = await api('/api/v1/payments/payments/hold/', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        order_id: order.id,
        user_id: state.userId,
        amount: finalAmount,
        currency: 'RUB',
        metadata: { source: 'frontend-checkout' },
      }),
    });

    const paymentCapture = await api(`/api/v1/payments/payments/${paymentHold.id}/capture/`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({}),
    });

    const shipment = await api('/api/v1/logistics/logistics/shipments/', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        order_id: order.id,
        user_id: state.userId,
        slot_id: slotId,
      }),
    });

    rememberShipmentId(shipment.id);
    state.lastPayment = paymentCapture;

    await api('/api/v1/cart/', {
      method: 'DELETE',
      headers: apiHeaders(),
    });

    state.promo = null;
    $('promoCodeInput').value = '';

    renderPaymentState(paymentCapture, order.id, shipment.id);
    setMessage('checkoutFlowMsg', `Заказ ${order.id} оформлен. Трекинг: ${shipment.tracking_number}`);

    await Promise.all([
      loadCart(),
      renderCheckoutPreview(),
      loadOrders(),
      loadShipments(),
    ]);

    activateTab('account');
  } catch (error) {
    setMessage('checkoutFlowMsg', error.message, true);
  }
}

function renderPaymentState(payment, orderId = null, shipmentId = null) {
  const root = $('paymentState');
  if (!payment) {
    root.innerHTML = '<p class="muted">Оплата еще не выполнялась</p>';
    return;
  }

  root.innerHTML = `
    <div class="profile-row"><strong>Order ID:</strong> ${orderId || payment.order_id}</div>
    <div class="profile-row"><strong>Payment ID:</strong> ${payment.id}</div>
    <div class="profile-row"><strong>Статус:</strong> ${payment.status}</div>
    <div class="profile-row"><strong>Сумма:</strong> ${formatRub(payment.amount)}</div>
    ${shipmentId ? `<div class="profile-row"><strong>Shipment ID:</strong> ${shipmentId}</div>` : ''}
  `;
}

async function cancelOrder(orderId) {
  await api(`/api/v1/orders/orders/${orderId}/cancel/`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ reason: 'Отмена пользователем из кабинета' }),
  });
}

function renderProfile() {
  $('profileInfo').innerHTML = `
    <div class="profile-row"><strong>Имя:</strong> ${state.fullName || '-'}</div>
    <div class="profile-row"><strong>Email:</strong> ${state.email || '-'}</div>
    <div class="profile-row"><strong>User ID:</strong> ${state.userId || '-'}</div>
    <div class="profile-row"><strong>Роль:</strong> ${activeUserRoleLabel()}</div>
  `;
}

async function loadOrders() {
  renderProfile();

  const root = $('ordersList');
  if (!state.authToken || isModeratorMode()) {
    root.innerHTML = '<p class="muted">История заказов доступна покупателю после входа</p>';
    return;
  }

  try {
    const data = await api('/api/v1/orders/orders/?limit=30&offset=0', { headers: apiHeaders() });
    const items = data.items || [];
    root.innerHTML = '';

    if (!items.length) {
      root.innerHTML = '<p class="muted">Заказов пока нет</p>';
      return;
    }

    items.forEach((order) => {
      const canCancel = ['PENDING', 'PAID'].includes(order.status);
      const node = document.createElement('article');
      node.className = 'order-item';
      node.innerHTML = `
        <div class="panel-head">
          <h3>Заказ ${order.id}</h3>
          <span class="badge">${order.status}</span>
        </div>
        <p class="muted">Создан: ${new Date(order.created_at).toLocaleString('ru-RU')}</p>
        <p><strong>Сумма:</strong> ${formatRub(order.total_amount || 0)}</p>
        <div class="order-lines">
          <div class="muted">Позиций: ${order.items_count || 0}</div>
        </div>
        ${canCancel ? '<button class="btn btn-danger cancel-order-btn">Отменить заказ</button>' : ''}
      `;

      const cancelBtn = node.querySelector('.cancel-order-btn');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', async () => {
          try {
            await cancelOrder(order.id);
            setMessage('accountMsg', `Заказ ${order.id} отменен`);
            await loadOrders();
          } catch (error) {
            setMessage('accountMsg', error.message, true);
          }
        });
      }

      root.appendChild(node);
    });
  } catch (error) {
    root.innerHTML = `<p class="muted" style="color:#be123c">${error.message}</p>`;
  }
}

async function createReturn(shipmentId) {
  await api(`/api/v1/logistics/logistics/shipments/${shipmentId}/returns/`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ reason: 'Возврат из личного кабинета' }),
  });
}

async function loadShipments() {
  const root = $('shipmentsList');
  if (!state.authToken || isModeratorMode()) {
    root.innerHTML = '<p class="muted">Трекинг доступен покупателю</p>';
    return;
  }

  const ids = state.shipmentIdsByUser[state.userId] || [];
  root.innerHTML = '';

  if (!ids.length) {
    root.innerHTML = '<p class="muted">Отправок пока нет</p>';
    return;
  }

  for (const shipmentId of ids) {
    try {
      const shipment = await api(`/api/v1/logistics/logistics/shipments/${shipmentId}/tracking/`, {
        headers: apiHeaders(),
      });

      const node = document.createElement('article');
      node.className = 'order-item';
      node.innerHTML = `
        <div class="panel-head">
          <h3>Shipment ${shipment.id}</h3>
          <span class="badge">${shipment.status}</span>
        </div>
        <p><strong>Трек:</strong> ${shipment.tracking_number}</p>
        <p><strong>Слот:</strong> ${shipment.slot.city} ${shipment.slot.date} ${shipment.slot.window_from}-${shipment.slot.window_to}</p>
        <div class="order-lines">
          ${(shipment.events || []).map((event) => `<div class="muted">${event.status} • ${event.location || '-'} • ${new Date(event.at).toLocaleString('ru-RU')}</div>`).join('')}
        </div>
        <button class="btn btn-ghost return-btn">Оформить возврат</button>
      `;

      node.querySelector('.return-btn').addEventListener('click', async () => {
        try {
          await createReturn(shipment.id);
          setMessage('accountMsg', `Возврат по shipment ${shipment.id} создан`);
          await loadShipments();
        } catch (error) {
          setMessage('accountMsg', error.message, true);
        }
      });

      root.appendChild(node);
    } catch (error) {
      const node = document.createElement('article');
      node.className = 'order-item';
      node.innerHTML = `<p class="muted" style="color:#be123c">${shipmentId}: ${error.message}</p>`;
      root.appendChild(node);
    }
  }
}

async function loadBlockingReasons() {
  const reasons = await api('/api/v1/moderation/product-blocking-reasons/', {
    headers: moderationHeaders(),
  });
  state.blockingReasons = reasons || [];

  const select = $('declineReason');
  select.innerHTML = '<option value="">-</option>';
  state.blockingReasons.forEach((reason) => {
    const option = document.createElement('option');
    option.value = reason.code;
    option.textContent = `${reason.title} (${reason.code})`;
    select.appendChild(option);
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function moderationBadgeClass(status) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'MODERATED' || normalized === 'APPROVED') {
    return 'moderation-badge-success';
  }
  if (['BLOCKED', 'HARD_BLOCKED', 'DECLINED'].includes(normalized)) {
    return 'moderation-badge-danger';
  }
  return 'moderation-badge-warning';
}

function renderModerationImages(images, emptyText = 'Изображения не добавлены') {
  const items = asArray(images).filter((image) => image?.url);
  if (!items.length) {
    return `<p class="muted">${escapeHtml(emptyText)}</p>`;
  }
  return `
    <div class="gallery-grid moderation-gallery">
      ${items.map((image) => `<img src="${escapeHtml(image.url)}" alt="Изображение товара" loading="lazy" class="gallery-image" />`).join('')}
    </div>
  `;
}

function renderModerationCharacteristics(items, emptyText = 'Характеристики не указаны') {
  const rows = asArray(items).filter((item) => item?.name || item?.value);
  if (!rows.length) {
    return `<p class="muted">${escapeHtml(emptyText)}</p>`;
  }
  return `
    <div class="profile-info">
      ${rows.map((item) => `
        <div class="profile-row">
          <strong>${escapeHtml(item.name || 'Параметр')}:</strong> ${escapeHtml(item.value || '-')}
        </div>
      `).join('')}
    </div>
  `;
}

function renderModerationFieldReports(items) {
  const reports = asArray(items).filter((item) => item?.field || item?.message);
  if (!reports.length) {
    return '';
  }
  return `
    <div class="divider"></div>
    <div class="content-section">
      <div class="content-label">Замечания модерации</div>
      <div class="profile-info">
        ${reports.map((report) => `
          <div class="profile-row">
            <strong>${escapeHtml(report.field || 'Поле')}:</strong> ${escapeHtml(report.message || 'Нужно исправление')}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderModerationSkus(items, productTitle = '') {
  const skus = asArray(items).filter(Boolean);
  if (!skus.length) {
    return '<p class="muted">SKU пока нет. Такая карточка не должна задерживаться в модерации.</p>';
  }

  const productStub = { title: productTitle || '' };

  return `
    <div class="moderation-sku-grid">
      ${skus.map((sku) => `
        <article class="order-item moderation-sku-card">
          <div class="panel-head">
            <h3>${escapeHtml(skuDisplayLabel(sku, productStub) || 'SKU без названия')}</h3>
            <span class="badge ${sku.deleted ? 'moderation-badge-danger' : 'moderation-badge-success'}">${sku.deleted ? 'DELETED' : 'ACTIVE'}</span>
          </div>
          <div class="profile-info">
            <div class="profile-row"><strong>SKU ID:</strong> ${escapeHtml(sku.id || '-')}</div>
            <div class="profile-row"><strong>Цена:</strong> ${formatRub(sku.price || 0)}</div>
            <div class="profile-row"><strong>Себестоимость:</strong> ${formatRub(sku.cost_price || 0)}</div>
            <div class="profile-row"><strong>Доступный остаток:</strong> ${escapeHtml(sku.active_quantity ?? 0)}</div>
            <div class="profile-row"><strong>В резерве:</strong> ${escapeHtml(sku.reserved_quantity ?? 0)}</div>
          </div>
          <div class="divider"></div>
          <div class="content-section">
            <div class="content-label">Фото SKU</div>
            ${renderModerationImages(sku.images, 'У SKU нет отдельных изображений')}
          </div>
          <div class="divider"></div>
          <div class="content-section">
            <div class="content-label">Характеристики SKU</div>
            ${renderModerationCharacteristics(sku.characteristics, 'Характеристики SKU не указаны')}
          </div>
        </article>
      `).join('')}
    </div>
  `;
}

function renderModerationCard(card) {
  const node = $('moderationCard');
  if (!card) {
    clearModerationDeclineForm();
    node.textContent = 'Очередь пуста';
    node.classList.add('muted');
    $('approveBtn').disabled = true;
    $('declineBtn').disabled = true;
    return;
  }

  clearModerationDeclineForm();
  node.classList.remove('muted');
  const snapshot = card.snapshot_after || {};
  const categoryName = snapshot.category?.name || 'Категория не указана';
  const status = snapshot.status || 'UNKNOWN';
  const blockingReason = snapshot.blocking_reason?.title || snapshot.blocking_reason?.code || '';
  const updatedAt = snapshot.updated_at || card.updated_at;
  const createdAt = snapshot.created_at || card.created_at;

  node.innerHTML = `
    <div class="panel-head">
      <div>
        <h3>${escapeHtml(snapshot.title || 'Карточка товара')}</h3>
        <p class="muted">Product ID: ${escapeHtml(card.product_id)}</p>
      </div>
      <span class="badge ${moderationBadgeClass(status)}">${escapeHtml(status)}</span>
    </div>

    <div class="profile-info">
      <div class="profile-row"><strong>Категория:</strong> ${escapeHtml(categoryName)}</div>
      <div class="profile-row"><strong>Событие в очереди:</strong> ${escapeHtml(card.event_type)}</div>
      <div class="profile-row"><strong>Статус очереди:</strong> ${escapeHtml(card.queue_status || 'PENDING')}</div>
      <div class="profile-row"><strong>SKU:</strong> ${escapeHtml(snapshot.skus_count ?? asArray(snapshot.skus).length)}</div>
      <div class="profile-row"><strong>Остаток:</strong> ${escapeHtml(snapshot.total_active_quantity ?? 0)}</div>
      <div class="profile-row"><strong>Обновлено:</strong> ${escapeHtml(new Date(updatedAt).toLocaleString('ru-RU'))}</div>
    </div>

    <div class="divider"></div>
    <div class="content-section">
      <div class="content-label">Описание</div>
      <div class="content-text">${escapeHtml(snapshot.description || 'Описание не заполнено')}</div>
    </div>

    <div class="divider"></div>
    <div class="content-section">
      <div class="content-label">Фото товара</div>
      ${renderModerationImages(snapshot.images)}
    </div>

    <div class="divider"></div>
    <div class="content-section">
      <div class="content-label">Характеристики товара</div>
      ${renderModerationCharacteristics(snapshot.characteristics)}
    </div>

    ${blockingReason ? `
      <div class="divider"></div>
      <div class="content-section">
        <div class="content-label">Текущая причина блокировки</div>
        <div class="content-text">${escapeHtml(blockingReason)}</div>
      </div>
    ` : ''}

    ${renderModerationFieldReports(snapshot.field_reports)}

    <div class="divider"></div>
    <div class="content-section">
      <div class="content-label">SKU продавца</div>
      ${renderModerationSkus(snapshot.skus, snapshot.title)}
    </div>

    <div class="divider"></div>
    <div class="content-section">
      <div class="content-label">Таймлайн карточки</div>
      <div class="profile-info">
        <div class="profile-row"><strong>Создано:</strong> ${escapeHtml(new Date(createdAt).toLocaleString('ru-RU'))}</div>
        <div class="profile-row"><strong>В очереди с:</strong> ${escapeHtml(new Date(card.created_at).toLocaleString('ru-RU'))}</div>
        <div class="profile-row"><strong>Назначено:</strong> ${escapeHtml(card.assigned_to || 'Еще не назначено')}</div>
      </div>
    </div>
  `;
  $('approveBtn').disabled = false;
  $('declineBtn').disabled = false;
}

async function getNextCard() {
  try {
    const card = await api('/api/v1/moderation/product-moderation/get-next/', {
      method: 'POST',
      headers: moderationHeaders(),
      body: JSON.stringify({}),
    });
    state.currentModerationCard = card;
    renderModerationCard(card);
    setMessage(
      'moderationMsg',
      card
        ? 'Карточка получена. Теперь можно одобрить или отклонить товар.'
        : 'Очередь пуста. Товар попадет сюда после создания карточки и первого SKU у продавца.',
    );
  } catch (error) {
    state.currentModerationCard = null;
    renderModerationCard(null);
    setMessage('moderationMsg', error.message, true);
  }
}

async function approveCurrent() {
  if (!state.currentModerationCard) {
    setMessage('moderationMsg', 'Сначала возьмите следующую карточку из очереди модерации', true);
    return;
  }
  try {
    const productId = state.currentModerationCard.product_id;
    const result = await api(`/api/v1/moderation/products/${productId}/approve/`, {
      method: 'POST',
      headers: moderationHeaders(),
      body: JSON.stringify({}),
    });
    setMessage('moderationMsg', `Товар ${result.product_id} переведен в ${result.status}`);
    state.currentModerationCard = null;
    renderModerationCard(null);
  } catch (error) {
    setMessage('moderationMsg', error.message, true);
  }
}

async function declineCurrent() {
  if (!state.currentModerationCard) {
    setMessage('moderationMsg', 'Сначала возьмите следующую карточку из очереди модерации', true);
    return;
  }
  try {
    const reasonCode = $('declineReason').value;
    if (!reasonCode) {
      setMessage('moderationMsg', 'Выберите причину блокировки перед отклонением товара', true);
      return;
    }
    const productId = state.currentModerationCard.product_id;
    const payload = {
      reason_code: reasonCode,
      comment: $('declineComment').value.trim(),
      fields: [],
    };

    const result = await api(`/api/v1/moderation/products/${productId}/decline/`, {
      method: 'POST',
      headers: moderationHeaders(),
      body: JSON.stringify(payload),
    });
    setMessage('moderationMsg', `Товар ${result.product_id} переведен в ${result.status}`);
    state.currentModerationCard = null;
    renderModerationCard(null);
  } catch (error) {
    setMessage('moderationMsg', error.message, true);
  }
}

function bindEvents() {
  syncAuthInputs({
    email: state.email || '',
    password: '',
    username: '',
    firstName: '',
    lastName: '',
    roleMode: state.roleMode || 'CUSTOMER',
  });

  $('authLoginBtn').addEventListener('click', () => openAuthPage('login'));
  $('authRegisterBtn').addEventListener('click', () => openAuthPage('register'));
  $('accountLoginBtn').addEventListener('click', () => openAuthPage('login'));
  $('accountRegisterBtn').addEventListener('click', () => openAuthPage('register'));
  $('authLogoutBtn').addEventListener('click', () => {
    void logout();
  });
  $('accountLogoutBtn').addEventListener('click', () => {
    void logout();
  });
  $('refreshAll').addEventListener('click', bootData);

  $('refreshProducts').addEventListener('click', loadProducts);
  $('reloadHomeProducts').addEventListener('click', loadHomeProducts);
  $('searchInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      loadProducts();
    }
  });

  $('categorySelect').addEventListener('change', () => {
    loadProducts();
  });
  $('sortSelect').addEventListener('change', () => {
    loadProducts();
  });

  $('goPromoCheckoutBtn').addEventListener('click', () => {
    activateTab('checkout');
  });
  const polinaGo = $('polinaBannerGoCheckout');
  if (polinaGo) {
    polinaGo.addEventListener('click', () => activateTab('checkout'));
  }
  const polinaFill = $('polinaBannerPrefill');
  if (polinaFill) {
    polinaFill.addEventListener('click', () => {
      const input = $('promoCodeInput');
      if (input) {
        input.value = 'POLINA';
      }
      activateTab('checkout');
      setMessage('checkoutFlowMsg', 'Код POLINA подставлен — нажмите «Применить промокод».', false);
    });
  }
  $('loadQaQueueBtn').addEventListener('click', loadQaModerationQueue);
  $('submitQaAnswerBtn').addEventListener('click', submitQaAnswer);

  $('clearCart').addEventListener('click', async () => {
    if (!state.authToken) {
      setMessage('checkoutMsg', 'Войдите в аккаунт, чтобы очистить корзину', true);
      return;
    }
    invalidatePromoState();
    await api('/api/v1/cart/', { method: 'DELETE', headers: apiHeaders() });
    await Promise.all([loadCart(), renderCheckoutPreview()]);
  });

  $('goCheckoutTabBtn').addEventListener('click', () => activateTab('checkout'));

  $('applyPromoBtn').addEventListener('click', applyPromo);
  $('loadSlotsBtn').addEventListener('click', loadDeliverySlots);
  $('checkoutBtn').addEventListener('click', runCheckoutFlow);

  $('saveAddressBtn').addEventListener('click', saveAddress);

  $('reloadOrdersBtn').addEventListener('click', async () => {
    await Promise.all([loadOrders(), loadShipments()]);
  });

  $('getNextCard').addEventListener('click', getNextCard);
  $('approveBtn').addEventListener('click', approveCurrent);
  $('declineBtn').addEventListener('click', declineCurrent);
}

async function bootData() {
  renderAuthState();
  setRoleVisibility();

  if (isModeratorMode()) {
    try {
      await loadBlockingReasons();
    } catch (error) {
      setMessage('moderationMsg', `Не удалось загрузить причины блокировки: ${error.message}`, true);
    }
    await loadQaModerationQueue();
    try {
      if (!state.currentModerationCard) {
        await getNextCard();
      } else {
        renderModerationCard(state.currentModerationCard);
        setMessage('moderationMsg', 'Данные модерации обновлены');
      }
    } catch (error) {
      setMessage('moderationMsg', error.message, true);
    }
    return;
  }

  try {
    await Promise.all([
      loadCategories(),
      loadProducts(),
      loadBanners(),
      loadCollections(),
      loadHomeProducts(),
      loadFavorites(),
      loadCart(),
      loadOrders(),
      loadShipments(),
      renderCheckoutPreview(),
    ]);
  } catch (error) {
    setMessage('checkoutMsg', `Ошибка загрузки: ${error.message}`, true);
  }

  renderAddressBook();

  const activeAddress = getActiveAddress();
  if (activeAddress) {
    applyAddressToCheckout(activeAddress);
  }

  renderPaymentState(state.lastPayment);
}

async function boot() {
  hydrateSession();
  wireTabs();
  bindEvents();
  initTopbarPromoCarousel();
  renderAuthState();
  setRoleVisibility();
  const hash = (window.location.hash || '').replace(/^#/, '').trim();
  if (hash) {
    activateTab(hash);
  }
  renderAddressBook();

  if (state.authToken) {
    await bootData();
  } else {
    clearProductDetails();
  }
}

boot();
