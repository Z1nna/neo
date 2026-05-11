import { useState } from 'react'
import './Orders.css'

export default function OrdersPage() {
  const [orders, setOrders] = useState([
    { id: 'ORD-12401', date: '2024-05-10', supplier: 'ТОП 10', items: 5, total: 125000, status: 'delivered', payment: 'paid' },
    { id: 'ORD-12400', date: '2024-05-09', supplier: 'ТОП 50', items: 3, total: 42000, status: 'shipped', payment: 'paid' },
    { id: 'ORD-12399', date: '2024-05-08', supplier: 'ТОП 100', items: 8, total: 156000, status: 'processing', payment: 'pending' },
    { id: 'ORD-12398', date: '2024-05-07', supplier: 'ТОП 500', items: 2, total: 28000, status: 'delivered', payment: 'paid' },
  ])

  const [filterStatus, setFilterStatus] = useState(null)

  const filteredOrders = filterStatus 
    ? orders.filter(o => o.status === filterStatus)
    : orders

  const getStatusBadge = (status) => {
    const statusMap = {
      processing: { label: 'Обработка', color: 'processing' },
      shipped: { label: 'Отправлено', color: 'shipped' },
      delivered: { label: 'Доставлено', color: 'delivered' },
    }
    return statusMap[status] || { label: status, color: 'default' }
  }

  const getPaymentBadge = (payment) => {
    return payment === 'paid' 
      ? { label: '✓ Оплачено', color: 'paid' }
      : { label: '⏳ Ожидание', color: 'pending' }
  }

  return (
    <div className="orders-page">
      <div className="orders-header">
        <h1>Мои заказы</h1>
        <p>История всех ваших закупок</p>
      </div>

      {/* Filter Tabs */}
      <div className="filter-tabs">
        <button 
          className={`filter-tab ${!filterStatus ? 'active' : ''}`}
          onClick={() => setFilterStatus(null)}
        >
          Все заказы <span className="badge">{orders.length}</span>
        </button>
        <button 
          className={`filter-tab ${filterStatus === 'processing' ? 'active' : ''}`}
          onClick={() => setFilterStatus('processing')}
        >
          Обработка <span className="badge">{orders.filter(o => o.status === 'processing').length}</span>
        </button>
        <button 
          className={`filter-tab ${filterStatus === 'shipped' ? 'active' : ''}`}
          onClick={() => setFilterStatus('shipped')}
        >
          Отправлено <span className="badge">{orders.filter(o => o.status === 'shipped').length}</span>
        </button>
        <button 
          className={`filter-tab ${filterStatus === 'delivered' ? 'active' : ''}`}
          onClick={() => setFilterStatus('delivered')}
        >
          Доставлено <span className="badge">{orders.filter(o => o.status === 'delivered').length}</span>
        </button>
      </div>

      {/* Orders List */}
      <div className="orders-container">
        {filteredOrders.length === 0 ? (
          <div className="empty-state">
            <p>Нет заказов с этим статусом</p>
          </div>
        ) : (
          filteredOrders.map(order => {
            const statusBadge = getStatusBadge(order.status)
            const paymentBadge = getPaymentBadge(order.payment)
            return (
              <div key={order.id} className="order-card">
                <div className="order-header">
                  <div className="order-id">
                    <h3>{order.id}</h3>
                    <p>{new Date(order.date).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                  </div>
                  <div className="order-badges">
                    <span className={`status-badge ${statusBadge.color}`}>{statusBadge.label}</span>
                    <span className={`payment-badge ${paymentBadge.color}`}>{paymentBadge.label}</span>
                  </div>
                </div>

                <div className="order-body">
                  <div className="order-detail">
                    <label>Поставщик</label>
                    <p>{order.supplier}</p>
                  </div>
                  <div className="order-detail">
                    <label>Товаров</label>
                    <p>{order.items} шт.</p>
                  </div>
                  <div className="order-detail">
                    <label>Общая сумма</label>
                    <p className="order-total">₽{order.total.toLocaleString('ru-RU')}</p>
                  </div>
                </div>

                <div className="order-footer">
                  <button className="action-btn details">Подробнее</button>
                  <button className="action-btn download">Скачать счёт</button>
                  {order.status === 'processing' && <button className="action-btn cancel">Отменить</button>}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Stats */}
      <div className="orders-stats">
        <div className="stat-box">
          <p className="stat-label">Всего потрачено</p>
          <p className="stat-value">₽{orders.reduce((sum, o) => sum + o.total, 0).toLocaleString('ru-RU')}</p>
        </div>
        <div className="stat-box">
          <p className="stat-label">Среднее за заказ</p>
          <p className="stat-value">₽{Math.round(orders.reduce((sum, o) => sum + o.total, 0) / orders.length).toLocaleString('ru-RU')}</p>
        </div>
        <div className="stat-box">
          <p className="stat-label">Всего заказов</p>
          <p className="stat-value">{orders.length}</p>
        </div>
      </div>
    </div>
  )
}
