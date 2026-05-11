import { useEffect, useMemo, useState } from 'react'
import './index.css'
import {
  buildApiHeaders,
  clearAuthSession,
  fetchMe,
  isAuthenticated,
  login,
  register,
} from '../../../shared/auth.js'

const CATALOG_BASE = '/api/v1/catalog'
const CART_BASE = '/api/v1/cart'

const EMPTY_AUTH_FORM = {
  email: '',
  username: '',
  first_name: '',
  last_name: '',
  password: '',
  password_confirm: '',
}

async function api(url, options = {}) {
  const response = await fetch(url, options)
  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json') ? await response.json() : null

  if (!response.ok) {
    throw new Error(payload?.message || `Request failed with status ${response.status}`)
  }

  return payload
}

function ProductCard({ product, isFavorite, onAddToCart, onToggleFavorite }) {
  return (
    <div className="product-card">
      <img src={product.image || 'https://placehold.co/600x400?text=NeoMarket'} alt={product.title} />
      <h3>{product.title}</h3>
      <p className="price">{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(product.price || 0)}</p>
      <div style={{ display: 'grid', gap: 8, padding: '0 1rem 1rem' }}>
        <button onClick={() => onAddToCart(product)} disabled={!product.in_stock}>
          {product.in_stock ? 'Добавить в корзину' : 'Нет в наличии'}
        </button>
        <button onClick={() => onToggleFavorite(product)} style={{ background: isFavorite ? '#dc3545' : '#6c757d' }}>
          {isFavorite ? 'Убрать из избранного' : 'В избранное'}
        </button>
      </div>
    </div>
  )
}

function CategoryList({ categories, selectedCategory, onSelectCategory }) {
  return (
    <div className="category-list">
      <h2>Категории</h2>
      <ul>
        <li className={!selectedCategory ? 'active' : ''} onClick={() => onSelectCategory(null)}>Все</li>
        {categories.map((category) => (
          <li
            key={category.id}
            className={selectedCategory === category.id ? 'active' : ''}
            onClick={() => onSelectCategory(category.id)}
          >
            {category.name}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [authForm, setAuthForm] = useState(EMPTY_AUTH_FORM)
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [collections, setCollections] = useState([])
  const [banners, setBanners] = useState([])
  const [favoriteIds, setFavoriteIds] = useState([])
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('date_desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)

  const hasAuth = isAuthenticated()

  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds])

  useEffect(() => {
    let cancelled = false

    const bootstrap = async () => {
      try {
        const [categoriesData, bannersData, collectionsData] = await Promise.all([
          api(`${CATALOG_BASE}/categories/`),
          api(`${CART_BASE}/home/banners/`).catch(() => ({ items: [] })),
          api(`${CART_BASE}/main/collections/`).catch(() => ({ items: [] })),
        ])
        if (cancelled) return

        setCategories(categoriesData.items || [])
        setBanners(bannersData.items || [])
        setCollections(collectionsData.items || [])
      } catch (error) {
        if (!cancelled) {
          setMessage({ type: 'error', text: error.message })
        }
      }
    }

    bootstrap()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadProducts = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          limit: '20',
          offset: String((currentPage - 1) * 20),
          sort: sortBy,
        })
        if (selectedCategory) params.set('category_id', selectedCategory)
        if (searchQuery) params.set('search', searchQuery)

        const data = await api(`${CATALOG_BASE}/products/?${params.toString()}`)
        if (cancelled) return

        setProducts(data.items || [])
        setTotalPages(Math.max(1, Math.ceil((data.total_count || 0) / 20)))
      } catch (error) {
        if (!cancelled) {
          setProducts([])
          setMessage({ type: 'error', text: error.message })
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadProducts()

    return () => {
      cancelled = true
    }
  }, [currentPage, searchQuery, selectedCategory, sortBy])

  useEffect(() => {
    if (!hasAuth) {
      setUser(null)
      setFavoriteIds([])
      return
    }

    let cancelled = false

    const loadAccountData = async () => {
      try {
        const [me, favorites] = await Promise.all([
          fetchMe(),
          api(`${CART_BASE}/favorites/`, {
            headers: buildApiHeaders(),
          }),
        ])
        if (cancelled) return

        setUser(me)
        setFavoriteIds((favorites.items || []).map((item) => item.product?.id).filter(Boolean))
      } catch (error) {
        if (!cancelled) {
          setMessage({ type: 'error', text: error.message })
        }
      }
    }

    loadAccountData()

    return () => {
      cancelled = true
    }
  }, [hasAuth])

  const handleAuthSubmit = async (event) => {
    event.preventDefault()
    setMessage(null)

    try {
      if (authMode === 'register') {
        await register({
          ...authForm,
          role: 'CUSTOMER',
        })
      } else {
        await login({
          email: authForm.email,
          password: authForm.password,
        })
      }

      const me = await fetchMe()
      setUser(me)
      setAuthForm(EMPTY_AUTH_FORM)
      setMessage({ type: 'success', text: authMode === 'register' ? 'Аккаунт покупателя создан.' : 'Вход выполнен.' })
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  const handleLogout = () => {
    clearAuthSession()
    window.location.reload()
  }

  const handleAddToCart = async (product) => {
    try {
      const skus = await api(`${CATALOG_BASE}/products/${product.id}/skus/`)
      const firstSku = (skus || [])[0]
      if (!firstSku?.id) {
        throw new Error('У товара пока нет доступного SKU')
      }

      await api(`${CART_BASE}/cart/items/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildApiHeaders({ useGuestSession: true }),
        },
        body: JSON.stringify({
          sku_id: firstSku.id,
          quantity: 1,
        }),
      })

      setMessage({ type: 'success', text: `Товар "${product.title}" добавлен в корзину.` })
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  const handleToggleFavorite = async (product) => {
    if (!hasAuth) {
      setMessage({ type: 'error', text: 'Для избранного нужна авторизация.' })
      return
    }

    const isFavorite = favoriteSet.has(product.id)
    try {
      await api(`${CART_BASE}/favorites/${product.id}/`, {
        method: isFavorite ? 'DELETE' : 'POST',
        headers: buildApiHeaders(),
      })

      setFavoriteIds((current) => (
        isFavorite ? current.filter((id) => id !== product.id) : [...current, product.id]
      ))
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  return (
    <div className="app">
      <header className="header">
        <h1>NeoMarket B2C</h1>
        <div className="user-controls">
          {hasAuth ? (
            <div className="input-group">
              <span>{user?.email || 'Авторизованный пользователь'}</span>
              <button onClick={handleLogout}>Выйти</button>
            </div>
          ) : (
            <form onSubmit={handleAuthSubmit} className="input-group" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {authMode === 'register' && (
                <>
                  <input placeholder="Username" value={authForm.username} onChange={(event) => setAuthForm((current) => ({ ...current, username: event.target.value }))} />
                  <input placeholder="Имя" value={authForm.first_name} onChange={(event) => setAuthForm((current) => ({ ...current, first_name: event.target.value }))} />
                  <input placeholder="Фамилия" value={authForm.last_name} onChange={(event) => setAuthForm((current) => ({ ...current, last_name: event.target.value }))} />
                </>
              )}
              <input type="email" placeholder="Email" value={authForm.email} onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))} />
              <input type="password" placeholder="Пароль" value={authForm.password} onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))} />
              {authMode === 'register' && (
                <input type="password" placeholder="Повторите пароль" value={authForm.password_confirm} onChange={(event) => setAuthForm((current) => ({ ...current, password_confirm: event.target.value }))} />
              )}
              <button type="submit">{authMode === 'register' ? 'Регистрация' : 'Войти'}</button>
              <button type="button" onClick={() => setAuthMode((current) => current === 'login' ? 'register' : 'login')}>
                {authMode === 'login' ? 'Создать аккаунт' : 'Есть аккаунт'}
              </button>
            </form>
          )}
        </div>
      </header>

      <div className="container">
        <CategoryList categories={categories} selectedCategory={selectedCategory} onSelectCategory={(id) => {
          setSelectedCategory(id)
          setCurrentPage(1)
        }} />

        <main className="main-content">
          {message && <div className={message.type === 'error' ? 'error' : 'loading'}>{message.text}</div>}

          {banners.length > 0 && (
            <div className="stats">
              {banners.map((banner) => (
                <div key={banner.id} className="stat-item">
                  <div className="stat-value">{banner.title}</div>
                  <div className="stat-label">{banner.subtitle || banner.link || 'Баннер'}</div>
                </div>
              ))}
            </div>
          )}

          {collections.length > 0 && (
            <div className="categories" style={{ marginBottom: 16 }}>
              {collections.map((collection) => (
                <button key={collection.id} className="category-btn" type="button">
                  {collection.title}
                </button>
              ))}
            </div>
          )}

          <div className="filters-bar">
            <form onSubmit={(event) => event.preventDefault()} className="search-form">
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value)
                  setCurrentPage(1)
                }}
                placeholder="Искать товары"
                className="search-input"
              />
            </form>

            <div className="filter-controls">
              <select value={sortBy} onChange={(event) => {
                setSortBy(event.target.value)
                setCurrentPage(1)
              }}>
                <option value="date_desc">Сначала новые</option>
                <option value="price_asc">Сначала дешёвые</option>
                <option value="price_desc">Сначала дорогие</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="loading">Загружаем каталог...</div>
          ) : (
            <>
              <div className="products-grid">
                {products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    isFavorite={favoriteSet.has(product.id)}
                    onAddToCart={handleAddToCart}
                    onToggleFavorite={handleToggleFavorite}
                  />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="pagination">
                  <button onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1}>
                    Назад
                  </button>
                  <span>Страница {currentPage} из {totalPages}</span>
                  <button onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages}>
                    Далее
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
