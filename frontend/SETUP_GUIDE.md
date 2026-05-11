# NeoMarket Microservices Frontend - Setup & Testing Guide

## 📋 Overview

You now have **5 individual React frontends** for testing each microservice independently:

1. **Catalog** (port 5173) - Browse products and categories
2. **Cart** (port 5174) - Shopping cart management
3. **Orders** (port 5175) - Order management and tracking
4. **B2B Cabinet** (port 5176) - Seller/admin dashboard
5. **Moderation** (port 5177) - Content moderation queue

Plus the **API Gateway** on port 8888 that routes all requests to microservices.

---

## 🚀 Quick Start

### Option 1: Run with Docker Compose (Recommended)

```bash
# From project root
docker compose up -d

# All services will start (26 services + 5 React frontends)
# Wait 30-60 seconds for all to be healthy

# Then access:
http://localhost:8080        # Main frontend
http://localhost:5173        # Catalog
http://localhost:5174        # Cart
http://localhost:5175        # Orders
http://localhost:5176        # B2B Cabinet
http://localhost:5177        # Moderation
http://localhost:8888        # API Gateway status
```

### Option 2: Run React Apps Locally (Development)

```bash
# Terminal 1 - Catalog
cd frontend/apps/catalog
npm install
npm run dev
# Runs on http://localhost:5173

# Terminal 2 - Cart (in another terminal)
cd frontend/apps/cart
npm install
npm run dev
# Runs on http://localhost:5174

# Do the same for other apps...
```

---

## 🧪 Testing Workflow

### 1. Check System Health

First, verify all services are running:

```bash
# Check all 26 services are healthy
docker compose ps

# Should show:
# - postgres, redis (infrastructure)
# - catalog, cart, orders, b2b, moderation, and all other services (all should be healthy)
# - api_gateway, prometheus, grafana, jaeger, loki (observability)
# - frontend app containers (catalog-app, cart-app, orders-app, b2b-cabinet-app, moderation-app)
```

### 2. Test Catalog Service

1. **Open** http://localhost:5173 (Catalog app)
2. **Enter** User ID (e.g., `user-123`)
3. **Expected behavior:**
   - See list of categories (if products exist)
   - Click a category to view products
   - See product cards with name, price, SKU, status
4. **If 404 errors:**
   - Check nginx logs: `docker compose logs api_gateway | grep -i error`
   - Verify endpoint: `http://localhost:8888/api/v1/catalog/categories`
5. **If empty data:**
   - Check if seed data ran: `docker compose logs catalog`
   - Manually seed: `docker exec neomarket-catalog python manage.py seed_demo_catalog`

### 3. Test Cart Service

1. **Open** http://localhost:5174 (Cart app)
2. **Enter** same User ID
3. **Test flow:**
   - Click "Add" button (enter product ID, e.g., `1`)
   - See item added to cart
   - Adjust quantity with +/- buttons
   - Click "Checkout" to create order
4. **If API errors:**
   - Product ID might not exist (check Catalog first)
   - Check endpoint: `http://localhost:8888/api/v1/cart/items`

### 4. Test Orders Service

1. **Open** http://localhost:5175 (Orders app)
2. **Enter** same User ID
3. **Expected:**
   - See orders created from cart checkout
   - Filter by status (pending, shipped, etc.)
   - Click "📍 Track" button to see tracking info
4. **If no orders:**
   - Complete checkout flow in Cart first
   - Wait 2-5 seconds and refresh Orders page

### 5. Test B2B Cabinet

1. **Open** http://localhost:5176 (B2B Cabinet)
2. **Enter** Seller ID (e.g., `seller-001`)
3. **Dashboard tab:**
   - See total products, sales, orders stats
4. **Products tab:**
   - Create new product (fill name, price, optionally SKU/stock)
   - See created product in list
   - Edit/delete products
5. **Orders tab:**
   - See orders received for seller's products

### 6. Test Moderation Queue

1. **Open** http://localhost:5177 (Moderation)
2. **Enter** Moderator ID (e.g., `mod-001`)
3. **Expected:**
   - See pending items in queue
   - View item details (title, description, category)
   - See any system flags
4. **Taking action:**
   - Click "✅ Approve" to approve
   - Enter rejection reason and click "❌ Reject" to reject
   - Item moves to next in queue
5. **View statistics:**
   - See pending/approved/rejected counts update

---

## 🔍 Identifying Missing Features

### Catalog Service
**Test these endpoints to find missing implementations:**
- [ ] `GET /api/v1/catalog/categories` - List categories
- [ ] `GET /api/v1/catalog/products` - List products (with pagination)
- [ ] `GET /api/v1/catalog/products?category_id={id}` - Filter by category
- [ ] `GET /api/v1/catalog/products?search={term}` - Search products
- [ ] `GET /api/v1/catalog/stats` - Get catalog statistics
- [ ] `POST /api/v1/catalog/products` - Create product (admin only?)
- [ ] `PUT /api/v1/catalog/products/{id}` - Update product
- [ ] `DELETE /api/v1/catalog/products/{id}` - Delete product

### Cart Service
**Missing features to implement:**
- [ ] `GET /api/v1/cart/items` - Get cart items for user
- [ ] `POST /api/v1/cart/items` - Add item to cart
- [ ] `PATCH /api/v1/cart/items/{id}` - Update item quantity
- [ ] `DELETE /api/v1/cart/items/{id}` - Remove item
- [ ] `POST /api/v1/cart/checkout` - Create order from cart
- [ ] `GET /api/v1/cart/summary` - Get cart summary (subtotal, tax, shipping)
- [ ] `DELETE /api/v1/cart/clear` - Clear entire cart
- [ ] `POST /api/v1/cart/apply-coupon` - Apply discount code

### Orders Service
**Missing features:**
- [ ] `GET /api/v1/orders` - List user orders (with pagination)
- [ ] `GET /api/v1/orders/{id}` - Get order details
- [ ] `GET /api/v1/orders/{id}/items` - Get order items
- [ ] `GET /api/v1/orders/{id}/track` - Get tracking info
- [ ] `POST /api/v1/orders/{id}/cancel` - Cancel order
- [ ] `GET /api/v1/orders?status={status}` - Filter by status

### B2B Service
**Missing seller features:**
- [ ] `GET /api/v1/b2b/dashboard` - Seller dashboard stats
- [ ] `GET /api/v1/b2b/products` - List seller's products
- [ ] `POST /api/v1/b2b/products` - Create product
- [ ] `PUT /api/v1/b2b/products/{id}` - Update product
- [ ] `DELETE /api/v1/b2b/products/{id}` - Delete product
- [ ] `GET /api/v1/b2b/orders` - List seller's orders
- [ ] `GET /api/v1/b2b/analytics` - Sales analytics

### Moderation Service
**Missing moderation features:**
- [ ] `GET /api/v1/moderation/queue` - Get items to moderate
- [ ] `GET /api/v1/moderation/queue?status={status}` - Filter by status
- [ ] `POST /api/v1/moderation/queue/{id}/approve` - Approve item
- [ ] `POST /api/v1/moderation/queue/{id}/reject` - Reject item with reason
- [ ] `GET /api/v1/moderation/stats` - Get moderation stats

---

## 📊 Testing Checklist

### System Health
- [ ] All 26 services start without errors
- [ ] All services report "Up" status in `docker compose ps`
- [ ] PostgreSQL migrations run successfully
- [ ] Redis is accessible
- [ ] API Gateway (nginx) starts without errors

### Frontend Apps
- [ ] Catalog app loads (http://localhost:5173)
- [ ] Cart app loads (http://localhost:5174)
- [ ] Orders app loads (http://localhost:5175)
- [ ] B2B Cabinet loads (http://localhost:5176)
- [ ] Moderation app loads (http://localhost:5177)

### API Connectivity
- [ ] Catalog can fetch categories from `/api/v1/catalog/categories`
- [ ] Catalog can fetch products
- [ ] Cart can fetch items, add items, update quantities
- [ ] Orders can fetch orders list
- [ ] B2B can fetch dashboard stats and products
- [ ] Moderation can fetch queue items

### Data Flow
- [ ] Can create product in Catalog (B2B)
- [ ] Can add product to cart
- [ ] Can proceed to checkout
- [ ] Can view created order in Orders service
- [ ] Can moderate submissions in Moderation queue

### Error Handling
- [ ] Invalid product IDs show proper error messages
- [ ] Missing required fields show validation errors
- [ ] Unauthorized requests are rejected appropriately
- [ ] Network errors are handled gracefully

---

## 🐛 Debugging Tips

### Check API Gateway Logs
```bash
docker compose logs api_gateway | tail -100
# Look for 404, 500, or routing errors
```

### Check Individual Service Logs
```bash
docker compose logs catalog
docker compose logs cart
docker compose logs orders
docker compose logs b2b
docker compose logs moderation
```

### Test Endpoints Directly
```bash
# Test Catalog endpoint
curl -X GET http://localhost:8888/api/v1/catalog/categories \
  -H "X-User-ID: user-123"

# Test Cart endpoint
curl -X GET http://localhost:8888/api/v1/cart/items \
  -H "X-User-ID: user-123"

# Add to cart
curl -X POST http://localhost:8888/api/v1/cart/items \
  -H "X-User-ID: user-123" \
  -H "Content-Type: application/json" \
  -d '{"product_id": "1", "quantity": 1}'
```

### Check Database
```bash
# Connect to PostgreSQL
docker exec -it neomarket-postgres psql -U neomarket -d neomarket

# List tables in each database
\c catalog_db
\dt

\c cart_db
\dt

# Query sample data
SELECT * FROM catalog_api_product LIMIT 5;
```

### Verify Redis
```bash
docker exec -it neomarket-redis redis-cli ping
# Should return: PONG
```

---

## 🛠️ What To Do Next

### 1. **Identify Missing Implementations**
   - Test each app using the checklist above
   - Note which endpoints return 404 or errors
   - Document what features are missing

### 2. **Implement Missing Endpoints**
   - Add missing API endpoints in each microservice
   - Update Django serializers if needed
   - Test with curl or Postman

### 3. **Add Validations**
   - Add input validation to all endpoints
   - Return proper error responses with messages
   - Add required field checks

### 4. **Implement Authentication**
   - Add JWT token support
   - Validate X-User-ID headers
   - Add role-based access control (RBAC)

### 5. **Add Database Seeding**
   - Populate test data automatically
   - Create sample products, orders, categories
   - Add test users and sellers

### 6. **Improve Error Handling**
   - Add proper HTTP status codes
   - Return descriptive error messages
   - Add logging for debugging

### 7. **Performance Optimization**
   - Add database indexes
   - Implement caching where appropriate
   - Add pagination to list endpoints

### 8. **Testing & QA**
   - Write unit tests for services
   - Write integration tests for APIs
   - Perform load testing

---

## 📚 File Structure

```
frontend/
├── index.html                               # Main launcher/dashboard
├── package.json                             # Monorepo config
├── README.md                                # Frontend documentation
├── SETUP_GUIDE.md                          # This file
├── shared/
│   └── apiClient.js                        # Shared API utilities
├── public/
│   └── [original SPA files]
├── apps/
│   ├── catalog/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── vite.config.js
│   │   └── src/
│   │       ├── App.jsx
│   │       ├── main.jsx
│   │       └── index.css
│   ├── cart/
│   ├── orders/
│   ├── b2b-cabinet/
│   └── moderation/
```

---

## 🔗 Quick Links

| Service | URL | Port | API Base |
|---------|-----|------|----------|
| Catalog | http://localhost:5173 | 5173 | `/api/v1/catalog` |
| Cart | http://localhost:5174 | 5174 | `/api/v1/cart` |
| Orders | http://localhost:5175 | 5175 | `/api/v1/orders` |
| B2B Cabinet | http://localhost:5176 | 5176 | `/api/v1/b2b` |
| Moderation | http://localhost:5177 | 5177 | `/api/v1/moderation` |
| API Gateway | http://localhost:8888 | 8888 | `/api/v1` |
| Main Frontend | http://localhost:8080 | 8080 | N/A |
| Postgres | localhost:5432 | 5432 | psql |
| Redis | localhost:6379 | 6379 | redis-cli |
| Grafana | http://localhost:3000 | 3000 | admin/admin |
| Prometheus | http://localhost:9090 | 9090 | N/A |
| Jaeger | http://localhost:16686 | 16686 | N/A |

---

**Last Updated**: April 13, 2026
**Status**: All 5 React frontends ready for testing
