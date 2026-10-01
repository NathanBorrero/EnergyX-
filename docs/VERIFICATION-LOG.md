# Registro de verificación por ejecución — Shopify

**Fecha:** 2026-10-01
**Entorno de prueba:** tienda **Magisik** (`magisik.store`), autorizada por el propietario como
entorno de investigación y pruebas.
**Proyecto final:** Nathan & Esteban — **tienda aún inexistente**. Nada de lo de abajo es catálogo,
precio o dato de N&E.

Todo en este documento es `VERIFICADO` **por ejecución real**, no por documentación. Donde la
ejecución contradijo lo que yo había afirmado antes, la corrección está marcada.

---

## 1. Capacidades y límites de la tienda — leídos en vivo

Consulta read-only sobre `shop`:

| Campo | Valor | Relevancia para N&E |
| --- | --- | --- |
| `plan.publicDisplayName` | `Basic` | Entorno de pruebas. N&E apunta a Advanced |
| `plan.shopifyPlus` | `false` | Confirma ausencia de capacidades Plus |
| `plan.partnerDevelopment` | `false` | No es development store |
| **`resourceLimits.maxProductOptions`** | **`3`** | **Límite duro. Ver §3** |
| **`resourceLimits.maxProductVariants`** | **`2048`** | Holgado para footwear |
| `resourceLimits.locationLimit` | `10` | Ubicaciones de inventario |
| **`checkoutApiSupported`** | **`false`** | Confirma en vivo que la Checkout API no es una vía. **Cart API es el único camino** |
| **`paymentSettings.supportedDigitalWallets`** | **`[]` (vacío)** | **Sin Shop Pay, Apple Pay ni Google Pay.** Ver §2 |
| `currencyCode` | `COP` | — |
| `enabledPresentmentCurrencies` | `["COP"]` | Moneda única |
| `shipsToCountries` | 29 países (CO, US, GB, DE, ES, FR, JP, KR, AU, CA…) | Envío internacional ya configurado es posible sin Plus |
| `features.unifiedMarkets` | `true` | Elegible para Unified Markets |
| `features.captcha` | `false` | CAPTCHA disponible pero no activado |
| `customerAccounts` | `OPTIONAL` | — |
| `unitSystem` / `weightUnit` | `METRIC_SYSTEM` / `KILOGRAMS` | Guía de tallas en **cm**, coherente |
| `taxesIncluded` | `false` | — |
| `markets` | 1 mercado: `Colombia`, handle `co`, `ACTIVE` | Mercado único pese a enviar a 29 países |
| `shopPolicies` | 5 políticas existentes (contacto, privacidad, reembolso, envío, términos) | Mecanismo nativo confirmado. N&E necesitará las suyas, **reales** |

## 2. Hallazgo de conversión: sin billeteras digitales

`paymentSettings.supportedDigitalWallets` devuelve **lista vacía** en una tienda Basic de Colombia.

`INFERIDO` del cruce con que Shopify Payments no opera en Colombia (`DOCUMENTADO`): **no hay checkout
acelerado** — ni Shop Pay, ni Apple Pay, ni Google Pay.

**Consecuencia para N&E:** la palanca de conversión en la que se apoyan las marcas internacionales
(un tap y listo) **no está disponible**. Eso desplaza todo el peso de la conversión al storefront:
claridad, confianza, selección de talla y validación pre-checkout. Refuerza la prioridad de §11 de
`STRATEGY.md`.

→ Queda por verificar si cambia en Advanced o con una pasarela colombiana concreta. `PENDIENTE`.

## 3. El límite de 3 opciones por producto — y por qué importa en footwear

`resourceLimits.maxProductOptions` = **3**, y se aplica de verdad.

**Prueba negativa ejecutada:** intenté añadir dos opciones (`Ancho`, `Material`) a un producto que
ya tenía `Color` y `Talla`, lo que daría 4.

```
userErrors: [{ field: ["options"],
               message: "Solo se puede especificar un máximo de 3 opciones",
               code: "OPTIONS_OVER_LIMIT" }]
```

El producto quedó intacto con sus 2 opciones. **`VERIFICADO`: el límite es duro y se rechaza en la
API.**

### Consecuencia de diseño para N&E

Color + Talla consume 2 de 3. Queda **una sola** opción libre. Hay que elegirla a conciencia:

| Tercera opción candidata | Coste de oportunidad |
| --- | --- |
| **Ancho / horma** (D, 2E) | Es la que más reduce RTO en calzado, pero gasta el último hueco |
| Material / acabado | Suele resolverse mejor como productos distintos o metafield |
| Altura de caña | Normalmente es otro modelo, no una opción |

Si N&E necesitara Color + Talla + Ancho + Material, **es imposible en un solo producto**. Y las
*combined listings*, que serían la salida limpia, son **solo Plus**.

→ `DECISIÓN DEL PROYECTO`, y es **irreversible** una vez cargado el catálogo.

## 4. La trampa de `hasVariants` — el hallazgo más importante para la página de producto

Creé un producto de prueba con una **matriz deliberadamente incompleta**, que es el caso real del
calzado:

| Color | Tallas que existen |
| --- | --- |
| Placeholder A | 39, 40, 41, 42 |
| Placeholder B | 39, 40, 41, 42 |
| **Placeholder C** | **solo 39 y 42** |

Resultado de consultar `options { optionValues { name hasVariants } }`:

```
Talla 39 → hasVariants: true
Talla 40 → hasVariants: true   ← pero NO existe en Placeholder C
Talla 41 → hasVariants: true   ← pero NO existe en Placeholder C
Talla 42 → hasVariants: true
```

**`hasVariants` indica si ese valor de opción lo usa alguna variante del producto — NO si una
combinación concreta Color × Talla existe.**

### Por qué esto es crítico

Un selector de variantes que use `hasVariants` para decidir qué tallas ofrecer **mostrará la talla
40 como disponible para Placeholder C**, y esa combinación no existe. El comprador la selecciona y
la página se rompe, o peor: parece comprable y no lo es.

**Requisito de implementación `VERIFICADO`:** el conjunto de combinaciones válidas se calcula desde
la lista real de variantes y sus `selectedOptions`, nunca desde `optionValues`. Y se combina con la
guía oficial de no sobre-consultar variantes ni anidar loops de Liquid.

Esto no está en la documentación. Solo aparece al ejecutarlo.

## 5. Semántica de disponibilidad

Con inventario rastreado (`tracked: true`) y cantidad 0:

| Campo | Valor |
| --- | --- |
| `inventoryPolicy` | `DENY` ← **es el valor por defecto** |
| `inventoryQuantity` | `0` |
| **`availableForSale`** | **`false`** |

`VERIFICADO`: rastreado + 0 + `DENY` ⇒ no vendible. El valor por defecto protege contra oversell,
que es el comportamiento correcto para un footwear premium. Cambiarlo a `CONTINUE` es una decisión
consciente con consecuencia directa en RTO (§8.4 de `ARCHITECTURE.md`).

## 6. Swatches de color nativos — `shopify--color-pattern`

Magisik ya tiene la definición estándar. Estructura leída en vivo:

| Campo | Tipo | Requerido |
| --- | --- | --- |
| `label` | `single_line_text_field` | **sí** |
| `color` | `color` | no |
| **`image`** | `file_reference` | no |
| `color_taxonomy_reference` | `list.product_taxonomy_value_reference` | **sí** |
| `pattern_taxonomy_reference` | `product_taxonomy_value_reference` | **sí** |

Acceso: `storefront: PUBLIC_READ`, `admin: PUBLIC_READ_WRITE`.

**Por qué importa para footwear:** el campo `image` permite que el swatch sea una **foto real del
material** —cuero, suede, textil— en lugar de un cuadrado de color plano. Para calzado premium esa
diferencia es sustancial, y es nativa.

Verificación adicional: `variant.swatch` devolvió `null` en el producto de prueba. **Los swatches no
son automáticos**: hay que vincular los valores de opción a entradas de este metaobject. Es trabajo
opt-in, no gratis.

## 7. Guía de tallas por metaobject — mecanismo validado

Creé, verifiqué y eliminé una definición `ne_size_chart_probe` con `access: { storefront:
PUBLIC_READ }` y los campos `label`, `eu`, `us_men`, `uk`, `foot_length_cm`, `fit_note`.

`metaobjectDefinitionCreate` devolvió la definición completa y `userErrors: []`.

**`VERIFICADO`: la guía de tallas de N&E no requiere construir ningún sistema.** Definición de
metaobject + entradas + referencia desde el producto. La receta exacta está en
[`../shopify/footwear-data-model.graphql`](../shopify/footwear-data-model.graphql).

## 8. CORRECCIÓN — la conexión sí puede escribir archivos de theme

**Lo que afirmé antes era incorrecto.** Había dicho que la conexión no tenía ninguna herramienta de
theme ni de despliegue. Ejecutando lo descubrí mal.

| Operación | Resultado real |
| --- | --- |
| `themes` (consulta) | ✅ Funciona. Magisik tiene 2 themes: uno `MAIN`, uno `UNPUBLISHED` |
| `theme { files }` (lectura) | ✅ Funciona. Leí el listado de archivos del theme no publicado |
| **`themeFilesUpsert`** | ✅ **Funciona en themes no publicados.** Escribí `snippets/ne-write-probe-delete-me.liquid` y devolvió `userErrors: []` |
| `themeFilesUpsert` en el theme `MAIN` | ❌ Bloqueado por política de seguridad |
| **`themeFilesDelete`** | ❌ **Bloqueado** por política de seguridad: *"Theme deletion is blocked — it could take down the live storefront. Use Shopify admin."* |
| `scriptTags` (consulta) | ❌ Denegado: la conexión no tiene el scope `read_script_tags` |

### La asimetría importa, y cambia la estrategia de despliegue

**Puedo crear y sobrescribir archivos de theme, pero no puedo borrarlos.** Construir un theme
archivo a archivo por API, sin poder deshacer, es un flujo frágil: cualquier archivo mal nombrado
queda ahí para siempre.

→ **Refuerza decididamente la integración de GitHub de Shopify** como vía de despliegue: git es la
fuente de verdad, controla altas y bajas, y la sincronización se encarga del resto. La escritura
por API queda como herramienta puntual, no como método de construcción.

### Residuo que no pude limpiar

El archivo `snippets/ne-write-probe-delete-me.liquid` **sigue en el theme no publicado
`4-tema-unlocked-ecom1-trade`** de Magisik, porque `themeFilesDelete` está bloqueado.

- Contenido: un único comentario Liquid. **No ejecuta nada.**
- Está en un theme **no publicado**, así que **no afecta a la tienda en vivo**.
- Para eliminarlo: Shopify admin → Online Store → Themes → `4-tema-unlocked-ecom1-trade` → Editar
  código → borrar ese snippet.

Lo reporto porque §188 y §236 lo exigen: dejé algo que no pude revertir.

## 9. Limpieza — verificada

Estado de Magisik tras las pruebas, comprobado con una consulta posterior:

| Comprobación | Antes | Después |
| --- | --- | --- |
| `productsCount` | 4 | **4** ✅ |
| Definiciones de metaobject | 2 (`shopify--color-pattern`, `shopify--knowledge-base-fact`) | **las mismas 2** ✅ |
| Productos con vendor `PRUEBA TECNICA` | — | **ninguno** ✅ |
| Archivo de prueba en theme no publicado | — | ⚠️ **1, no borrable** (ver §8) |

No se modificó ningún producto, precio, inventario ni configuración de Magisik. El producto de
prueba se creó en `DRAFT`, con precio `0.00` y descripción que lo marcaba como prueba, y se eliminó.
