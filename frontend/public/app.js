const AUTH_API_BASE = '/api/v1/auth';
const AUTH_STORAGE_KEY = 'neomarket-auth-session';
const AUTH_RETURN_URL_KEY = 'neomarket-auth-return-url';

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

function activateTab(tabId) {
  document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
  document.querySelectorAll('.panel').forEach((panel) => panel.classList.remove('active'));

  const tab = document.querySelector(`.tab[data-tab="${tabId}"]`);
  const panel = $(tabId);
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

function moderationHeaders(extra = {}) {
  return apiHeaders(extra);
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  if (response.status === 204) {
    return null;
  }
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
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
    renderAccountAuthActions();
    return;
  }

  node.textContent = `${state.fullName || state.email} (${activeUserRoleLabel()}) • ${state.userId}`;
  renderAccountAuthActions();
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

async function loadProductSkus(productId) {
  const skus = await api(`/api/v1/catalog/products/${productId}/skus/`);
  skus.forEach((sku) => {
    state.skuMap[sku.id] = {
      product_id: productId,
      sku_id: sku.id,
      title: sku.name,
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
  if (!skuId) {
    throw new Error('Выберите SKU');
  }

  const skuData = state.skuMap[skuId] || {};
  skuData.product_id = product.id;
  skuData.product_title = product.title;
  state.skuMap[skuId] = skuData;
  persistLocalData();

  await api('/api/v1/cart/cart/items/', {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ sku_id: skuId, quantity }),
  });
}

function productCardNode(product) {
  const node = $('productTemplate').content.firstElementChild.cloneNode(true);
  node.querySelector('.product-title').textContent = product.title;
  node.querySelector('.product-price').textContent = formatRub(product.price);
  node.querySelector('.product-meta').textContent = product.in_stock ? 'В наличии' : 'Нет в наличии';

  const skuSelect = node.querySelector('.sku-select');
  const addCartButton = node.querySelector('.add-cart-btn');
  skuSelect.innerHTML = '<option>Загрузка SKU...</option>';
  addCartButton.disabled = true;
  addCartButton.textContent = 'Загрузка SKU...';

  loadProductSkus(product.id)
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
        option.textContent = `${sku.name} - ${formatRub(sku.price)}`;
        skuSelect.appendChild(option);
      });
      addCartButton.disabled = false;
      addCartButton.textContent = 'В корзину';
    })
    .catch(() => {
      skuSelect.innerHTML = '<option value="">Не удалось загрузить SKU</option>';
      addCartButton.textContent = 'Ошибка SKU';
    });

  node.querySelector('.favorite-btn').addEventListener('click', async () => {
    try {
      if (!state.authToken) {
        throw new Error('Для избранного нужна авторизация');
      }
      await api(`/api/v1/cart/favorites/${product.id}/`, {
        method: 'POST',
        headers: apiHeaders(),
      });
      await loadFavorites();
    } catch (error) {
      setMessage('accountMsg', error.message, true);
    }
  });

  addCartButton.addEventListener('click', async () => {
    try {
      await addToCart(product, skuSelect.value, 1);
      await Promise.all([loadCart(), renderCheckoutPreview()]);
      setMessage('checkoutMsg', 'Товар добавлен в корзину');
    } catch (error) {
      setMessage('checkoutMsg', error.message, true);
    }
  });

  node.querySelector('.details-btn').addEventListener('click', async () => {
    await openProductDetails(product.id);
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

function buildGallery(productId) {
  const suffixes = ['a', 'b', 'c'];
  return suffixes.map((suffix, index) => `https://picsum.photos/seed/${productId}-${suffix}/420/${280 + index}`);
}

function renderQa(payload) {
  const list = $('qaList');
  list.innerHTML = '';
  const items = payload?.items || [];
  if (!items.length) {
    list.innerHTML = '<p class="muted">Пока вопросов нет</p>';
    return;
  }

  items.forEach((item) => {
    const node = document.createElement('article');
    node.className = 'qa-item';
    node.innerHTML = `
      <p><strong>Вопрос:</strong> ${item.question}</p>
      <p class="muted"><strong>Кто:</strong> ${item.user_id}</p>
      <p class="muted"><strong>Когда:</strong> ${new Date(item.created_at).toLocaleString('ru-RU')}</p>
      <p><strong>Ответ:</strong> ${item.answer || 'Пока нет ответа продавца'}</p>
    `;
    list.appendChild(node);
  });
}

async function loadProductQa(productId) {
  return api(`/api/v1/reviews/qa/questions/?product_id=${productId}`);
}

function renderQaModerationQueue(payload) {
  const root = $('qaModerationList');
  root.innerHTML = '';
  const items = payload?.items || [];
  if (!items.length) {
    root.innerHTML = '<p class="muted">Открытых вопросов нет</p>';
    state.selectedQaQuestionId = '';
    $('submitQaAnswerBtn').disabled = true;
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

async function openProductDetails(productId) {
  state.currentProductId = productId;
  const [details, similar, reviews, qa] = await Promise.all([
    api(`/api/v1/catalog/products/${productId}/`),
    api(`/api/v1/catalog/products/${productId}/similar/?limit=6&offset=0`),
    api(`/api/v1/reviews/reviews/?product_id=${productId}`),
    loadProductQa(productId),
  ]);

  state.currentProduct = details;
  const detailsRoot = $('productDetails');
  const gallery = buildGallery(productId);
  const galleryMarkup = gallery
    .map((url) => `<img src="${url}" alt="${details.title}" loading="lazy" class="gallery-image" />`)
    .join('');

  const skuOptions = (details.skus || [])
    .map((sku) => `<option value="${sku.id}">${sku.name} - ${formatRub(sku.price)}</option>`)
    .join('');

  const characteristicItems = [
    { key: 'Статус', value: details.status || 'UNKNOWN' },
    { key: 'Категория', value: details.category?.name || 'Не задана' },
    { key: 'SKU', value: String(details.skus?.length || 0) },
  ];
  const characteristicsMarkup = characteristicItems
    .map((item) => `<div class="profile-row"><strong>${item.key}:</strong> ${item.value}</div>`)
    .join('');

  const similarMarkup = (similar.items || [])
    .map((item) => `<button class="btn btn-ghost similar-link" data-id="${item.id}">${item.title}</button>`)
    .join('');

  detailsRoot.classList.remove('muted');
  detailsRoot.innerHTML = `
    <h3>${details.title}</h3>
    <p class="muted">${details.description || 'Описание пока не заполнено'}</p>
    <div class="gallery-grid">${galleryMarkup}</div>
    <div class="divider"></div>
    <h4 class="subhead">Характеристики</h4>
    <div class="profile-info">${characteristicsMarkup}</div>
    <div class="field">
      <label for="detailsSkuSelect">SKU</label>
      <select id="detailsSkuSelect">${skuOptions || '<option value="">Нет SKU</option>'}</select>
    </div>
    <button id="detailsAddToCartBtn" class="btn btn-primary">Добавить в корзину</button>
    <div class="divider"></div>
    <h4 class="subhead">Похожие товары</h4>
    <div class="similar-grid">${similarMarkup || '<p class="muted">Похожие товары не найдены</p>'}</div>
  `;

  $('submitReviewBtn').disabled = !state.authToken;
  $('askQuestionBtn').disabled = !state.authToken;
  renderReviews(reviews);
  renderQa(qa);

  const detailsSkuSelect = $('detailsSkuSelect');
  const detailsAddToCartBtn = $('detailsAddToCartBtn');
  if (!detailsSkuSelect.value) {
    detailsAddToCartBtn.disabled = true;
    detailsAddToCartBtn.textContent = 'Нет SKU для покупки';
  }
  detailsAddToCartBtn.addEventListener('click', async () => {
    try {
      await addToCart(details, detailsSkuSelect.value, 1);
      await Promise.all([loadCart(), renderCheckoutPreview()]);
      setMessage('checkoutMsg', 'Товар добавлен в корзину');
      activateTab('cart');
    } catch (error) {
      setMessage('checkoutMsg', error.message, true);
    }
  });

  detailsRoot.querySelectorAll('.similar-link').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await openProductDetails(btn.dataset.id);
    });
  });
}

function clearProductDetails() {
  state.currentProductId = null;
  state.currentProduct = null;
  $('productDetails').classList.add('muted');
  $('productDetails').textContent = 'Выберите товар, чтобы увидеть галерею, характеристики, рейтинг и Q&A.';
  $('reviewsSummary').textContent = '';
  $('reviewsList').innerHTML = '';
  $('qaList').innerHTML = '';
  $('submitReviewBtn').disabled = true;
  $('askQuestionBtn').disabled = true;
  setMessage('qaMsg', '');
}

function renderReviews(payload) {
  const summary = payload?.summary || { avg_rating: 0, total: 0 };
  $('reviewsSummary').textContent = `Средняя оценка: ${Number(summary.avg_rating || 0).toFixed(1)} (${summary.total} отзывов)`;

  const root = $('reviewsList');
  root.innerHTML = '';
  const items = payload?.items || [];
  if (!items.length) {
    root.innerHTML = '<p class="muted">Пока отзывов нет</p>';
    return;
  }

  items.forEach((review) => {
    const node = document.createElement('article');
    node.className = 'review-item';
    node.innerHTML = `
      <p><strong>${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</strong></p>
      <p>${review.text || 'Без текста'}</p>
      <p class="muted">Пользователь: ${review.user_id}</p>
    `;
    root.appendChild(node);
  });
}

async function submitReview() {
  if (!state.authToken) {
    setMessage('reviewMsg', 'Для отзыва нужна авторизация', true);
    return;
  }
  if (!state.currentProductId) {
    setMessage('reviewMsg', 'Сначала выберите товар', true);
    return;
  }

  try {
    const payload = {
      product_id: state.currentProductId,
      user_id: state.userId,
      rating: Number($('reviewRating').value),
      text: $('reviewText').value.trim(),
    };
    await api('/api/v1/reviews/reviews/', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify(payload),
    });
    $('reviewText').value = '';
    setMessage('reviewMsg', 'Отзыв добавлен');
    const reviews = await api(`/api/v1/reviews/reviews/?product_id=${state.currentProductId}`);
    renderReviews(reviews);
  } catch (error) {
    setMessage('reviewMsg', error.message, true);
  }
}

async function askQuestion() {
  if (!state.authToken || !state.currentProductId) {
    setMessage('qaMsg', 'Нужна авторизация и выбранный товар', true);
    return;
  }
  const question = $('qaQuestionInput').value.trim();
  if (!question) {
    setMessage('qaMsg', 'Введите вопрос', true);
    return;
  }

  try {
    await api('/api/v1/reviews/qa/questions/', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        product_id: state.currentProductId,
        user_id: state.userId,
        question,
      }),
    });

    $('qaQuestionInput').value = '';
    const payload = await loadProductQa(state.currentProductId);
    renderQa(payload);
    setMessage('qaMsg', 'Вопрос добавлен');
  } catch (error) {
    setMessage('qaMsg', error.message, true);
  }
}

async function loadBanners() {
  const data = await api('/api/v1/cart/home/banners/');
  const root = $('heroBanners');
  root.innerHTML = '';

  (data.items || []).forEach((banner) => {
    const node = document.createElement('article');
    node.className = 'banner-item';
    node.style.backgroundImage = `url('${banner.image}')`;
    node.innerHTML = `<div class="banner-copy"><strong>${banner.title}</strong><p>${banner.subtitle || ''}</p></div>`;
    root.appendChild(node);
  });
}

async function loadCollections() {
  const data = await api('/api/v1/cart/main/collections/');
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
      const payload = await api(`/api/v1/cart/collections/${collection.id}/products/`);
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
  const data = await api('/api/v1/cart/cart/also_bought/');
  state.homeProducts = data.items || [];
  renderHomeProducts();
}

function calculateCartTotals(items) {
  let amount = 0;
  const normalized = items.map((item) => {
    const skuData = state.skuMap[item.sku_id] || {};
    const unitPrice = Number(skuData.unit_price || 0);
    const lineTotal = unitPrice * Number(item.quantity || 0);
    amount += lineTotal;
    return {
      ...item,
      title: skuData.product_title || skuData.title || item.sku_id,
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

  const data = await api('/api/v1/cart/cart/', { headers: apiHeaders() });
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
    row.innerHTML = `
      <strong>${item.title}</strong>
      <div class="muted">SKU: ${item.sku_id}</div>
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
      await api(`/api/v1/cart/cart/items/${item.item_id}/`, {
        method: 'PUT',
        headers: apiHeaders(),
        body: JSON.stringify({ quantity: item.quantity - 1 }),
      });
      await Promise.all([loadCart(), renderCheckoutPreview()]);
    });

    row.querySelector('.qty-inc').addEventListener('click', async () => {
      await api(`/api/v1/cart/cart/items/${item.item_id}/`, {
        method: 'PUT',
        headers: apiHeaders(),
        body: JSON.stringify({ quantity: item.quantity + 1 }),
      });
      await Promise.all([loadCart(), renderCheckoutPreview()]);
    });

    row.querySelector('.remove').addEventListener('click', async () => {
      await api(`/api/v1/cart/cart/items/${item.item_id}/`, {
        method: 'DELETE',
        headers: apiHeaders(),
      });
      await Promise.all([loadCart(), renderCheckoutPreview()]);
    });

    root.appendChild(row);
  });

  $('cartSummary').textContent = `Позиций: ${data.summary.total_items}. Товаров: ${data.summary.total_quantity}. Сумма: ${formatRub(totals.amount)}`;
  await renderCheckoutPreview();
}

async function loadFavorites() {
  const list = $('favoritesList');
  if (!state.authToken) {
    list.innerHTML = '<p class="muted">Избранное доступно после входа</p>';
    return;
  }

  try {
    const data = await api('/api/v1/cart/favorites/?limit=20&offset=0', { headers: apiHeaders() });
    const items = data.items || [];
    list.innerHTML = '';

    if (!items.length) {
      list.innerHTML = '<p class="muted">Избранное пока пусто</p>';
      return;
    }

    items.forEach((favorite) => {
      const productId = favorite.product?.id || favorite.product_id;
      const node = document.createElement('article');
      node.className = 'favorite-item';
      node.innerHTML = `
        <strong>${productId}</strong>
        <div class="muted">Добавлено: ${new Date(favorite.added_at).toLocaleString('ru-RU')}</div>
        <div class="product-actions">
          <button class="btn btn-ghost open-product">К товару</button>
          <button class="btn btn-ghost remove-fav">Удалить</button>
        </div>
      `;

      node.querySelector('.open-product').addEventListener('click', async () => {
        activateTab('catalog');
        await openProductDetails(productId);
      });

      node.querySelector('.remove-fav').addEventListener('click', async () => {
        await api(`/api/v1/cart/favorites/${productId}/`, {
          method: 'DELETE',
          headers: apiHeaders(),
        });
        await loadFavorites();
      });

      list.appendChild(node);
    });
  } catch (error) {
    list.innerHTML = `<p class="muted" style="color:#be123c">${error.message}</p>`;
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
  return {
    city: $('deliveryCity').value.trim() || 'Moscow',
    street: $('deliveryStreet').value.trim() || 'Tverskaya 1',
    apartment: $('deliveryApartment').value.trim() || '1',
    comment: $('deliveryComment').value.trim() || '',
  };
}

async function renderCheckoutPreview() {
  const root = $('checkoutItems');
  root.innerHTML = '';

  if (!state.authToken) {
    root.innerHTML = '<p class="muted">Для оформления нужно войти как покупатель</p>';
    $('checkoutTotal').textContent = '0 ₽';
    return;
  }

  const cart = await api('/api/v1/cart/cart/', { headers: apiHeaders() });
  const items = cart.items || [];

  if (!items.length) {
    root.innerHTML = '<p class="muted">Корзина пуста</p>';
    $('checkoutTotal').textContent = '0 ₽';
    return;
  }

  const totals = calculateCartTotals(items);
  items.forEach((item) => {
    const skuData = state.skuMap[item.sku_id] || {};
    const row = document.createElement('article');
    row.className = 'order-item';
    row.innerHTML = `
      <h3>${skuData.product_title || skuData.title || item.sku_id}</h3>
      <p class="muted">SKU: ${item.sku_id}</p>
      <p>Количество: ${item.quantity}</p>
      <p>Цена: ${formatRub((skuData.unit_price || 0) * item.quantity)}</p>
    `;
    root.appendChild(row);
  });

  const finalAmount = state.promo?.final_amount ?? totals.amount;
  $('checkoutTotal').textContent = formatRub(finalAmount);
}

async function applyPromo() {
  if (!state.authToken) {
    setMessage('promoResult', 'Сначала войдите как покупатель', true);
    return;
  }

  const cart = await api('/api/v1/cart/cart/', { headers: apiHeaders() });
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
    const result = await api('/api/v1/promo/promo/apply/', {
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
    const cart = await api('/api/v1/cart/cart/', { headers: apiHeaders() });
    if (!cart.items?.length) {
      setMessage('checkoutFlowMsg', 'Корзина пуста', true);
      return;
    }

    const totals = calculateCartTotals(cart.items);
    const orderItems = totals.normalized.map((item) => {
      const skuData = state.skuMap[item.sku_id] || {};
      if (!skuData.product_id) {
        throw new Error(`Не хватает product_id для SKU ${item.sku_id}`);
      }
      return {
        product_id: skuData.product_id,
        sku_id: item.sku_id,
        quantity: item.quantity,
        unit_price: { amount: item.unitPrice, currency: 'RUB' },
        line_total: { amount: item.lineTotal, currency: 'RUB' },
      };
    });

    const finalAmount = state.promo?.final_amount ?? totals.amount;

    const order = await api('/api/v1/orders/orders/', {
      method: 'POST',
      headers: apiHeaders({ 'Idempotency-Key': crypto.randomUUID() }),
      body: JSON.stringify({
        items: orderItems,
        total: { amount: finalAmount, currency: 'RUB' },
        delivery_address: parseDeliveryAddress(),
        payment_method: 'CARD_ONLINE',
        comment: state.promo?.promo_code ? `promo=${state.promo.promo_code}` : 'checkout flow',
      }),
    });

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

    await api('/api/v1/cart/cart/', {
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
      const canCancel = ['PENDING', 'PAID', 'ASSEMBLING'].includes(order.status);
      const node = document.createElement('article');
      node.className = 'order-item';
      node.innerHTML = `
        <div class="panel-head">
          <h3>Заказ ${order.id}</h3>
          <span class="badge">${order.status}</span>
        </div>
        <p class="muted">Создан: ${new Date(order.created_at).toLocaleString('ru-RU')}</p>
        <p><strong>Сумма:</strong> ${formatRub(order.total?.amount || 0)}</p>
        <div class="order-lines">
          ${(order.items || []).map((item) => `<div class="muted">SKU ${item.sku_id} x ${item.quantity}</div>`).join('')}
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
  select.innerHTML = '';
  state.blockingReasons.forEach((reason) => {
    const option = document.createElement('option');
    option.value = reason.code;
    option.textContent = `${reason.title} (${reason.code})`;
    select.appendChild(option);
  });
}

function renderModerationCard(card) {
  const node = $('moderationCard');
  if (!card) {
    node.textContent = 'Очередь пуста';
    $('approveBtn').disabled = true;
    $('declineBtn').disabled = true;
    return;
  }

  node.innerHTML = `<pre>${JSON.stringify(card, null, 2)}</pre>`;
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
    setMessage('moderationMsg', card ? 'Карточка получена' : 'Очередь пуста');
  } catch (error) {
    state.currentModerationCard = null;
    renderModerationCard(null);
    setMessage('moderationMsg', error.message, true);
  }
}

async function approveCurrent() {
  if (!state.currentModerationCard) {
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
    return;
  }
  try {
    const productId = state.currentModerationCard.product_id;
    const payload = {
      reason_code: $('declineReason').value,
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

  $('openCatalogFromDetails').addEventListener('click', clearProductDetails);
  $('submitReviewBtn').addEventListener('click', submitReview);
  $('askQuestionBtn').addEventListener('click', askQuestion);
  $('loadQaQueueBtn').addEventListener('click', loadQaModerationQueue);
  $('submitQaAnswerBtn').addEventListener('click', submitQaAnswer);

  $('clearCart').addEventListener('click', async () => {
    if (!state.authToken) {
      return;
    }
    await api('/api/v1/cart/cart/', { method: 'DELETE', headers: apiHeaders() });
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
      await loadQaModerationQueue();
      setMessage('moderationMsg', 'Режим модератора активен');
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
  renderAuthState();
  setRoleVisibility();
  renderAddressBook();

  if (state.authToken) {
    await bootData();
  } else {
    clearProductDetails();
  }
}

boot();
