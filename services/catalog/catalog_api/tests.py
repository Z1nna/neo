import uuid

from django.test import TestCase
from rest_framework.test import APIClient

from catalog_api.management.commands.consume_domain_events import Command
from catalog_api.models import Category, Product, ProductAttribute, ProductImage, Sku


class CatalogEventProjectionTests(TestCase):
    def setUp(self):
        self.command = Command()
        self.category = Category.objects.create(
            id=uuid.uuid4(),
            name="Electronics",
            slug="electronics",
        )

    def test_b2b_product_blocked_event_hides_product_from_catalog_projection(self):
        product = Product.objects.create(
            id=uuid.uuid4(),
            title="Catalog Product",
            description="demo",
            status=Product.Status.MODERATED,
            category=self.category,
        )

        self.command._handle_event(
            "b2b",
            "PRODUCT_BLOCKED",
            {
                "product_id": str(product.id),
                "event_type": "PRODUCT_BLOCKED",
                "hard_block": False,
            },
        )

        product.refresh_from_db()
        self.assertEqual(product.status, Product.Status.BLOCKED)

    def test_b2b_hard_blocked_snapshot_maps_to_catalog_blocked_status(self):
        product_id = uuid.uuid4()

        self.command._handle_event(
            "b2b",
            "PRODUCT_UPDATED",
            {
                "snapshot_after": {
                    "id": str(product_id),
                    "title": "Hard blocked product",
                    "description": "demo",
                    "status": "HARD_BLOCKED",
                    "deleted": False,
                    "category": {
                        "id": str(self.category.id),
                        "name": self.category.name,
                    },
                }
            },
        )

        product = Product.objects.get(id=product_id)
        self.assertEqual(product.status, Product.Status.BLOCKED)

    def test_b2b_snapshot_projects_skus_images_and_attributes(self):
        product_id = uuid.uuid4()
        sku_id = uuid.uuid4()

        self.command._handle_event(
            "b2b",
            "PRODUCT_UPDATED",
            {
                "snapshot_after": {
                    "id": str(product_id),
                    "title": "Projected product",
                    "description": "demo",
                    "status": "MODERATED",
                    "deleted": False,
                    "category": {
                        "id": str(self.category.id),
                        "name": self.category.name,
                    },
                    "images": [{"url": "https://cdn.example.com/product.jpg", "ordering": 0}],
                    "characteristics": [{"name": "brand", "value": "Neo"}],
                    "skus": [
                        {
                            "id": str(sku_id),
                            "name": "Projected SKU",
                            "price": 199900,
                            "active_quantity": 4,
                            "images": [{"url": "https://cdn.example.com/sku.jpg", "ordering": 0}],
                            "characteristics": [{"name": "color", "value": "black"}],
                        }
                    ],
                }
            },
        )

        product = Product.objects.get(id=product_id)
        sku = Sku.objects.get(id=sku_id)
        image = ProductImage.objects.get(product=product)
        attribute = ProductAttribute.objects.get(product=product, name="brand")

        self.assertEqual(product.status, Product.Status.MODERATED)
        self.assertEqual(sku.product_id, product.id)
        self.assertEqual(sku.attributes["color"], "black")
        self.assertEqual(image.image_url, "https://cdn.example.com/product.jpg")
        self.assertEqual(attribute.value, "Neo")


class CatalogApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.root = Category.objects.create(name="Электроника", slug="electronics")
        self.category = Category.objects.create(name="Смартфоны", slug="smartphones", parent=self.root)
        self.product = Product.objects.create(
            title="Neo Phone X",
            description="Флагманский смартфон для тестов каталога",
            status=Product.Status.MODERATED,
            category=self.category,
        )
        ProductImage.objects.create(product=self.product, image_url="https://cdn.example.com/phone.jpg", is_main=True, order=0)
        ProductAttribute.objects.create(product=self.product, name="brand", value="Neo")
        ProductAttribute.objects.create(product=self.product, name="memory", value="256")
        Sku.objects.create(
            product=self.product,
            name="Black 256GB",
            price=12999000,
            active_quantity=7,
            attributes={"color": "black", "memory": "256"},
        )

    def test_products_search_rejects_short_query(self):
        response = self.client.get("/api/v1/products", {"search": "ab"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "INVALID_REQUEST")

    def test_product_detail_contains_slug_and_sku_shape(self):
        response = self.client.get(f"/api/v1/products/{self.product.id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["slug"], "neo-phone-x")
        self.assertEqual(response.data["images"][0]["ordering"], 0)
        self.assertEqual(response.data["skus"][0]["discount"], 0)
        self.assertEqual(response.data["skus"][0]["image"], "https://cdn.example.com/phone.jpg")

    def test_category_filters_and_facets_include_dynamic_values(self):
        filters_response = self.client.get(f"/api/v1/categories/{self.category.id}/filters")
        self.assertEqual(filters_response.status_code, 200)
        filter_slugs = {item["slug"] for item in filters_response.data["items"]}
        self.assertIn("brand", filter_slugs)
        self.assertIn("price", filter_slugs)

        facets_response = self.client.get("/api/v1/catalog/facets", {"category_id": str(self.category.id)})
        self.assertEqual(facets_response.status_code, 200)
        facet_names = {item["name"] for item in facets_response.data["facets"]}
        self.assertIn("brand", facet_names)

    def test_breadcrumbs_for_category_and_product(self):
        category_response = self.client.get("/api/v1/breadcrumbs", {"category_id": str(self.category.id)})
        self.assertEqual(category_response.status_code, 200)
        self.assertEqual(category_response.data["meta"]["resolved_via"], "category_id")
        self.assertEqual(category_response.data["data"][-1]["is_current"], True)

        product_response = self.client.get("/api/v1/breadcrumbs", {"product_id": str(self.product.id)})
        self.assertEqual(product_response.status_code, 200)
        self.assertEqual(product_response.data["meta"]["resolved_via"], "product_id")
        self.assertEqual(product_response.data["data"][-1]["name"], self.product.title)

    def test_products_ids_mode_returns_full_product_payload(self):
        response = self.client.get("/api/v1/products", {"ids": str(self.product.id)})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total_count"], 1)
        self.assertEqual(response.data["items"][0]["id"], str(self.product.id))
        self.assertIn("skus", response.data["items"][0])

    def test_products_sku_ids_mode_returns_product_containing_sku(self):
        sku = self.product.skus.first()
        response = self.client.get("/api/v1/products", {"sku_ids": str(sku.id)})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total_count"], 1)
        self.assertEqual(response.data["items"][0]["skus"][0]["id"], str(sku.id))
