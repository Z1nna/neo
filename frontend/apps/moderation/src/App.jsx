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

const API_BASE = '/api/v1/moderation'

const EMPTY_AUTH_FORM = {
  email: '',
  username: '',
  first_name: '',
  last_name: '',
  password: '',
  password_confirm: '',
}

const EMPTY_ENQUEUE_FORM = {
  product_id: '',
  event_type: 'CREATED',
  title: '',
  description: '',
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

  if (response.status === 204) return null

  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json') ? await response.json() : null

  if (!response.ok) {
    throw new Error(payload?.message || `Request failed with status ${response.status}`)
  }

  return payload
}

export default function App() {
  const [authMode, setAuthMode] = useState('login')
  const [authForm, setAuthForm] = useState(EMPTY_AUTH_FORM)
  const [authLoading, setAuthLoading] = useState(false)
  const [moderator, setModerator] = useState(null)
  const [currentItem, setCurrentItem] = useState(null)
  const [blockingReasons, setBlockingReasons] = useState([])
  const [selectedReason, setSelectedReason] = useState('')
  const [comment, setComment] = useState('')
  const [enqueueForm, setEnqueueForm] = useState(EMPTY_ENQUEUE_FORM)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)

  const hasAuth = isAuthenticated()

  useEffect(() => {
    if (!hasAuth) return

    let cancelled = false

    const bootstrap = async () => {
      try {
        const [me, reasons] = await Promise.all([
          fetchMe(),
          api('/product-blocking-reasons'),
        ])
        if (cancelled) return

        setModerator(me)
        setBlockingReasons(reasons || [])
        if (!selectedReason && (reasons || []).length > 0) {
          setSelectedReason(reasons[0].code)
        }
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
  }, [hasAuth, selectedReason])

  const handleAuthSubmit = async (event) => {
    event.preventDefault()
    setAuthLoading(true)
    setMessage(null)

    try {
      if (authMode === 'register') {
        await register({
          ...authForm,
          role: 'MODERATOR',
        })
      } else {
        await login({
          email: authForm.email,
          password: authForm.password,
        })
      }

      const me = await fetchMe()
      setModerator(me)
      setAuthForm(EMPTY_AUTH_FORM)
      setMessage({ type: 'success', text: authMode === 'register' ? 'Аккаунт модератора создан.' : 'Вход выполнен.' })
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setAuthLoading(false)
    }
  }

  const handleNextCard = async () => {
    setLoading(true)
    setMessage(null)
    try {
      const card = await api('/product-moderation/get-next', { method: 'POST', body: {} })
      setCurrentItem(card)
      if (!card) {
        setMessage({ type: 'success', text: 'Очередь сейчас пуста.' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setLoading(false)
    }
  }

  const handleEnqueue = async (event) => {
    event.preventDefault()
    setLoading(true)
    setMessage(null)

    try {
      const card = await api('/product-moderation/enqueue', {
        method: 'POST',
        body: {
          product_id: enqueueForm.product_id,
          event_type: enqueueForm.event_type,
          snapshot_after: {
            id: enqueueForm.product_id,
            title: enqueueForm.title || 'Товар без названия',
            description: enqueueForm.description,
          },
        },
      })
      setCurrentItem(card)
      setMessage({ type: 'success', text: 'Карточка добавлена в очередь.' })
      setEnqueueForm(EMPTY_ENQUEUE_FORM)
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async () => {
    if (!currentItem) return
    setLoading(true)
    setMessage(null)
    try {
      const result = await api(`/products/${currentItem.product_id}/approve`, { method: 'POST', body: {} })
      setMessage({ type: 'success', text: `Товар ${result.product_id} переведён в ${result.status}.` })
      setCurrentItem(null)
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setLoading(false)
    }
  }

  const handleDecline = async () => {
    if (!currentItem) return
    setLoading(true)
    setMessage(null)
    try {
      const result = await api(`/products/${currentItem.product_id}/decline`, {
        method: 'POST',
        body: {
          reason_code: selectedReason,
          comment,
          fields: [],
        },
      })
      setMessage({ type: 'success', text: `Товар ${result.product_id} переведён в ${result.status}.` })
      setCurrentItem(null)
      setComment('')
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    clearAuthSession()
    window.location.reload()
  }

  if (!hasAuth) {
    return (
      <div>
        <div className="header">
          <h1>Moderation Workspace</h1>
          <p>Авторизация через auth service обязательна для модератора.</p>
        </div>
        <div className="container">
          {message && <div className={message.type === 'error' ? 'error' : 'empty'}>{message.text}</div>}
          <div className="item-card">
            <div className="item-header">
              <div>
                <div className="item-title">{authMode === 'register' ? 'Регистрация модератора' : 'Вход модератора'}</div>
                <div className="item-id">JWT будет использоваться для approve/decline/enqueue.</div>
              </div>
            </div>
            <form className="controls" onSubmit={handleAuthSubmit}>
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
                <input
                  type="password"
                  placeholder="Повторите пароль"
                  value={authForm.password_confirm}
                  onChange={(event) => setAuthForm((current) => ({ ...current, password_confirm: event.target.value }))}
                />
              )}
              <button type="submit" disabled={authLoading}>{authLoading ? 'Подождите...' : authMode === 'register' ? 'Создать аккаунт MODERATOR' : 'Войти'}</button>
              <button type="button" onClick={() => setAuthMode((current) => current === 'login' ? 'register' : 'login')}>
                {authMode === 'login' ? 'Новый модератор' : 'Уже есть аккаунт'}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="header">
        <h1>Moderation Workspace</h1>
        <p>{moderator ? `${moderator.email} · ${moderator.role}` : 'Авторизованный модератор'}</p>
      </div>

      <div className="container">
        {message && <div className={message.type === 'error' ? 'error' : 'empty'}>{message.text}</div>}

        <div className="controls">
          <button onClick={handleNextCard} disabled={loading}>
            {loading ? 'Загрузка...' : 'Взять следующую карточку'}
          </button>
          <button onClick={handleLogout}>Выйти</button>
        </div>

        <form className="item-card" onSubmit={handleEnqueue}>
          <div className="item-header">
            <div>
              <div className="item-title">Ручной enqueue</div>
              <div className="item-id">Нужен для отладки и ручного запуска модерации по контракту OpenAPI.</div>
            </div>
          </div>
          <div className="controls">
            <input
              placeholder="UUID товара"
              value={enqueueForm.product_id}
              onChange={(event) => setEnqueueForm((current) => ({ ...current, product_id: event.target.value }))}
            />
            <select
              value={enqueueForm.event_type}
              onChange={(event) => setEnqueueForm((current) => ({ ...current, event_type: event.target.value }))}
            >
              <option value="CREATED">CREATED</option>
              <option value="UPDATED">UPDATED</option>
            </select>
            <input
              placeholder="Название"
              value={enqueueForm.title}
              onChange={(event) => setEnqueueForm((current) => ({ ...current, title: event.target.value }))}
            />
            <input
              placeholder="Описание"
              value={enqueueForm.description}
              onChange={(event) => setEnqueueForm((current) => ({ ...current, description: event.target.value }))}
            />
            <button type="submit" disabled={loading}>Поставить в очередь</button>
          </div>
        </form>

        {currentItem ? (
          <div className="item-card">
            <div className="item-header">
              <div>
                <div className="item-title">{currentItem.snapshot_after?.title || 'Карточка товара'}</div>
                <div className="item-id">Product ID: {currentItem.product_id}</div>
              </div>
              <div className={`item-badge badge-${(currentItem.queue_status || 'PENDING').toLowerCase()}`}>
                {currentItem.queue_status}
              </div>
            </div>

            <div className="item-meta">
              <div className="meta-item">
                <div className="meta-label">Event type</div>
                <div className="meta-value">{currentItem.event_type}</div>
              </div>
              <div className="meta-item">
                <div className="meta-label">Assigned to</div>
                <div className="meta-value">{currentItem.assigned_to || 'Ещё не назначено'}</div>
              </div>
              <div className="meta-item">
                <div className="meta-label">Created at</div>
                <div className="meta-value">{new Date(currentItem.created_at).toLocaleString('ru-RU')}</div>
              </div>
            </div>

            <div className="item-content">
              <div className="content-section">
                <div className="content-label">Snapshot after</div>
                <div className="content-text">{JSON.stringify(currentItem.snapshot_after || {}, null, 2)}</div>
              </div>
            </div>

            <div className="content-section">
              <div className="content-label">Причина блокировки</div>
              <select value={selectedReason} onChange={(event) => setSelectedReason(event.target.value)}>
                <option value="">Выберите причину</option>
                {blockingReasons.map((reason) => (
                  <option key={reason.code} value={reason.code}>
                    {reason.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="content-section">
              <div className="content-label">Комментарий</div>
              <textarea
                className="reason-input"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Комментарий модератора"
              />
            </div>

            <div className="item-actions">
              <button className="approve-btn" onClick={handleApprove} disabled={loading}>Approve</button>
              <button className="reject-btn" onClick={handleDecline} disabled={loading || !selectedReason}>Decline</button>
            </div>
          </div>
        ) : (
          <div className="empty">Карточка ещё не выбрана. Возьмите следующую из очереди или создайте enqueue вручную.</div>
        )}
      </div>
    </div>
  )
}
