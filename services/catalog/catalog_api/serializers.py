from rest_framework import serializers

from .models import Category, Product, Sku, ProductImage, ProductAttribute


def _serialize_image(image) -> dict | None:
    if not image:
        return None
    return {
        "url": image.image_url,
        "order": image.order,
    }


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug"]


class CategoryTreeItemSerializer(serializers.ModelSerializer):
    parent_id = serializers.SerializerMethodField()
    children = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ["id", "name", "parent_id", "children"]

    def get_parent_id(self, obj):
        return obj.parent_id

    def get_children(self, obj) -> list[dict]:
        children = obj.children.order_by("name")
        return CategoryTreeItemSerializer(children, many=True).data


class CategoryParentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug"]


class CategoryDetailSerializer(serializers.ModelSerializer):
    parent = CategoryParentSerializer(read_only=True)
    product_count = serializers.SerializerMethodField()
    seo = serializers.SerializerMethodField()
    meta_tags = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "parent",
            "product_count",
            "seo",
            "meta_tags",
            "image_url",
            "is_active",
            "created_at",
            "updated_at",
        ]

    def get_product_count(self, obj) -> int | None:
        include_count = self.context.get("include_product_count", False)
        if not include_count:
            return None
        return obj.products.filter(status=Product.Status.MODERATED).count()

    def get_seo(self, obj) -> dict:
        return {
            "title": obj.name,
            "description": obj.description or "",
            "keywords": [],
        }

    def get_meta_tags(self, _obj) -> dict:
        return {}


class SkuShortSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()

    class Meta:
        model = Sku
        fields = ["id", "name", "price", "image"]

    def get_image(self, obj) -> dict | None:
        main_image = obj.product.images.filter(is_main=True).first()
        if main_image:
            return _serialize_image(main_image)
        return _serialize_image(obj.product.images.first())


class SkuDetailSerializer(serializers.ModelSerializer):
    characteristics = serializers.SerializerMethodField()
    images = serializers.SerializerMethodField()

    class Meta:
        model = Sku
        fields = ["id", "name", "price", "active_quantity", "characteristics", "images"]

    def get_characteristics(self, obj) -> list[dict]:
        return [
            {"name": str(name).upper(), "value": str(value)}
            for name, value in (obj.attributes or {}).items()
        ]

    def get_images(self, obj) -> list[dict]:
        return [_serialize_image(image) for image in obj.product.images.all()]


class ProductImageSerializer(serializers.ModelSerializer):
    url = serializers.CharField(source="image_url", read_only=True)

    class Meta:
        model = ProductImage
        fields = ["url", "order"]


class ProductAttributeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductAttribute
        fields = ["id", "name", "value"]


class ProductShortSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()
    price = serializers.SerializerMethodField()
    in_stock = serializers.SerializerMethodField()
    is_in_cart = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = ["id", "title", "image", "price", "in_stock", "is_in_cart"]

    def get_image(self, obj) -> str | None:
        main_image = obj.images.filter(is_main=True).first()
        if main_image:
            return main_image.image_url
        first_image = obj.images.first()
        return first_image.image_url if first_image else None

    def get_price(self, obj) -> int:
        sku = obj.skus.order_by("price").first()
        return sku.price if sku else 0

    def get_in_stock(self, obj) -> bool:
        return obj.skus.filter(active_quantity__gt=0).exists()

    def get_is_in_cart(self, _obj) -> bool:
        return False


class ProductShortListResponseSerializer(serializers.Serializer):
    total_count = serializers.IntegerField()
    limit = serializers.IntegerField()
    offset = serializers.IntegerField()
    items = ProductShortSerializer(many=True)


class ProductDetailSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    characteristics = serializers.SerializerMethodField()
    images = ProductImageSerializer(many=True, read_only=True)
    skus = SkuDetailSerializer(many=True, read_only=True)

    class Meta:
        model = Product
        fields = [
            "id",
            "title",
            "description",
            "status",
            "category",
            "images",
            "characteristics",
            "skus",
        ]

    def get_characteristics(self, obj) -> list[dict]:
        attributes = obj.attributes.all()
        return ProductAttributeSerializer(attributes, many=True).data


class FilterItemSerializer(serializers.Serializer):
    slug = serializers.CharField()
    name = serializers.CharField()
    type = serializers.ChoiceField(choices=["list", "range", "switch"])
    value = serializers.ListField(required=False)
    min = serializers.IntegerField(required=False)
    max = serializers.IntegerField(required=False)
