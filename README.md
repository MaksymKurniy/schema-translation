# Schema translator
Updates the open .liquid file in `sections` by adding the `t:` translations to the `{% schema %}` tag, the lines with the translation will be added to `locales/en.default.schema.json`. To use global names in the `en.default.schema` file there must be corresponding lines in `sections.all`

## Usage
Open a .liquid file and run the `> Translate Schema` command. The extension will attempt to convert the open file.

---

## Disclaimer

It works only if there is a schema tag in the file. It is also advised to format your tag properly prior conversion.

**❌ WRONGLY FORMATTED**
```liquid
{%schema %}
{
	...
}
{% endschema%}

{%schema%}{
	...
}
{%endschema%}
```

**✅ CORRECT FORMATTING**
```liquid
{% schema %}
{
	...
}
{% endschema %}
```

### Плюси:
+ Підтримка декількох liquid одночасно
+ Форматування schema та json
+ Підтримка All перекладів
+ Не чіпає вже перекладені рядки
+ Не потрібно додавати в кожний проект
+ Простий інтерфейс
+ Швидка робота
### Мінуси:
- Можливі баги
- Можлива не підтримка нестандартного написання schema
