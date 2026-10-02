# Nathan & Esteban — Modelos de arquitectura

**Fecha:** 2026-10-01
**Estado:** comparación preparada. **Sin recomendación final** — depende de U1–U3 en
[`REQUIREMENTS.md`](REQUIREMENTS.md) §2.1.

Leyenda de clasificación: ver [`REQUIREMENTS.md`](REQUIREMENTS.md).
Hechos de plataforma y sus fuentes: [`DISCOVERY.md`](DISCOVERY.md).

---

## 4bis. DECISIÓN DE FASE 2 — tomada

**Stack: Shopify Theme / Liquid, Online Store 2.0, escrito de cero.**

No es la opción por defecto ni la más fácil: es la que gana por razones concretas, dada la dirección
de arte recibida.

### Qué pedía la dirección de arte

Editorial, arquitectónica, minimalista con identidad propia. Prioridad a **composición, espacio,
tipografía, fotografía, producto, movimiento y narrativa**, por delante de los efectos. Sin
glassmorphism, sin blobs, sin gradientes aleatorios, sin partículas, sin animación decorativa.
**La identidad debe funcionar incluso sin 3D.**

### Por qué eso decide el stack

Un frontend headless compra dos cosas: control total del render y una cáscara de WebGL persistente
entre páginas. **Ninguna de las dos la pide esta dirección de arte.** Una identidad que descansa en
composición, tipografía y fotografía se construye con CSS y buen Liquid; no necesita que React posea
el documento. Y si el 3D es progresivo y opcional —lo es, por decisión explícita—, no hay cáscara
de WebGL que preservar.

Lo que el theme sí trae, sin construir nada:

| Capacidad | En theme | Headless |
| --- | --- | --- |
| Streaming de HTML y Early Hints | nativo, verificado | hay que montarlo |
| SEO, `hreflang`, sitemaps, mercados | nativo | hay que montarlo |
| 3D y AR (`model_viewer_tag`, Shopify-XR) | nativo | hay que integrarlo |
| Section Rendering API | nativo | no aplica |
| Theme Check (linter oficial) | **ejecutado: 0 infracciones** | no existe |
| Editor visual para el dueño | nativo | hay que construirlo |
| Hosting, CDN, certificados | incluido | hay que pagarlo y operarlo |
| Bloques de apps (`@app`) | nativo | se pierden |

La única ventaja de headless que quedó **verificada** es la CSP con nonce. No es un requisito aquí:
Shopify es dueño de la autenticación, el pago y los datos personales, así que la superficie que esa
CSP protegería no vive en nuestro código.

### Lo que esta decisión cuesta, dicho claro

- **Sin control del checkout.** En plan Basic las extensiones de UI de checkout son solo Plus, así
  que da igual el stack: no se podría personalizar de todos modos.
- **Liquid en lugar de componentes.** Mitigado con snippets y un único archivo de JavaScript que
  conecta módulos probados en lugar de reimplementarlos.
- **Sin paso de compilación.** Resuelto con un import map, que es estándar del navegador y además
  conserva la estructura de carpetas que exige la integración de GitHub de Shopify.

### La directiva Shopify-primero confirma la decisión, no la causa

La decisión estaba tomada por el razonamiento de arriba antes de que llegara la directiva
«si Shopify puede hacerlo, hazlo en Shopify». Que coincidan es una confirmación, no el motivo.

---

## 5. Comparación objetiva de alternativas

Solo alternativas **oficialmente soportadas** por Shopify. Descarto construir un frontend
desconectado de las APIs de Shopify: violaría §200 y la directiva de alcance.

### 5.1 Las opciones

| ID | Opción | Soporte de Shopify |
| --- | --- | --- |
| **A** | Theme propio en Liquid (Online Store 2.0) | Soportado, es la plataforma nativa |
| **B** | Hydrogen actual (React Router) + Oxygen | **"Shopify's fully supported path"** (textual) |
| **C** | Hydrogen developer preview (framework libre) + hosting libre | **Early developer preview.** Shopify pide feedback; no lo presenta como soportado |
| **D** | Sitio propio + Storefront Web Components | Soportado |

La opción **C queda fuera para un lanzamiento real** por decisión de riesgo, no de gusto: §188 y
§205 prohíben apoyar producción en algo que el proveedor etiqueta como preview temprano. Se
mantiene en la tabla como referencia futura.

### 5.2 Matriz contra los 13 criterios

`=` equivalente · `+` ventaja · `−` desventaja · `?` depende de U1–U3

| Criterio | A · Theme | B · Hydrogen+Oxygen | D · Web Components | Nivel |
| --- | --- | --- | --- | --- |
| **Originalidad** | `=` | `=` | `=` | `INFERIDO` — ver §5.3 |
| **Experiencia premium** | `=` | `=` | `=` | `INFERIDO` — ver §5.3 |
| **3D** | `+` `model_viewer_tag` y Shopify-XR nativos | `=` componente `ModelViewer`; assets 3D hasta 500 MB en Oxygen | `−` todo a mano | `VERIFICADO` |
| **Motion** | `=` | `=` | `=` | `INFERIDO` |
| **Shopify** | `+` integración total, nada que reconstruir | `=` vía Storefront API | `=` vía componentes | `VERIFICADO` |
| **Dropi** | `=` indiferente: Dropi opera sobre la tienda, no sobre el frontend | `=` | `=` | `INFERIDO` |
| **Performance** | `+` streaming de HTML y Early Hints **gratis** | `?` control total, pero hay que reimplementar streaming y hints | `−` sin ninguna de las dos | `VERIFICADO` |
| **Seguridad** | `−` sin control documentado de headers → **CSP con nonce `NO VERIFICADO`** | `+` `createContentSecurityPolicy` con nonce | `−` depende del host | `VERIFICADO` / `NO VERIFICADO` |
| **SEO** | `+` metadata, `robots.txt` editable, **hreflang automático** | `−` todo propio: sitemap, robots, canonical, hreflang | `−` todo propio | `VERIFICADO` |
| **Accesibilidad** | `=` responsabilidad del implementador en las tres | `=` | `=` | `VERIFICADO` |
| **Conversión** | `=` las tres terminan en el mismo `checkoutUrl` | `=` | `=` | `VERIFICADO` |
| **Mantenibilidad** | `+` un solo sistema; editor de themes; otro desarrollador lo reconoce | `−` React Router + runtime workerd, con APIs de Node ausentes | `−` sin convención establecida | `INFERIDO` sobre hechos verificados |
| **Costo** | `+` cero hosting adicional | `=` Oxygen incluido sin cargo en planes pagos | `−` hosting propio aparte | `VERIFICADO` |

### 5.3 Lo que hay que decir sobre originalidad y "premium"

`INFERIDO`, y lo marco como tal porque es donde más se decide mal por el motivo equivocado:

**Un theme propio en Liquid no limita la originalidad visual.** Liquid renderiza el HTML que se le
escriba; el CSS y el JavaScript son los mismos del resto de la web. La sensación de que "los themes
se ven a plantilla" viene de partir de Dawn o de un theme comprado y modificarlo — exactamente lo
que §177 prohíbe — no de la tecnología.

Los límites reales del theme son **arquitectónicos, no creativos**:

| Límite real del theme | Nivel |
| --- | --- |
| 25 secciones por plantilla JSON, 50 bloques por sección, 8 niveles de anidamiento | `VERIFICADO` |
| Sin control documentado de headers de respuesta HTTP → CSP con nonce no confirmado | `NO VERIFICADO` |
| Las plantillas `.liquid` todavía no reciben streaming (solo las JSON) | `VERIFICADO` |

Ninguno de esos tres es un límite de dirección de arte. Por tanto **no se debe elegir headless
"para poder hacer algo original"**: eso sería elegir por moda, lo que el propietario prohibió
explícitamente.

El argumento legítimo a favor de B es otro, y es concreto: **CSP con nonce** y **control total del
render**, si el modelo de amenazas o la naturaleza del 3D lo exigen.

### 5.4 Lo que ya está decidido por hechos, en cualquier opción

| Hecho | Consecuencia |
| --- | --- |
| Checkout de Shopify, siempre (`cartCreate` → `checkoutUrl`) | No hay checkout propio. §200, §211 |
| Branding y UI del checkout = solo Plus; plan objetivo Advanced | El checkout es intocable. Toda la marca vive antes |
| Combined listings = solo Plus | Un producto por modelo, con opciones Color + Talla |
| Shopify Functions = sí en Advanced | La lógica de pago y envío sí es programable |
| La secret key del carrito no puede ir al cliente | Headless con datos privados del comprador exige servidor |

---

## 6. Arquitectura de seguridad

Modelo §197: minimizar superficie + proteger datos + reducir impacto + no exponer secretos + validar.

### 6.1 Threat model (§207)

| Activo | Amenaza | Vector | Impacto | Mitigación | Nivel |
| --- | --- | --- | --- | --- | --- |
| Datos del comprador en el carrito | Exposición de datos privados | Secret key del cart ID filtrada a cliente, enlace o log | Alto: email y dirección del comprador | La secret key **nunca** sale del servidor. En theme, el carrito es de Shopify y no se maneja el ID | `VERIFICADO` (doc oficial) |
| Integridad de precio | Manipulación de precio desde el navegador | Confiar en un precio enviado por el cliente | Alto: venta bajo costo | Shopify es la fuente de verdad; el frontend solo representa estado. §209 | `VERIFICADO` |
| Integridad de inventario | Oversell | Confiar en stock del cliente, o doble fuente de verdad con Dropi | Medio-alto: RTO y reputación | Una sola fuente de verdad; `inventory_policy` explícito. §210 | `VERIFICADO` |
| Tokens de API | Robo de token privado | Token privado en código de cliente o en el repositorio | Alto | Token **público** para cliente; **privado** solo servidor. Secretos en variables de entorno, nunca en Git. §201, §202 | `VERIFICADO` |
| Integridad del storefront | XSS | Contenido no confiable renderizado sin escapar; script de tercero | Alto | Escapar en el contexto exacto de salida; CSP donde sea posible; auditar terceros | `VERIFICADO` |
| Checkout y pagos | Cualquiera | — | Crítico | **No se toca.** Shopify lo gestiona. §200 | `VERIFICADO` |
| Cuenta de cliente | Credential stuffing | — | Medio | Shopify gestiona autenticación. No construir login propio | `VERIFICADO` |
| Webhooks (solo si se usan) | Spoofing, replay, duplicación | Endpoint que confía en el payload | Medio-alto | Verificar autenticidad, validar payload, idempotencia. §203, §204 | `VERIFICADO` como práctica; sin implementación que auditar |

### 6.2 Principios aplicados

| Principio | Aplicación concreta | Nivel |
| --- | --- | --- |
| Menor privilegio (§199) | El canal Headless comparte permisos entre todos sus storefronts → pedir **solo** los scopes necesarios | `VERIFICADO` |
| Sin secretos en el repositorio (§201) | `.gitignore` ya excluye `.env` y `.shopify/`. Ningún token en Liquid público, assets ni documentación | `VERIFICADO`, ya implementado |
| Entornos separados (§202) | development / staging / production. Oxygen admite 110 variables de entorno personalizadas | `VERIFICADO` |
| Dependencias mínimas (§205) | Cada dependencia se justifica por reputación, mantenimiento, vulnerabilidades, licencia, tamaño y necesidad real |  |
| Salida de IA como entrada no confiable | Es una recomendación explícita de la guía de seguridad de Shopify. Aplica a este propio trabajo | `VERIFICADO` |

### 6.3 CSP — la diferencia real entre opciones

| Opción | CSP | Nivel |
| --- | --- | --- |
| B · Hydrogen | `createContentSecurityPolicy` → `nonce`, `NonceProvider`, header; el componente `<Script>` añade el nonce solo | `VERIFICADO` |
| A · Theme | **No se encontró documentación** de control de headers de respuesta desde un theme | `NO VERIFICADO` — ausencia de evidencia, no prueba de imposibilidad |

Si el modelo de amenazas exige CSP con nonce, esto es un argumento objetivo a favor de B.
**No pretendo que sea concluyente sin verificarlo contra la plataforma.**

---

## 7. Arquitectura de rendimiento

### 7.1 Presupuesto y umbrales

| Métrica | Objetivo | Origen | Nivel |
| --- | --- | --- | --- |
| Lighthouse performance | ≥ 60 media en home/producto/colección, **desktop y mobile** | Umbral del Theme Store, usado aquí como suelo | `VERIFICADO` |
| Lighthouse accesibilidad | ≥ 90 media, desktop y mobile | Ídem | `VERIFICADO` |
| Ponderación de valor de negocio | colección 43 % · producto 40 % · home 17 % | Speed score de Shopify | `VERIFICADO` |
| Tareas largas | ninguna > 50 ms durante la carga | Guía de Shopify sobre INP | `VERIFICADO` |

El suelo de 60 es el **mínimo de aceptación de Shopify**, no la ambición. Para "competir con una
marca internacional" el objetivo de trabajo debería ser considerablemente más alto; fijar ese número
exacto es `PENDIENTE` de U3.

### 7.2 Método de medición (§188: no decir "optimizado" sin medir)

| Paso | Detalle | Nivel |
| --- | --- | --- |
| Throttling | CPU **4×** + red **Slow 4G** (1,6 Mbps ↓, 750 Kbps ↑, **150 ms RTT**), **simultáneos** | `VERIFICADO` |
| Repeticiones | 3 corridas por URL, usar la **mediana**; Chrome en incógnito | `VERIFICADO` |
| Preview | Añadir `pb=0` a la URL para apagar la barra de preview | `VERIFICADO` |
| Dispositivo real | Un Android de gama media (clase Moto G / Galaxy A) además del emulado | `VERIFICADO` |
| Campo vs laboratorio | RUM para decidir y verificar; Lighthouse para depurar y CI | `VERIFICADO` |

### 7.3 Reglas de implementación, por impacto verificado

| Regla | Métrica | Impacto |
| --- | --- | --- |
| Contenido esencial en HTML del servidor, **no** en JavaScript | LCP | Alto |
| Evitar loops anidados sobre productos/variantes/opciones (crecen cuadráticamente) | TTFB | Alto |
| Recursos de primer paint **antes** de `content_for_header` | FCP | Alto |
| `fetchpriority="high"` en la imagen LCP; **nunca** lazy-load en ella | LCP | Alto |
| No usar `background-image` CSS para contenido LCP | LCP | Alto |
| `sizes` mobile-first para no bajar imágenes de desktop en móvil | LCP | Alto |
| `preload` con moderación: 1 o 2 recursos que el navegador descubra tarde | LCP | Medio |
| Carga condicional por viewport con `import()` dinámico | INP | Medio |

Todas `VERIFICADO`. Nota: varias están expresadas en vocabulario de theme (`content_for_header`,
`image_url`), pero el principio subyacente aplica igual en headless.

### 7.4 Lo que la plataforma regala, y hay que no estropear

| Mecanismo | Condición de elegibilidad | Nivel |
| --- | --- | --- |
| **Streaming de HTML** | Plantilla **JSON** (las `.liquid` no), y `{{ content_for_header }}` como etiqueta simple, sin filtros, no dentro de snippet ni variable, dentro de `<head>` | `VERIFICADO` |
| **Early Hints** | Funcionan con páginas streameadas; llegan a partir de la segunda visita servida | `VERIFICADO` |

`INFERIDO`: esto empuja a que **todas** las plantillas del theme sean JSON, no `.liquid`, si se
elige la opción A. Es una decisión de arquitectura con efecto directo en FCP y LCP.

### 7.5 Presupuesto de assets (§219) — `PENDIENTE` de U3/U7/U8

Marcos verificados que acotan el presupuesto:

| Asset | Límite de plataforma | Nivel |
| --- | --- | --- |
| Modelo 3D como asset estático en Oxygen | 500 MB | `VERIFICADO` |
| Vídeo | 1 GB | `VERIFICADO` |
| Imagen | 20 MB | `VERIFICADO` |

Esos son **límites de la plataforma, no presupuestos**. Un presupuesto real para móvil es mucho
menor y debe fijarse con U3. Dejar el presupuesto sin fijar es la vía más común a una experiencia
lenta disfrazada de premium (§221).

---

## 8. Arquitectura de productos, variantes e inventario

### 8.1 El hecho que decide el modelo de datos

**Combined listings son exclusivas de Shopify Plus.** `VERIFICADO`.

La documentación usa precisamente un zapato como ejemplo: un zapato en tres colores y diez tallas,
con cada color como producto separado, se unifica en una sola página de producto mediante una
combined listing. Los productos hijos tienen **sus propias imágenes y su propio handle de URL**; el
producto padre no se puede comprar, no tiene inventario ni datos de ventas propios.

**En Advanced eso no está disponible.** Por tanto:

| Modelo | Viabilidad en Advanced | Consecuencia |
| --- | --- | --- |
| **Un producto por modelo**, opciones Color + Talla | ✅ Viable | Un handle y una URL por modelo. Imágenes a nivel de variante por color. **Sin URL propia por color** |
| Un producto por color, unificados en la página | ❌ Requiere combined listings (Plus) | — |
| Un producto por color, sin unificar | ⚠️ Técnicamente posible | URL y SEO por color, pero el selector de color hay que construirlo a mano y se fragmenta el producto |

**Recomendación técnica, `INFERIDO` sobre hechos verificados:** un producto por modelo con opciones
Color y Talla. Es lo nativo, lo mantenible y lo que no exige Plus. El costo aceptado es no tener URL
propia por color.

→ `PENDIENTE` de U5: si el SEO por color resulta estratégico (p. ej. "zapato X en blanco" como
consulta real de búsqueda), esto se revisa **antes** de cargar el catálogo, porque es irreversible.

### 8.2 Límites verificados

| Límite | Valor | Nivel |
| --- | --- | --- |
| Variantes por producto | **2.048** (desde el 15 de octubre de 2025; antes 100) | `VERIFICADO` en vivo: `resourceLimits.maxProductVariants` |
| **Opciones por producto** | **3** | `VERIFICADO` en vivo **y por prueba negativa**: `OPTIONS_OVER_LIMIT` |
| Ubicaciones de inventario | 10 | `VERIFICADO` en vivo |
| Apps que no usen las APIs GraphQL de producto vigentes | Pueden romperse o degradarse con más de 100 variantes | `VERIFICADO` (documentación) |

Las variantes van holgadas: 15 colores × 20 tallas = 300, muy por debajo de 2.048.

**Las opciones no.** Color + Talla consume 2 de 3, dejando **una sola** libre. Si N&E necesitara
además Ancho y Material, es imposible en un solo producto, y las combined listings que serían la
salida son solo Plus. Intenté añadir una cuarta opción y la API la rechazó con
`OPTIONS_OVER_LIMIT`. Evidencia en [`VERIFICATION-LOG.md`](VERIFICATION-LOG.md) §3.

→ **Gastar la tercera opción es una decisión irreversible del proyecto.** La candidata con más
impacto en RTO es **Ancho/horma**.

### 8.3 Mecanismos nativos para la página de producto

| Necesidad | Mecanismo nativo | Nivel |
| --- | --- | --- |
| Saber si una combinación existe y está disponible | **Calcular desde `variants[].selectedOptions`.** Ver la advertencia de abajo | `VERIFICADO` por ejecución |
| Swatches de color con **foto del material** | Metaobject estándar `shopify--color-pattern`, campo `image`. No es automático: hay que vincularlo | `VERIFICADO` por ejecución |
| Actualizar la página al cambiar variante sin recargar | **Section Rendering API** | `VERIFICADO` |
| Evitar sobrecarga con muchas variantes | Guía oficial "Avoid over-fetching product variants" y "Avoid deeply nested Liquid loops" | `VERIFICADO` |
| Guía de tallas estructurada y reutilizable | **Metaobjects** — el ejemplo oficial de la documentación es literalmente una guía de tallas (`size_chart`, `access: { storefront: PUBLIC_READ }`) | `VERIFICADO` |
| Consumir metaobjects desde secciones del theme | Tipos de setting `metaobject` y `metaobject_list` (desde octubre de 2024) | `VERIFICADO` |
| Datos sueltos de producto (materiales, horma, drop) | Metafields con `metafield_tag` | `VERIFICADO` |

**Esto cierra la pregunta de la guía de tallas sin construir nada:** metaobject de tipo `size_chart`
+ referencia desde el producto. No hace falta sistema propio, ni app, ni base de datos. Mecanismo
**ejecutado y verificado**; la receta lista para N&E está en
[`../shopify/footwear-data-model.graphql`](../shopify/footwear-data-model.graphql).

### 8.3.bis ⚠️ Trampa verificada: `hasVariants` no dice si una combinación existe

Probado con una matriz incompleta (un color disponible solo en 2 de 4 tallas):

`optionValues[].hasVariants` devolvió `true` para **todas** las tallas, incluidas las que no existen
para ese color. El campo indica si ese **valor de opción** lo usa alguna variante del producto, **no
si la combinación Color × Talla concreta existe**.

**Consecuencia:** un selector que use `hasVariants` ofrecerá tallas inexistentes. El conjunto de
combinaciones válidas se calcula **desde `variants[].selectedOptions`**, y la compra se decide con
`availableForSale`. Evidencia en [`VERIFICATION-LOG.md`](VERIFICATION-LOG.md) §4.

### 8.4 Inventario

| Mecanismo | Detalle | Nivel |
| --- | --- | --- |
| `variant.inventory_policy` | `deny` = dejar de vender sin stock · `continue` = seguir vendiendo. **`DENY` es el valor por defecto** | `VERIFICADO` por ejecución |
| Semántica de disponibilidad | rastreado + cantidad 0 + `DENY` ⇒ `availableForSale: false` | `VERIFICADO` por ejecución |
| `variant.inventory_quantity` | Si no se rastrea inventario, devuelve unidades vendidas | `VERIFICADO` |
| `variant.incoming` / `variant.inventory_management` | Inventario entrante y servicio de gestión | `VERIFICADO` |
| Estados de inventario | `incoming`, `on_hand`, `available`, `committed`, `reserved`, `damaged`, `safety_stock`, `quality_control`. Solo `available` es vendible | `VERIFICADO` |
| Webhooks de stock | `variants/in_stock`, `variants/out_of_stock` | `VERIFICADO` |

**Decisión de diseño `PENDIENTE` de U5/U9, y es importante:** `inventory_policy` debe elegirse
conscientemente por variante. Con `continue` se vende sin stock — cómodo en dropshipping, pero
genera RTO y rompe la promesa de marca de un footwear premium. `deny` protege la experiencia a costa
de perder ventas. **No lo decido yo**; lo que sí hago es dejar registrado que elegirlo por descuido
es la causa estructural del oversell (§210).

---

## 9. Flujo Shopify → carrito → checkout

### 9.1 El flujo, con lo que está verificado en cada paso

```
Producto en Shopify (fuente de verdad: precio, variantes, inventario)
        ↓
Storefront del cliente: selección de Color + Talla
   · product_option_value.available decide qué combinaciones se ofrecen
   · Section Rendering API actualiza sin recargar          [theme]
        ↓
Carrito
   · Theme:    carrito nativo de Shopify (no se maneja cart ID)
   · Headless: cartCreate / cartLinesAdd / cartLinesUpdate / cartLinesRemove
               cartBuyerIdentityUpdate para contexto del comprador
        ↓
checkoutUrl  (campo del objeto Cart, recuperable en cualquier momento)
        ↓
CHECKOUT REAL DE SHOPIFY  — intocable en Advanced
   · Sin UI propia en información/envío/pago (solo Plus)
   · Sin branding visual (solo Plus)
   · Shopify Functions SÍ: filtrar, renombrar y reordenar opciones de pago y envío
        ↓
Pedido
```

| Elemento | Nivel |
| --- | --- |
| La Checkout API está deprecada; el camino es la Storefront **Cart API** | `VERIFICADO` |
| `checkoutUrl` se obtiene del objeto `Cart` en cualquier punto del flujo | `VERIFICADO` |
| Cart ID = `<token>?key=<secret>`; sin la key se eliminan datos privados del comprador y las mutaciones fallan | `VERIFICADO` |
| Shopify puede cambiar formato y longitud de los cart tokens en cualquier momento → no asumir formato | `VERIFICADO` |
| El tráfico de compradores en la Storefront API **no tiene rate limit** | `VERIFICADO` |
| Existe un throttle de creación de checkouts por minuto → `200 Throttled`; exige cola con backoff exponencial | `VERIFICADO` |

### 9.2 Estados que la interfaz debe cubrir (§182, §214, §216)

`INFERIDO` del estándar, no de la plataforma:

| Estado | Comportamiento exigido |
| --- | --- |
| Variante no disponible | Visible pero no seleccionable, con motivo claro. No ocultarla en silencio |
| Producto agotado | Página funcional; sin botón muerto; alternativa ofrecida |
| Sin imagen / sin vídeo / sin modelo 3D | Degradación elegante, nunca hueco ni `undefined` |
| Fallo del 3D o de WebGL | Producto, precio y añadir al carrito siguen funcionando (§215) |
| JavaScript caído | El producto se puede ver y comprar, o al menos ver (§214) |
| `200 Throttled` al crear checkout | Reintento con backoff y mensaje humano, nunca error técnico |
| Conexión lenta | Contenido esencial primero; lo pesado después |
| `prefers-reduced-motion` | Motion reducido o anulado, sin romper la comprensión |

---

## 10. Flujo Shopify → Dropi

**Estado general: `NO VERIFICADO`.** Dropi es condicional por decisión del propietario, y sin cuenta
ni credenciales no hay nada que comprobar. Esta sección existe para dejar el hueco preparado y para
registrar lo que **no** se sabe.

### 10.1 Clasificación honesta (§186)

| Afirmación | Nivel |
| --- | --- |
| Dropi es una plataforma de dropshipping/fulfillment de origen colombiano con operación LATAM y contra entrega | `DOCUMENTADO` |
| Existe una app "Dropify" publicada por Dropi en el App Store que importa productos y crea el pedido en Dropi cuando Shopify crea una orden | `DOCUMENTADO` |
| Transportadoras en Colombia: Coordinadora, Envía, Servientrega | `DOCUMENTADO` |
| API propia con credenciales desde el panel | `NO VERIFICADO` |
| Endpoints, parámetros, autenticación, límites, idempotencia | `NO VERIFICADO` — **no se transcriben**: las fuentes son blogs y PDFs subidos a Scribd, no documentación oficial (§187) |
| Sincronización de inventario en tiempo real | `NO VERIFICADO` |
| Scopes que la app solicita a Shopify | `NO VERIFICADO` — `apps.shopify.com` está bloqueado en este entorno |

### 10.2 Lo que sí se puede afirmar sin verificar Dropi

`INFERIDO` sobre hechos verificados de Shopify:

1. **Dropi opera sobre la tienda, no sobre el frontend.** Si la integración ocurre vía la app, es
   una relación Dropi ↔ Shopify. **La elección de arquitectura del storefront es indiferente a
   Dropi.** Eso lo saca de la decisión de stack.
2. **El riesgo real es la doble fuente de verdad de inventario**, y existe con o sin verificar la
   API. Shopify ya ofrece el mecanismo para resolverlo: `inventory_policy` explícito y los webhooks
   `variants/in_stock` / `variants/out_of_stock`.
3. **Si alguna herramienta del flujo depende de script tags, muere el 1 de marzo de 2027.** Hay que
   auditarlo cuando exista la tienda; `scriptTags` sigue siendo consultable para ese inventario.
4. **No construir una plataforma alternativa a Dropi** — directiva de alcance explícita.

### 10.3 Lo que queda preparado, sin construir

| Preparación | Costo ahora |
| --- | --- |
| Una sola fuente de verdad de inventario, declarada y documentada | Cero: es una decisión, no código |
| `inventory_policy` elegido conscientemente por variante | Cero hasta que exista catálogo |
| Atributos de pedido pre-checkout (municipio, teléfono validado) como `attributes` del carrito | Bajo, y sirve igual sin Dropi |
| No asumir ningún campo ni endpoint de Dropi en el modelo de datos | Cero |

**Nada se marcará como "integrado con Dropi" hasta ejecutarlo contra una cuenta real** (§186, §188).

---

## 20. Qué debe ser nativo de Shopify y qué tendría sentido construir

El filtro de la directiva de alcance: *¿esto es realmente necesario para construir y operar
correctamente la página web?*

### 20.1 Nativo de Shopify — **no construir**

| Función | Mecanismo nativo | Nivel |
| --- | --- | --- |
| Catálogo, variantes, precios | Modelo de producto, hasta 2.048 variantes | `VERIFICADO` |
| Inventario y sus estados | Inventory states, `inventory_policy`, webhooks | `VERIFICADO` |
| Carrito | Carrito del theme, o Storefront Cart API | `VERIFICADO` |
| Checkout, pagos, pedidos, impuestos | Checkout de Shopify | `VERIFICADO` |
| Autenticación de clientes | Cuentas de Shopify | `VERIFICADO` |
| Contra entrega | Método de pago manual + Shopify Functions para filtrar opciones | `VERIFICADO` (Functions) / `DOCUMENTADO` (COD manual) |
| Guía de tallas estructurada | **Metaobject `size_chart`** | `VERIFICADO` |
| Datos extra de producto (materiales, horma) | Metafields | `VERIFICADO` |
| 3D y AR del producto | `model_viewer_tag` + Shopify-XR | `VERIFICADO` |
| Imágenes responsive y CDN | `image_url` / `image_tag` con `widths` y `sizes` | `VERIFICADO` |
| hreflang y SEO internacional | Automático, desactivable | `VERIFICADO` |
| `robots.txt` | Editable en el theme | `VERIFICADO` |
| Analítica de comportamiento y consentimiento | Web pixels + Customer Privacy API | `VERIFICADO` |
| Descuentos y promociones | Descuentos nativos + Shopify Functions | `VERIFICADO` |
| Precios y contenido por mercado | Market overrides (disponible en Advanced) | `VERIFICADO` |
| Control de versiones del theme | Integración de GitHub de Shopify | `VERIFICADO` |
| Fulfillment | Dropi, cuando corresponda | `DOCUMENTADO` |

### 20.2 Lo que sí tiene sentido construir nosotros

Solo esto. Y cada punto se justifica por marca, comprensión, producto, conversión o diferenciación
(§180):

| Construir | Por qué lo justifica |
| --- | --- |
| **La dirección de arte hecha código**: sistema tipográfico, escala, retícula, color, espaciado, ritmo | Es la identidad. Nadie más lo puede dar. §178, §231 |
| **La narrativa de producto**: cómo se presenta el zapato, composición, secuencia, cinematografía | Es el diferencial. §228 |
| **El selector de talla y color** con su feedback, estados y disponibilidad real | Es el punto exacto donde se gana o se pierde la conversión en footwear |
| **La experiencia de guía de tallas** (los datos son nativos; la experiencia no) | Es la palanca número uno contra el RTO en zapatos |
| **La presentación del 3D/AR** si U2 lo justifica (los mecanismos son nativos; el encuadre y la dirección no) | §180 |
| **Microinteracciones y transiciones** con una física única y consistente | §231, §232 |
| **Los estados**: carga, error, agotado, sin imagen, reduced motion | §182, §214, §216 |
| **La validación pre-checkout** de dirección y municipio para contra entrega | Obligado: la UI de checkout es solo Plus. Y es donde se combate el RTO |

### 20.3 Lo que queda explícitamente prohibido construir

ERP · CRM · gestión de inventario propia · sistema de pedidos propio · plataforma de fulfillment ·
sistema de pagos propio · alternativa a Shopify · alternativa a Dropi · checkout propio ·
autenticación propia · blockchain (§206) · cualquier servicio que no mejore la página.
