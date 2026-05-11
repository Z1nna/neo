import { useState, useEffect } from 'react'
import './Dashboard.css'

export default function Dashboard({ userInfo }) {
  const [stats, setStats] = useState({
    revenue: 125430,
    orders: 342,
    reviews: 4.8,
    activeProducts: 156
  })

  const [recentOrders, setRecentOrders] = useState([
    { id: 'ORD-12401', items: 5, total: 12500, date: '2024-05-10', status: 'completed' },
    { id: 'ORD-12400', items: 3, total: 8750, date: '2024-05-09', status: 'shipped' },
    { id: 'ORD-12399', items: 8, total: 21000, date: '2024-05-08', status: 'processing' },
  ])

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="welcome-section">
          <h1>Добро пожаловать, {userInfo.contact_person}!</h1>
          <p>Ваша компания: {userInfo.company_name}</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <p className="stat-label">Выручка (этот месяц)</p>
            <p className="stat-value">₽{(stats.revenue * 80).toLocaleString('ru-RU')}</p>
            <span className="stat-change positive">+12% от прошлого месяца</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">📦</div>
          <div className="stat-content">
            <p className="stat-label">Активные заказы</p>
            <p className="stat-value">{stats.orders}</p>
            <span className="stat-change">+24 новых сегодня</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">⭐</div>
          <div className="stat-content">
            <p className="stat-label">Ваш рейтинг</p>
            <p className="stat-value">{stats.reviews}</p>
            <span className="stat-change positive">На основе {userInfo.reviews} отзывов</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <p className="stat-label">Активные товары</p>
            <p className="stat-value">{stats.activeProducts}</p>
            <span className="stat-change">8 новых добавлено</span>
          </div>
        </div>
      </div>

      {/* Promotions */}
      <div className="promotions-section">
        <h2>Рекомендации</h2>
        <div className="promo-cards">
          <div className="promo-card">
            <div className="promo-tag">Маркетинг</div>
            <h3>Увеличьте видимость товаров</h3>
            <p>Используйте инструменты продвижения, чтобы привлечь больше покупателей</p>
            <button className="promo-btn">Узнать больше</button>
          </div>

          <div className="promo-card">
            <div className="promo-tag">Логистика</div>
            <h3>Оптимизируйте доставку</h3>
            <p>Подключитесь к новым партнёрам логистики для быстрой доставки</p>
            <button className="promo-btn">Подробнее</button>
          </div>

          <div className="promo-card">
            <div className="promo-tag">Аналитика</div>
            <h3>Отслеживайте тренды</h3>
            <p>Анализируйте спрос на товары и адаптируйте ассортимент</p>
            <button className="promo-btn">Открыть</button>
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="recent-orders">
        <div className="section-header">
          <h2>Последние заказы</h2>
          <a href="#" className="view-all">Посмотреть все →</a>
        </div>

        <table className="orders-table">
          <thead>
            <tr>
              <th>Заказ</th>
              <th>Товаров</th>
              <th>Сумма</th>
              <th>Дата</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {recentOrders.map(order => (
              <tr key={order.id}>
                <td><strong>{order.id}</strong></td>
                <td>{order.items}</td>
                <td className="amount">₽{(order.total * 80).toLocaleString('ru-RU')}</td>
                <td>{new Date(order.date).toLocaleDateString('ru-RU')}</td>
                <td>
                  <span className={`status-badge ${order.status}`}>
                    {order.status === 'completed' ? '✓ Завершён' : 
                     order.status === 'shipped' ? '📦 Отправлен' : 
                     '⏳ Обработка'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
