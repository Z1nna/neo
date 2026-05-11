import { useState } from 'react'
import './Cart.css'

export default function CartPage() {
  const [cartItems, setCartItems] = useState([
    { id: 1, name: 'Процессор Intel Core i9', supplier: 'ТОП 10', qty: 10, price: 45000 },
    { id: 2, name: 'Видеокарта RTX 4090', supplier: 'ТОП 10', qty: 5, price: 89000 },
    { id: 3, name: 'SSD Samsung 1TB', supplier: 'ТОП 50', qty: 20, price: 12000 },
  ])

  const updateQty = (id, qty) => {
    if (qty <= 0) {
      removeItem(id)
    } else {
      setCartItems(cartItems.map(item => 
        item.id === id ? {...item, qty} : item
      ))
    }
  }

  const removeItem = (id) => {
    setCartItems(cartItems.filter(item => item.id !== id))
  }

  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.qty, 0)
  const shipping = subtotal > 500000 ? 0 : 15000
  const discount = Math.floor(subtotal * 0.05)
  const total = subtotal + shipping - discount

  return (
    <div className="cart-page">
      <div className="cart-header">
        <h1>Корзина</h1>
        <p>{cartItems.length} товаров в корзине</p>
      </div>

      <div className="cart-container">
        {/* Items */}
        <div className="cart-items-section">
          {cartItems.length === 0 ? (
            <div className="empty-cart">
              <p>Корзина пуста</p>
              <a href="#" className="continue-shopping">Продолжить покупки</a>
            </div>
          ) : (
            <div className="cart-items-list">
              {cartItems.map(item => (
                <div key={item.id} className="cart-item">
                  <div className="item-image">📦</div>
                  
                  <div className="item-details">
                    <h3>{item.name}</h3>
                    <p className="supplier">{item.supplier}</p>
                  </div>

                  <div className="item-quantity">
                    <label>Количество</label>
                    <div className="qty-controls">
                      <button onClick={() => updateQty(item.id, item.qty - 1)}>−</button>
                      <input 
                        type="number" 
                        value={item.qty}
                        onChange={(e) => updateQty(item.id, parseInt(e.target.value) || 0)}
                      />
                      <button onClick={() => updateQty(item.id, item.qty + 1)}>+</button>
                    </div>
                  </div>

                  <div className="item-price">
                    <label>Цена</label>
                    <p>₽{item.price.toLocaleString('ru-RU')}</p>
                  </div>

                  <div className="item-total">
                    <label>Итого</label>
                    <p>₽{(item.price * item.qty).toLocaleString('ru-RU')}</p>
                  </div>

                  <button className="remove-btn" onClick={() => removeItem(item.id)} title="Удалить">
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        {cartItems.length > 0 && (
          <aside className="cart-summary">
            <div className="summary-section">
              <h2>Расчет</h2>
              
              <div className="summary-row">
                <span>Сумма товаров:</span>
                <strong>₽{subtotal.toLocaleString('ru-RU')}</strong>
              </div>

              <div className="summary-row">
                <span>Скидка (5%):</span>
                <strong className="discount">−₽{discount.toLocaleString('ru-RU')}</strong>
              </div>

              <div className="summary-row">
                <span>Доставка:</span>
                <strong>
                  {shipping === 0 ? 'Бесплатно' : `₽${shipping.toLocaleString('ru-RU')}`}
                </strong>
              </div>

              {shipping === 0 && <p className="free-shipping">Бесплатная доставка!</p>}

              <div className="summary-divider"></div>

              <div className="summary-total">
                <span>Итого к оплате:</span>
                <strong>₽{total.toLocaleString('ru-RU')}</strong>
              </div>

              <button className="checkout-btn">Оформить заказ</button>

              <div className="payment-methods">
                <h3>Методы оплаты</h3>
                <label className="payment-method">
                  <input type="radio" name="payment" defaultChecked />
                  <span>Счёт на оплату</span>
                </label>
                <label className="payment-method">
                  <input type="radio" name="payment" />
                  <span>Банковский перевод</span>
                </label>
                <label className="payment-method">
                  <input type="radio" name="payment" />
                  <span>Карта (B2B)</span>
                </label>
              </div>

              <div className="support-info">
                <p>Нужна помощь?</p>
                <a href="#">Связаться с поддержкой</a>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Recommendations */}
      {cartItems.length > 0 && (
        <div className="recommendations">
          <h2>Рекомендуемые товары</h2>
          <div className="products-preview">
            {[1, 2, 3].map(i => (
              <div key={i} className="product-preview">
                <div className="preview-image">⚙️</div>
                <h4>Рекомендуемый товар {i}</h4>
                <p className="preview-price">₽{Math.random() * 50000 | 0}</p>
                <button className="add-btn">Добавить</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
