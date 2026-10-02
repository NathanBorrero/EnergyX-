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

---

## 10. FASE 2 — El theme, verificado en navegador

Esta sección registra lo que se comprobó **ejecutando**, no leyendo. Todo lo de aquí se puede
reproducir con `node scripts/check.mjs` cuando las dos herramientas opcionales están presentes.

### 10.1 Theme Check de Shopify — VERIFICADO

El linter oficial (`shopify theme check`) se ejecutó sobre `theme/`:

```
44 files inspected with no offenses found.
```

Antes de llegar ahí reportó **12 infracciones en 8 archivos**, y una era grave:

| Comprobación | Archivo | Qué significaba |
| --- | --- | --- |
| `LiquidSyntaxError` | `snippets/ne-buy-buttons.liquid` | **La etiqueta `form` no compilaba.** Le había pasado un filtro en un argumento (`id: 'x' | append: section.id`), que no es sintaxis válida. **La ficha de producto se habría quedado sin forma de comprar.** |
| `ValidSchemaTranslations` ×3 | `sections/custom-liquid.liquid` | Claves de esquema sin entrada en el locale: la sección aparecería sin nombre en el editor. |
| `TranslationKeyExists` ×5 | varios | Textos que habrían salido como la clave cruda en pantalla. |
| `UnusedAssign` | `sections/editorial-hero.liquid` | Variable muerta. |
| `ValidScopedCSSClass` ×2 | colección y búsqueda | `.ne-product-grid` definida en el `{% stylesheet %}` de **otra** sección: en una página sin esa sección, la rejilla se quedaba **sin columnas**. Movida a `assets/ne-base.css`. |

### 10.2 Seis defectos que solo un navegador real podía encontrar

`scripts/check-components.mjs` carga el banco de pruebas en Chromium y ejercita los componentes
contra los módulos reales. Encontró seis defectos. **Ninguno se ve leyendo el código y ninguno
rompe la página de forma visible**, que es exactamente por qué hacía falta la prueba.

#### A. `this.slot` pisa una propiedad del DOM — la galería 3D no montaba nunca

`slot` es una propiedad de **todo** elemento (el nombre de ranura de shadow DOM, y es una cadena).
`this.slot = <div>` escribe el atributo con el objeto convertido a texto, así que la lectura
siguiente murió con `this.slot.querySelector is not a function`.

El `try/catch` del componente hizo su trabajo: la ficha siguió funcionando con la fotografía, el
error quedó en `window.__ne_errors` y **nada en la pantalla lo delataba**.

Corregido renombrando a `this.modelSlot`, y con él `open`, `select`, `input`, `output`, `button` y
`error`, que llevan nombre de propiedad del DOM en algún elemento. Añadida una comprobación que
enumera la cadena de prototipos **en el navegador** y falla ante cualquier colisión: una lista
escrita a mano se habría quedado corta justo en la propiedad que nadie recuerda.

#### B. `data-ne-3d-mode` no se lee como `dataset.ne3dMode` — el ajuste de 3D se ignoraba

Verificado en Chromium:

```js
// <div data-ne-3d-mode="eager" data-ne-model-mode="eager">
el.dataset.ne3dMode     // undefined
el.dataset['ne-3dMode'] // "eager"
el.dataset.neModelMode  // "eager"
```

El guion solo se colapsa cuando le sigue una **letra minúscula**. Con un dígito detrás, el guion
permanece en la clave, y el acceso con punto devuelve `undefined`.

Consecuencia: **el ajuste `product_3d_mode` del theme se ignoraba por completo**, incluido `off`.
Poner el 3D en «apagado» no lo apagaba.

Corregido renombrando el atributo a `data-ne-model-mode`. `check-theme.mjs` ahora **prohíbe la
forma entera**: cualquier `data-ne-*` con un dígito tras un guion falla la comprobación.

#### C. `<input type="number">` destruye la coma decimal — el recomendador diría «fuera de rango»

Verificado en Chromium, tecleando carácter a carácter:

| Entrada tecleada | `type="number"` | `type="text"` + `inputmode="decimal"` |
| --- | --- | --- |
| `25,9` | `"259"`, y `validity.valid === true` | `"25,9"` |

No queda vacío: **queda mal, y pasa la validación**. En español la coma decimal es lo que la gente
escribe, así que un comprador que mide bien su pie habría recibido «tu medida queda fuera del rango
de este modelo». La pieza que existe para evitar devoluciones habría hecho lo contrario.

Corregido a `type="text"` con `inputmode="decimal"`, que sigue abriendo el teclado numérico en
móvil. La validación la hace `parseMeasurement`, que ya normaliza la coma.

#### D. La guía de tallas nunca se enteraba del stock — respondía siempre «agotada»

Los elementos personalizados montan en orden de DOM. El selector monta primero y **anuncia su
estado antes de que la guía de tallas esté escuchando**, así que la guía se quedaba con la lista de
tallas comprables vacía.

Con una lista vacía, `reconcileWithStock` concluye que nada se puede comprar. Resultado: el
recomendador respondía **siempre** «tu talla está agotada en este color», con stock de todo.

Corregido con una petición explícita (`ne:request-state`): quien necesita el estado lo pide y el
selector contesta. Así da igual el orden de montaje, y también funciona cuando el editor del theme
reinyecta una sección sola.

#### E. Deshabilitar los valores inexistentes dejaba colores INALCANZABLES

Con la matriz de prueba —Cuero no se fabrica en 40, y la 40 solo existe en Negro— partiendo de
Negro/40, preguntar «¿existe Cuero?» con la talla 40 fija devuelve `nonexistent`. Es verdad. Pero el
selector lo deshabilitaba, y entonces **nunca se podía llegar a Cuero**: para cambiar de color había
que cambiar antes de talla, y la talla puesta no existe en Cuero.

Corregido por semántica, no por cálculo: **todo valor que la matriz lista existe en alguna variante,
así que todo valor es alcanzable**. Elegirlo es precisamente lo que dispara la reconciliación. No se
deshabilita nada; «inexistente» ahora significa «no se fabrica con tu selección actual, y al
elegirlo ajustaremos el resto», que es accionable.

Los tres estados siguen distinguiéndose visualmente, y la prueba lo verifica contra el **CSS real**.

#### F. `form.id` no devuelve el id cuando el formulario tiene un control llamado `id`

Verificado en Chromium: el acceso con nombre de los controles gana sobre la propiedad. Un formulario
de producto **siempre** tiene un `<select name="id">`, así que `form.id` devuelve ese elemento, no la
cadena. No llegó a código de producción —era una aserción de la prueba—, pero queda registrado
porque es una trampa que cualquier código de theme puede pisar.

### 10.3 Lo que las comprobaciones garantizan ahora

| Comprobación | Qué cubre | Validada inyectando |
| --- | --- | --- |
| `contratos del theme` (10) | ganchos DOM, puente de textos, puente de rutas, atribuciones de línea, elementos personalizados, assets, snippets, secciones, elegibilidad de streaming, JSON | **13 fallos inyectados, 13 detectados** |
| `theme check de Shopify` | sintaxis Liquid, traducciones, esquemas, ámbito de CSS | el propio linter |
| `componentes en navegador` (9) | mejora progresiva, tres estados, reconciliación, recomendador de punta a punta, evento de talla, añadir al carrito, 3D progresivo, **compra sin JavaScript**, colisiones con el DOM | los seis defectos de §10.2 |

### 10.4 Dos dependencias opcionales, declaradas

Theme Check y las pruebas en navegador necesitan Shopify CLI y Playwright. **Ninguno se versiona**:
el repositorio sigue con cero dependencias. Cuando no están, la comprobación se declara
**`NO EJECUTADA`**, nunca superada:

```
N/E  theme check de Shopify
1 NO EJECUTADA(S): theme check de Shopify
```

Decir que pasó algo que no se ejecutó es el éxito falso que §183 prohíbe. Para ejecutarlas se
definen `NE_SHOPIFY_CLI` y `NE_PLAYWRIGHT` con la ruta de cada herramienta.

---

## 11. Carrito — verificado, y el límite de Shopify que no se pudo cruzar

### 11.1 `line.index` no existe — todas las líneas compartían el mismo `id`

Verificado contra la documentación de Liquid: el objeto `line_item` **no documenta `index`**, y el
patrón oficial del template de carrito recorre `cart.items` con `forloop`.

Liquid devuelve `nil` ante una propiedad inexistente, y `nil | plus: 1` es **1**. Así que:

```liquid
{{ line.index | plus: 1 }}   <!-- 1, 1, 1, 1... en TODAS las líneas -->
```

Las etiquetas de cantidad de todas las líneas apuntaban al **primer** campo. Un lector de pantalla
anuncia la cantidad equivocada, y pulsar la etiqueta de la tercera línea enfoca la primera.

Theme Check no lo ve: no sigue las propiedades de los objetos de Liquid. Corregido con
`forloop.index`, y añadida la comprobación `ninguna variable de bucle usa .index`, que prohíbe el
patrón entero. Verificada reinyectando el fallo: detectado.

La línea se identifica además por `line.key` —que sí está documentado— en lugar de por su posición:
`key` es estable aunque las líneas se reordenen.

### 11.2 El carrito actualiza por la API de Shopify, no recalculando

Verificado en navegador: cambiar cantidad o quitar una línea manda una petición a la ruta de
carrito con `id` (la `key`), `quantity`, `sections` y `sections_url`, y **sustituye el HTML que
Shopify devuelve**.

No se suma ningún total en el navegador. Un subtotal calculado en cliente acaba discrepando del que
cobra el checkout —impuestos, descuentos automáticos, envío—, y la prueba verifica justamente que el
subtotal y el contador que aparecen son los que vinieron renderizados por Shopify.

Confirmado en la documentación de la Cart API: `sections` acepta lista o array, y `sections_url`
**debe empezar por `/`**. La comprobación lo verifica.

### 11.3 Tres veces el mismo falso positivo, y la lección

Las comprobaciones escaneaban el archivo entero, comentarios incluidos. Pero los comentarios de este
theme **explican las trampas que el código evita**, así que la explicación se contaba como el
defecto:

| Comprobación | Qué contaba mal |
| --- | --- |
| elegibilidad de streaming | el comentario que explica las reglas del streaming |
| ganchos del script | el comentario que explica la trampa de `data-ne-3d-mode` |
| variable de bucle `.index` | el comentario que explica por qué no se usa `line.index` |

Resuelto de una vez: hay una función `withoutComments` y **todas** las extracciones trabajan sobre
el código sin comentarios, tanto en Liquid como en JavaScript. Documentar una trampa no puede
contar como caer en ella.

### 11.4 `git checkout` sobre un archivo con cambios sin commitear

Al restaurar una inyección de prueba usé `git checkout` sobre `main-cart.liquid`, que tenía cambios
**sin commitear**: se perdieron todos. Las comprobaciones lo detectaron en la siguiente ejecución
—cinco ganchos que el script buscaba y ningún Liquid pintaba, más `<ne-cart>` definido y sin usar—,
así que la pérdida duró una ejecución. Queda registrado porque §188 obliga a reportar lo que se
rompe, no solo lo que se arregla.

### 11.5 Subir el theme a Shopify — NO PUEDO HACERLO CON EL ACCESO/CAPACIDADES ACTUALES DE SHOPIFY

La autorización existe y las mutaciones existen en el esquema (`themeCreate`, `themeDelete`,
`themeFilesUpsert`, `themePublish`). Lo que falta es poder **comprobar el resultado**:

| Host | Resultado |
| --- | --- |
| `magisik.store` | sin conexión |
| `www.magisik.store` | sin conexión |
| `cdn.shopify.com` | sin conexión |

La política de red del entorno deniega esos hosts, así que una vez subido el theme **no podría
cargar ni una página** para verificar que renderiza. Y `themeFilesDelete` está bloqueado por
política de seguridad (ver §8), con lo que lo más probable es que `themeDelete` también lo esté.

Subirlo dejaría unos sesenta archivos que quizá no se puedan borrar en una tienda que **no es** la
de Nathan & Esteban, a cambio de saber solo que el validador de archivos los aceptó —que es
aproximadamente lo que Theme Check ya verifica en local, con 0 infracciones sobre 44 archivos.

**Decisión: no se sube.** Lo que sí se verificó sin tocar la tienda:

- Theme Check oficial: 44 archivos, 0 infracciones.
- 11 contratos entre marcado y script, validados inyectando 14 fallos.
- 11 comprobaciones de comportamiento en Chromium, contra el CSS y los textos reales.

Para desbloquearlo hay que permitir el dominio de la tienda en los ajustes de red del entorno, o
desplegar por la integración de GitHub de Shopify una vez exista la tienda de Nathan & Esteban
(`DISCOVERY.md`, integración de GitHub).
