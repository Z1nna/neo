import { useEffect, useState } from 'react'
import './index.css'
import {
  buildApiHeaders,
  fetchMe,
  getGuestSessionId,
  isAuthenticated,
} from '../../../shared/auth.js'

const API_BASE = '/api/v1/cart/cart'

async function api(path, { method = 'GET', body, useGuestSession = true } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...buildApiHeaders({ useGuestSession }),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (response.status === 204) return null

  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json') ? await response.json() : null

  if (!response.ok) {
    throw new Error(payload?.message || `Request failed with status ${response.status}`)
  }

  return payload
}

export default function App() {
  const [items, setItems] = useState([])
  const [summary, setSummary] = useState({ total_amount: 0, total_items: 0, total_quantity: 0, currency: 'RUB' })
  const [validation, setValidation] = useState(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [user, setUser] = useState(null)
  const [newSkuId, setNewSkuId] = useState('')
  const [newQuantity, setNewQuantity] = useState(1)

  const hasAuth = isAuthenticated()

  const fetchCart = async () => {
    setLoading(true)
    try {
      if (hasAuth) {
        const me = await fetchMe()
        setUser(me)
      }

      const data = await api('/', { useGuestSession: true })
      setItems(data.items || [])
      setSummary(data.summary || { total_amount: 0, total_items: 0, total_quantity: 0, currency: 'RUB' })
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCart()
  }, [hasAuth])

  const addItem = async (event) => {
    event.preventDefault()
    if (!newSkuId.trim()) return

    try {
      await api('/items/', {
        method: 'POST',
        body: {
          sku_id: newSkuId.trim(),
          quantity: Number(newQuantity || 1),
        },
        useGuestSession: true,
      })
      setMessage({ type: 'success', text: 'SKU добавлен в корзину.' })
      setNewSkuId('')
      setNewQuantity(1)
      await fetchCart()
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  const updateQuantity = async (itemId, quantity) => {
    if (quantity < 1) {
      await removeItem(itemId)
      return
    }

    try {
      await api(`/items/${itemId}/`, {
        method: 'PUT',
        body: { quantity },
        useGuestSession: true,
      })
      await fetchCart()
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  const removeItem = async (itemId) => {
    try {
      await api(`/items/${itemId}/`, {
        method: 'DELETE',
        useGuestSession: true,
      })
      setMessage({ type: 'success', text: 'Позиция удалена из корзины.' })
      await fetchCart()
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  const validateCart = async () => {
    try {
      const data = await api('/validate/', {
        useGuestSession: false,
      })
      setValidation(data)
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  return (
    <div>
      <div className="header">
        <h1>Shopping Cart</h1>
        <div className="input-group">
          <span>{hasAuth ? (user?.email || 'Авторизованный покупатель') : `Guest session: ${getGuestSessionId()}`}</span>
        </div>
      </div>

      <div className="container">
        {message && <div className={message.type === 'error' ? 'error' : 'loading'}>{message.text}</div>}

        <div className="cart-items">
          <div className="input-group" style={{ marginBottom: 16 }}>
            <input
              type="text"
              value={newSkuId}
              onChange={(event) => setNewSkuId(event.target.value)}
              placeholder="SKU UUID"
            />
            <input
              className="qty-input"
              type="number"
              min="1"
              value={newQuantity}
              onChange={(event) => setNewQuantity(Math.max(1, Number(event.target.value) || 1))}
            />
            <button onClick={addItem}>Добавить SKU</button>
          </div>

          {loading && <div className="loading">Загружаем корзину...</div>}

          {!loading && items.length === 0 && (
            <div className="empty-cart">Корзина пока пуста.</div>
          )}

          {!loading && items.map((item) => (
            <div key={item.item_id} className="item-row">
              <div className="item-info">
                <div className="item-name">{item.product_title || `SKU ${item.sku_id}`}</div>
                <div>SKU: {item.sku_name || item.sku_id}</div>
              </div>
              <div className="item-controls">
                <button onClick={() => updateQuantity(item.item_id, item.quantity - 1)}>-</button>
                <input className="qty-input" value={item.quantity} readOnly />
                <button onClick={() => updateQuantity(item.item_id, item.quantity + 1)}>+</button>
              </div>
              <div className="item-total">
                {item.line_total ? new Intl.NumberFormat('ru-RU', { style: 'currency', currency: summary.currency || 'RUB', maximumFractionDigits: 0 }).format(item.line_total) : 'n/a'}
              </div>
              <button className="danger" onClick={() => removeItem(item.item_id)}>Удалить</button>
            </div>
          ))}
        </div>

        <div className="cart-summary">
          <div className="summary-row">
            <span>Позиций</span>
            <span>{summary.total_items || items.length}</span>
          </div>
          <div className="summary-row">
            <span>Количество</span>
            <span>{summary.total_quantity || 0}</span>
          </div>
          <div className="summary-row total">
            <span>Сумма</span>
            <span>{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: summary.currency || 'RUB', maximumFractionDigits: 0 }).format(summary.total_amount || 0)}</span>
          </div>

          <div className="actions">
            <button onClick={fetchCart}>Обновить</button>
            <button onClick={validateCart} disabled={!hasAuth}>Проверить перед заказом</button>
          </div>

          {validation && (
            <div className="stats" style={{ marginTop: 16 }}>
              <div className="stat">
                <span className="stat-label">is_valid</span>
                <span className="stat-value">{String(validation.is_valid)}</span>
              </div>
              <div className="stat">
                <span className="stat-label">can_checkout</span>
                <span className="stat-value">{String(validation.can_checkout)}</span>
              </div>
              <div className="stat">
                <span className="stat-label">issues</span>
                <span className="stat-value">{(validation.issues || []).length}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
