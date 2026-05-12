const AUTH_STORAGE_KEY = 'neomarket-auth-session';

let authRefreshPromise = null;

function parseJson(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function authSession() {
  return parseJson(localStorage.getItem(AUTH_STORAGE_KEY), null);
}

function clearAuthSessionStorage() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

async function tryRefreshAuthSession() {
  const session = authSession();
  const refreshToken = session?.refreshToken;
  if (!refreshToken) {
    return false;
  }
  if (!authRefreshPromise) {
    authRefreshPromise = (async () => {
      try {
        const response = await fetch('/api/v1/auth/refresh/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        const contentType = response.headers.get('content-type') || '';
        const data = contentType.includes('application/json') ? await response.json() : null;
        if (!response.ok) {
          if (response.status === 401 || response.status === 400) {
            clearAuthSessionStorage();
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

function formatRub(amount) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function looksLikeMojibakeSkuName(text) {
  const t = String(text || '');
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

function apiHeaders(extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra };
  const session = authSession();
  const userId = session?.user?.id;
  const token = session?.accessToken;
  const role = session?.user?.role;
  if (userId) {
    headers['X-User-Id'] = userId;
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (role) {
    headers['X-Roles'] = String(role);
  }
  return headers;
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
        const baseHeaders =
          options.headers && typeof options.headers === 'object' && !(options.headers instanceof Headers)
            ? { ...options.headers }
            : {};
        return api(path, { ...options, headers: { ...baseHeaders, ...apiHeaders() } }, false);
      }
    }
    const message = data?.message || data?.detail || data?.code || `HTTP ${response.status}`;
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
  }
  return data;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getProductIdFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const id = (params.get('id') || '').trim();
  return UUID_RE.test(id) ? id : '';
}

function setMsg(el, text, isError) {
  if (!el) {
    return;
  }
  el.textContent = text || '';
  el.style.color = isError ? '#be123c' : '#5f6774';
}

function galleryUrls(product) {
  const imgs = (product.images || [])
    .map((im) => im?.url || im?.image_url)
    .filter(Boolean);
  if (imgs.length) {
    return imgs;
  }
  const pid = String(product.id || 'x');
  return ['a', 'b', 'c'].map(
    (suffix, index) => `https://picsum.photos/seed/${pid}-${suffix}/800/${520 + index}`,
  );
}

function renderThumbs(urls, onPick) {
  const root = document.getElementById('productPageThumbs');
  root.innerHTML = '';
  urls.forEach((url, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `product-page-thumb${i === 0 ? ' is-active' : ''}`;
    b.style.backgroundImage = `url('${url.replace(/'/g, '%27')}')`;
    b.setAttribute('aria-label', `Фото ${i + 1}`);
    b.addEventListener('click', () => {
      root.querySelectorAll('.product-page-thumb').forEach((n) => n.classList.remove('is-active'));
      b.classList.add('is-active');
      onPick(url);
    });
    root.appendChild(b);
  });
}

function renderReviews(payload) {
  const summary = payload?.summary || { avg_rating: 0, total: 0 };
  document.getElementById('productPageReviewsSummary').textContent = `Средняя оценка: ${Number(
    summary.avg_rating || 0,
  ).toFixed(1)} (${summary.total} отзывов)`;

  const root = document.getElementById('productPageReviewsList');
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
      <p>${escapeHtml(review.text || 'Без текста')}</p>
      <p class="muted">Пользователь: ${escapeHtml(review.user_id)}</p>
    `;
    root.appendChild(node);
  });
}

function renderQa(payload) {
  const list = document.getElementById('productPageQaList');
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
      <p><strong>Вопрос:</strong> ${escapeHtml(item.question)}</p>
      <p class="muted"><strong>Кто:</strong> ${escapeHtml(item.user_id)}</p>
      <p class="muted"><strong>Когда:</strong> ${new Date(item.created_at).toLocaleString('ru-RU')}</p>
      <p><strong>Ответ:</strong> ${escapeHtml(item.answer || 'Пока нет ответа продавца')}</p>
    `;
    list.appendChild(node);
  });
}

async function loadProductQa(productId) {
  return api(`/api/v1/reviews/qa/questions/?product_id=${productId}`);
}

let currentProduct = null;
let currentProductId = '';

async function main() {
  const productId = getProductIdFromQuery();
  const errEl = document.getElementById('productPageError');
  const root = document.getElementById('productPageRoot');
  const uidEl = document.getElementById('productPageUid');

  if (!productId) {
    errEl.style.display = '';
    setMsg(errEl, 'Укажите корректный UUID товара в параметре ?id=', true);
    return;
  }

  uidEl.textContent = `UID: ${productId}`;

  try {
    const [details, similar, reviews, qa] = await Promise.all([
      api(`/api/v1/catalog/products/${productId}/`),
      api(`/api/v1/catalog/products/${productId}/similar/?limit=8&offset=0`),
      api(`/api/v1/reviews/reviews/?product_id=${productId}`),
      loadProductQa(productId),
    ]);

    currentProduct = details;
    currentProductId = productId;

    document.title = `${details.title} — NeoMarket`;

    document.getElementById('productPageBreadcrumb').innerHTML = `
      <a href="./">Главная</a> · <a href="./index.html#catalog">Каталог</a> · <span>${escapeHtml(details.title)}</span>
    `;

    document.getElementById('productPageTitle').textContent = details.title;
    document.getElementById('productPageCategory').textContent = details.category?.name
      ? `Категория: ${details.category.name}`
      : '';
    document.getElementById('productPageDescription').innerHTML = (details.description || '')
      .split('\n')
      .map((line) => escapeHtml(line))
      .join('<br/>');

    const urls = galleryUrls(details);
    const main = document.getElementById('productPageMainPhoto');
    const setMain = (url) => {
      main.style.backgroundImage = `url('${url.replace(/'/g, '%27')}')`;
    };
    setMain(urls[0]);
    renderThumbs(urls, setMain);

    const skus = details.skus || [];
    const skuSelect = document.getElementById('productPageSku');
    skuSelect.innerHTML = '';
    if (!skus.length) {
      skuSelect.innerHTML = '<option value="">Нет вариантов</option>';
    } else {
      skus.forEach((sku) => {
        const opt = document.createElement('option');
        opt.value = sku.id;
        opt.textContent = `${skuDisplayLabel(sku, details)} — ${formatRub(sku.price)}`;
        skuSelect.appendChild(opt);
      });
    }

    const firstSku = skus[0];
    document.getElementById('productPagePrice').textContent = firstSku
      ? formatRub(firstSku.price)
      : '—';
    document.getElementById('productPageStock').textContent = firstSku
      ? Number(firstSku.active_quantity) > 0
        ? `В наличии: ${firstSku.active_quantity} шт.`
        : 'Нет в наличии'
      : '';

    skuSelect.addEventListener('change', () => {
      const s = skus.find((x) => String(x.id) === skuSelect.value);
      if (s) {
        document.getElementById('productPagePrice').textContent = formatRub(s.price);
        document.getElementById('productPageStock').textContent =
          Number(s.active_quantity) > 0 ? `В наличии: ${s.active_quantity} шт.` : 'Нет в наличии';
      }
    });

    const specs = document.getElementById('productPageSpecs');
    const rows = [
      { k: 'UID товара', v: String(details.id) },
      { k: 'Статус', v: details.status || '—' },
      { k: 'Категория', v: details.category?.name || '—' },
      ...(details.characteristics || []).map((a) => ({
        k: a.name || '—',
        v: a.value || '—',
      })),
    ];
    specs.innerHTML = rows
      .map((r) => `<div class="profile-row"><strong>${escapeHtml(r.k)}:</strong> ${escapeHtml(r.v)}</div>`)
      .join('');

    const sim = document.getElementById('productPageSimilar');
    const simItems = similar.items || [];
    sim.innerHTML = simItems.length
      ? simItems
          .map(
            (it) =>
              `<a class="btn btn-ghost" href="./product.html?id=${encodeURIComponent(it.id)}">${escapeHtml(
                it.title,
              )}</a>`,
          )
          .join('')
      : '<p class="muted">Похожих товаров нет</p>';

    renderReviews(reviews);
    renderQa(qa);

    const session = authSession();
    const hasAuth = Boolean(session?.accessToken);
    document.getElementById('productPageSubmitReview').disabled = !hasAuth;
    document.getElementById('productPageAskQa').disabled = !hasAuth;

    root.style.display = '';
  } catch (e) {
    errEl.style.display = '';
    setMsg(errEl, e.message || String(e), true);
  }
}

function persistSkuMap(skuId, product) {
  const key = 'nm_sku_map';
  const map = parseJson(localStorage.getItem(key), {});
  const sku = (product.skus || []).find((s) => String(s.id) === String(skuId));
  map[skuId] = {
    product_id: product.id,
    sku_id: skuId,
    title: product.title,
    unit_price: sku?.price,
  };
  localStorage.setItem(key, JSON.stringify(map));
}

document.getElementById('productPageAddCart').addEventListener('click', async () => {
  const session = authSession();
  const token = session?.accessToken;
  if (!token) {
    localStorage.setItem('neomarket-auth-return-url', `${window.location.pathname}${window.location.search}`);
    window.location.href = './auth.html?mode=login';
    return;
  }
  const skuId = document.getElementById('productPageSku').value;
  if (!skuId || !currentProduct) {
    setMsg(
      document.getElementById('productPageActionMsg'),
      'Дождитесь загрузки и выберите вариант (SKU) из списка',
      true,
    );
    return;
  }
  if (!UUID_RE.test(String(skuId).trim())) {
    setMsg(document.getElementById('productPageActionMsg'), 'Выберите корректный SKU из списка', true);
    return;
  }
  try {
    persistSkuMap(skuId, currentProduct);
    await api('/api/v1/cart/items/', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ sku_id: skuId, quantity: 1 }),
    });
    setMsg(document.getElementById('productPageActionMsg'), 'Добавлено в корзину', false);
  } catch (e) {
    setMsg(document.getElementById('productPageActionMsg'), e.message, true);
  }
});

document.getElementById('productPageFavorite').addEventListener('click', async () => {
  const session = authSession();
  const token = session?.accessToken;
  if (!token) {
    localStorage.setItem('neomarket-auth-return-url', `${window.location.pathname}${window.location.search}`);
    window.location.href = './auth.html?mode=login';
    return;
  }
  if (!currentProductId) {
    setMsg(document.getElementById('productPageActionMsg'), 'Подождите, страница товара ещё загружается', true);
    return;
  }
  try {
    await api(`/api/v1/favorites/${currentProductId}/`, {
      method: 'POST',
      headers: apiHeaders(),
    });
    setMsg(document.getElementById('productPageActionMsg'), 'Добавлено в избранное', false);
  } catch (e) {
    setMsg(document.getElementById('productPageActionMsg'), e.message, true);
  }
});

document.getElementById('productPageSubmitReview').addEventListener('click', async () => {
  const session = authSession();
  const userId = session?.user?.id || session?.user_id;
  if (!userId || !currentProductId) {
    setMsg(document.getElementById('productPageReviewMsg'), 'Нужна авторизация', true);
    return;
  }
  try {
    await api('/api/v1/reviews/reviews/', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        product_id: currentProductId,
        user_id: userId,
        rating: Number(document.getElementById('productPageReviewRating').value),
        text: document.getElementById('productPageReviewText').value.trim(),
      }),
    });
    document.getElementById('productPageReviewText').value = '';
    setMsg(document.getElementById('productPageReviewMsg'), 'Отзыв добавлен', false);
    const reviews = await api(`/api/v1/reviews/reviews/?product_id=${currentProductId}`);
    renderReviews(reviews);
  } catch (e) {
    setMsg(document.getElementById('productPageReviewMsg'), e.message, true);
  }
});

document.getElementById('productPageAskQa').addEventListener('click', async () => {
  const session = authSession();
  const userId = session?.user?.id || session?.user_id;
  if (!userId || !currentProductId) {
    setMsg(document.getElementById('productPageQaMsg'), 'Нужна авторизация', true);
    return;
  }
  const question = document.getElementById('productPageQaQuestion').value.trim();
  if (!question) {
    setMsg(document.getElementById('productPageQaMsg'), 'Введите вопрос', true);
    return;
  }
  try {
    await api('/api/v1/reviews/qa/questions/', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        product_id: currentProductId,
        user_id: userId,
        question,
      }),
    });
    document.getElementById('productPageQaQuestion').value = '';
    setMsg(document.getElementById('productPageQaMsg'), 'Вопрос отправлен', false);
    const qa = await loadProductQa(currentProductId);
    renderQa(qa);
  } catch (e) {
    setMsg(document.getElementById('productPageQaMsg'), e.message, true);
  }
});

void main();
