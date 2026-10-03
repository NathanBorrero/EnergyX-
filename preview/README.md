# Previsualización para revisar

Una página con las cinco vistas del storefront —portada, colección, ficha, carrito y contraseña—
para poder **mirarlas y marcar correcciones** sin entrar al admin de Shopify.

## Qué es y qué no es

**Lo que sí:** usa el **CSS real del theme**, los mismos archivos que Shopify sirve. Si algo se ve
mal aquí, se ve mal en la tienda. Y el marcado es el del theme: hay una comprobación que falla si
aparece una clase que el theme no tiene.

**Lo que no:** no es Shopify. No hay Liquid, ni productos, ni carrito de verdad, ni el JavaScript de
los componentes. Los precios, las fotos y los textos están **pendientes** y se marcan como tales.

Para ver el theme **funcionando de verdad** hay que previsualizarlo en Shopify:
admin → Online Store → Themes → `NATHAN & ESTEBAN — ACTUAL (no publicar)` → **Preview**.

## Cómo se publica

Se sube como artefacto junto a los cuatro archivos de CSS del theme:

```
index.html + ne-core.css + ne-product.css + ne-cart.css + ne-collection.css
```

Los CSS se copian de `theme/assets/` sin tocarlos. Copiarlos a mano y editarlos sería exactamente
la deriva que este proyecto ya ha pagado seis veces.

## Una diferencia honesta con la tienda

La página carga **los cuatro** paquetes de CSS a la vez, porque cambia de vista sin recargar. La
tienda real carga solo el que cada plantilla necesita. Eso hace que esto **no sirva para medir
rendimiento**: para eso están `scripts/measure.mjs` y los bancos de pruebas.
