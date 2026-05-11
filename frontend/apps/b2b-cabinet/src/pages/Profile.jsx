import { useState } from 'react'
import './Profile.css'

export default function ProfilePage({ userInfo, setUserInfo }) {
  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState(userInfo)

  const handleSave = () => {
    setUserInfo(editData)
    setIsEditing(false)
  }

  return (
    <div className="profile-page">
      <div className="profile-header">
        <h1>Профиль компании</h1>
        <p>Управляйте информацией о вашей компании</p>
      </div>

      <div className="profile-container">
        {/* Main Profile */}
        <div className="profile-main">
          {/* Company Info */}
          <div className="profile-card">
            <div className="card-header">
              <h2>Информация о компании</h2>
              <button 
                className="edit-btn"
                onClick={() => {
                  setIsEditing(!isEditing)
                  if (isEditing) setEditData(userInfo)
                }}
              >
                {isEditing ? 'Отмена' : '✎ Редактировать'}
              </button>
            </div>

            {isEditing ? (
              <form className="edit-form">
                <div className="form-group">
                  <label>Название компании</label>
                  <input 
                    type="text"
                    value={editData.company_name}
                    onChange={(e) => setEditData({...editData, company_name: e.target.value})}
                  />
                </div>

                <div className="form-group">
                  <label>Контактное лицо</label>
                  <input 
                    type="text"
                    value={editData.contact_person}
                    onChange={(e) => setEditData({...editData, contact_person: e.target.value})}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Email</label>
                    <input 
                      type="email"
                      value={editData.email}
                      onChange={(e) => setEditData({...editData, email: e.target.value})}
                    />
                  </div>

                  <div className="form-group">
                    <label>Телефон</label>
                    <input 
                      type="tel"
                      value={editData.phone}
                      onChange={(e) => setEditData({...editData, phone: e.target.value})}
                    />
                  </div>
                </div>

                <button type="button" className="save-btn" onClick={handleSave}>
                  Сохранить изменения
                </button>
              </form>
            ) : (
              <div className="company-info">
                <div className="info-row">
                  <span className="label">Название:</span>
                  <span className="value">{userInfo.company_name}</span>
                </div>
                <div className="info-row">
                  <span className="label">Контактное лицо:</span>
                  <span className="value">{userInfo.contact_person}</span>
                </div>
                <div className="info-row">
                  <span className="label">Email:</span>
                  <span className="value">{userInfo.email}</span>
                </div>
                <div className="info-row">
                  <span className="label">Телефон:</span>
                  <span className="value">{userInfo.phone}</span>
                </div>
              </div>
            )}
          </div>

          {/* Company Stats */}
          <div className="profile-card">
            <h2>Статистика</h2>
            <div className="stats-grid">
              <div className="stat">
                <p className="stat-label">Рейтинг</p>
                <p className="stat-value">{'⭐'.repeat(Math.floor(userInfo.rating))}</p>
                <p className="stat-number">{userInfo.rating} / 5</p>
              </div>
              <div className="stat">
                <p className="stat-label">Отзывы</p>
                <p className="stat-value">{userInfo.reviews}</p>
                <p className="stat-number">положительных</p>
              </div>
              <div className="stat">
                <p className="stat-label">Клиент с</p>
                <p className="stat-value">{userInfo.since}</p>
                <p className="stat-number">года</p>
              </div>
            </div>
          </div>

          {/* Reviews */}
          <div className="profile-card">
            <h2>Последние отзывы</h2>
            <div className="reviews-list">
              {[
                { rating: 5, text: 'Отличное качество, быстрая доставка!', author: 'ООО Компания 1', date: '2024-05-10' },
                { rating: 5, text: 'Рекомендую! Все товары в порядке', author: 'ООО Компания 2', date: '2024-05-09' },
                { rating: 4, text: 'Хорошее качество, но доставка заняла немного дольше', author: 'ООО Компания 3', date: '2024-05-08' },
              ].map((review, idx) => (
                <div key={idx} className="review">
                  <div className="review-rating">{'⭐'.repeat(review.rating)}</div>
                  <p className="review-text">{review.text}</p>
                  <div className="review-meta">
                    <span className="review-author">{review.author}</span>
                    <span className="review-date">{new Date(review.date).toLocaleDateString('ru-RU')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="profile-sidebar">
          {/* Account Settings */}
          <div className="sidebar-card">
            <h3>Параметры аккаунта</h3>
            <div className="account-item">
              <label>Статус</label>
              <p className="status verified">✓ Верифицирован</p>
            </div>
            <div className="account-item">
              <label>Тип аккаунта</label>
              <p>B2B</p>
            </div>
            <div className="account-item">
              <label>Двухфакторная аутентификация</label>
              <p>Включена</p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="sidebar-card">
            <h3>Быстрые действия</h3>
            <button className="action-link">🔔 Управление уведомлениями</button>
            <button className="action-link">🔐 Изменить пароль</button>
            <button className="action-link">📝 Загрузить документы</button>
            <button className="action-link">💳 Способы оплаты</button>
          </div>

          {/* Support */}
          <div className="sidebar-card">
            <h3>Нужна помощь?</h3>
            <p>Свяжитесь с нашей командой поддержки для решения вопросов</p>
            <button className="support-btn">Связаться с поддержкой</button>
          </div>
        </aside>
      </div>
    </div>
  )
}
