import { useEffect, useMemo, useState } from 'react'
import './App.css'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import {
  buildApiHeaders,
  clearAuthSession,
  fetchMe,
  getAuthSession,
  isAuthenticated,
  login,
  register,
  updateMe,
} from './auth.js'

const API_BASE = '/api/v1/b2b'
const SELLER_ID_KEY = 'b2b-seller-id'
const DEFAULT_SELLER_ID = '11111111-1111-1111-1111-111111111111'
const DEFAULT_WAREHOUSE_ID = '22222222-2222-2222-2222-222222222222'

const DEFAULT_PROFILE = {
  company_name: 'NeoMarket Seller',
  contact_person: 'Команда продаж',
  email: 'seller@neomarket.local',
  phone: '+7 (999) 000-00-00',
  warehouse_id: DEFAULT_WAREHOUSE_ID,
  rating: 4.9,
  reviews: 128,
  since: '2021',
}

const EMPTY_AUTH_FORM = {
  email: '',
  username: '',
  first_name: '',
  last_name: '',
  phone: '',
  company_name: '',
  password: '',
  password_confirm: '',
}

const EMPTY_PRODUCT_FORM = {
  title: '',
  description: '',
  category_name: '',
  imagesText: '',
  characteristicsText: '',
}

const EMPTY_SKU_FORM = {
  product_id: '',
  name: '',
  price: '',
  cost_price: '',
  active_quantity: '',
  imagesText: '',
  characteristicsText: '',
}

const EMPTY_INVOICE_ITEM = {
  sku_id: '',
  quantity: '1',
}

const PAGE_TITLES = {
  overview: 'Панель продавца',
  products: 'Товары и остатки',
  supplies: 'Поставки на склад',
  settings: 'Настройки кабинета',
}

function readStoredValue(key, fallback) {
  const raw = localStorage.getItem(key)
  return raw || fallback
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())
}

function shortId(value) {
  if (!value) return 'n/a'
  return `${value.slice(0, 8)}...${value.slice(-4)}`
}

function formatMoney(value) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function formatDate(value) {
  if (!value) return 'Не указано'
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : []
}

function flattenErrorMessages(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.flatMap((item) => flattenErrorMessages(item))
  if (typeof value === 'object') return Object.values(value).flatMap((item) => flattenErrorMessages(item))
  return [String(value)]
}

function getApiErrorMessage(payload, status) {
  const direct = [payload?.message, payload?.detail, payload?.code].find((item) => typeof item === 'string' && item.trim())
  if (direct) return direct

  const nested = flattenErrorMessages(payload).filter(Boolean)
  if (nested.length) return nested.join('; ')

  return `Request failed with status ${status}`
}

function productStock(product) {
  return normalizeArray(product?.skus).reduce((sum, sku) => sum + Number(sku.active_quantity || 0), 0)
}

function parseCharacteristics(text) {
  return text
    .split('\n')
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => {
      const [name, ...rest] = row.split(':')
      return {
        name: (name || '').trim(),
        value: rest.join(':').trim(),
      }
    })
    .filter((row) => row.name && row.value)
}

function serializeCharacteristics(items) {
  return normalizeArray(items)
    .map((item) => `${item.name}: ${item.value}`)
    .join('\n')
}

function parseImages(text) {
  return text
    .split('\n')
    .map((row) => row.trim())
    .filter(Boolean)
    .map((url, index) => ({
      url,
      ordering: index,
    }))
}

function serializeImages(items) {
  return normalizeArray(items)
    .map((item) => item?.url || '')
    .filter(Boolean)
    .join('\n')
}

async function request(path, { sellerId, method = 'GET', body } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...buildApiHeaders(),
      'X-Seller-Id': sellerId,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (response.status === 204) return null

  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json') ? await response.json() : null

  if (!response.ok) {
    const message = getApiErrorMessage(payload, response.status)
    throw new Error(message)
  }

  return payload
}

function Banner({ banner, onClose }) {
  if (!banner) return null

  return (
    <div className={`app-banner ${banner.type}`}>
      <span>{banner.text}</span>
      <button type="button" onClick={onClose}>Закрыть</button>
    </div>
  )
}

function MetricCard({ label, value, hint, tone = 'default' }) {
  return (
    <div className={`metric-card ${tone}`}>
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
      <p className="metric-hint">{hint}</p>
    </div>
  )
}

function SectionCard({ title, subtitle, actions, children }) {
  return (
    <section className="section-card">
      <div className="section-card-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions && <div className="section-actions">{actions}</div>}
      </div>
      {children}
    </section>
  )
}

function StatusBadge({ status }) {
  const tone = {
    CREATED: 'neutral',
    ON_MODERATION: 'warning',
    MODERATED: 'success',
    BLOCKED: 'danger',
    HARD_BLOCKED: 'danger',
    ACCEPTED: 'success',
  }[status] || 'neutral'

  return <span className={`status-badge ${tone}`}>{status}</span>
}

function EmptyState({ title, description }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  )
}

export default function App() {
  const authSession = getAuthSession()
  const [currentPage, setCurrentPage] = useState('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sellerId, setSellerId] = useState(() => authSession?.user?.id || readStoredValue(SELLER_ID_KEY, DEFAULT_SELLER_ID))
  const [sellerIdDraft, setSellerIdDraft] = useState(() => authSession?.user?.id || readStoredValue(SELLER_ID_KEY, DEFAULT_SELLER_ID))
  const [userInfo, setUserInfo] = useState(() =>
    authSession?.user
      ? {
          ...DEFAULT_PROFILE,
          company_name: authSession.user.company_name || DEFAULT_PROFILE.company_name,
          contact_person: [authSession.user.first_name, authSession.user.last_name].filter(Boolean).join(' ') || DEFAULT_PROFILE.contact_person,
          email: authSession.user.email || DEFAULT_PROFILE.email,
          phone: authSession.user.phone || DEFAULT_PROFILE.phone,
        }
      : DEFAULT_PROFILE
  )
  const [banner, setBanner] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [authLoading, setAuthLoading] = useState(false)
  const [authForm, setAuthForm] = useState(EMPTY_AUTH_FORM)
  const [searchQuery, setSearchQuery] = useState('')
  const [productStatusFilter, setProductStatusFilter] = useState('ALL')
  const [overview, setOverview] = useState(null)
  const [stats, setStats] = useState(null)
  const [products, setProducts] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState({
    overview: true,
    products: true,
    supplies: true,
  })
  const [productForm, setProductForm] = useState(EMPTY_PRODUCT_FORM)
  const [editingProductId, setEditingProductId] = useState(null)
  const [editingProductForm, setEditingProductForm] = useState(EMPTY_PRODUCT_FORM)
  const [expandedProductId, setExpandedProductId] = useState(null)
  const [skuForm, setSkuForm] = useState(EMPTY_SKU_FORM)
  const [editingSkuId, setEditingSkuId] = useState(null)
  const [invoiceForm, setInvoiceForm] = useState({
    warehouse_id: DEFAULT_PROFILE.warehouse_id,
    items: [{ ...EMPTY_INVOICE_ITEM }],
  })

  const allSkus = useMemo(
    () =>
      products.flatMap((product) =>
        normalizeArray(product.skus).map((sku) => ({
          ...sku,
          product_title: product.title,
        }))
      ),
    [products]
  )

  const availableInvoiceSkus = useMemo(
    () =>
      products
        .filter((product) => !product.deleted && product.status === 'MODERATED')
        .flatMap((product) =>
          normalizeArray(product.skus)
            .filter((sku) => !sku.deleted)
            .map((sku) => ({
              ...sku,
              product_title: product.title,
            }))
        ),
    [products]
  )

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesQuery =
        !searchQuery ||
        product.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        normalizeArray(product.skus).some((sku) => sku.name.toLowerCase().includes(searchQuery.toLowerCase()))

      const matchesStatus = productStatusFilter === 'ALL' || product.status === productStatusFilter

      return matchesQuery && matchesStatus
    })
  }, [productStatusFilter, products, searchQuery])

  const alertsCount = (overview?.pending_invoices || 0) + normalizeArray(stats?.low_stock_skus).length

  const hasAuth = isAuthenticated()

  useEffect(() => {
    localStorage.setItem(SELLER_ID_KEY, sellerId)
  }, [sellerId])

  useEffect(() => {
    setSellerIdDraft(sellerId)
  }, [sellerId])

  useEffect(() => {
    if (!hasAuth) return

    let cancelled = false

    const hydrateProfile = async () => {
      try {
        const me = await fetchMe()
        const profile = await request('/profile/', { sellerId: me.id })
        if (cancelled) return

        setSellerId(me.id)
        setSellerIdDraft(me.id)
        setUserInfo((current) => ({
          ...DEFAULT_PROFILE,
          ...current,
          ...profile,
          company_name: profile?.company_name || me.company_name || current.company_name,
          contact_person: profile?.contact_person || [me.first_name, me.last_name].filter(Boolean).join(' ') || current.contact_person,
          email: profile?.email || me.email || current.email,
          phone: profile?.phone || me.phone || current.phone,
          warehouse_id: profile?.warehouse_id || current.warehouse_id || DEFAULT_WAREHOUSE_ID,
          since: profile?.since || current.since,
        }))
      } catch (error) {
        if (!cancelled) {
          setBanner({ type: 'error', text: error.message })
        }
      }
    }

    hydrateProfile()

    return () => {
      cancelled = true
    }
  }, [hasAuth])

  useEffect(() => {
    setInvoiceForm((current) => ({
      warehouse_id: current.warehouse_id || userInfo.warehouse_id || DEFAULT_WAREHOUSE_ID,
      items: current.items.length > 0 ? current.items : [{ ...EMPTY_INVOICE_ITEM }],
    }))
  }, [userInfo.warehouse_id])

  useEffect(() => {
    if (!hasAuth) {
      setLoading({ overview: false, products: false, supplies: false })
      return
    }

    let cancelled = false

    const loadData = async () => {
      setLoading({ overview: true, products: true, supplies: true })

      const [overviewResult, statsResult, productsResult, invoicesResult] = await Promise.allSettled([
        request('/dashboard/overview/', { sellerId }),
        request('/dashboard/stats/', { sellerId }),
        request('/products/?limit=100&offset=0', { sellerId }),
        request('/invoices/', { sellerId }),
      ])

      if (cancelled) return

      if (overviewResult.status === 'fulfilled') setOverview(overviewResult.value)
      if (statsResult.status === 'fulfilled') setStats(statsResult.value)
      if (productsResult.status === 'fulfilled') setProducts(productsResult.value.items || [])
      if (invoicesResult.status === 'fulfilled') setInvoices(invoicesResult.value.items || [])

      const rejected = [overviewResult, statsResult, productsResult, invoicesResult].find((item) => item.status === 'rejected')
      if (rejected) {
        setBanner({
          type: 'error',
          text: rejected.reason.message,
        })
      }

      setLoading({ overview: false, products: false, supplies: false })
    }

    loadData()

    return () => {
      cancelled = true
    }
  }, [hasAuth, sellerId])

  const refreshOverview = async () => {
    const [overviewData, statsData] = await Promise.all([
      request('/dashboard/overview/', { sellerId }),
      request('/dashboard/stats/', { sellerId }),
    ])
    setOverview(overviewData)
    setStats(statsData)
  }

  const refreshProducts = async () => {
    const productsData = await request('/products/?limit=100&offset=0', { sellerId })
    setProducts(productsData.items || [])
  }

  const refreshInvoices = async () => {
    const invoicesData = await request('/invoices/', { sellerId })
    setInvoices(invoicesData.items || [])
  }

  const announce = (type, text) => {
    setBanner({ type, text })
  }

  const handleLogout = () => {
    clearAuthSession()
    localStorage.removeItem(SELLER_ID_KEY)
    window.location.reload()
  }

  const handleAuthField = (key, value) => {
    setAuthForm((current) => ({ ...current, [key]: value }))
  }

  const handleAuthSubmit = async (event) => {
    event.preventDefault()
    setAuthLoading(true)

    try {
      if (authMode === 'register') {
        await register({
          ...authForm,
          role: 'SELLER',
        })
      } else {
        await login({
          email: authForm.email,
          password: authForm.password,
        })
      }

      const me = await fetchMe()
      const profile = await request('/profile/', { sellerId: me.id })
      setSellerId(me.id)
      setSellerIdDraft(me.id)
      setUserInfo((current) => ({
        ...DEFAULT_PROFILE,
        ...current,
        ...profile,
        company_name: profile?.company_name || me.company_name || current.company_name,
        contact_person: profile?.contact_person || [me.first_name, me.last_name].filter(Boolean).join(' ') || current.contact_person,
        email: profile?.email || me.email || current.email,
        phone: profile?.phone || me.phone || current.phone,
        warehouse_id: profile?.warehouse_id || current.warehouse_id || DEFAULT_WAREHOUSE_ID,
        since: profile?.since || current.since,
      }))
      announce('success', authMode === 'register' ? 'Seller-аккаунт создан.' : 'Вход выполнен.')
      setAuthForm(EMPTY_AUTH_FORM)
    } catch (error) {
      announce('error', error.message)
    } finally {
      setAuthLoading(false)
    }
  }

  const applySellerId = () => {
    if (hasAuth) {
      announce('warning', 'После авторизации Seller ID берётся из JWT и не переопределяется вручную.')
      return
    }
    if (!isUuid(sellerIdDraft)) {
      announce('error', 'Seller ID должен быть валидным UUID.')
      return
    }
    setSellerId(sellerIdDraft.trim())
    announce('success', 'Seller ID обновлён. Кабинет перезагружает данные продавца.')
  }

  const handleCreateProduct = async (event) => {
    event.preventDefault()

    if (!productForm.title.trim() || !productForm.category_name.trim()) {
      announce('error', 'Для карточки товара нужны название и категория.')
      return
    }
    if (parseImages(productForm.imagesText).length === 0) {
      announce('error', 'Для карточки товара нужен хотя бы один URL изображения.')
      return
    }

    try {
      await request('/products/', {
        sellerId,
        method: 'POST',
        body: {
          title: productForm.title.trim(),
          description: productForm.description.trim(),
          category_name: productForm.category_name.trim(),
          images: parseImages(productForm.imagesText),
          characteristics: parseCharacteristics(productForm.characteristicsText),
        },
      })

      setProductForm(EMPTY_PRODUCT_FORM)
      await Promise.all([refreshProducts(), refreshOverview()])
      announce('success', 'Товар создан. Теперь можно добавить SKU и остатки.')
    } catch (error) {
      announce('error', error.message)
    }
  }

  const startProductEdit = (product) => {
    setEditingProductId(product.id)
    setEditingProductForm({
      title: product.title,
      description: product.description || '',
      category_name: product.category?.name || '',
      imagesText: serializeImages(product.images),
      characteristicsText: serializeCharacteristics(product.characteristics),
    })
  }

  const saveProductEdit = async (event, productId) => {
    event.preventDefault()

    try {
      await request(`/products/${productId}/`, {
        sellerId,
        method: 'PUT',
        body: {
          title: editingProductForm.title.trim(),
          description: editingProductForm.description.trim(),
          category_name: editingProductForm.category_name.trim(),
          images: parseImages(editingProductForm.imagesText),
          characteristics: parseCharacteristics(editingProductForm.characteristicsText),
        },
      })

      setEditingProductId(null)
      setEditingProductForm(EMPTY_PRODUCT_FORM)
      await Promise.all([refreshProducts(), refreshOverview()])
      announce('success', 'Карточка товара обновлена.')
    } catch (error) {
      announce('error', error.message)
    }
  }

  const deleteProduct = async (productId) => {
    if (!window.confirm('Удалить товар? Это уберёт карточку и связанные SKU.')) return

    try {
      await request(`/products/${productId}/`, {
        sellerId,
        method: 'DELETE',
      })

      if (expandedProductId === productId) {
        setExpandedProductId(null)
        setEditingSkuId(null)
        setSkuForm(EMPTY_SKU_FORM)
      }

      await Promise.all([refreshProducts(), refreshOverview()])
      announce('success', 'Товар удалён.')
    } catch (error) {
      announce('error', error.message)
    }
  }

  const toggleProductDetails = (product) => {
    const nextId = expandedProductId === product.id ? null : product.id
    setExpandedProductId(nextId)
    setEditingSkuId(null)
    setSkuForm({
      ...EMPTY_SKU_FORM,
      product_id: nextId ? product.id : '',
    })
  }

  const startSkuEdit = (product, sku) => {
    setExpandedProductId(product.id)
    setEditingSkuId(sku.id)
    setSkuForm({
      product_id: product.id,
      name: sku.name,
      price: String(sku.price),
      cost_price: String(sku.cost_price || 0),
      active_quantity: String(sku.active_quantity),
      imagesText: serializeImages(sku.images),
      characteristicsText: serializeCharacteristics(sku.characteristics),
    })
  }

  const saveSku = async (event) => {
    event.preventDefault()

    if (!skuForm.product_id || !skuForm.name.trim()) {
      announce('error', 'SKU должен быть привязан к товару и иметь название.')
      return
    }
    if (parseImages(skuForm.imagesText).length === 0) {
      announce('error', 'Для SKU нужен хотя бы один URL изображения.')
      return
    }

    const payload = {
      ...(editingSkuId ? {} : { product_id: skuForm.product_id }),
      name: skuForm.name.trim(),
      price: Number(skuForm.price || 0),
      cost_price: Number(skuForm.cost_price || 0),
      active_quantity: Number(skuForm.active_quantity || 0),
      images: parseImages(skuForm.imagesText),
      characteristics: parseCharacteristics(skuForm.characteristicsText),
    }

    try {
      await request(editingSkuId ? `/skus/${editingSkuId}/` : '/skus/', {
        sellerId,
        method: editingSkuId ? 'PUT' : 'POST',
        body: payload,
      })

      const currentProductId = skuForm.product_id
      setEditingSkuId(null)
      setSkuForm({
        ...EMPTY_SKU_FORM,
        product_id: currentProductId,
      })
      await Promise.all([refreshProducts(), refreshOverview()])
      announce('success', editingSkuId ? 'SKU обновлён.' : 'SKU добавлен.')
    } catch (error) {
      announce('error', error.message)
    }
  }

  const deleteSku = async (productId, skuId) => {
    if (!window.confirm('Удалить SKU?')) return

    try {
      await request(`/skus/${skuId}/`, {
        sellerId,
        method: 'DELETE',
      })

      setExpandedProductId(productId)
      if (editingSkuId === skuId) {
        setEditingSkuId(null)
        setSkuForm({
          ...EMPTY_SKU_FORM,
          product_id: productId,
        })
      }

      await Promise.all([refreshProducts(), refreshOverview()])
      announce('success', 'SKU удалён.')
    } catch (error) {
      announce('error', error.message)
    }
  }

  const updateInvoiceRow = (index, key, value) => {
    setInvoiceForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)),
    }))
  }

  const addInvoiceRow = () => {
    setInvoiceForm((current) => ({
      ...current,
      items: [...current.items, { ...EMPTY_INVOICE_ITEM }],
    }))
  }

  const removeInvoiceRow = (index) => {
    setInvoiceForm((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  const createInvoice = async (event) => {
    event.preventDefault()

    const items = invoiceForm.items
      .map((item) => ({
        sku_id: item.sku_id,
        quantity: Number(item.quantity || 0),
      }))
      .filter((item) => item.sku_id && item.quantity > 0)

    const warehouseId = invoiceForm.warehouse_id.trim()

    if (!isUuid(warehouseId)) {
      announce('error', 'Warehouse ID должен быть UUID.')
      return
    }

    if (items.length === 0) {
      announce('error', 'Добавьте хотя бы один SKU в поставку.')
      return
    }

    try {
      await request('/invoices/', {
        sellerId,
        method: 'POST',
        body: {
          warehouse_id: warehouseId,
          items,
        },
      })

      setInvoiceForm({
        warehouse_id: warehouseId,
        items: [{ ...EMPTY_INVOICE_ITEM }],
      })
      await Promise.all([refreshInvoices(), refreshOverview()])
      announce('success', 'Поставка создана. Её можно принять после проверки склада.')
    } catch (error) {
      announce('error', error.message)
    }
  }

  const acceptInvoice = async (invoiceId) => {
    try {
      await request('/invoices/accept/', {
        sellerId,
        method: 'POST',
        body: { invoice_id: invoiceId },
      })

      await Promise.all([refreshInvoices(), refreshProducts(), refreshOverview()])
      announce('success', 'Поставка принята, остатки обновлены.')
    } catch (error) {
      announce('error', error.message)
    }
  }

  const saveSettings = async (event) => {
    event.preventDefault()

    if (!isUuid(userInfo.warehouse_id)) {
      announce('error', 'Warehouse ID должен быть валидным UUID.')
      return
    }

    try {
      const [me, profile] = await Promise.all([
        updateMe({
          first_name: userInfo.contact_person.split(' ')[0] || '',
          last_name: userInfo.contact_person.split(' ').slice(1).join(' '),
          phone: userInfo.phone,
          company_name: userInfo.company_name,
        }),
        request('/profile/', {
          sellerId,
          method: 'PATCH',
          body: {
            company_name: userInfo.company_name,
            contact_person: userInfo.contact_person,
            email: userInfo.email,
            phone: userInfo.phone,
            warehouse_id: userInfo.warehouse_id,
          },
        }),
      ])

      setSellerId(me.id)
      setSellerIdDraft(me.id)
      setUserInfo((current) => ({
        ...DEFAULT_PROFILE,
        ...current,
        ...profile,
        company_name: profile?.company_name || me.company_name || current.company_name,
        contact_person: profile?.contact_person || [me.first_name, me.last_name].filter(Boolean).join(' ') || current.contact_person,
        email: profile?.email || me.email || current.email,
        phone: profile?.phone || me.phone || current.phone,
        warehouse_id: profile?.warehouse_id || current.warehouse_id || DEFAULT_WAREHOUSE_ID,
        since: profile?.since || current.since,
      }))
      announce('success', 'Профиль продавца сохранён в auth и B2B сервисах.')
    } catch (error) {
      announce('error', error.message)
    }
  }

  const renderOverview = () => (
    <div className="page-stack">
      <SectionCard
        title="Seller health"
        subtitle="Быстрый обзор того, что важно продавцу прямо сейчас."
      >
        <div className="hero-panel">
          <div>
            <p className="eyebrow">NeoMarket Seller</p>
            <h1>{userInfo.company_name}</h1>
            <p className="hero-copy">
              Продавец <strong>{userInfo.contact_person}</strong>, Seller ID <code>{shortId(sellerId)}</code>.
              Кабинет собран поверх реального B2B API: товары, SKU, остатки и поставки синхронизированы.
            </p>
          </div>
          <div className="hero-facts">
            <div>
              <span>Контакты</span>
              <strong>{userInfo.email}</strong>
            </div>
            <div>
              <span>Склад</span>
              <strong>{shortId(userInfo.warehouse_id)}</strong>
            </div>
            <div>
              <span>Рейтинг</span>
              <strong>{userInfo.rating} / 5</strong>
            </div>
          </div>
        </div>
      </SectionCard>

      <div className="metrics-grid">
        <MetricCard
          label="Товаров"
          value={overview?.total_products ?? '—'}
          hint="Всего карточек продавца"
        />
        <MetricCard
          label="SKU"
          value={overview?.total_skus ?? '—'}
          hint="Вариации с отдельными остатками"
          tone="accent"
        />
        <MetricCard
          label="Остаток"
          value={overview?.total_stock ?? '—'}
          hint="Сумма активного стока по SKU"
          tone="success"
        />
        <MetricCard
          label="Поставки в работе"
          value={overview?.pending_invoices ?? '—'}
          hint="Нуждаются в приёмке"
          tone="warning"
        />
      </div>

      <div className="two-column-grid">
        <SectionCard
          title="Статусы товаров"
          subtitle="Витрина должна быстро показывать, где продавец теряет время."
        >
          {loading.overview ? (
            <div className="loader-row"><span className="spinner" /> Загружаем аналитику...</div>
          ) : normalizeArray(stats?.product_statuses).length === 0 ? (
            <EmptyState
              title="Пока пусто"
              description="Создайте первый товар, чтобы увидеть распределение по статусам."
            />
          ) : (
            <div className="status-list">
              {stats.product_statuses.map((item) => (
                <div key={item.label} className="status-row">
                  <StatusBadge status={item.label} />
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Низкий остаток"
          subtitle="Аналогично Seller-кабинетам: это первый список, который надо чинить."
        >
          {loading.overview ? (
            <div className="loader-row"><span className="spinner" /> Смотрим критичные SKU...</div>
          ) : normalizeArray(stats?.low_stock_skus).length === 0 ? (
            <EmptyState
              title="Запас нормальный"
              description="У всех SKU остаток выше критического порога."
            />
          ) : (
            <div className="simple-list">
              {stats.low_stock_skus.map((sku) => (
                <div key={sku.id} className="list-row">
                  <div>
                    <strong>{sku.name}</strong>
                    <p>{sku.product_title}</p>
                  </div>
                  <span>{sku.active_quantity} шт.</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="two-column-grid">
        <SectionCard title="Последние товары" subtitle="Недавние карточки и дата обновления.">
          {normalizeArray(stats?.recent_products).length === 0 ? (
            <EmptyState title="Товаров нет" description="Добавьте первую карточку на вкладке товаров." />
          ) : (
            <div className="simple-list">
              {stats.recent_products.map((product) => (
                <div key={product.id} className="list-row wide">
                  <div>
                    <strong>{product.title}</strong>
                    <p>{product.category?.name || 'Без категории'}</p>
                  </div>
                  <div className="list-meta">
                    <StatusBadge status={product.status} />
                    <span>{formatDate(product.updated_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Последние поставки" subtitle="Складские операции, которые влияют на остатки.">
          {normalizeArray(stats?.recent_invoices).length === 0 ? (
            <EmptyState title="Поставок нет" description="Создайте первую поставку во вкладке поставок." />
          ) : (
            <div className="simple-list">
              {stats.recent_invoices.map((invoice) => (
                <div key={invoice.id} className="list-row wide">
                  <div>
                    <strong>{shortId(invoice.id)}</strong>
                    <p>{normalizeArray(invoice.items).length} SKU в поставке</p>
                  </div>
                  <div className="list-meta">
                    <StatusBadge status={invoice.status} />
                    <span>{formatDate(invoice.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )

  const renderProducts = () => (
    <div className="page-stack">
      <SectionCard
        title="Новый товар"
        subtitle="Карточка товара создаётся отдельно, затем к ней добавляются SKU, цены и остатки."
      >
        <form className="form-grid" onSubmit={handleCreateProduct}>
          <label>
            <span>Название</span>
            <input
              value={productForm.title}
              onChange={(event) => setProductForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="Например, Беспроводные наушники NeoPods"
            />
          </label>
          <label>
            <span>Категория</span>
            <input
              value={productForm.category_name}
              onChange={(event) => setProductForm((current) => ({ ...current, category_name: event.target.value }))}
              placeholder="Электроника"
            />
          </label>
          <label className="wide">
            <span>Описание</span>
            <textarea
              rows="3"
              value={productForm.description}
              onChange={(event) => setProductForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="Краткое описание карточки товара"
            />
          </label>
          <label className="wide">
            <span>Изображения товара</span>
            <textarea
              rows="3"
              value={productForm.imagesText}
              onChange={(event) => setProductForm((current) => ({ ...current, imagesText: event.target.value }))}
              placeholder={'https://cdn.example.com/product-main.jpg\nhttps://cdn.example.com/product-side.jpg'}
            />
          </label>
          <label className="wide">
            <span>Характеристики</span>
            <textarea
              rows="3"
              value={productForm.characteristicsText}
              onChange={(event) => setProductForm((current) => ({ ...current, characteristicsText: event.target.value }))}
              placeholder={'Бренд: NeoMarket\nТип: Беспроводные наушники'}
            />
          </label>
          <div className="button-row wide">
            <button type="submit" className="primary-btn">Создать карточку</button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Товары продавца"
        subtitle="Фокус на том, что нужно seller-аналогам: статус, SKU, остатки и быстрое редактирование."
        actions={
          <div className="filter-bar">
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Поиск по товару или SKU"
            />
            <select
              value={productStatusFilter}
              onChange={(event) => setProductStatusFilter(event.target.value)}
            >
              <option value="ALL">Все статусы</option>
              <option value="CREATED">CREATED</option>
              <option value="ON_MODERATION">ON_MODERATION</option>
              <option value="MODERATED">MODERATED</option>
              <option value="BLOCKED">BLOCKED</option>
              <option value="HARD_BLOCKED">HARD_BLOCKED</option>
            </select>
          </div>
        }
      >
        {loading.products ? (
          <div className="loader-row"><span className="spinner" /> Загружаем товары...</div>
        ) : filteredProducts.length === 0 ? (
          <EmptyState
            title="Ничего не найдено"
            description="Измените фильтры или создайте первую карточку товара."
          />
        ) : (
          <div className="product-stack">
            {filteredProducts.map((product) => (
              <article key={product.id} className="product-card">
                <div className="product-head">
                  <div>
                    <p className="eyebrow">{product.category?.name || 'Без категории'}</p>
                    <h3>{product.title}</h3>
                    <p className="product-meta">
                      SKU: {normalizeArray(product.skus).length} · Остаток: {productStock(product)} шт. · Обновлено {formatDate(product.updated_at)}
                      {product.deleted ? ' · Удалён из витрины' : ''}
                    </p>
                  </div>
                  <div className="product-head-side">
                    <StatusBadge status={product.status} />
                    <div className="button-row compact">
                      <button type="button" className="ghost-btn" onClick={() => toggleProductDetails(product)}>
                        {expandedProductId === product.id ? 'Скрыть SKU' : 'SKU и остатки'}
                      </button>
                      {!product.deleted && product.status !== 'HARD_BLOCKED' && (
                        <button type="button" className="ghost-btn" onClick={() => startProductEdit(product)}>
                          Редактировать
                        </button>
                      )}
                      {!product.deleted && product.status !== 'HARD_BLOCKED' && (
                        <button type="button" className="danger-btn" onClick={() => deleteProduct(product.id)}>
                          Удалить
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <p className="product-description">{product.description || 'Описание пока не заполнено.'}</p>
                {normalizeArray(product.images).length > 0 && (
                  <p className="product-meta">Изображений: {normalizeArray(product.images).length}</p>
                )}
                {(product.blocking_reason || normalizeArray(product.field_reports).length > 0) && (
                  <div className="inline-panel">
                    <strong>Причина блокировки</strong>
                    <p>{product.blocking_reason?.title || 'Есть замечания модерации'}</p>
                    {normalizeArray(product.field_reports).length > 0 && (
                      <ul className="info-list">
                        {product.field_reports.map((report, index) => (
                          <li key={`${product.id}-report-${index}`}>
                            <strong>{report.field || 'Поле'}:</strong> {report.message || report.reason || 'Требует исправления'}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {editingProductId === product.id && (
                  <form className="form-grid inline-panel" onSubmit={(event) => saveProductEdit(event, product.id)}>
                    <label>
                      <span>Название</span>
                      <input
                        value={editingProductForm.title}
                        onChange={(event) => setEditingProductForm((current) => ({ ...current, title: event.target.value }))}
                      />
                    </label>
                    <label>
                      <span>Категория</span>
                      <input
                        value={editingProductForm.category_name}
                        onChange={(event) => setEditingProductForm((current) => ({ ...current, category_name: event.target.value }))}
                      />
                    </label>
                    <label className="wide">
                      <span>Описание</span>
                      <textarea
                        rows="3"
                        value={editingProductForm.description}
                        onChange={(event) => setEditingProductForm((current) => ({ ...current, description: event.target.value }))}
                      />
                    </label>
                    <label className="wide">
                      <span>Изображения</span>
                      <textarea
                        rows="3"
                        value={editingProductForm.imagesText}
                        onChange={(event) => setEditingProductForm((current) => ({ ...current, imagesText: event.target.value }))}
                      />
                    </label>
                    <label className="wide">
                      <span>Характеристики</span>
                      <textarea
                        rows="3"
                        value={editingProductForm.characteristicsText}
                        onChange={(event) => setEditingProductForm((current) => ({ ...current, characteristicsText: event.target.value }))}
                      />
                    </label>
                    <div className="button-row wide">
                      <button type="submit" className="primary-btn">Сохранить товар</button>
                      <button type="button" className="ghost-btn" onClick={() => setEditingProductId(null)}>
                        Отменить
                      </button>
                    </div>
                  </form>
                )}

                {expandedProductId === product.id && (
                  <div className="inline-panel">
                    <div className="sku-table">
                      <div className="sku-table-head">
                        <span>SKU</span>
                        <span>Цена</span>
                        <span>Себестоимость</span>
                        <span>Остаток</span>
                        <span>Резерв</span>
                        <span>Действия</span>
                      </div>
                      {normalizeArray(product.skus).length === 0 ? (
                        <EmptyState
                          title="SKU ещё нет"
                          description="Добавьте первую вариацию товара, чтобы управлять ценой и остатком."
                        />
                      ) : (
                        normalizeArray(product.skus).map((sku) => (
                          <div key={sku.id} className="sku-row">
                            <div>
                              <strong>{sku.name}</strong>
                              {normalizeArray(sku.characteristics).length > 0 && (
                                <p>{serializeCharacteristics(sku.characteristics)}</p>
                              )}
                              {normalizeArray(sku.images).length > 0 && <p>Фото: {normalizeArray(sku.images).length}</p>}
                            </div>
                            <span>{formatMoney(sku.price)}</span>
                            <span>{formatMoney(sku.cost_price)}</span>
                            <span>{sku.active_quantity} шт.</span>
                            <span>{sku.reserved_quantity || 0} шт.</span>
                            <div className="button-row compact">
                              {!product.deleted && product.status !== 'HARD_BLOCKED' && (
                                <>
                                  <button type="button" className="ghost-btn" onClick={() => startSkuEdit(product, sku)}>
                                    Изменить
                                  </button>
                                  <button type="button" className="danger-btn" onClick={() => deleteSku(product.id, sku.id)}>
                                    Удалить
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <form className="form-grid" onSubmit={saveSku}>
                      <label>
                        <span>Название SKU</span>
                        <input
                          value={skuForm.name}
                          onChange={(event) => setSkuForm((current) => ({ ...current, name: event.target.value, product_id: product.id }))}
                          placeholder="Например, Чёрные / 128 ГБ"
                        />
                      </label>
                      <label>
                        <span>Цена</span>
                        <input
                          type="number"
                          min="0"
                          value={skuForm.price}
                          onChange={(event) => setSkuForm((current) => ({ ...current, price: event.target.value, product_id: product.id }))}
                        />
                      </label>
                      <label>
                        <span>Себестоимость</span>
                        <input
                          type="number"
                          min="0"
                          value={skuForm.cost_price}
                          onChange={(event) => setSkuForm((current) => ({ ...current, cost_price: event.target.value, product_id: product.id }))}
                        />
                      </label>
                      <label>
                        <span>Остаток</span>
                        <input
                          type="number"
                          min="0"
                          value={skuForm.active_quantity}
                          onChange={(event) => setSkuForm((current) => ({ ...current, active_quantity: event.target.value, product_id: product.id }))}
                        />
                      </label>
                      <label className="wide">
                        <span>Изображения SKU</span>
                        <textarea
                          rows="3"
                          value={skuForm.imagesText}
                          onChange={(event) => setSkuForm((current) => ({ ...current, imagesText: event.target.value, product_id: product.id }))}
                          placeholder={'https://cdn.example.com/sku-front.jpg\nhttps://cdn.example.com/sku-side.jpg'}
                        />
                      </label>
                      <label className="wide">
                        <span>Характеристики</span>
                        <textarea
                          rows="3"
                          value={skuForm.characteristicsText}
                          onChange={(event) => setSkuForm((current) => ({ ...current, characteristicsText: event.target.value, product_id: product.id }))}
                          placeholder={'Цвет: чёрный\nПамять: 128 ГБ'}
                        />
                      </label>
                      <div className="button-row wide">
                        <button type="submit" className="primary-btn">
                          {editingSkuId ? 'Сохранить SKU' : 'Добавить SKU'}
                        </button>
                        {editingSkuId && (
                          <button
                            type="button"
                            className="ghost-btn"
                            onClick={() => {
                              setEditingSkuId(null)
                              setSkuForm({ ...EMPTY_SKU_FORM, product_id: product.id })
                            }}
                          >
                            Отменить
                          </button>
                        )}
                      </div>
                    </form>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )

  const renderSupplies = () => (
    <div className="page-stack">
      <SectionCard
        title="Создать поставку"
        subtitle="Сценарий ближе к seller-flow: выбрать SKU, указать склад, завести накладную и затем принять её."
      >
        <form className="form-grid" onSubmit={createInvoice}>
          <label className="wide">
            <span>Warehouse ID</span>
            <input
              value={invoiceForm.warehouse_id}
              onChange={(event) => setInvoiceForm((current) => ({ ...current, warehouse_id: event.target.value }))}
            />
          </label>

          <div className="wide invoice-items">
            {invoiceForm.items.map((item, index) => (
              <div key={`${item.sku_id}-${index}`} className="invoice-row">
                <select
                  value={item.sku_id}
                  onChange={(event) => updateInvoiceRow(index, 'sku_id', event.target.value)}
                >
                  <option value="">Выберите SKU</option>
                  {availableInvoiceSkus.map((sku) => (
                    <option key={sku.id} value={sku.id}>
                      {sku.product_title} / {sku.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(event) => updateInvoiceRow(index, 'quantity', event.target.value)}
                  placeholder="Количество"
                />
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => removeInvoiceRow(index)}
                  disabled={invoiceForm.items.length === 1}
                >
                  Убрать
                </button>
              </div>
            ))}
          </div>

          <div className="button-row wide">
            <button type="button" className="ghost-btn" onClick={addInvoiceRow}>Добавить SKU</button>
            <button type="submit" className="primary-btn">Создать поставку</button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Накладные и приёмка" subtitle="После приёмки остатки SKU растут автоматически.">
        {loading.supplies ? (
          <div className="loader-row"><span className="spinner" /> Загружаем поставки...</div>
        ) : invoices.length === 0 ? (
          <EmptyState
            title="Поставок пока нет"
            description="Создайте первую накладную, чтобы начать управление приходами."
          />
        ) : (
          <div className="invoice-list">
            {invoices.map((invoice) => (
              <article key={invoice.id} className="invoice-card">
                <div className="invoice-head">
                  <div>
                    <p className="eyebrow">Накладная {shortId(invoice.id)}</p>
                    <h3>{normalizeArray(invoice.items).length} SKU в поставке</h3>
                    <p>Склад {shortId(invoice.warehouse_id)} · {formatDate(invoice.created_at)}</p>
                  </div>
                  <div className="button-row compact">
                    <StatusBadge status={invoice.status} />
                    {invoice.status === 'CREATED' && (
                      <button type="button" className="primary-btn" onClick={() => acceptInvoice(invoice.id)}>
                        Принять поставку
                      </button>
                    )}
                  </div>
                </div>

                <div className="invoice-items-grid">
                  {normalizeArray(invoice.items).map((item, index) => (
                    <div key={`${invoice.id}-${item.sku_id}-${index}`} className="mini-card">
                      <strong>{shortId(item.sku_id)}</strong>
                      <span>{item.quantity} шт.</span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )

  const renderSettings = () => (
    <div className="page-stack">
      <SectionCard title="Идентификатор продавца" subtitle={hasAuth ? 'После входа seller identity приходит из JWT и синхронизирована с auth-сервисом.' : 'Для локального bootstrap без JWT можно использовать `X-Seller-Id`.'}>
        <div className="form-grid">
          <label className="wide">
            <span>Seller ID</span>
            <input
              value={sellerIdDraft}
              onChange={(event) => setSellerIdDraft(event.target.value)}
              disabled={hasAuth}
            />
          </label>
          <div className="button-row wide">
            <button type="button" className="primary-btn" onClick={applySellerId} disabled={hasAuth}>
              Применить Seller ID
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Профиль кабинета" subtitle="Настройки сохраняются в auth и B2B backend, включая дефолтный склад продавца.">
        <form className="form-grid" onSubmit={saveSettings}>
          <label>
            <span>Компания</span>
            <input
              value={userInfo.company_name}
              onChange={(event) => setUserInfo((current) => ({ ...current, company_name: event.target.value }))}
            />
          </label>
          <label>
            <span>Контактное лицо</span>
            <input
              value={userInfo.contact_person}
              onChange={(event) => setUserInfo((current) => ({ ...current, contact_person: event.target.value }))}
            />
          </label>
          <label>
            <span>Email</span>
            <input
              value={userInfo.email}
              onChange={(event) => setUserInfo((current) => ({ ...current, email: event.target.value }))}
            />
          </label>
          <label>
            <span>Телефон</span>
            <input
              value={userInfo.phone}
              onChange={(event) => setUserInfo((current) => ({ ...current, phone: event.target.value }))}
            />
          </label>
          <label className="wide">
            <span>Warehouse ID по умолчанию</span>
            <input
              value={userInfo.warehouse_id}
              onChange={(event) => setUserInfo((current) => ({ ...current, warehouse_id: event.target.value }))}
            />
          </label>
          <div className="button-row wide">
            <button type="submit" className="primary-btn">Сохранить настройки</button>
          </div>
        </form>
      </SectionCard>
    </div>
  )

  const renderPage = () => {
    switch (currentPage) {
      case 'products':
        return renderProducts()
      case 'supplies':
        return renderSupplies()
      case 'settings':
        return renderSettings()
      default:
        return renderOverview()
    }
  }

  if (!hasAuth) {
    return (
      <div className="app-layout">
        <div className="bg-wave"></div>
        <main className="main-content" style={{ maxWidth: 640, margin: '48px auto' }}>
          <Banner banner={banner} onClose={() => setBanner(null)} />
          <section className="section-card">
            <div className="section-card-head">
              <div>
                <p className="eyebrow">NeoMarket Seller</p>
                <h2>{authMode === 'register' ? 'Регистрация продавца' : 'Вход в seller-кабинет'}</h2>
                <p>Кабинет теперь работает через реальные JWT-токены auth-сервиса.</p>
              </div>
            </div>

            <form className="form-grid" onSubmit={handleAuthSubmit}>
              {authMode === 'register' && (
                <>
                  <label>
                    <span>Компания</span>
                    <input value={authForm.company_name} onChange={(event) => handleAuthField('company_name', event.target.value)} />
                  </label>
                  <label>
                    <span>Username</span>
                    <input value={authForm.username} onChange={(event) => handleAuthField('username', event.target.value)} />
                  </label>
                  <label>
                    <span>Имя</span>
                    <input value={authForm.first_name} onChange={(event) => handleAuthField('first_name', event.target.value)} />
                  </label>
                  <label>
                    <span>Фамилия</span>
                    <input value={authForm.last_name} onChange={(event) => handleAuthField('last_name', event.target.value)} />
                  </label>
                  <label>
                    <span>Телефон</span>
                    <input value={authForm.phone} onChange={(event) => handleAuthField('phone', event.target.value)} />
                  </label>
                </>
              )}
              <label>
                <span>Email</span>
                <input type="email" value={authForm.email} onChange={(event) => handleAuthField('email', event.target.value)} />
              </label>
              <label>
                <span>Пароль</span>
                <input type="password" value={authForm.password} onChange={(event) => handleAuthField('password', event.target.value)} />
              </label>
              {authMode === 'register' && (
                <label>
                  <span>Подтверждение пароля</span>
                  <input
                    type="password"
                    value={authForm.password_confirm}
                    onChange={(event) => handleAuthField('password_confirm', event.target.value)}
                  />
                </label>
              )}
              <div className="button-row wide">
                <button type="submit" className="primary-btn" disabled={authLoading}>
                  {authLoading ? 'Подождите...' : authMode === 'register' ? 'Создать seller-аккаунт' : 'Войти'}
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => setAuthMode((current) => (current === 'login' ? 'register' : 'login'))}
                >
                  {authMode === 'login' ? 'Нужен новый seller-аккаунт' : 'Уже есть аккаунт'}
                </button>
              </div>
            </form>
          </section>
        </main>
      </div>
    )
  }

  return (
    <div className="app-layout">
      <div className="bg-wave"></div>
      <Header
        activePage={currentPage}
        onMenuClick={() => setSidebarOpen((current) => !current)}
        onLogout={handleLogout}
        userInfo={userInfo}
        sellerId={sellerId}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        alertsCount={alertsCount}
      />
      <div className="app-container">
        <Sidebar
          currentPage={currentPage}
          setCurrentPage={(page) => {
            setCurrentPage(page)
            setSidebarOpen(false)
          }}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <main className="main-content">
          <Banner banner={banner} onClose={() => setBanner(null)} />
          <div className="page-header">
            <div>
              <p className="eyebrow">Seller workspace</p>
              <h1>{PAGE_TITLES[currentPage]}</h1>
            </div>
            <div className="page-header-meta">
              <span>Seller ID: <code>{shortId(sellerId)}</code></span>
              <span>Склад: <code>{shortId(userInfo.warehouse_id)}</code></span>
            </div>
          </div>
          {renderPage()}
        </main>
      </div>
    </div>
  )
}
