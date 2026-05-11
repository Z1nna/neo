# 📋 API Implementation Checklist

**Project**: NeoMarket  
**Date**: March 30, 2026  
**Status**: 43/43 endpoints implemented (100%)

---

## 🛒 B2C Cart Service (Корзина, Избранное, Подборки)

### Cart Management
- ✅ `GET /api/v1/cart` — Получить корзину
- ✅ `DELETE /api/v1/cart` — Очистить корзину
- ✅ `POST /api/v1/cart/items` — Добавить товар в корзину
- ✅ `GET /api/v1/cart/items/{item_id}` — Получить товар из корзину
- ✅ `PUT /api/v1/cart/items/{item_id}` — Обновить количество товара
- ✅ `DELETE /api/v1/cart/items/{item_id}` — Удалить товар из корзины
- ✅ `GET /api/v1/cart/validate` — Проверить готовность к оформлению

### Favorites (Избранное)
- ✅ `GET /api/v1/favorites` — Получить список избранного
- ✅ `POST /api/v1/favorites/{product_id}` — Добавить товар в избранное
- ✅ `DELETE /api/v1/favorites/{product_id}` — Удалить из избранного
- ✅ `POST /api/v1/favorites/{product_id}/subscribe` — Подписаться на уведомления о товаре

### Recommendations & Collections
- ✅ `GET /api/v1/cart/also_bought` — Часто покупают вместе
- ✅ `GET /api/v1/main/collections` — Получить подборки товаров
- ✅ `GET /api/v1/collections/{collection_id}/products` — Товары в подборке

### Homepage
- ✅ `GET /api/v1/home/banners` — Получить баннеры на главную

**Subtotal**: 15/15 ✅

---

## 📦 B2C Catalog Service (Каталог товаров)

### Product Listing & Search
- ✅ `GET /api/v1/products` — Список товаров с пагинацией, поиском, фильтрами и сортировкой
- ✅ `GET /api/v1/products/{id}` — Детали товара
- ✅ `GET /api/v1/products/{id}/similar` — Похожие товары в категории

### SKU Management
- ✅ `GET /api/v1/products/{product_id}/skus` — Список SKU товара
- ✅ `GET /api/v1/products/{product_id}/skus/{sku_id}` — Детали конкретного SKU

### Categories
- ✅ `GET /api/v1/categories` — Дерево категорий
- ✅ `GET /api/v1/categories/{id}` — Детали категории
- ✅ `GET /api/v1/categories/{id}/filters` — Доступные фильтры для категории

**Subtotal**: 8/8 ✅

---

## 🎯 B2C Orders Service (Заказы)

- ✅ `POST /api/v1/orders` — Создать заказ
- ✅ `GET /api/v1/orders` — История заказов пользователя (с пагинацией)
- ✅ `GET /api/v1/orders/{order_id}` — Получить заказ по ID
- ✅ `POST /api/v1/orders/{order_id}/cancel` — Отменить заказ
- ✅ `PATCH /api/v1/orders/{order_id}/status` — Обновить статус заказа (ADMIN role)

**Subtotal**: 5/5 ✅

---

## 🛡️ Moderation Service (Модерация товаров)

- ✅ `POST /api/v1/product-moderation/get-next` — Получить следующую карточку из очереди
- ✅ `POST /api/v1/products/{id}/approve` — Одобрить товар (статус → MODERATED)
- ✅ `POST /api/v1/products/{id}/decline` — Отклонить товар с причиной (статус → BLOCKED)
- ✅ `GET /api/v1/product-blocking-reasons` — Список причин блокировки

**Subtotal**: 4/4 ✅

---

## ✅ B2B Seller Cabinet (Кабинет продавца)

### Product Management
- ✅ `GET /api/v1/products` — Список товаров продавца
- ✅ `POST /api/v1/products` — Создать товар
- ✅ `GET /api/v1/products/{id}` — Получить товар со всеми SKU
- ✅ `PUT /api/v1/products/{id}` — Обновить товар
- ✅ `DELETE /api/v1/products/{id}` — Удалить товар

### SKU Management
- ✅ `POST /api/v1/skus` — Добавить SKU
- ✅ `PUT /api/v1/skus` — Обновить SKU
- ✅ `DELETE /api/v1/skus?id={sku_id}` — Удалить SKU

### Invoice Management
- ✅ `GET /api/v1/invoices` — Список накладных
- ✅ `POST /api/v1/invoices` — Создать накладную
- ✅ `POST /api/v1/invoices/accept` — Принять накладную и обновить остатки

**Subtotal**: 11/11 ✅

---

## Summary

| Service | Implemented | Total | Status |
|---------|-------------|-------|--------|
| B2C Cart | 15 | 15 | ✅ 100% |
| B2C Catalog | 8 | 8 | ✅ 100% |
| B2C Orders | 5 | 5 | ✅ 100% |
| Moderation | 4 | 4 | ✅ 100% |
| B2B Cabinet | 11 | 11 | ✅ 100% |
| **TOTAL** | **43** | **43** | **100%** |

> Note: The Moderation service is an internal service and may not be counted in the public API checklist. If excluding it, the completion rate is 32/32 (100%) for all public-facing services.

---

## Implementation Notes

### ✅ Fully Implemented Services:
1. **Cart Service** - All cart operations, favorites, subscriptions, collections, and banners
2. **Catalog Service** - Product listing with search/filters, SKU management, and category trees
3. **Orders Service** - Order creation, history, status transitions, and cancellation
4. **Moderation Service** - Product approval/decline workflow with blocking reasons

### ⏳ Pending Implementation:
1. **Advanced Marketplace Capabilities**
  - Payment gateway integration and settlement workflows
  - Delivery slots, logistics tracking, and returns
  - Promotion engine, ratings/reviews, and anti-fraud controls

---

## Related Documentation

- OpenAPI Specs:
  - [B2C Cart Service](../b2c/cart/openapi.yaml)
  - [B2C Catalog Service](../b2c/catalog/openapi.yaml)
  - [B2C Orders Service](../b2c/orders/openapi.yaml)
  - [B2B Cabinet](../b2b/openapi.yaml)
  - [Moderation Service](../moderation/openapi.yaml)

- Architecture:
  - [ER Database Diagram](../uml/er-db-diagramm.md)
  - [B2C Cart Management Sequence](../uml/b2c-cart-management-sequence.md)
  - [B2C Catalog Browsing Sequence](../uml/b2c-catalog-browsing-sequence.md)
  - [B2B Product Moderation Sequence](../uml/b2b-product-moderation-sequence.md)
