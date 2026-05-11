import { useEffect, useState } from 'react'
import './index.css'
import {
  buildApiHeaders,
  clearAuthSession,
  fetchMe,
  isAuthenticated,
  login,
  register,
} from '../../../shared/auth.js'

const API_BASE = '/api/v1/orders/orders'
const EMPTY_AUTH_FORM = {
  email: '',
  username: '',
  first_name: '',
  last_name: '',
  password: '',
  password_confirm: '',
}

async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...buildApiHeaders(),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json') ? await response.json() : null

  if (!response.ok) {
    throw new Error(payload?.message || `Request failed with status ${response.status}`)
  }

  return payload
}

export default function App() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [user, setUser] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [authForm, setAuthForm] = useState(EMPTY_AUTH_FORM)

  const hasAuth = isAuthenticated()

  useEffect(() => {
    if (!hasAuth) {
      setOrders([])
      return
    }

    let cancelled = false

    const loadOrders = async () => {
      setLoading(true)
      try {
        const [me, data] = await Promise.all([
          fetchMe(),
          api('/?limit=50&offset=0'),
        ])
        if (cancelled) return

        setUser(me)
        setOrders(data.items || [])
      } catch (error) {
        if (!cancelled) {
          setMessage({ type: 'error', text: error.message })
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadOrders()

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

  const cancelOrder = async (orderId) => {
    if (!window.confirm('Отменить заказ?')) return

    try {
      await api(`/${orderId}/cancel/`, {
        method: 'POST',
        body: {},
      })
      const data = await api('/?limit=50&offset=0')
      setOrders(data.items || [])
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  if (!hasAuth) {
    return (
      <div>
        <div className="header">
          <h1>Orders</h1>
          <div className="input-group">История заказов доступна после авторизации.</div>
        </div>
        <div className="container">
          {message && <div className="error">{message.text}</div>}
          <form className="filters" onSubmit={handleAuthSubmit}>
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
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="header">
        <h1>Orders</h1>
        <div className="input-group">
          <span>{user?.email || 'Покупатель'}</span>
          <button onClick={handleLogout}>Выйти</button>
        </div>
      </div>

      <div className="container">
        {message && <div className={message.type === 'error' ? 'error' : 'loading'}>{message.text}</div>}
        {loading && <div className="loading">Загружаем заказы...</div>}

        {!loading && orders.length === 0 && (
          <div className="empty-state">Заказов пока нет.</div>
        )}

        {!loading && orders.length > 0 && (
          <div className="orders-list">
            {orders.map((order) => (
              <div key={order.id} className="order-card">
                <div className="order-header">
                  <div>
                    <div className="order-id">Заказ #{order.id}</div>
                    <div className="order-date">{new Date(order.created_at).toLocaleString('ru-RU')}</div>
                  </div>
                  <div className={`order-status status-${(order.status || 'PENDING').toLowerCase()}`}>
                    {order.status}
                  </div>
                </div>

                <div className="order-items">
                  {(order.items || []).map((item) => (
                    <div key={`${order.id}-${item.sku_id}`} className="order-item">
                      <div className="item-name">Product {item.product_id}</div>
                      <div className="item-qty">x{item.quantity}</div>
                      <div className="item-price">
                        {new Intl.NumberFormat('ru-RU', { style: 'currency', currency: item.line_total.currency || 'RUB', maximumFractionDigits: 0 }).format(item.line_total.amount || 0)}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="order-summary">
                  <div className="summary-item">
                    <div className="summary-label">Итого</div>
                    <div className="summary-value total">
                      {new Intl.NumberFormat('ru-RU', { style: 'currency', currency: order.total.currency || 'RUB', maximumFractionDigits: 0 }).format(order.total.amount || 0)}
                    </div>
                  </div>
                </div>

                <div className="order-actions">
                  {['PENDING', 'PAID', 'ASSEMBLING'].includes(order.status) && (
                    <button className="danger" onClick={() => cancelOrder(order.id)}>
                      Отменить заказ
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
