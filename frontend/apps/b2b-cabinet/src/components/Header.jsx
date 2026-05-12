import { useState } from 'react'
import './Header.css'

const pageTitles = {
  overview: 'Панель продавца',
  products: 'Товары и остатки',
  supplies: 'Поставки',
  settings: 'Настройки',
}

function shortId(value) {
  if (!value) return 'n/a'
  return `${value.slice(0, 8)}...${value.slice(-4)}`
}

export default function Header({
  activePage,
  alertsCount,
  onMenuClick,
  onNavigate,
  onLogout,
  onSearchChange,
  searchQuery,
  sellerId,
  userInfo,
}) {
  const [showProfile, setShowProfile] = useState(false)
  const searchEnabled = activePage === 'products'

  const navigate = (page) => {
    setShowProfile(false)
    onNavigate?.(page)
  }

  return (
    <header className="b2b-header">
      <div className="header-content">
        <div className="header-left">
          <button className="menu-btn" onClick={onMenuClick}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div className="logo">
            <div>
              <div className="logo-row">
                <h1>NeoMarket</h1>
                <span className="badge">SELLER</span>
              </div>
              <p className="page-caption">{pageTitles[activePage] || 'Seller cabinet'}</p>
            </div>
          </div>
        </div>

        <div className="header-center">
          <div className="search-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              disabled={!searchEnabled}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={searchEnabled ? 'Поиск по товарам и SKU...' : 'Поиск доступен на вкладке товаров'}
              value={searchQuery}
            />
          </div>
        </div>

        <div className="header-right">
          <div className="seller-chip">Seller ID: {shortId(sellerId)}</div>
          <button className="icon-btn" title="Уведомления" onClick={() => navigate('alerts')}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span className="notification-badge">{alertsCount}</span>
          </button>

          <div className="profile-menu">
            <button className="profile-btn" onClick={() => setShowProfile(!showProfile)}>
              <div className="avatar">{userInfo.contact_person?.charAt(0)}</div>
              <span className="company-name">{userInfo.company_name}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {showProfile && (
              <div className="profile-dropdown">
                <div className="profile-header">
                  <div className="avatar-large">{userInfo.contact_person?.charAt(0)}</div>
                  <div>
                    <p className="profile-company">{userInfo.company_name}</p>
                    <p className="profile-email">{userInfo.email}</p>
                  </div>
                </div>
                <div className="profile-divider"></div>
                <button type="button" className="dropdown-item" onClick={() => navigate('settings')}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  Мой профиль
                </button>
                <button type="button" className="dropdown-item" onClick={() => navigate('supplies')}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22C6.477 22 2 17.523 2 12s4.477-10 10-10 10 4.477 10 10-4.477 10-10 10z" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                  История
                </button>
                <button type="button" className="dropdown-item" onClick={() => navigate('settings')}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="1" />
                    <circle cx="19" cy="12" r="1" />
                    <circle cx="5" cy="12" r="1" />
                  </svg>
                  Настройки
                </button>
                <div className="profile-divider"></div>
                <button className="dropdown-item logout" onClick={onLogout}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Выход
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
