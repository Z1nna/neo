# NeoMarket Frontend

Single unified storefront UI for NeoMarket.

## Runtime

- Frontend URL: http://localhost:8080
- API gateway URL: http://localhost:8888/api/v1

## What is included in one UI

- Home page widgets and collections
- Catalog browsing with filters
- Cart and checkout flow
- Favorites
- Moderation panel (with moderator headers or JWT)

## Start

```bash
docker compose up -d --build frontend api_gateway
```

If you want full platform startup:

```bash
docker compose up -d --build
```

## Notes

- UI static files are in `frontend/public`.
- Nginx config for frontend is in `frontend/nginx.conf`.
- Current frontend API proxy uses service routes under `/api/{service}/api/v1/...`.
