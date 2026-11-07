from rest_framework import serializers


class LocaleSerializer(serializers.Serializer[object]):
    code = serializers.CharField()
    name = serializers.CharField()
    is_default = serializers.BooleanField()


class MetaSerializer(serializers.Serializer[object]):
    locales = LocaleSerializer(many=True)
