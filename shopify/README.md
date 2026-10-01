# Configuración de Shopify para Nathan & Esteban

Operaciones **validadas contra el esquema y probadas por ejecución** en el entorno de pruebas
(Magisik), listas para ejecutarse en la tienda de N&E **cuando exista**.

Evidencia de cada verificación: [`../docs/VERIFICATION-LOG.md`](../docs/VERIFICATION-LOG.md).

## Estado

| | |
| --- | --- |
| Tienda de N&E | **No existe todavía.** Nada de esto se ha ejecutado contra ella |
| Plan objetivo | Advanced |
| Entorno de pruebas | Magisik (Basic, COP, Colombia) — solo para validar mecanismos |

## Qué hay aquí

| Archivo | Contenido |
| --- | --- |
| [`footwear-data-model.graphql`](footwear-data-model.graphql) | Definiciones de metaobject y metafield del modelo de footwear, más las consultas de verificación |

## Orden de ejecución, cuando exista la tienda

1. Crear la tienda de N&E y fijar el plan.
2. Verificar límites reales con la consulta `ShopCapabilities` del archivo. **No asumir** que son
   los mismos que en el entorno de pruebas.
3. Crear la definición `size_chart`.
4. Crear la definición `fit_profile`.
5. Crear los metafields de producto que referencian ambas.
6. Cargar entradas de guía de tallas **con datos reales** del fabricante.
7. Crear los productos con opciones `Color` y `Talla`.
8. Vincular los valores de color a entradas de `shopify--color-pattern` para los swatches.
9. Ejecutar las consultas de verificación del final del archivo.

## Reglas que esta configuración respeta

- **Ningún dato inventado.** Tallas, medidas, materiales, precios y notas de horma son
  `PLACEHOLDER` explícito hasta que el propietario los aporte (§191).
- **Máximo 3 opciones por producto**, verificado: `Color` + `Talla` deja una libre. Gastarla es una
  decisión consciente (§3 del log de verificación).
- **`inventoryPolicy: DENY`** por defecto, que es el comportamiento que protege contra oversell
  (§210).
- **El selector de variantes calcula las combinaciones válidas desde las variantes reales**, nunca
  desde `hasVariants` (§4 del log de verificación).

## Lo que esto NO es

No es un sistema de gestión de inventario, ni un ERP, ni una capa sobre Shopify. Son definiciones de
datos nativas de Shopify, ejecutadas una vez. La lógica vive en Shopify; nosotros construimos la
experiencia.
