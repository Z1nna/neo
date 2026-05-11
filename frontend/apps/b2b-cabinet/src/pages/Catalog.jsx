import { useState } from 'react'
import './Catalog.css'

export default function CatalogPage() {
  const [products, setProducts] = useState([
    { id: 1, name: 'Процессор Intel Core i9', category: 'Компоненты', price: 45000, supplier: 'ТОП 500', rating: 4.9, orders: 1240, image: '🖥️' },
    { id: 2, name: 'Видеокарта RTX 4090', category: 'Компоненты', price: 89000, supplier: 'ТОП 10', rating: 4.8, orders: 856, image: '📺' },
    { id: 3, name: 'Материнская плата ASUS', category: 'Компоненты', price: 28000, supplier: 'ТОП 100', rating: 4.7, orders: 532, image: '⚙️' },
    { id: 4, name: 'SSD Samsung 1TB', category: 'Хранение', price: 12000, supplier: 'ТОП 50', rating: 4.9, orders: 2100, image: '💾' },
    { id: 5, name: 'Оперативная память 32GB', category: 'Память', price: 8500, supplier: 'ТОП 25', rating: 4.8, orders: 1876, image: '🎚️' },
    { id: 6, name: 'Блок питания 850W', category: 'Питание', price: 6500, supplier: 'ТОП 100', rating: 4.6, orders: 634, image: '🔋' },
  ])

  const [selectedCategory, setSelectedCategory] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('rating')
  const [cart, setCart] = useState([])

  const categories = ['Все', 'Компоненты', 'Хранение', 'Память', 'Питание']

  const filteredProducts = products
    .filter(p => !selectedCategory || selectedCategory === 'Все' || p.category === selectedCategory)
    .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'rating') return b.rating - a.rating
      if (sortBy === 'price-low') return a.price - b.price
      if (sortBy === 'price-high') return b.price - a.price
      if (sortBy === 'popular') return b.orders - a.orders
      return 0
    })

  const addToCart = (product) => {
    const existing = cart.find(item => item.id === product.id)
    if (existing) {
      setCart(cart.map(item => 
        item.id === product.id ? {...item, qty: item.qty + 1} : item
      ))
    } else {
      setCart([...cart, {...product, qty: 1}])
    }
  }

  return (
    <div className="catalog-page">
      <div className="catalog-header">
        <h1>Каталог поставщиков</h1>
        <p>Закупайте товары оптом от проверенных поставщиков</p>
      </div>

      <div className="catalog-container">
        {/* Sidebar */}
        <aside className="catalog-sidebar">
          <div className="sidebar-section">
            <h3>Категории</h3>
            <div className="category-list">
              {categories.map(cat => (
                <button
                  key={cat}
                  className={`category-btn ${(selectedCategory === cat || (selectedCategory === null && cat === 'Все')) ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(cat === 'Все' ? null : cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="sidebar-divider"></div>

          <div className="sidebar-section">
            <h3>Рейтинг поставщика</h3>
            <div className="rating-filter">
              {[5, 4, 3].map(rating => (
                <label key={rating} className="rating-label">
                  <input type="checkbox" />
                  <span>{'⭐'.repeat(rating)} {rating}+</span>
                </label>
              ))}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="catalog-main">
          {/* Filters & Sort */}
          <div className="catalog-controls">
            <div className="search-box">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input 
                type="text" 
                placeholder="Поиск товаров..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <select className="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="rating">По рейтингу</option>
              <option value="price-low">Цена: низкая → высокая</option>
              <option value="price-high">Цена: высокая → низкая</option>
              <option value="popular">По популярности</option>
            </select>
          </div>

          {/* Products Grid */}
          <div className="products-grid">
            {filteredProducts.length === 0 ? (
              <div className="no-products">
                <p>Товары не найдены</p>
              </div>
            ) : (
              filteredProducts.map(product => (
                <div key={product.id} className="product-item">
                  <div className="product-image">{product.image}</div>
                  
                  <div className="product-info">
                    <h3>{product.name}</h3>
                    <p className="product-supplier">{product.supplier}</p>
                    
                    <div className="product-rating">
                      <span className="stars">{'⭐'.repeat(Math.floor(product.rating))}</span>
                      <span className="rating-value">{product.rating}</span>
                      <span className="orders-count">({product.orders} закупок)</span>
                    </div>

                    <div className="product-price-info">
                      <p className="product-price">₽{product.price.toLocaleString('ru-RU')}</p>
                      <p className="product-unit">за единицу</p>
                    </div>

                    <button className="add-to-cart-btn" onClick={() => addToCart(product)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="9" cy="21" r="1" />
                        <circle cx="20" cy="21" r="1" />
                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                      </svg>
                      В корзину
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </main>

        {/* Cart Sidebar */}
        {cart.length > 0 && (
          <aside className="cart-sidebar">
            <div className="cart-header">
              <h3>Корзина</h3>
              <span className="cart-count">{cart.length}</span>
            </div>

            <div className="cart-items">
              {cart.map(item => (
                <div key={item.id} className="cart-item">
                  <p className="cart-item-name">{item.name}</p>
                  <div className="cart-item-qty">
                    <button onClick={() => setCart(cart.map(i => i.id === item.id ? {...i, qty: Math.max(1, i.qty - 1)} : i))}>−</button>
                    <span>{item.qty}</span>
                    <button onClick={() => setCart(cart.map(i => i.id === item.id ? {...i, qty: i.qty + 1} : i))}>+</button>
                  </div>
                  <p className="cart-item-price">₽{(item.price * item.qty).toLocaleString('ru-RU')}</p>
                </div>
              ))}
            </div>

            <div className="cart-total">
              <strong>Итого:</strong>
              <strong>₽{cart.reduce((sum, item) => sum + item.price * item.qty, 0).toLocaleString('ru-RU')}</strong>
            </div>

            <button className="checkout-btn">Оформить заказ</button>
          </aside>
        )}
      </div>
    </div>
  )
}
