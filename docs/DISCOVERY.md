# EnergyX — Master Discovery: base de hechos de plataforma

**Fecha:** 2026-10-01
**Propósito:** base factual para la decisión de arquitectura. **No contiene la recomendación final**
(§192: requiere los requisitos de §1–172, aún no incorporados).

---

## 0. Método y fiabilidad de fuentes

Clasificación según §186/§187. Nada se eleva a `VERIFIED` sin evidencia directa.

| Nivel | Significado en este documento |
| --- | --- |
| `VERIFIED` | Leído directamente de documentación oficial de Shopify (shopify.dev) vía el conector MCP de Shopify, que devuelve el contenido y la URL de origen. |
| `DOCUMENTED` | Fuente secundaria plausible (blogs del sector, agregadores, snippets de buscador). No comprobado contra fuente primaria ni contra un sistema real. |
| `UNVERIFIED` | No se pudo comprobar. |

### Hosts bloqueados por la política de egress de este entorno

No fue posible abrir directamente:

| Host | Consecuencia |
| --- | --- |
| `shopify.dev` | Sin lectura directa del navegador. **Mitigado**: el conector MCP de Shopify devuelve el mismo contenido con su URL. |
| `help.shopify.com` | Sin verificación primaria de facturación, comisiones y planes. |
| `apps.shopify.com` | **Sin auditoría del listado oficial de la app de Dropi** ni de sus scopes declarados. |

Por eso **costos, comisiones y todo lo relativo a Dropi quedan en `DOCUMENTED`**, nunca en `VERIFIED`.

### Dos vocabularios, y por qué conviven

Este documento y `STATUS.md` usan los términos en inglés **tal como los define §186 y §235 del
estándar** (`VERIFIED`, `DOCUMENTED`, `UNVERIFIED`, `PLACEHOLDER`, `PARTIAL`). No se renombran
porque son las palabras del propio estándar.

`REQUIREMENTS.md`, `ARCHITECTURE.md` y `STRATEGY.md` usan la clasificación en español solicitada
después, que añade dos niveles que el estándar no tenía. Equivalencia:

| Estándar (§186/§235) | Clasificación extendida | Significado |
| --- | --- | --- |
| `VERIFIED` | `VERIFICADO` | Comprobado por ejecución o documentación oficial |
| `DOCUMENTED` | `DOCUMENTADO` | Fuente secundaria, sin comprobar |
| — | **`INFERIDO`** | Deducción propia sobre datos verificados. Señalada, no presentada como hecho |
| `UNVERIFIED` | `NO VERIFICADO` | No se pudo comprobar |
| `PLACEHOLDER` | **`PENDIENTE`** | Decisión que depende de información que todavía no existe |

Los dos niveles añadidos son los más útiles: `INFERIDO` separa mi razonamiento de los hechos, y
`PENDIENTE` separa "no lo sé" de "falta decidirlo".

---

## 1. Plataforma de themes — `VERIFIED`

### Arquitectura

Capas: `layout` → `template` → `section groups` → `sections` → `blocks`. Las plantillas JSON
actúan solo como envoltorio de secciones; las plantillas Liquid contienen código.
([architecture](https://shopify.dev/docs/storefronts/themes/architecture),
[os20](https://shopify.dev/docs/storefronts/themes/os20))

### Límites de plataforma

| Límite | Valor |
| --- | --- |
| Plantillas JSON por theme | 1.000 |
| Secciones por plantilla JSON | 25 |
| Section groups por theme | 20 |
| Secciones por section group | 25 |
| Bloques por sección | 50 (reducible con `max_blocks`) |
| Bloques por plantilla JSON o section group | 1.250 |
| Profundidad de anidamiento de theme blocks | 8 niveles (excluyendo el nivel de sección) |
| Archivos en `blocks/` por theme | 300 |

Los bloques renderizados estáticamente con `{% content_for %}` no cuentan.
([limits](https://shopify.dev/docs/storefronts/themes/architecture/limits))

### Ventajas de rendimiento que da la plataforma gratis

Estas son **decisivas** y un storefront headless debe reimplementarlas por su cuenta:

**Streamed HTML responses.** Shopify hace streaming automático de páginas elegibles. Elegibilidad:

1. la página se renderiza desde una **plantilla JSON** (las `.liquid` todavía no se streamean);
2. el layout contiene `{{ content_for_header }}` como etiqueta de salida simple — sin filtros, no
   dentro de otra etiqueta ni de un snippet, no asignada antes a una variable;
3. `{{ content_for_header }}` está dentro de `<head>` y `</head>` viene después.

Los themes en preview, la barra de preview y el editor de themes **no** se streamean.
Lo que está por encima de `{{ content_for_header }}` llega al navegador antes de que se rendericen
las secciones: hojas de estilo, fuentes y scripts se descargan mientras corre Liquid → FCP y LCP
más tempranos.

**Early Hints.** Funcionan con páginas streameadas. Tras la primera vez que Shopify sirve una
página, las visitas posteriores reciben los preload hints antes del HTML.
([platform](https://shopify.dev/docs/storefronts/themes/best-practices/performance/platform))

### SEO nativo

Metadata, `robots.txt` personalizable, **hreflang automático** (desactivable en
Online store → Preferences → Social sharing and SEO), objeto `localization`.
([seo](https://shopify.dev/docs/storefronts/themes/seo),
[hreflang](https://shopify.dev/docs/storefronts/themes/seo/hreflang))

---

## 2. Headless — `VERIFIED`

### Hydrogen actual

Hydrogen **ya no es Remix**: los proyectos Hydrogen son **apps de React Router**. Tres capas:
Hydrogen (SDK de primitivas de commerce), React Router (framework), Oxygen (hosting).
([fundamentals](https://shopify.dev/docs/storefronts/headless/hydrogen/fundamentals))

### Hydrogen developer preview — cambio estructural, y es *preview*

Anunciado el **17 de junio de 2026**: saca la lógica de commerce de React Router a un núcleo
**framework-agnostic**. Comparación textual de la propia documentación:

| | Hydrogen actual | Developer preview |
| --- | --- | --- |
| Qué es | Framework | SDK + Agent Skills |
| Framework | React Router | Cualquier framework JavaScript |
| Runtime | Oxygen o Node | Cualquier runtime JavaScript |
| Setup | `npm create @shopify/hydrogen@latest` | `npx @shopify/hydrogen@preview setup` |

Plantillas de arranque: React Router → Oxygen; Next.js → Vercel. Paths de setup para SvelteKit,
Nuxt, SolidStart. Bindings de Vue desde el 30 de julio de 2026 (`@shopify/hydrogen/vue`).

**Advertencia de la propia fuente:** *"Use current Hydrogen if you want Shopify's fully supported
path for building with React Router"* y *"This is an early developer preview, and we're looking for
your feedback as we keep building it out."*

→ **Riesgo registrado:** el preview no está presentado por Shopify como camino soportado para
producción. Usarlo en un lanzamiento real es una apuesta, no una optimización.
([developer-preview](https://shopify.dev/docs/storefronts/headless/developer-preview),
[changelog jun-17](https://shopify.dev/changelog/posts/hydrogen-developer-preview),
[changelog jul-30](https://shopify.dev/changelog/posts/hydrogen-developer-preview-update-july-30))

### Oxygen — costo y límites

**Oxygen está incluido sin cargo extra en los planes pagos:** Starter, Basic, Grow, Advanced, Plus,
Pause and build. **No está disponible en planes Agentic.** Disponible en development stores (desde
el 3 de agosto de 2026), Plus Partner Sandbox y planes trial — pero dev stores y trials **no
incluyen entornos públicos**, así que sus URLs de despliegue siempre exigen login de la tienda.

Runtime: basado en **workerd** de Cloudflare. APIs web estándar (Fetch, Cache, Streams, Web Crypto).
**Algunas APIs de Node.js no están disponibles.**

| Límite de Oxygen | Valor |
| --- | --- |
| Tamaño del worker | ≤ 10 MB |
| Startup time | ≤ 400 ms |
| CPU por request | 30 s |
| Memoria | 128 MB máx. (excederlo puede implicar requests descartadas) |
| Variables de entorno personalizadas | 110 |
| Requests salientes | deben completar en ≤ 2 min |
| Asset estático: imágenes | 20 MB |
| Asset estático: video | 1 GB |
| Asset estático: **modelos 3D** | **500 MB** |
| Asset estático: otros | 20 MB |

**Oxygen no soporta proxies por delante de los despliegues** — entran en conflicto con su
mitigación de bots y causan problemas de SEO.

Alternativa: **self-hosting** de Hydrogen en Vercel, Netlify, Fly.io, Cloudflare Workers.
([fundamentals](https://shopify.dev/docs/storefronts/headless/hydrogen/fundamentals),
[self-hosting](https://shopify.dev/docs/storefronts/headless/hydrogen/deployments/self-hosting))

### Storefront API

Versiones listadas: `2026-01`, `2026-04`, `2026-07`, `2026-10`, `unstable`.

**Modelo de tokens:**

| Tipo | Header | Uso |
| --- | --- | --- |
| Público | `X-Shopify-Storefront-Access-Token` | Navegador o app móvil; visible para el comprador |
| Privado | `Shopify-Storefront-Private-Token` | Solo servidor. **Debe tratarse como secreto; nunca en cliente** |

Máximo **100 storefront access tokens activos por tienda**. El canal **Headless** entrega tokens
público y privado automáticamente y centraliza permisos (todos los storefronts del canal comparten
los mismos permisos).

**Rate limits — dato decisivo:** *"Buyer traffic isn't rate-limited at all"* en la Storefront API.
Acceso tokenless: límite de complejidad de query de 1.000. Existe un **throttle de creación de
checkouts por minuto** que devuelve `200 Throttled` → requiere cola con backoff exponencial.
Admin API (distinta): 100 pts/s estándar, 200 Advanced, 1.000 Plus, 2.000 enterprise.
([storefront ref](https://shopify.dev/docs/api/storefront/2026-10),
[limits](https://shopify.dev/docs/api/usage/limits),
[admin rate limits](https://shopify.dev/docs/apps/build/apis/graphql-admin/rate-limits))

### Cart API — hallazgo de seguridad crítico

La Checkout API está **deprecada**; el camino es la **Storefront Cart API**: `cartCreate`,
`cartLinesAdd/Update/Remove`, `cartBuyerIdentityUpdate`, y `checkoutUrl` del objeto `Cart` para
enviar al checkout web de Shopify.

El **ID del carrito es `<token>?key=<secret>`**. Textual de la documentación:

> *"Never expose the secret part of the ID. Treat it like a password—don't include it in shareable
> links, public pages, or any client-side code."*

Sin la key, los datos privados del comprador se eliminan de la respuesta y las mutaciones fallan.
Shopify advierte además que **puede cambiar el formato y la longitud de los cart tokens en cualquier
momento** — no se debe asumir formato.

→ **Consecuencia arquitectónica:** un storefront headless que maneje datos privados del comprador
**necesita un servidor** que custodie la secret key. Una SPA puramente estática no cumple §201/§209.
([cart/manage](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart/manage),
[migrate](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart/migrate-to-cart-api/migrate-your-app))

### Cuarta vía: Storefront Web Components

Componentes HTML (`<shopify-store>`, `<shopify-context>`) que llevan productos, colecciones y
carrito con checkout a **cualquier sitio web**, sin escribir JavaScript complejo y **sin necesidad
del canal Headless**. Sin access token funcionan; se requiere token público solo para datos como el
conteo de inventario o datos personalizados.
([storefront-web-components](https://shopify.dev/docs/api/storefront-web-components),
[getting started](https://shopify.dev/docs/api/storefront-web-components/getting-started))

---

## 3. Checkout — matriz por plan, `VERIFIED`

Esto **acota lo que es posible** según el plan contratado. Textual de la tabla de tecnologías:

| Tecnología | Disponibilidad |
| --- | --- |
| Checkout UI extensions en pasos **information / shipping / payment** | **Solo Shopify Plus** |
| Extensions en **Thank you** y **Order status** | Todos los planes excepto Starter |
| Market overrides | Advanced |
| Checkout UI extensions post-purchase | Todos excepto Starter; en beta; en tienda real requiere solicitar acceso |
| **GraphQL Admin API — branding del checkout** (look and feel) | **Solo Shopify Plus** |
| **Shopify Functions** (lógica de backend) | **Todos los planes excepto Starter** |
| Web pixel extensions | Todos excepto Starter |

**Lectura que importa:** la *lógica* de checkout (ocultar/renombrar/reordenar opciones de pago y
de envío, máximos de pedido, reglas de ubicación, restricciones de fulfillment, puntos de recogida)
**sí es accesible sin Plus** vía Shopify Functions. Lo que es **exclusivo de Plus** es la *UI* en los
pasos de información/envío/pago y el **branding visual del checkout**.
([technologies](https://shopify.dev/docs/apps/build/checkout/technologies),
[delivery-shipping](https://shopify.dev/docs/apps/build/checkout/delivery-shipping))

### Calendario de deprecaciones — fechas duras

| Fecha | Qué ocurre | Estado |
| --- | --- | --- |
| 28 ago 2025 | `checkout.liquid` y additional scripts sunset en Thank you / Order status | pasado |
| 28 ago 2025 | Script tags sunset en esas páginas, tiendas **Plus** | pasado |
| **26 ago 2026** | Script tags sunset en esas páginas, tiendas **no-Plus** | pasado |
| **1 oct 2026** | `scriptTagCreate` / `scriptTagUpdate` devuelven user error; REST `ScriptTag` rechaza POST y PUT. **Aplica a todas las versiones de API — fijar versión no lo posterga** | **hoy** |
| **1 oct 2026** | Último día para actualizar extensiones de checkout basadas en componentes React (`2025-07` es la última versión que los soporta; después, Polaris web components) | **hoy** |
| **1 mar 2027** | Shopify **deja de inyectar script tags** en storefronts | futuro |

`checkout.liquid` ya está **sin soporte** para los pasos Information, Shipping y Payment.
`scriptTags` (query) y `scriptTagDelete` siguen funcionando, para auditar y limpiar.

Migración: script tag → **app embed block** dentro de un theme app extension; si el script solo
recoge analytics o conversión → **web pixel**.

→ **Riesgo a auditar en cualquier herramienta de terceros del stack** (widgets de WhatsApp,
contra-entrega, upsells, trackers LatAm): si depende de script tags, deja de funcionar el 1 de marzo
de 2027.
([script-tag-deprecation](https://shopify.dev/docs/apps/build/online-store/script-tag-deprecation),
[changelog](https://shopify.dev/changelog/posts/online-store-script-tags-deprecation),
[checkout-ui-extensions 2025-07](https://shopify.dev/docs/api/checkout-ui-extensions/2025-07))

---

## 4. 3D y AR — `VERIFIED`

Shopify tiene **3D nativo**, y no es Three.js:

- Tipo de media de producto `model`; filtro Liquid **`model_viewer_tag`** → emite un elemento
  **`<model-viewer>`**.
- En Hydrogen, el componente **`ModelViewer`** usa la librería **`@google/model-viewer` v1.21.1**,
  descargada de forma **lazy** mediante un `<script type="module">` inyectado dinámicamente.
- **AR**: librería **Shopify-XR** → AR Quick Look en Safari iOS y Scene Viewer en Android.
  Requiere **iOS 13+ o Android 9+**.
- Guías UX oficiales: badge de 3D en el thumbnail, control en el media destacado y botón
  **"View in your space"** solo en dispositivos con soporte AR, colocado debajo del media destacado,
  sin obstruir los controles de video/3D.

→ **Implicación para §180 y §218:** si la necesidad es *ver el producto en 3D/AR*, `<model-viewer>`
es el camino nativo, accesible y barato. Three.js/WebGL propio solo se justifica para escenas con
dirección de arte que `<model-viewer>` no puede expresar — y ese costo hay que defenderlo
explícitamente, no asumirlo.
([support-media](https://shopify.dev/docs/storefronts/themes/product-merchandising/media/support-media),
[media-ux](https://shopify.dev/docs/storefronts/themes/product-merchandising/media/media-ux),
[liquid model](https://shopify.dev/docs/api/liquid/objects/model),
[hydrogen ModelViewer](https://shopify.dev/docs/api/hydrogen/2025-07/components/media/modelviewer))

---

## 5. Performance y accesibilidad — benchmarks oficiales, `VERIFIED`

### Umbrales del Theme Store

Aplican como **requisito** solo si se publica en el Theme Store; para un theme propio son
**benchmark de calidad**, no una puerta.

- Performance: **media mínima de Lighthouse 60** en home, producto y colección, en **desktop y
  mobile**.
- Accesibilidad: **media mínima de Lighthouse 90** en las mismas tres páginas, desktop y mobile.
- Al verificar, las secciones deben tener imágenes y contenido reales; no pueden estar vacías.

**Speed score de Shopify** (media ponderada, distinta del umbral de aceptación):
home **17%**, producto **40%**, colección **43%**. El umbral de aceptación es la media simple.

### Requisitos de accesibilidad enumerados

Teclado en todas las partes de la página incluyendo navegación desplegable; estado de foco visible;
`alt` en todas las imágenes; inputs con ID único y labels con `for` coincidente; HTML válido;
contraste **4.5:1** en cuerpo de texto y **3:1** para texto >18pt y elementos no textuales;
orden de foco igual al orden del DOM; **target táctil mínimo 24×24 px CSS**; h1–h6 visualmente
diferenciados.

### Metodología mobile prescrita

- DevTools: CPU throttling **4×** (aproxima un Android medio clase Moto G Power) **+** red
  **Slow 4G** (1,6 Mbps bajada, 750 Kbps subida, **150 ms RTT**), ambos a la vez.
- Lighthouse: Chrome en incógnito, **3 corridas por URL**, usar la **mediana**, añadir `pb=0` a la
  URL para apagar la barra de preview.
- Dispositivo real además del emulado: thermal throttling, procesos de fondo y latencia táctil real
  solo aparecen en hardware.
- **"JavaScript execution cost is the single largest multiplier between desktop and mobile
  performance."**
- Tareas largas >50 ms bloquean el main thread y retrasan INP.
- RUM (campo) para decidir qué optimizar y verificar mejoras; Lighthouse (lab) para depurar y CI.

### Reglas de alto impacto

| Regla | Métrica | Impacto |
| --- | --- | --- |
| Renderizar contenido esencial en Liquid y HTML, **no** en JavaScript | LCP | Alto |
| Evitar loops Liquid profundamente anidados (crecen cuadráticamente con el catálogo) | TTFB | Alto |
| Cargar recursos de primer paint **antes** de `content_for_header` | FCP | Alto |
| Usar `preload` con moderación (compite con la priorización del navegador) | LCP | Medio |
| `fetchpriority="high"` en la imagen LCP; **nunca** lazy-load en la imagen LCP | LCP | — |
| No usar `background-image` CSS para contenido LCP | LCP | — |
| `sizes` mobile-first para no bajar imágenes de desktop en móvil | LCP | — |

([performance](https://shopify.dev/docs/storefronts/themes/best-practices/performance),
[testing](https://shopify.dev/docs/storefronts/themes/best-practices/performance/testing-for-performance),
[mobile](https://shopify.dev/docs/storefronts/themes/best-practices/performance/improve-mobile-page-load-speed),
[requirements](https://shopify.dev/docs/storefronts/themes/store/requirements))

---

## 6. Analytics y consentimiento — `VERIFIED`

**Web pixels** corren en un **sandbox seguro**, no en el DOM de la página. Superficie de la Standard
API: `analytics` (eventos de cliente), `browser` (cookie, localStorage, sessionStorage ejecutados
asíncronamente en el top frame), `customerPrivacy`, `init`, `settings`.

**Customer Privacy API:** señales de consentimiento respetadas automáticamente. En regiones donde el
consentimiento es obligatorio, los callbacks se ejecutan **solo después del consentimiento** y
entonces **se reproducen todos los eventos previamente registrados**. En regiones de opt-out, se
ejecutan hasta que el usuario se da de baja. Estado expuesto:
`analyticsProcessingAllowed`, `marketingAllowed`, `preferencesProcessingAllowed`, `saleOfDataAllowed`.

Matiz: **no se puede llamar a la Customer Privacy API desde un web pixel *app* extension**; los
custom pixels sí acceden vía `api.customerPrivacy`.

En el developer preview de Hydrogen, analytics y consentimiento se configuran vía **ShopifyScripts**,
con soporte del banner de privacidad de Shopify (desde el 30 de julio de 2026).
([about pixels](https://shopify.dev/docs/apps/build/marketing/pixels),
[standard api](https://shopify.dev/docs/api/web-pixels-api/standard-api),
[pixel privacy](https://shopify.dev/docs/api/web-pixels-api/pixel-privacy))

---

## 7. Seguridad — `VERIFIED`

**CSP en Hydrogen:** utilidad `createContentSecurityPolicy` → devuelve `nonce`, `NonceProvider` y el
valor del header. El componente `<Script>` añade el nonce automáticamente; `useNonce()` lo expone.
Directivas personalizables.

**CSP en un theme:** **no se encontró documentación** de control de headers de respuesta HTTP desde
un theme. Se registra como `UNVERIFIED` — ausencia de evidencia, no prueba de imposibilidad.
→ **Diferencial real a favor de headless** si el modelo de amenazas exige CSP con nonce.

**Guía oficial de buenas prácticas** (resumen textual del "short version"): tratar toda entrada
externa como no confiable **incluida la que viene de Shopify**; derivar la tienda y sus recursos de
una **sesión autenticada**, nunca de un parámetro de request; escapar contenido no confiable para el
contexto exacto de renderizado; **todo lo que se envía como parte de app o theme puede acabar
público**; no recoger PII sin consentimiento expreso y solo el mínimo; dependencias pocas, pinneadas
y revisadas; **tratar la salida de IA como entrada no confiable y darle la menor autoridad posible**;
poder revocar o rotar credenciales en minutos, no días.

Referencias que la propia guía adopta: OWASP Top 10, OWASP Cheat Sheet Series.
Contacto de incidentes: `security@shopify.com`.
([security best practices](https://shopify.dev/docs/apps/build/security/following-security-best-practices),
[hydrogen CSP](https://shopify.dev/docs/storefronts/headless/hydrogen/content-security-policy),
[createContentSecurityPolicy](https://shopify.dev/docs/api/hydrogen/2026-01/utilities/createcontentsecuritypolicy))

### Estados de inventario (fuente de verdad, §210)

`incoming`, `on_hand`, `available`, `committed`, `reserved`, `damaged`, `safety_stock`,
`quality_control`. `on_hand` = suma de los demás excepto `incoming`. Solo `available` es vendible.
([inventory](https://shopify.dev/docs/apps/build/orders-fulfillment/inventory-management-apps))

---

## 8. Costos — `DOCUMENTED`, **no verificado**

`help.shopify.com` y `shopify.com` están bloqueados por la política de egress de este entorno, así
que estas cifras provienen de agregadores del sector, no de fuente primaria. **Deben confirmarse
antes de usarse para decidir plan o modelar margen.**

| Plan | Mensual (mes a mes) | Anual (−25%) | Comisión a pasarela externa |
| --- | --- | --- | --- |
| Agentic | 0 USD | — | — |
| Starter | 5 USD | — | — |
| Basic | 39 USD | 29 USD | 2,0 % |
| Grow | 105 USD | 79 USD | 1,0 % |
| Advanced | 399 USD | 299 USD | 0,6 % |
| Plus | desde 2.300 USD (término de 3 años) | — | 0,20 % |

Nota verificada que cruza con esto: **Oxygen no está disponible en planes Agentic**, y en Starter no
hay Shopify Functions, web pixels ni extensiones de checkout.

### Pagos en Colombia — `DOCUMENTED`

| Hecho | Nivel |
| --- | --- |
| Shopify Payments **no** está disponible en Colombia; México sería el único país LATAM soportado | `DOCUMENTED` |
| Shopify Payments en ~39 países/regiones a junio de 2026 | `DOCUMENTED` |
| Pasarelas usadas en Colombia: PSE, Nequi, Daviplata, tarjetas, Efecty | `DOCUMENTED` |
| Los métodos de pago **manuales** (contra entrega, transferencia, efectivo) están **exentos** de la comisión por pasarela externa | `DOCUMENTED` — **materialmente relevante, confirmar** |
| Contra entrega se activa como **método de pago manual** en la configuración de Shopify | `DOCUMENTED` |
| Colombia tendría la mayor adopción de contra entrega en Shopify del mundo (~57 % de compradores online) | `DOCUMENTED` |
| Gestionar disponibilidad de contra entrega por municipio reduciría el RTO (devolución al origen) de ~40 % a ~20 % | `DOCUMENTED` |

**Por qué importa el cruce:** si Shopify Payments no opera en Colombia, toda venta con tarjeta pasa
por pasarela externa y paga la comisión de plan **además** de la de la pasarela. Si, en cambio, el
grueso del volumen es contra entrega y los métodos manuales están exentos, la comisión de plan deja
de ser el factor dominante y el plan se elige por **capacidades** (Functions, extensiones, market
overrides), no por porcentaje. **Las dos ramas llevan a planes distintos**, y ninguna está verificada.

### Asimetría de costo que sí está verificada

Oxygen está incluido sin cargo extra en los planes pagos. Un frontend propio en Vercel, Netlify o
Cloudflare añade una factura de hosting separada. Un theme no añade ninguna.

---

## 9. Dropi y Dropify — `DOCUMENTED` / `UNVERIFIED`

Sin cuenta ni credenciales, y con `apps.shopify.com` bloqueado, **nada de esto puede elevarse**.
Ver `STATUS.md` §4 para la tabla completa. Resumen:

| Afirmación | Nivel |
| --- | --- |
| Plataforma de dropshipping/fulfillment colombiana, operación LATAM, contra entrega | `DOCUMENTED` |
| App "Dropify" publicada por Dropi en el App Store; importa productos y crea el pedido en Dropi cuando Shopify crea una orden | `DOCUMENTED` |
| Transportadoras en Colombia: Coordinadora, Envía, Servientrega | `DOCUMENTED` |
| API propia con credenciales desde el panel (Configuración → Desarrolladores) | `UNVERIFIED` |
| Endpoints, parámetros, autenticación, límites, idempotencia | `UNVERIFIED` — **no se transcriben**: las fuentes son blogs y documentos subidos a Scribd, no documentación oficial (§187) |
| Sincronización de inventario en tiempo real Dropi → Shopify | `UNVERIFIED` |
| Scopes que la app solicita a Shopify | `UNVERIFIED` — listado del App Store inaccesible |

**Problema estructural ya identificable** (independiente de cómo funcione Dropi): si Dropi gestiona
el stock real y Shopify también lo muestra, hay **dos fuentes de verdad** y una ventana de
desincronización → riesgo de **oversell**. §210 exige elegir **una** fuente de verdad y definir el
comportamiento ante discrepancia. Esto es decisión de diseño, no de plataforma, y no depende de
verificar la API.

---

## 10. Opciones de arquitectura con sus restricciones reales

Las cuatro son viables. Lo que sigue son **restricciones verificadas**, no preferencias.

### Opción A — Theme Shopify (Liquid, Online Store 2.0)

| | |
| --- | --- |
| Gana gratis | Streaming de HTML, Early Hints, SEO nativo con hreflang automático, 3D y AR nativos vía `model_viewer_tag` + Shopify-XR, `robots.txt` editable, cero hosting adicional |
| Techo | Límites de plataforma (25 secciones/plantilla, 50 bloques/sección, 8 niveles); sin control documentado de headers HTTP → **CSP con nonce `UNVERIFIED`** |
| 3D | `<model-viewer>` nativo. WebGL propio es posible pero sin el soporte de plataforma |
| Costo | El más bajo: ningún hosting extra |
| Mantenibilidad | Más alta: editor de themes, un solo sistema, otro desarrollador lo reconoce (§233) |

### Opción B — Hydrogen actual (React Router) + Oxygen

| | |
| --- | --- |
| Gana | Control total del render; CSP con nonce (`createContentSecurityPolicy`); componente `ModelViewer`; Oxygen **sin cargo extra** en planes pagos |
| Cuesta | Reimplementar streaming, Early Hints, SEO, hreflang, sitemap, `robots.txt` por cuenta propia |
| Límites duros | Worker ≤10 MB, startup ≤400 ms, 128 MB RAM, 30 s CPU/request, 110 env vars, **sin proxies por delante** |
| Assets | Modelos 3D hasta 500 MB, video hasta 1 GB, imágenes 20 MB |
| Mantenibilidad | Requiere competencia en React Router + runtime workerd (algunas APIs de Node ausentes) |
| Soporte | **Camino plenamente soportado por Shopify** |

### Opción C — Hydrogen developer preview (framework libre) + hosting libre

| | |
| --- | --- |
| Gana | Cualquier framework JS y cualquier runtime; bindings de Vue; tooling de TypeScript para GraphQL; analytics y consentimiento vía ShopifyScripts; ships con skills para agentes |
| Riesgo | **Shopify lo presenta como early developer preview y pide feedback.** No es el camino soportado. Para un lanzamiento real esto es deuda de riesgo, no una ventaja (§188, §205) |
| Hosting | Vercel/Netlify/Cloudflare → factura separada |

### Opción D — Sitio propio + Storefront Web Components

| | |
| --- | --- |
| Gana | Libertad total de frontend con la menor superficie de código de commerce; funciona **sin** el canal Headless; sin token para lo básico |
| Cuesta | SEO, render y rendimiento enteramente propios; el carrito y su secret key siguen exigiendo cuidado servidor (§201) |
| Encaje | Fuerte cuando lo narrativo domina y el catálogo es pequeño |

### Restricciones transversales a las cuatro

1. **El checkout es de Shopify en todos los casos.** `cartCreate` → `checkoutUrl`. Ninguna opción
   permite un checkout propio sin reconstruir pagos, lo que §200 prohíbe sin razón técnica real.
2. **El branding visual del checkout es solo Plus.** Ninguna arquitectura lo cambia.
3. **La UI de checkout en pasos information/shipping/payment es solo Plus.** Sin Plus, toda
   validación de dirección/teléfono/municipio debe ocurrir **antes** del checkout, en el storefront
   — y eso sí es trabajo de frontend, en cualquiera de las cuatro opciones.
4. **Shopify Functions funciona sin Plus** (excepto Starter): filtrar y renombrar opciones de pago
   y envío, máximos de pedido, restricciones de fulfillment. Es la palanca real para contra entrega
   sin Plus.
5. **La secret key del carrito exige servidor** si se tocan datos privados del comprador.
6. **Script tags mueren el 1 de marzo de 2027** → cualquier dependencia de terceros que los use es
   deuda con fecha de vencimiento, en cualquier arquitectura.

---

## 11. Lo que falta para cerrar la decisión

### No lo puede resolver la investigación: debe venir del documento

| # | Input | Por qué decide la arquitectura |
| --- | --- | --- |
| 1 | **§1–172** | Requisitos, marca, producto y dirección de arte. Sin ellos no hay criterio de ponderación entre las cuatro opciones |
| 2 | Naturaleza real del 3D | *Ver el producto* (→ `<model-viewer>` nativo, barato, accesible, AR incluido) vs *escena con dirección de arte* (→ WebGL propio, y hay que defender el costo). Cambia la opción recomendada |
| 3 | Plan de Shopify contratado o presupuestado | Plus vs no-Plus decide si la UI del checkout y su branding están disponibles. No es una preferencia: es una puerta |
| 4 | Peso de contra entrega en el volumen esperado | Decide si la comisión de pasarela importa y, con ello, el plan óptimo |
| 5 | Quién mantiene el sistema después del lanzamiento | §233. Un desarrollador solo y Hydrogen/React Router es un riesgo distinto que un equipo |

### Se puede verificar en cuanto haya acceso

| # | Verificación | Requiere |
| --- | --- | --- |
| 6 | Tienda Shopify: plan activo, productos, variantes, inventario, países, métodos de pago | Re-autenticar el conector + dominio de la tienda |
| 7 | Comisiones reales y exención de métodos manuales | Fuente primaria de Shopify (bloqueada aquí) o la propia facturación de la tienda |
| 8 | Dropi: API real, scopes, idempotencia, sincronía de inventario | Cuenta y credenciales de Dropi |
| 9 | Auditoría de script tags existentes | Acceso a la tienda (`scriptTags` sigue consultable) |

### Se puede dejar en placeholder sin bloquear nada

Copys, nombres de colecciones, imágenes de relleno, textos legales, claims de producto — todos como
**placeholder explícito** (§191), nunca inventados.

---

## 12. Deuda y riesgos registrados en esta fase

| Riesgo | Origen | Severidad |
| --- | --- | --- |
| Elegir el developer preview de Hydrogen para producción | Shopify lo marca como early preview | Alta |
| Dos fuentes de verdad de inventario (Dropi y Shopify) → oversell | Diseño de integración | Alta |
| Dependencias de terceros basadas en script tags | Deprecación del 1 mar 2027 | Media, con fecha fija |
| Asumir que la UI del checkout es personalizable sin Plus | Restricción de plan | Alta si se planifica mal |
| Exponer la secret key del carrito en cliente | Arquitectura headless mal planteada | Alta |
| Cifras de costo tomadas de fuentes secundarias | Egress bloqueado a fuentes primarias | Media |
| WebGL propio sin justificar frente a `<model-viewer>` | §180, §217, §218 | Media |

---

## 13. La conexión a Shopify — qué permite realmente, `VERIFIED`

Comprobado por ejecución directa el 2026-10-01, no por documentación.

### Tienda conectada

| Campo | Valor |
| --- | --- |
| Nombre | **Magisik** |
| Dominio | `magisik.store` |
| **Plan** | **Basic** |
| Moneda | **COP** |
| País | **Colombia** |
| Zona horaria | −05 |

**La tienda conectada es Magisik, el proyecto anterior — no Nathan & Esteban.**

### Catálogo de la tienda conectada

Conteo exacto: **4 productos**. Todos de belleza/maquillaje (pestañina, estuche LED de maquillaje,
barra de color 3 en 1, trío iluminador). Vendor `Magisik`. 1 `ACTIVE`, 3 `UNLISTED`. Precios entre
20.000 y 79.999 COP. Última actualización: junio de 2026.

**Cero productos de footwear.** No existe dato real de producto de Nathan & Esteban accesible desde
esta conexión.

Observación: varias cantidades de inventario (999, 9.999, 9.991) tienen forma de stock ficticio de
dropshipping, no de inventario real. Relevante para §210 si alguna de esas prácticas se arrastrara
al proyecto nuevo.

### Consecuencias verificadas del plan Basic

Cruzando el plan real con la matriz de §3 de este documento:

| Capacidad | Disponible en Basic |
| --- | --- |
| Checkout UI extensions en **information / shipping / payment** | **NO** — solo Plus |
| Branding visual del checkout vía Admin API | **NO** — solo Plus |
| Market overrides | **NO** — requiere Advanced |
| **Shopify Functions** | **SÍ** — disponible en todos los planes excepto Starter |
| Extensions en Thank you / Order status | SÍ |
| Web pixels | SÍ |
| Oxygen (hosting de Hydrogen) | SÍ — incluido sin cargo extra en planes pagos |

→ **Decidido por los hechos, no por preferencia:** con Basic, toda validación de dirección,
teléfono y municipio para contra entrega debe ocurrir **antes** del checkout, en el storefront.
La *lógica* de filtrar y renombrar opciones de pago y envío sí es alcanzable vía Shopify Functions.

→ Colombia + COP confirma el escenario de §8: Shopify Payments no opera en Colombia (`DOCUMENTED`),
luego pasarela externa para tarjeta y contra entrega como método manual.

### Lo que la conexión puede leer

`get-shop-info`, `search_products`, `get-product`, `search_collections`, `get-collection`,
`get-inventory-levels`, `list-orders`, `get-order`, `list-customers`, `run-analytics-query`
(ShopifyQL), `search_docs_chunks` (documentación de shopify.dev — **funciona sin autenticar**),
`graphql_schema`, y `graphql_query` para cualquier recurso del Admin API sin herramienta dedicada
(metafields, metaobjects, pages, blogs, markets, translations, publications).

### Lo que la conexión puede modificar

`create-product`, `update-product`, `bulk-update-product-status`, `create-collection`,
`update-collection`, `add-to-collection`, `set-inventory`, `create-discount`, productos digitales,
y `graphql_mutation`.

### Lo que la conexión **no** puede hacer — límite duro

Verificado por búsqueda exhaustiva del registro de herramientas: **no existe ninguna herramienta de
gestión de themes**. No se puede leer ni escribir archivos de theme, ni publicar un theme, ni
desplegar una app Hydrogen, ni desplegar extensiones de checkout o app embeds.

La única herramienta adyacente, `get-new-store-previews`, lo dice explícitamente:
*"this tool cannot edit themes"* y *"previews can only be claimed as brand-new stores"*.

→ **El camino de build y deploy no pasa por esta conexión.** Pasa por:
Shopify CLI (**no instalado** en este entorno) + theme access token, o la **integración de GitHub
de Shopify** — que encajaría de forma natural con este repositorio. Para Hydrogen: Oxygen vía CLI o
GitHub Action, o Vercel/Netlify/Cloudflare si se autoaloja.

### `switch-shop` — no ejecutado a propósito

La herramienta existe, pero su propia definición advierte que **revoca el token de acceso de la
tienda actual** y obliga a autorizar de nuevo de forma interactiva. Esta sesión no puede ejecutar
un flujo OAuth. Llamarla sin confirmación arriesgaría perder el acceso a Shopify sin poder
recuperarlo desde aquí. **Requiere decisión del propietario.**

---

## 14. Decisiones cerradas por el propietario — 2026-10-01

Registradas aquí para no volver a preguntarlas (§193). Consecuencias derivadas de hechos ya
verificados en este documento, no de suposiciones.

### D-A. Nathan & Esteban **no tiene tienda Shopify todavía**

| Consecuencia | Nivel |
| --- | --- |
| No existe dato real de producto de N&E en ninguna parte accesible. El catálogo de footwear **se creará**, no se leerá | `VERIFIED` |
| El desarrollo necesita un **development store** de una cuenta de Partner | derivado |
| Oxygen **sí** funciona en development stores desde el 3 de agosto de 2026, pero sin entornos públicos: las URLs de despliegue exigen login de la tienda | `VERIFIED` (§2) |
| El benchmark de performance de Shopify se corre precisamente sobre un development store con un CSV de productos estandarizado | `VERIFIED` (§5) |
| Hasta que exista catálogo decidido, todo dato de producto va como **placeholder explícito** (§191): modelos, tallas, colores, materiales, precios, claims | regla aplicada |
| La conexión MCP **sí puede crear** productos, variantes, colecciones e inventario cuando llegue el momento | `VERIFIED` (§13) |

**Lo que esto no cambia:** la arquitectura. Se puede decidir y construir contra un development
store con productos placeholder, y conectar el catálogo real después. Lo que sí queda bloqueado es
cualquier afirmación sobre producto, precio o claim.

### D-B. Plan objetivo: **Shopify Advanced**

Cruzando con la matriz verificada de §3 y §13:

| Capacidad | En Advanced |
| --- | --- |
| **Market overrides** | **SÍ** — la documentación los sitúa exactamente en Advanced |
| **Shopify Functions** | **SÍ** |
| Extensions en Thank you / Order status | SÍ |
| Web pixels | SÍ |
| Oxygen sin cargo extra | SÍ (plan pago) |
| Rate limit del Admin API | **200 puntos/segundo** (el doble del estándar) |
| Comisión a pasarela externa | **0,6 %** (`DOCUMENTED`, sin verificar) |
| Checkout UI extensions en information / shipping / payment | **NO** — solo Plus |
| Branding visual del checkout vía Admin API | **NO** — solo Plus |

### Consecuencia arquitectónica firme de D-B

El checkout queda **visualmente intocable** y **sin campos propios**. No es una limitación a
sortear: es el perímetro del diseño.

Por tanto, y esto condiciona todo el proyecto:

1. **Toda la experiencia de marca ocurre antes del `checkoutUrl`.** El storefront es el único
   lienzo. La "checkout transition" que pide §231 es una transición *hacia* el checkout de Shopify,
   no un checkout propio.
2. **Toda validación de contra entrega ocurre pre-checkout.** Dirección, teléfono y municipio se
   validan en el storefront, donde sí hay control total de diseño. Esto deja de ser una concesión y
   pasa a ser una ventaja: es exactamente donde el RTO se combate (§8).
3. **La lógica de pago y envío sí es programable** vía Shopify Functions: filtrar, renombrar y
   reordenar opciones, máximos de pedido, restricciones de fulfillment.
4. **Market overrides disponibles** abren precios y contenido por mercado sin necesidad de Plus,
   lo que importa si N&E apunta a "marca internacional" más allá de Colombia.

### Lo que sigue bloqueando la recomendación final de arquitectura

Una sola cosa: **las secciones §1–172**, y dentro de ellas la naturaleza real de la necesidad de 3D.

La distinción es decisiva y ya está documentada en §4 y §11 de este documento:

| Si el 3D es… | Camino | Costo |
| --- | --- | --- |
| Ver el producto, girarlo, verlo en tu espacio | `<model-viewer>` + Shopify-XR, nativos | Bajo, accesible, con AR incluido |
| Una escena con dirección de arte que `model-viewer` no puede expresar | WebGL propio | Alto, y hay que defenderlo contra §180, §217 y §218 |

Ambos son posibles en las cuatro opciones de arquitectura de §10. Lo que cambia es **cuál de las
cuatro gana**, y eso depende del peso que §1–172 dé a cada criterio.
