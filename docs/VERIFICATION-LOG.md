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

---

## 12. Accesibilidad — medida sobre la página renderizada

La paleta ya se había validado con `a11y-contrast.js` **antes** de escribir una línea de CSS, y eso
encontró un borde a 2.37:1 contra un mínimo de 3:1. Pero validar los tokens no dice nada de lo que
el comprador ve. Esta sección registra lo que apareció al medir la página.

El módulo que mide es **el mismo** que validó la paleta, importado en la página por su URL. No hay
un segundo cálculo de contraste sin pruebas.

### 12.1 Dos violaciones reales de contraste

| Violación | Medido | Exige |
| --- | --- | --- |
| Borde de los chips «agotado» y «no se fabrica», en `--ne-rule` | **1.34:1** | 3:1 |
| `opacity: 0.65` sobre el chip «no se fabrica» | rebajaba todo lo de dentro | — |

**El borde de un chip no es decoración.** Es el límite del control y comunica su estado, así que le
aplica el mínimo no textual de 3:1. `--ne-rule` está declarado como decorativo y da 1.34:1 contra el
papel: el chip agotado se quedaba prácticamente sin contorno. Corregido a `--ne-border`, que pasa, y
la distinción entre los dos estados vive donde debe —tachado frente a discontinuo, que son
diferencias de **forma**— en lugar de en un color invisible.

**La `opacity` era peor, porque era indetectable.** Rebaja el contraste de todo lo que contiene,
texto incluido, y **no aparece en `getComputedStyle().color`**: cualquier medición que solo lea
colores da un pase falso exactamente donde el contraste se ha roto. Retirada; el color de texto
suave ya cumple 7.26:1.

La auditoría ahora compone el color contra el fondo por el producto de las opacidades de la cadena
de ancestros, que es lo que el navegador pinta. Verificado inyectando `opacity: 0.35`: detectado,
2.95:1 contra 4.5:1 exigido.

### 12.2 Un objetivo destructivo por debajo del objetivo de 44px

«Quitar» en el carrito medía 53×27: cumple el mínimo de 24, no llegaba al objetivo de 44. Es la
acción más destructiva del carrito y la que más se pulsa por error en móvil. Subida a 44.

### 12.3 Tres fallos en mi propia auditoría

Una auditoría con falsos positivos se desactiva, así que se corrigieron:

| Fallo | Por qué era falso |
| --- | --- |
| Contaba toda `label[for]` como objetivo | Una etiqueta junto a un campo **visible** no es el objetivo: el objetivo es el campo. Solo lo es cuando su control está oculto a la vista, como en los chips. |
| Tomaba la vuelta de la tabulación por un salto de orden | Tras el último elemento, Tab vuelve al primero. Es el comportamiento normal del navegador. |
| Medía duplicados decorativos | La foto de una línea de carrito es `aria-hidden="true"` con `tabindex="-1"`: fuera del árbol de accesibilidad y del orden de tabulación, y repite el enlace de texto contiguo. Es el caso «objetivo equivalente»; el objetivo que cuenta es el enlace, y ese se mide. |

### 12.4 La tercera forma de la misma deriva, y la peor

El banco de pruebas había llevado **CSS copiado** (resuelto cargando el archivo real), **textos
copiados** (resuelto resolviéndolos del archivo de idioma) y, todavía, **marcado simplificado**.

Esta última es la que más engaña. Al inyectar a propósito un fallo de contraste en
`.ne-picker__chosen`, **no se detectó nada**: el banco escribía ese `<span>` sin la clase, así que la
regla nunca se aplicaba. La auditoría estaba midiendo elementos **sin los estilos del theme**, es
decir, aprobando cosas que en la tienda pueden fallar.

Medidas: **15 clases del marcado real no existían en el banco.** Alineado clase por clase, y añadida
la comprobación `el banco de pruebas lleva las clases del marcado real`, que falla si una clase usada
en una pieza espejada no aparece en ningún banco. Verificada retirando `.ne-picker__chosen`:
detectada.

También se añadió un tercer banco para el **carrito vacío**: es un estado aparte, es lo primero que
ve quien llega al carrito por error, y es la única pantalla que es solo texto y un botón.

Como efecto colateral, los `{% stylesheet %}` de las **19** piezas del theme pasaron a
`assets/ne-components.css`. Una sola fuente, y es la que carga tanto la tienda como la auditoría.

### 12.5 Las ocho comprobaciones, validadas inyectando el fallo

| Fallo inyectado | Detectado |
| --- | --- |
| Texto a 1.51:1 | sí |
| Borde de control a 1.34:1 | sí |
| Objetivo de pulsado de 64×18 | sí |
| `:focus-visible { outline: none }` | sí |
| Imagen sin `alt` | sí |
| `<h1>` convertido en `<h3>` | sí |
| Campo sin nombre accesible | sí |
| `opacity: 0.35` | sí |

### 12.6 Lo que esto NO cubre

**No sustituye a una auditoría con lector de pantalla real.** Lo que una máquina puede decidir se
decide aquí: contraste, tamaño de objetivo, orden de foco, estructura de encabezados, nombres
accesibles, `alt`. Lo que exige a una persona escuchando la página —si los anuncios de `aria-live`
llegan en el momento útil, si el orden narrativo tiene sentido, si los textos describen de verdad lo
que pasa— sigue **pendiente**, y así está declarado en `STATUS.md`.

---

## 13. Analítica y SEO

### 13.1 El pixel personalizado — nativo de Shopify, sin app

`shopify/pixel/custom-pixel.js` es el cuerpo de un **pixel personalizado**: se pega en
Shopify admin → Settings → Customer events → Add custom pixel. Es capacidad nativa, no hace falta
app ni infraestructura. Instrucciones completas en `shopify/pixel/README.md`.

API confirmada contra la documentación: en un pixel personalizado los globales son `analytics`,
`init` y `api`, el consentimiento inicial se lee de `init.customerPrivacy`, los cambios se escuchan
con `api.customerPrivacy.subscribe('visitorConsentCollected', ...)` —el único evento que esa API
acepta hoy— y las banderas son `analyticsProcessingAllowed`, `marketingAllowed`,
`preferencesProcessingAllowed` y `saleOfDataAllowed`.

Tres decisiones que el código hace cumplir:

1. **Sin consentimiento no sale nada.** Y se escucha la aceptación posterior, porque el comprador
   puede aceptar sin recargar: medir toda la sesión con el estado inicial perdería justo a quien
   aceptó.
2. **`checkout_completed` está disponible y NO se usa.** Señalaría lo mismo que `orders/create`
   pero sujeto a consentimiento y a bloqueadores, así que daría una cifra **menor** para el mismo
   hecho. Dos números para un hecho es cómo se construye un informe que miente.
3. **Ningún importe viaja.** No por olvido: tenerlo en un evento de cliente invita a sumar ingresos
   desde el navegador. El ingreso vive en `orders/paid`.

El evento propio `ne:size_selected` se trata como **entrada hostil**, porque Shopify documenta que
un visitante puede publicar eventos personalizados desde la consola. El estado se valida contra la
lista cerrada que el theme emite, las cadenas se recortan, y el payload lleva `trusted: false`.

**Destino: PLACEHOLDER.** No hay servicio de analítica definido, así que no se inventa: con
`DESTINATION` vacío el pixel **no hace ninguna petición de red** y deja los eventos en un buffer
local. Apuntarlo a un endpoint inexistente sería fingir una integración.

Seis comprobaciones, **validadas inyectando el fallo de cada una: 6 de 6**.

| Fallo inyectado | Detectado |
| --- | --- |
| Etapa de servidor (`order_created`) en el pixel | sí |
| Etapa inventada, fuera de la taxonomía | sí |
| Un importe en el payload | sí |
| Suscripción a `checkout_completed` | sí |
| No comprobar `analyticsProcessingAllowed` | sí |
| No escuchar `visitorConsentCollected` | sí |

El vocabulario de etapas está repetido en el pixel porque un pixel personalizado **no puede
importar módulos**: es un script suelto en un sandbox. La repetición es inevitable; la deriva está
vigilada.

### 13.2 JSON-LD — dos defectos corregidos

#### Interpolación cruda en `variesBy`

El bloque construía el array de `variesBy` como **cadena de JSON a mano** e interpolaba el
resultado sin filtro. Los URIs son literales que controlamos, así que era seguro **hoy**. El
problema es otro: una interpolación cruda dentro de un bloque JSON-LD es la forma en que ese bloque
se rompe mañana —un título como `Botín "Andes"` basta—, y **un bloque roto no da un dato peor: da
ningún dato**, porque el buscador descarta el script entero. Y se descubre semanas después, en una
caída de tráfico.

Reescrito como lista emitida con `| json`, y añadida la comprobación **`JSON-LD sin interpolación
cruda`**, que exige que toda interpolación dentro de un bloque `application/ld+json` acabe en
`| json`. Verificada inyectando `"name": "{{ product.title }}"`: detectada.

#### Un precio de cero se declaraba

La condición era `variant.price != blank`. **En Liquid el cero no es blank**, así que un producto
todavía sin precio real —un PLACEHOLDER, que es lo que hay ahora— habría emitido `"price": 0.0` ante
un buscador: una declaración de que el zapato es gratis. Corregido a `> 0`: sin precio real no hay
oferta.

Es exactamente el tipo de dato inventado que §191 prohíbe, y había entrado por una comparación mal
elegida, no por una decisión.

### 13.3 Lo que sigue sin verificar en SEO

| Pendiente | Por qué |
| --- | --- |
| Prueba de resultados enriquecidos de Google | `developers.google.com` denegado por la política de red |
| Niveles de requisito de las propiedades | mismo bloqueo: siguen en `DOCUMENTED`, nunca `VERIFIED` |
| Indexación real | exige una tienda publicada |

---

## 14. Rendimiento — medido, sin inventar una puntuación

Esto **no es una medición de Lighthouse**, y no pretende serlo: una puntuación exige una página
desplegada, un dispositivo y una red, y ninguna de las tres existe todavía. Inventar un umbral de
rendimiento sería inventar información (§191).

Lo que sí se puede medir hoy, y es real:

### 14.1 Bytes servidos, comprimidos

| Recurso | Comprimido | Presupuesto |
| --- | --- | --- |
| CSS del primer paint (3 archivos) | **11 063 B** | 12 000 |
| `ne-components.js` | **14 681 B** | 17 000 |
| Módulos que la ficha importa (5) | **16 554 B** | 20 000 |
| **Total CSS + JS de la ficha** | **42 298 B** | — |

Los presupuestos son **de regresión, no de objetivo**: están justo por encima de lo medido, con una
razón. No afirman que el theme sea rápido —eso se mide desplegado—, avisan si alguien duplica el
peso sin darse cuenta. Un presupuesto que no se ha medido no vale nada, y uno copiado de un artículo
vale menos.

### 14.2 El import map declara doce módulos; la página descarga seis

Era un riesgo real y concreto: si declarar en el import map implicara descargar, la ficha bajaría
unos 30 KB comprimidos de más en cada visita. **Verificado contando peticiones reales en Chromium:**

```
descargados 6: ne-components.js, ne-variant-matrix.js, ne-size-advisor.js,
               ne-cart-line.js, ne-size-selected-event.js, ne-shopify-semantics.js
```

Exactamente `ne-components.js` más sus cinco imports. Declarar no es descargar, y ahora hay una
comprobación que lo sostiene: verificada añadiendo un import no usado, que la hizo fallar.

### 14.3 Un desplazamiento de maquetación real, causado por mi propio diseño

**0.0132 de desplazamiento acumulado, reproducible en las cuatro ejecuciones.** No era ruido.

La causa, leída de las fuentes que reporta el observador:

```
FIELDSET.ne-picker__group   327@28  ->  371@72
NE-SIZE-GUIDE.ne-sizeguide  471@44  ->  467@44
DIV.ne-buy                  539@46  ->  535@46
DL.ne-specs                 609@75  ->  605@75
```

Los chips estaban ocultos hasta que el script mejoraba el selector. El primer paint mostraba el
`<select>` de reserva —fieldset de 28px— y a los ~90 ms los chips aparecían a 72px, empujando hacia
abajo la guía de tallas, el formulario de compra y la ficha técnica.

Es el coste clásico de «ocultar hasta que llegue el JavaScript»: el fallback sin JavaScript era
correcto, pero el cambio movía la página.

**Corregido decidiendo la maquetación antes del primer paint**, con un script en línea y síncrono en
`theme.liquid` que marca el documento con `ne-js`. Lo primero que se pinta ya es el estado final.

**Y con una red de seguridad**, que es la otra mitad de la solución: tener JavaScript **no** es lo
mismo que que el módulo haya llegado. Si a los tres segundos ningún selector se ha marcado como
mejorado —error de red, de sintaxis, un bloqueador—, se retira la marca y reaparece el `<select>`,
que es el control que permite comprar. Perder el estado visual es aceptable; perder la venta no.

Medido después: **0.0000** en la ficha y en el carrito. Y hay una prueba en navegador que bloquea
`ne-components.js` y verifica que el `<select>` vuelve: *si el módulo no llega, vuelve el control de
reserva*.

### 14.4 Las cinco comprobaciones, validadas inyectando el fallo

| Fallo inyectado | Detectado |
| --- | --- |
| Imagen sin `width`/`height` ni `aspect-ratio` | sí |
| `<script src>` sin `defer` ni `type="module"` | sí |
| Un import no usado (séptimo módulo descargado) | sí |
| Un bloque insertado tarde que desplaza la página | sí |
| Presupuesto de bytes excedido | **la inyección fue mala**, no la comprobación: 900 reglas CSS idénticas comprimen a casi nada. El límite se verifica por construcción con los números medidos arriba. |

Esa última fila queda escrita tal cual porque §183 prohíbe presentar como validado algo que no lo
está. La comprobación compara un número medido contra un límite y falla si lo supera; lo que no se
demostró es el detector con una inyección realista.

### 14.5 Lo que sigue sin medir, y por qué

| Pendiente | Depende de |
| --- | --- |
| Lighthouse (rendimiento ≥60, accesibilidad ≥90 de media) | una página desplegada |
| LCP, INP, CLS de campo | tráfico real |
| El método de prueba móvil (CPU 4× + 4G lento, 3 ejecuciones, mediana) | una URL que cargar |

Las tres están bloqueadas por lo mismo: la política de red del entorno deniega el dominio de la
tienda. Ninguna se declara estimada.

---

## 15. Seguridad del theme

### 15.1 Dónde está la superficie de verdad

Shopify es dueño de la autenticación, del pago y de los datos personales, así que este theme no
guarda credenciales, no valida contraseñas y no toca tarjetas. Lo que sí puede hacer mal es corto y
concreto, y eso es exactamente lo que se comprueba.

El punto de partida es un hecho que cambia todo lo demás: **Liquid no escapa por defecto.** Un
`{{ }}` con texto que escribe una persona es una inyección esperando a ocurrir.

### 15.2 XSS reflejado real, por el término de búsqueda

```liquid
{{ 'general.search.no_results' | t: terms: search.terms }}
```

`search.terms` viene de un parámetro de URL: **lo controla cualquiera que consiga que alguien abra
un enlace**. Se interpolaba en una cadena traducida que se emite cruda.

Y aquí está lo importante: **la documentación de Shopify no dice si el filtro `t` escapa lo que
interpola**, y su propio ejemplo de búsqueda emite `search.terms` sin escapar en un atributo. No se
puede saber cuál de las dos cosas significa eso.

**Regla aplicada: un control de seguridad no se apoya en un comportamiento de plataforma sin
verificar.** Se escapa explícitamente, antes de interpolar. Si Shopify además escapa, el único
efecto es que alguien que busque literalmente `<b>` vea `&lt;b&gt;`: un defecto cosmético en un caso
extremo, frente a un XSS reflejado si no se escapa. Para un término normal —letras, números,
acentos— `escape` no cambia nada.

### 15.3 Texto del comerciante en atributos

Tres sitios emitían texto libre del comerciante dentro de un atributo sin escapar: `shop.name` en
un `aria-label` y en un `og:site_name`, y un ajuste de sección en un `class`. Gravedad menor —hace
falta acceso al admin—, pero una comilla en el nombre de la tienda rompe el atributo igual.
Escapados.

### 15.4 Un `style` interpolado, cambiado por un conjunto cerrado de clases

```liquid
style="--ne-grid-cols: {{ section.settings.columns }}"
```

El ajuste es de tipo `range`, así que Shopify lo acota a un entero y **hoy no es explotable**. Pero
la forma es mala por una razón concreta: **`escape` no impediría una inyección de CSS**, así que
escaparlo no arreglaría nada, y el día que alguien cambie ese ajuste a `text` el agujero aparece sin
que nada avise.

Sustituido por una clase de un conjunto cerrado (`ne-product-grid--cols-2|3|4`). Un valor fuera de
rango no coincide con ninguna regla y la rejilla cae al valor por defecto: **no hay nada que
inyectar, porque no hay nada que interpretar.**

### 15.5 Por qué NO se comprueba «todo `{{ }}` debe llevar escape»

Se midió: el theme tiene **86 interpolaciones dentro de atributos**, y 63 no llevan filtro de
escape. Exigirlo a todas daría 62 avisos de ruido —URLs que genera Shopify, ids de sección, enums,
números— por cada hallazgo real. **Una comprobación con ese ruido se desactiva a la semana.**

Así que se comprueba lo que de verdad puede contener una comilla: una lista explícita de fuentes de
**texto que escribe una persona** (`search.terms`, `request.path`, `shop.*`, `*.settings.*`,
`*.title`, `*.alt`, `*.label`, `*.vendor`, `*.description`…). De 86 interpolaciones, señaló 4. Las
4 eran reales.

### 15.6 Las seis comprobaciones, validadas inyectando la vulnerabilidad

| Vulnerabilidad inyectada | Detectada |
| --- | --- |
| XSS reflejado por el término de búsqueda | sí |
| Texto del comerciante sin escapar en un atributo | sí |
| Interpolación cruda dentro de un bloque JSON | sí |
| `<script>` de un tercero (`cdn.jsdelivr.net`) | sí |
| `target="_blank"` sin `rel="noopener"` | sí |
| Una credencial asignada, incluso dentro de un comentario de Liquid | sí |

Sobre la última: un secreto dentro de un comentario de Liquid **sí** se elimina del lado del
servidor, así que el mensaje no afirma que se sirva al navegador. Lo que afirma es que está
versionado y en el historial, que es motivo suficiente para sacarlo y rotarlo. La búsqueda es por
**forma** —el prefijo de un token de Shopify, una clave privada, una asignación con un valor largo—
y no por palabras: buscar «token» daría un falso positivo en cada comentario que explique por qué
no hay tokens.

### 15.7 Lo que queda fuera del alcance del theme

| No se comprueba | Por qué |
| --- | --- |
| CSP con nonce | Shopify no permite cabeceras propias en el Online Store. Era la única ventaja de seguridad verificada de headless, y no es requisito: la superficie que protegería no vive en nuestro código. |
| Validación de pago y PII | las tiene Shopify. El theme no las ve. |
| Rotación de credenciales de app | no hay app todavía. |
| Liquid personalizado del comerciante | es un requisito de la tienda de themes y solo lo usa quien ya tiene acceso al admin. Se informa en cada ejecución para que esté a la vista, no se trata como hallazgo. |

---

## 16. QA final — las dos páginas que nadie había auditado

La auditoría cubría la ficha de producto y el carrito. Faltaban dos páginas, y no eran las menos
importantes:

- **La portada** es la primera impresión, y es la única que usa la superficie **inversa** —fondo
  oscuro—. Los pares de color inversos se habían validado **a nivel de token**, y medir tokens no es
  medir lo que se ve.
- **La colección** pesa el **43% de la puntuación de velocidad** de la tienda de themes: más que la
  ficha (40%) y mucho más que la portada (17%).

Se añadió un cuarto banco que reproduce `editorial-hero` —con `ne-inverse` activado a propósito—,
`statement`, `product-grid` y las tarjetas, incluida una con imagen pendiente y una agotada.

**La superficie inversa pasa el contraste medido sobre lo renderizado.** Eso queda verificado, no
inferido de los tokens.

### 16.1 `min-height` no hace nada en un elemento en línea

El hallazgo de esta pasada, y era latente en todo el theme.

```css
.ne-button--text {
  min-height: var(--ne-touch-min);  /* inerte: falta `display` */
}
```

`.ne-button--text` se usa en **cuatro sitios sin `.ne-button`**, y por sí sola no declaraba
`display`. En un elemento en línea **`min-height` se ignora**, así que ese mínimo de área de pulsado
**nunca se aplicó en ninguno de los cuatro**.

Medido en la portada: «Ver todo» a **71×21**, por debajo del mínimo de 24. Tras añadir
`display: inline-flex`: **71×27**.

Lo más instructivo es por qué no había salido antes: en el carrito el mismo botón sí cumplía, pero
solo porque al corregir «Quitar» le había puesto `display: inline-flex` en una regla aparte. El
síntoma estaba tapado en la única página donde se estaba midiendo.

Añadida la comprobación **`los modificadores usados solos se sostienen solos`**: un modificador
usado sin su clase base que declare `min-height` sin `display` falla. No prohíbe usar un modificador
solo —`.ne-section--vast` declara su propio `padding-block` y es una variante legítima—; exige que
quien se use solo declare lo que necesita para sostenerse.

### 16.2 Una clase muerta en cada página

`<body class="ne-body-root ...">` no tenía **ninguna** regla de CSS en ningún archivo. Retirada.
`template--<nombre>` se mantiene: no la usa nuestro CSS, pero es la convención que un comerciante o
una app esperan para apuntar a una plantilla concreta, y eso es un propósito real.

### 16.3 La deriva de marcado, por cuarta vez

El banco de la portada escribía `class="ne-skip"`; la clase real del layout es `ne-skip-link`. Es
**el mismo problema** que ya había aparecido con el CSS, con los textos y con las clases de los
snippets, ahora en el layout, que la comprobación no cubría porque `theme/layout/theme.liquid` no
estaba en la lista de piezas espejadas.

Dos arreglos, y el segundo es el que importa: el layout entra en la lista, y **los cuatro bancos se
declaran en un solo sitio** del script, en lugar de repetirse en tres comprobaciones —que es
exactamente cómo se me había olvidado añadir el cuarto a una de ellas.

### 16.4 Estado de las comprobaciones

| Suite | Comprobaciones | Validadas inyectando el fallo |
| --- | --- | --- |
| `node --test` | 321 pruebas | — |
| Contratos del theme | 15 | 16 inyecciones |
| Componentes en navegador | 12 | 6 defectos reales encontrados |
| Accesibilidad renderizada | 5 | 8 inyecciones |
| Rendimiento | 5 | 4 de 5 (una inyección fue mala, §14.4) |
| Seguridad | 6 | 6 inyecciones |
| Theme Check de Shopify | 44 archivos | el propio linter |
| **Total `scripts/check.mjs`** | **17** | — |

Cuatro páginas auditadas: ficha de producto, carrito, carrito vacío, portada y colección.

---

## 17. Tres ajustes que mentían, y el presupuesto haciendo su trabajo

### 17.1 Tres controles en el editor del theme que no hacían nada

Auditando la coherencia entre `settings_schema.json` y lo que el Liquid lee:

| Ajuste | Estado |
| --- | --- |
| `analytics_size_selected_event` | en el editor, **ningún archivo lo leía** |
| `cod_prevalidation` | en el editor, **ningún archivo lo leía** |
| `cod_coverage_list` | en el editor, **ningún archivo lo leía** |

Esto es peor que una función que falta: el comerciante los ve, los cambia, **y cree que ya lo
configuró**. Un control que miente.

Los tres están wireados ahora:

- **`analytics_size_selected_event`** decide si se publica `ne:size_selected`. Se pasa al rastreador
  como `publish: null`, que lo deja funcionando sin publicar, en lugar de no crearlo: así el resto
  del componente no tiene que comprobar si existe.
- **`cod_prevalidation` + `cod_coverage_list`** alimentan un bloque nuevo de **cobertura de pago
  contra entrega en el carrito**, que usa el módulo `cod-guard` ya probado.

### 17.2 Por qué la cobertura va en el carrito y no en el checkout

El checkout sería el sitio natural, y **NO DISPONIBLE EN SHOPIFY CON EL ACCESO/CAPACIDADES
ACTUALES**: las extensiones de UI de checkout en las páginas de información, envío y pago son solo
de Shopify Plus. Verificado en la matriz de planes.

El carrito es el último punto del storefront antes de salir hacia el checkout de Shopify, así que
ahí se pregunta. Con contra entrega el comprador no paga nada por adelantado —rechazar el paquete no
le cuesta, y el flete de ida y vuelta lo paga la marca—, así que saber antes de pedir si hay
cobertura evita el pedido que iba a volver.

**No inventa cobertura.** Si la lista está vacía, el bloque no se renderiza, y si llega vacía al
módulo este devuelve `unknown` y la interfaz **no dice nada**: afirmar que no entregamos en una
ciudad sin saberlo sería un dato inventado. Verificado en navegador con la lista vacía: no dice
nada.

También se verificó de punta a punta la normalización que había costado tres defectos reales:
`Bogotá D.C.`, `bogota dc`, `BOGOTA D.C`, `Medellín` y `medellin` se reconocen todas.

### 17.3 El presupuesto de bytes encontró una regresión que yo acababa de meter

Al importar `cod-guard` en `ne-components.js`, los módulos de la ficha de producto pasaron de
**16 554 a 20 851 B comprimidos**, por encima del límite de 20 000.

Y el diagnóstico era exacto: el componente de cobertura **solo existe en el carrito**, pero un import
estático lo mete en el grafo de la ficha de producto. **4,3 KB comprimidos que la ficha descargaría
sin usarlos.**

**La respuesta correcta a un presupuesto excedido es quitar peso, no subir el número.** Se cambió a
`import()` dinámico dentro del componente, así que el módulo solo baja en las páginas donde ese
componente existe. La ficha volvió a 16 554 B y sigue descargando seis módulos, `cod-guard` no entre
ellos.

El presupuesto de bytes se había quedado sin validar por inyección (§14.4). Esto es mejor que una
inyección: encontró una regresión real, en el momento en que se introdujo.

### 17.4 Dos comprobaciones nuevas

| Comprobación | Qué detecta | Validada |
| --- | --- | --- |
| `los ajustes del theme se declaran y se leen` | un ajuste en el editor que nadie lee, **y** un `settings.x` que el esquema no declara y devolvería nil | inyectando los dos casos |
| `los modificadores usados solos se sostienen solos` | un modificador sin su base que declare `min-height` sin `display` | el fallo real de §16.1 |

La primera distingue `settings.x` de `section.settings.x` y `block.settings.x`. Sin esa distinción,
trece ajustes de sección aparecían como «no declarados»: una comprobación con trece falsos positivos
se desactiva.

### 17.5 El README mentía

Decía que el stack estaba sin decidir y que había diez comprobaciones. Reescrito: el punto de
entrada del repositorio no puede contradecir el estado del repositorio.

---

## 18. Optimización de carga — medida antes y después

Punto de partida y de llegada, mediana de 5 ejecuciones con **CPU 4× y 4G lento a la vez**, iPhone
390×844@3x:

| | Portada antes | Portada ahora | Ficha antes | Ficha ahora |
| --- | --- | --- | --- | --- |
| **LCP** | 752 ms | **516 ms** | 736 ms | **600 ms** |
| **FCP** | 752 ms | **516 ms** | 736 ms | **600 ms** |
| **CLS** | 0.0000 | **0.0000** | 0.0000 | **0.0000** |
| **TBT** | 9 ms | **1 ms** | 73 ms | **21 ms** |
| **INP** | — | — | 40 ms | 56 ms |
| load | 825 ms | **504 ms** | 1312 ms | **937 ms** |
| Peticiones | 6 | **3** | 11 | **10** |
| Peso | 96,2 KB | **23,8 KB** | 148,8 KB | **85,9 KB** |
| JavaScript | 49,6 KB | **0 KB** | 92,6 KB | **46,4 KB** |

**La portada: −31 % de LCP, −75 % de peso, la mitad de peticiones y cero JavaScript.**
La ficha: −18 % de LCP, −42 % de peso, **−71 % de tiempo de bloqueo**.

Sobre el INP de 40 → 56 ms: **no es una regresión del código.** Se perfiló con siete ejecuciones
mirando el desglose del Event Timing API, y el **tiempo de procesamiento del manejador es 0 ms en
todas**. Los 40–112 ms son retardo de presentación, es decir, el presupuesto de frame del navegador
con la CPU estrangulada 4×. La mediana real son 48 ms y la varianza es del entorno de medición.

### 18.1 Lo que pagó, y cuánto

| Cambio | Efecto medido |
| --- | --- |
| **La portada no emite JavaScript** | −46 KB y −5 peticiones. No tiene selector, ni guía de tallas, ni galería, ni carrito: sus tarjetas son enlaces y el contador lo renderiza Shopify. Cargaba 46 KB para cero componentes. |
| **Partir la tarea larga del montaje** | TBT de la ficha **~100 ms → ~20 ms, sin quitar un byte.** Había una tarea de 112–145 ms a los ~900 ms: este archivo montando los cinco componentes de una sentada. La guía, la galería y la cobertura ceden el hilo; el selector monta ya, porque es lo que se toca primero. |
| **CSS troceado por uso y concatenado** | De 3 hojas y 38,4 KB en toda página a **una de 15,5 KB**, más 6 KB solo en la ficha y 2,5 KB solo en el carrito. −2 peticiones en todas las páginas. |
| **Comentarios fuera del código servido** | JavaScript −45 %, CSS −39 %. Eran el 39 % del CSS y casi la mitad del JS. |
| **Fuentes del sistema por defecto** | **Cero descargas de fuente.** Era una dependencia de render: parsear, pedir, esperar, pintar. En iPhone da SF Pro y New York, sin una petición, sin texto invisible y sin desplazamiento por intercambio. |
| **Una fuente menos** | El peso 500 se usaba en UNA regla. Un archivo de fuente entero compitiendo con el primer paint por un título de tarjeta. |
| **`preload` de la imagen del hero** | El `<img>` no está al principio de su sección; el enlace sí. Comparte la escalera de anchos con el `<img>` para que no sean dos descargas. |

### 18.2 Lo que NO pagó, y se quitó

Se probó diferir `size-advisor`, `cart-line` y `size-selected-event` —12 KB que solo hacen falta al
abrir la guía o tocar una talla— con precarga en reposo. Resultado:

```
TBT de la ficha    75 ms -> 86 ms
peso de la ficha   85,7 KB -> 86,9 KB
```

**Se revirtió.** Son módulos de 3 a 5 KB que bajan en paralelo por la misma conexión; a ese tamaño
el parseo es ruido. Lo que sí añadía era 1,3 KB de maquinaria y un riesgo real: un toque antes de
que llegara el módulo se quedaba sin publicar el evento y sin escribir las atribuciones de línea.

La regla del proyecto aplicada a sí misma: **si una optimización no se gana su complejidad con un
número, se quita.**

### 18.3 Dos fallos que envenenaban la medición

Los dos eran invisibles, y los dos daban números MEJORES de lo real.

**Un banco pedía tres archivos que ya no existían.** Al fusionar el CSS, el banco de la ficha quedó
apuntando a `ne-tokens.css`, `ne-base.css` y `ne-shell.css`. Un 404 de hoja de estilo no rompe la
página: la deja sin estilos. La medición dio 6,1 KB de CSS y un LCP buenísimo de una página sin
maquetar.

**El banco de la portada no tenía import map.** `ne-components.js` lanzaba «Failed to resolve module
specifier» y **ningún elemento personalizado se definía**. La portada no tiene componentes que
mejorar, así que se veía perfecta, y se midió una página con el JavaScript roto.

Dos comprobaciones nuevas, las dos validadas inyectando el fallo:

- **`assets referenciados existen`** ahora cubre los bancos, no solo el Liquid.
- **`todos los bancos definen sus componentes sin errores`** carga los cuatro y exige cero errores de
  página y los cinco elementos definidos. Más su recíproca: la portada tiene que cargar **sin
  descargar JavaScript y sin definir ningún componente** — si apareciera alguno, estaría cargando
  código que no usa.

Un error de módulo no se ve. Hay que preguntarlo.

### 18.4 El barrido de comentarios, probado por comportamiento

El razonamiento de por qué un barrido por líneas es seguro está en el propio script: ningún módulo
tiene un literal de plantilla multilínea, y ni una cadena ni una expresión regular pueden abarcar
varias líneas, así que una línea cuyo primer carácter no blanco es `//` es inequívocamente un
comentario.

**Pero un razonamiento no es una prueba.** `sync-theme-assets.mjs --verify` monta un espejo de
`src/lib` con el contenido **que se sirve**, le copia las pruebas de verdad y las ejecuta:

```
OK  321 pruebas pasan contra el código SERVIDO, sin comentarios
```

Está dentro de `scripts/check.mjs`, así que corre en cada ejecución de la suite.

### 18.5 Un falso positivo que iba a dar ruido para siempre

La comprobación de marcadores pendientes buscaba la palabra `TODO`, y este código está comentado en
español: «TODO ES MEJORA PROGRESIVA», «TODO ESTÁTICO», «TODO LO COMERCIAL». Tres falsos positivos de
golpe en cuanto el archivo entró en el ámbito escaneado.

Afinada a la convención real del marcador —`TODO:` o `TODO(alguien)`, con dos puntos o paréntesis—.
Verificada en los dos sentidos: un marcador de verdad falla, la palabra española no.

### 18.6 Presupuestos apretados al nuevo mínimo

Los presupuestos de regresión estaban puestos sobre los valores antiguos y sobraban por todas
partes. Ahora:

| | Medido | Presupuesto |
| --- | --- | --- |
| CSS de toda página | 3 549 B | 4 200 |
| CSS extra de ficha | 1 423 B | 1 800 |
| CSS extra de carrito | 802 B | 1 100 |
| Componentes JS | 7 201 B | 8 000 |
| Módulos de la ficha | 6 290 B | 7 200 |
| **JavaScript de la portada** | **0** | **0** |

**Total de la ficha: 17 KB comprimidos** de CSS más JavaScript.

### 18.7 El theme optimizado, en Shopify

Subido y verificado. **62 archivos, `processingFailed: false`.** Los archivos clave comprobados byte
a byte contra el local:

| Theme | Id | Estado |
| --- | --- | --- |
| `NATHAN & ESTEBAN — ACTUAL (no publicar)` | `213916090621` | **el bueno** |
| `ZZ OBSOLETO 2 — borrar` | `213915894013` | superado |
| `ZZ OBSOLETO — borrar (sustituido por v2)` | `213914812669` | superado |

**`themeDelete` está bloqueado por política de seguridad**, verificado ejecutándolo: *«Theme
deletion is blocked — it could take down the live storefront. Use Shopify admin.»* Así que los dos
superados se renombraron con prefijo `ZZ OBSOLETO` para que se ordenen al final y se borren de un
clic desde el admin. **Es trabajo pendiente para el dueño, no un descuido.**

`themeUpdate` solo acepta `name`, y `themeFilesDelete` también está bloqueado, así que no hay forma
de reemplazar un theme en sitio desde un ZIP: cada subida crea uno nuevo. Por eso hay tres.

### 18.8 El vídeo de un tercero, en fachada

Un embed de YouTube o Vimeo trae varios cientos de KB de JavaScript ajeno, cookies y conexiones a
dominios que no son Shopify, **en la carga inicial, aunque nadie vaya a ver el vídeo**. En una ficha
de producto el vídeo casi nunca es lo primero que se mira.

Ahora se pinta la miniatura y un botón, y el `iframe` vive en un `<template>`: el navegador lo
parsea y **no carga su contenido**. Ni una petición al tercero hasta el clic. Sin JavaScript queda
el enlace al vídeo en su sitio original, que es mejor que un hueco.

Verificado en navegador: **cero `iframe` en el documento antes de pedirlo**, uno después, y el botón
desaparece al cambiarse.

### 18.9 Y un fallo que encontró esa misma prueba

Al añadir un medio más al banco, la prueba de «el 3D se apaga fuera de la vista» empezó a fallar. La
causa era real: el observador vigilaba **la galería entera**, que puede medir varias pantallas
—fotos, vídeo, modelo—, así que mientras cualquier parte de ella asomara, el visor seguía encendido
aunque estuviera muy lejos de la vista. Ahora observa **el visor**.

Un contexto WebGL encendido consume GPU y batería. Ese es exactamente el fallo que la directiva de
rendimiento quería evitar, y estaba ahí.
