# Nathan & Esteban — Estrategias por área

**Fecha:** 2026-10-01
**Estado:** preparado antes de §1–172. Nada aquí exige cerrar el stack; todo aplica a cualquiera de
las opciones de [`ARCHITECTURE.md`](ARCHITECTURE.md) §5.

Leyenda de clasificación: ver [`REQUIREMENTS.md`](REQUIREMENTS.md).

---

## 11. Estrategia de footwear: tallas, colores, disponibilidad y RTO

### 11.1 El problema real del footwear

En zapatos, la talla es la causa principal de devolución. Con contra entrega el problema se
amplifica: el comprador no pagó nada, así que rechazar el paquete no le cuesta nada.

| Dato | Nivel |
| --- | --- |
| Colombia tendría la mayor adopción de contra entrega en Shopify del mundo (~57 % de compradores online) | `DOCUMENTADO` |
| Gestionar disponibilidad de contra entrega por municipio reduciría el RTO de ~40 % a ~20 % | `DOCUMENTADO` |
| La talla como causa principal de devolución en calzado | `INFERIDO` — conocimiento de categoría, sin fuente verificada aquí |

**Consecuencia:** la guía de tallas no es un detalle de UX. Es la palanca de margen del proyecto.
Una experiencia de talla excelente vale más, en dinero, que cualquier efecto visual.

### 11.2 Modelo de datos

Decidido por hechos (ver [`ARCHITECTURE.md`](ARCHITECTURE.md) §8): **un producto por modelo de
zapato, con opciones Color + Talla**, porque las combined listings son solo Plus. Límite de 2.048
variantes por producto, holgadísimo para footwear.

| Elemento | Mecanismo | Nivel |
| --- | --- | --- |
| Color | Opción de producto, con imágenes a nivel de variante | `VERIFICADO` |
| Talla | Opción de producto | `VERIFICADO` |
| Disponibilidad por combinación | `product_option_value.available` | `VERIFICADO` |
| Cambio de variante sin recargar | Section Rendering API | `VERIFICADO` |
| Medidas de la guía de tallas | Metaobject `size_chart` con `access: { storefront: PUBLIC_READ }` | `VERIFICADO` |
| Horma, materiales, drop, peso | Metafields | `VERIFICADO` |

**Costo aceptado:** sin URL propia por color. Si el SEO por color resulta estratégico, hay que
revisarlo **antes** de cargar catálogo, porque es irreversible (`PENDIENTE` de U5).

### 11.3 Reducción de RTO — qué se puede hacer, y dónde

Recordatorio de restricción verificada: **la UI dentro del checkout es solo Plus**. En Advanced todo
esto ocurre **antes** del `checkoutUrl`, en el storefront — que es donde tenemos control total de
diseño.

| Palanca | Dónde vive | Nivel |
| --- | --- | --- |
| Guía de tallas con medidas reales en cm, no solo equivalencias de número | Storefront, datos en metaobject | `VERIFICADO` el mecanismo |
| Medición en casa explicada bien (talón-punta, con instrucciones claras) | Storefront | diseño propio |
| Recomendación de talla según la medida introducida | Storefront, lógica de cliente sobre datos del metaobject | diseño propio |
| Aviso de horma: "calza estrecho / amplio / fiel" por modelo | Metafield por producto | `VERIFICADO` el mecanismo |
| Validación de teléfono y dirección antes del checkout | Storefront | diseño propio |
| Municipio: ofrecer contra entrega solo donde opera | Storefront + **Shopify Functions** para filtrar opciones de pago | `VERIFICADO` que Functions está en Advanced |
| Filtrar, renombrar y reordenar opciones de pago y envío | Shopify Functions | `VERIFICADO` |
| Transparencia de plazos y de qué pasa si no queda bien | Storefront, texto real | `PENDIENTE` de U11: **no inventar políticas** |

### 11.4 Lo que **no** se construye

Ni motor propio de recomendación de talla con machine learning, ni base de datos de medidas de pie,
ni sistema de gestión de devoluciones. La lógica de recomendación es aritmética simple sobre datos
que viven en metaobjects. Directiva de alcance.

---

## 12. Estrategia de 3D, WebGL, model-viewer y AR

### 12.1 El hecho que reencuadra la decisión

Shopify tiene 3D y AR **nativos**, y no son Three.js:

| Mecanismo | Detalle | Nivel |
| --- | --- | --- |
| `model_viewer_tag` | Filtro Liquid que emite un elemento `<model-viewer>` | `VERIFICADO` |
| `ModelViewer` en Hydrogen | Componente que usa `@google/model-viewer` v1.21.1, descargado **lazy** vía `<script type="module">` inyectado | `VERIFICADO` |
| Shopify-XR | AR Quick Look en Safari iOS, Scene Viewer en Android | `VERIFICADO` |
| Requisito de dispositivo para AR | iOS 13+ o Android 9+ | `VERIFICADO` |
| Guías UX oficiales | Badge 3D en thumbnail, control en media destacado, botón "View in your space" solo en dispositivos con AR, bajo el media destacado, sin tapar controles | `VERIFICADO` |
| Tipo de media de producto | `model`, filtrable con `product.media \| where: 'media_type', 'model'` | `VERIFICADO` |

### 12.2 Decisión escalonada, no binaria

Aplicando §180 (test de necesidad) y §217 (cada elemento pesado justifica su coste):

| Nivel | Qué es | Cuándo se justifica | Costo |
| --- | --- | --- | --- |
| **0 · Fotografía** | Secuencia fotográfica dirigida, con rotación por scroll si aporta | Siempre es el suelo. Un zapato bien fotografiado vende más que un 3D mediocre | Bajo |
| **1 · `<model-viewer>` nativo** | Girar el zapato, zoom, y **AR en el espacio real** | Cuando el comprador necesita entender volumen, perfil y proporción — habitual en calzado | Bajo: nativo, lazy, accesible, AR gratis |
| **2 · WebGL propio** | Escena con dirección de arte: materiales, luz, cámara, composición que `model-viewer` no puede expresar | **Solo si U2 lo exige**, y hay que defenderlo contra §180, §217, §218 y §222 | Alto: peso, GPU, batería, mantenimiento, accesibilidad |

### 12.2.bis Corrección — el 3D no se pre-decide como visor de producto

> **CORREGIDO el 2026-10-01 por indicación del propietario.** Había convertido el escalado de arriba
> en una recomendación implícita de quedarse en nivel 1 (`<model-viewer>`). Eso era yo optimizando
> coste **antes** de conocer el concepto creativo, y es exactamente el error inverso al que §226
> advierte: conformarse con la primera solución razonable.

La instrucción es clara: **la experiencia 3D debe responder al concepto creativo de la marca**, no
al revés. Por tanto:

| Lo que el escalado **sí** es | Lo que **no** es |
| --- | --- |
| Un mapa de costes y capacidades verificadas, para decidir con datos | Una recomendación de quedarse en el nivel barato |
| La garantía de que el nivel 0 nunca falta como suelo de degradación (§215, §216) | Un veto al WebGL propio |
| El recordatorio de que `model-viewer` trae AR, accesibilidad y lazy-load gratis | Una afirmación de que eso baste para N&E |

**Nivel 2 no está descartado: está sin decidir.** Si el concepto de marca exige una escena con
dirección de arte —materiales, luz, cámara, composición, narrativa— entonces `<model-viewer>` no la
expresa y el WebGL propio es la respuesta correcta, no un lujo. Lo que §217 y §218 exigen no es
evitarlo, es **presupuestarlo**: saber cuánto pesa, cuándo carga y qué pasa si falla.

Lo que sí es decisión cerrada, independientemente del nivel: los requisitos no negociables de §12.3.

**U2 queda abierto y es del propietario.** La pregunta precisa no es "¿3D sí o no?" sino
**¿qué debe sentir y entender el comprador que hoy no puede?** De esa respuesta sale el nivel, y el
presupuesto en MB sale después.

### 12.3 Requisitos no negociables para cualquier nivel de 3D

| Requisito | Origen |
| --- | --- |
| Si falla el 3D o WebGL, **producto, precio y añadir al carrito siguen funcionando** | §215 |
| Sin modelo 3D disponible, degradación elegante: nunca hueco, nunca `undefined` | §216 |
| Carga diferida: el 3D **nunca** bloquea el primer paint ni el LCP | §217, y es el comportamiento nativo de `ModelViewer` |
| `prefers-reduced-motion` respetado | §214, §223 |
| Presupuesto en MB fijado **antes** de modelar | §219 — `PENDIENTE` de U3/U8 |
| Botón AR solo en dispositivos compatibles | Guía UX oficial, `VERIFICADO` |
| Alternativa accesible al contenido 3D | §182 |

Nota de límites: Oxygen admite modelos 3D de hasta 500 MB como asset estático (`VERIFICADO`). **Eso
es un límite de plataforma, no un presupuesto.** Un `.glb` de 8 MB ya arruina una conexión 4G.

### 12.4 Lo que no se hace

Partículas, blobs, cursor personalizado sin propósito, parallax por defecto, glassmorphism
decorativo, ni una demo de Three.js disfrazada de página de producto (§179).

---

## 13. Estrategia de accesibilidad

### 13.1 Objetivo medible

Lighthouse accesibilidad **≥ 90** de media en home, producto y colección, **desktop y mobile**
(umbral del Theme Store, usado aquí como suelo). `VERIFICADO`.

### 13.2 Requisitos con números, no intenciones

Todos `VERIFICADO` desde los requisitos oficiales de theme:

| Requisito | Valor exacto |
| --- | --- |
| Contraste en cuerpo de texto | **4.5:1** |
| Contraste en texto > 18pt y elementos no textuales (bordes, iconos) | **3:1** |
| Target táctil para punteros | mínimo **24 × 24 px CSS** |
| Teclado | Todas las partes de la página, **incluida la navegación desplegable** |
| Foco | Estado de foco **visible** en todo elemento enfocable |
| Orden de foco | Igual al orden del DOM: arriba-abajo, izquierda-derecha |
| Imágenes | `alt` en todas; usar `image.alt` o `image_tag: alt:` |
| Formularios | ID único por input, y `label` con `for` coincidente |
| Encabezados | h1–h6 visualmente diferenciados entre sí |
| HTML | Válido |

### 13.3 Dónde chocará con "premium"

`INFERIDO`, y conviene decirlo antes de diseñar: la estética premium habitual —tipografía fina,
gris claro sobre blanco, texto pequeño, botones etéreos— **falla 4.5:1 y falla 24×24**. No es una
limitación molesta: es el gate que el propio estándar fijó en §182 y §223.

La salida no es bajar la ambición visual, es dirección de arte que consiga distinción con contraste
suficiente. Eso es diseño mejor, no diseño más pobre.

### 13.4 Edge cases obligatorios (§214)

`prefers-reduced-motion` · navegación solo con teclado · lectores de pantalla en el selector de
talla y color · pantalla pequeña y pantalla grande · zoom del navegador al 200 % · JavaScript caído.

---

## 14. Estrategia de SEO

### 14.1 Lo que la plataforma da

| Mecanismo | Nivel |
| --- | --- |
| Metadata SEO en el theme | `VERIFICADO` |
| `robots.txt` personalizable | `VERIFICADO` |
| **hreflang automático**, desactivable en Online store → Preferences → Social sharing and SEO | `VERIFICADO` |
| Objeto `localization` para construir hreflang a mano si se desactiva el automático | `VERIFICADO` |
| Advertencia oficial: no hardcodear dominios ni handles en hreflang, porque el handle cambia por idioma; cada URL localizada debe ser su propio canonical | `VERIFICADO` |
| Market overrides (contenido y precio por mercado) | `VERIFICADO`, disponible en Advanced |

En headless, **todo lo anterior hay que reimplementarlo**: sitemap, robots, canonical y hreflang.
`VERIFICADO` por ausencia: no hay equivalente automático documentado.

### 14.2 Datos estructurados

| Afirmación | Nivel |
| --- | --- |
| Shopify genera JSON-LD de producto automáticamente | `NO VERIFICADO` — no encontré documentación que lo afirme. **No lo doy por hecho** |
| Los datos estructurados de producto son responsabilidad del theme | `INFERIDO` |

→ Tarea: implementar JSON-LD de producto explícitamente (nombre, imagen, marca, oferta, precio,
moneda, disponibilidad) y verificarlo con una herramienta de resultados enriquecidos. No asumir que
viene gratis.

### 14.3 Discovery agéntico — hallazgo nuevo y relevante

Shopify tiene una capa de comercio agéntico documentada que no existía en el planteamiento clásico
de SEO:

| Elemento | Detalle | Nivel |
| --- | --- | --- |
| **UCP** (Universal Commerce Protocol) | Protocolo para que agentes de IA actúen en nombre del comprador | `VERIFICADO` |
| **Global Catalog MCP** | Permite a agentes de IA buscar productos **en todo el ecosistema Shopify**, agrupados por Universal Product ID (UPID) | `VERIFICADO` |
| **Storefront Catalog MCP** | Lo mismo, acotado a una sola tienda | `VERIFICADO` |
| Herramientas | `search_catalog`, `lookup_catalog`, `get_product` | `VERIFICADO` |
| Flujo agéntico | descubrimiento → carrito → checkout → pedidos | `VERIFICADO` |
| Universal Cart API | En lista de espera de acceso temprano | `VERIFICADO` |
| El ejemplo oficial de la documentación | Es literalmente un zapato: *"Trail Runner Pro"*, con opciones Size y Color, categoría `Sporting Goods > Athletics > Running > Shoes` | `VERIFICADO` |

**Lo importante, y encaja con la directiva de alcance:** esto **no se construye**. Se obtiene
estructurando bien el producto en Shopify — título, descripción, categoría de taxonomía, opciones,
variantes, SKU, imágenes con alt, precio. Es un argumento más para que Shopify sea la fuente de
verdad y para no inventar un modelo de datos propio.

`INFERIDO`: un catálogo mal estructurado es invisible para esta capa. Un catálogo bien estructurado
aparece sin trabajo extra.

### 14.4 Riesgo de SEO ya identificado

**Oxygen no admite proxies por delante de sus despliegues**: Shopify advierte que entran en
conflicto con su mitigación de bots y **causan problemas de SEO**. `VERIFICADO`. Si se elige la
opción B, esto condiciona el DNS y descarta meter un CDN o WAF intermedio.

---

## 15. Estrategia de analytics

### 15.1 Mecanismo nativo

| Elemento | Detalle | Nivel |
| --- | --- | --- |
| **Web pixels** | Corren en **sandbox seguro**, no en el DOM. Superficie: `analytics`, `browser` (cookie, localStorage, sessionStorage en el top frame), `customerPrivacy`, `init`, `settings` | `VERIFICADO` |
| Disponibilidad | Todos los planes excepto Starter → **sí en Advanced** | `VERIFICADO` |
| **Customer Privacy API** | Respeta consentimiento automáticamente. En regiones de consentimiento obligatorio los callbacks se ejecutan **solo tras el consentimiento** y entonces **se reproducen los eventos previos** | `VERIFICADO` |
| Estados de consentimiento | `analyticsProcessingAllowed`, `marketingAllowed`, `preferencesProcessingAllowed`, `saleOfDataAllowed` | `VERIFICADO` |
| Matiz | **No** se puede llamar a la Customer Privacy API desde un web pixel *app* extension; los custom pixels sí, vía `api.customerPrivacy` | `VERIFICADO` |
| En Hydrogen dev preview | Analytics y consentimiento vía ShopifyScripts, con soporte del banner de privacidad de Shopify | `VERIFICADO` |

### 15.2 La trampa de medir con contra entrega

`INFERIDO`, y es importante: **"pedido creado" ≠ "pedido pagado"**. Con contra entrega el ingreso se
confirma días después, y una parte se pierde por RTO.

Si se mide conversión como se mide por defecto, los números mienten en la dirección optimista. Las
métricas que importan en este modelo:

| Métrica | Por qué |
| --- | --- |
| Pedidos creados | Señal de funnel, no de ingreso |
| Pedidos **entregados y pagados** | El ingreso real |
| Tasa de RTO, segmentada por municipio | Donde está el dinero que se escapa |
| Devoluciones por talla, por modelo | Valida o refuta la guía de tallas |
| Uso real de la guía de tallas y del 3D | **Decide si el 3D se queda o se elimina** (§180, §227) |

Ese último punto cierra el círculo del estándar: si el 3D no se usa, §227 obliga a eliminarlo. Hace
falta medirlo para poder cumplirlo.

### 15.3 Lo que no se construye

Ni data warehouse, ni pipeline de eventos propio, ni dashboard de BI. Shopify ya trae analítica y
ShopifyQL. Directiva de alcance.

---

## 16. Estrategia de testing y regresión

### 16.1 Herramientas nativas — esto es higiene, no infraestructura (resuelve C7)

| Herramienta | Qué hace | Nivel |
| --- | --- | --- |
| **`shopify theme check`** | Linter oficial de Liquid. Detecta problemas que afectan a **todos los Core Web Vitals**: scripts que bloquean el parser sin `defer`/`async`, assets remotos en dominios externos, falta de `preconnect` al CDN de Shopify, `img` sin `width`/`height`, paginación excesiva. Checks opcionales añaden límites de tamaño de CSS y JS | `VERIFICADO` |
| Instalación | `npm install -g @shopify/cli` — Theme Check viene incluido | `VERIFICADO` |
| En CI | `- run: shopify theme check` | `VERIFICADO` |
| `--auto-correct` | Corrige automáticamente lo corregible | `VERIFICADO` |
| `shopify theme dev` | Preview con hot reload de CSS y secciones | `VERIFICADO` |
| `shopify theme console` | REPL de Liquid | `VERIFICADO` |
| Editor | Integración con VS Code vía Liquid language server | `VERIFICADO` |
| Lighthouse CI | `npx lighthouse {url} --output json` | `VERIFICADO` |

**Nota de entorno:** Shopify CLI **no está instalado** en este contenedor (`VERIFICADO`). Hay que
instalarlo cuando empiece la implementación.

### 16.2 Benchmark reproducible de Shopify

| Paso | Detalle | Nivel |
| --- | --- | --- |
| 1 | Development store nuevo en cuenta de Partner, separado de producción | `VERIFICADO` |
| 2 | Importar el CSV de productos de prueba estandarizado de Shopify | `VERIFICADO` |
| 3 | Obtener preview link (`shopifypreview.com`), accesible sin contraseña | `VERIFICADO` |
| 4 | Añadir `pb=0` a cada URL | `VERIFICADO` |
| 5 | Lighthouse en home, producto y colección; 3 corridas, mediana, incógnito | `VERIFICADO` |
| 6 | Umbral: media ≥ 60 performance y ≥ 90 accesibilidad, desktop y mobile | `VERIFICADO` |

Esto aísla el rendimiento del theme del contenido de la tienda. Es exactamente lo que necesitamos
mientras N&E no tenga catálogo real.

### 16.3 Regresión (§196) — qué revisar tras cada cambio

Pregunta obligatoria: **¿qué podría haber roto este cambio?**

| Si se toca… | Probar específicamente |
| --- | --- |
| Selector de variante | Todas las combinaciones color × talla, incluidas las no disponibles |
| Carrito | Añadir, actualizar cantidad, eliminar, carrito vacío, y llegar al `checkoutUrl` |
| Página de producto | Producto sin descripción, sin imagen, sin vídeo, sin modelo 3D, agotado |
| 3D | Que su fallo **no** rompa producto, precio ni añadir al carrito (§215) |
| Imágenes | `sizes` en móvil, imagen LCP sin lazy-load, `width`/`height` presentes |
| Cualquier JavaScript | Rendimiento en CPU 4× + Slow 4G, y comportamiento con JS caído |
| Navegación | Teclado completo, orden de foco, foco visible |
| Motion | `prefers-reduced-motion` |
| Plantillas | Que sigan siendo JSON para conservar el streaming de HTML |

### 16.4 Lo que no se construye

Ni framework de testing propio, ni suite de E2E elaborada antes de que exista la página. Theme Check
+ Lighthouse en CI + la lista de regresión de arriba cubren el riesgo real con costo mínimo.

---

## 17. Estrategia de despliegue y GitHub

### 17.1 Hecho verificado de este entorno

**La conexión MCP de Shopify no tiene ninguna herramienta de theme ni de despliegue.** Lee y modifica
datos de commerce; no puede leer ni escribir un archivo de theme, publicar un theme, desplegar
Hydrogen ni desplegar extensiones. `VERIFICADO` por búsqueda exhaustiva del registro de herramientas.

El despliegue pasa por otra vía.

### 17.2 Integración de GitHub de Shopify para themes (opción A)

| Característica | Detalle | Nivel |
| --- | --- | --- |
| Sincronización | **Bidireccional**: la rama actualiza el theme, y los cambios hechos en el admin se comitean a la rama | `VERIFICADO` |
| Alcance de los commits de Shopify | Editor de themes, editor de código, y apps de theme instaladas | `VERIFICADO` |
| Formato del commit | `Update from Shopify for theme <X>` / `Committed from shop: <Y>` / `Theme last edited by: <Z>` | `VERIFICADO` |
| Agrupación | Ediciones guardadas en ~10 s se agrupan en un commit; el nombre es el del último que guardó | `VERIFICADO` |
| **No se puede desactivar** | *"Files are updated in GitHub whenever changes are made to a connected theme. This can't be disabled."* | `VERIFICADO` |
| Estructura | **Solo soporta la estructura de carpetas por defecto de un theme de Shopify** | `VERIFICADO` |
| Con build pipeline | Hace falta una **rama de deploy separada** con el código compilado | `VERIFICADO` |
| Estrategia de ramas recomendada | Conectar `main` a la tienda y publicarlo. Ramas no-main para campañas, publicables temporalmente | `VERIFICADO` |
| **Irreversibilidad** | **No se puede reconectar una rama a un theme tras desconectarla: al reconectar se añade como un theme nuevo** | `VERIFICADO` |
| Permisos | Cuenta con permiso *Manage themes* o *Themes* | `VERIFICADO` |
| Riesgo de organización | Cualquier miembro de la organización de GitHub con ese permiso puede **ver** los repos a los que la app tiene acceso → conceder acceso **solo** a los repos necesarios | `VERIFICADO` |

**Tres consecuencias prácticas:**

1. Si se elige A, **este repositorio puede conectarse directamente a la tienda**. Encaja con el flujo
   de ramas que ya usamos.
2. La sincronización bidireccional obligatoria significa que **cualquier edición en el admin
   aparecerá como commit**. Hay que asumirlo en la disciplina de ramas, no pelearlo.
3. **Conceder a la app de GitHub de Shopify acceso solo a este repositorio**, nunca a la organización
   completa. Principio de menor privilegio (§199).

### 17.3 Despliegue en opción B (Hydrogen + Oxygen)

| Elemento | Detalle | Nivel |
| --- | --- | --- |
| Hosting | Oxygen, **incluido sin cargo extra** en planes pagos (incluido Advanced) | `VERIFICADO` |
| En development stores | Disponible desde el 3 de agosto de 2026, pero **sin entornos públicos**: las URLs exigen login de la tienda | `VERIFICADO` |
| Runtime | workerd de Cloudflare. Algunas APIs de Node.js **no** disponibles | `VERIFICADO` |
| Límites | Worker ≤ 10 MB · startup ≤ 400 ms · 128 MB RAM · 30 s CPU/request · 110 env vars · requests salientes ≤ 2 min | `VERIFICADO` |
| **Sin proxies por delante** | Rompen la mitigación de bots y causan problemas de SEO | `VERIFICADO` |
| Alternativa | Self-hosting en Vercel, Netlify, Fly.io o Cloudflare Workers | `VERIFICADO` |

### 17.4 Entornos (§202)

development → staging → production, con secretos separados y **nunca** secretos de producción en el
código. En Oxygen, 110 variables de entorno personalizadas por entorno (`VERIFICADO`).

### 17.5 Pendiente

El pipeline concreto es `PENDIENTE` del stack (U1–U3). Lo que **no** está pendiente: el repositorio
no debe conectarse a ninguna tienda hasta que exista la tienda de N&E y se haya elegido el stack,
porque desconectar una rama es irreversible.

---

## 18. Riesgos técnicos y operativos

| # | Riesgo | Prob. | Impacto | Mitigación | Nivel |
| --- | --- | --- | --- | --- | --- |
| R1 | **RTO alto por talla equivocada** con contra entrega | Alta | Alto: se come el margen | Guía de tallas excelente, recomendación por medida, aviso de horma, validación pre-checkout | `DOCUMENTADO` el fenómeno |
| R2 | **Doble fuente de verdad de inventario** (Dropi + Shopify) → oversell | Media-alta | Alto | Una sola fuente declarada; `inventory_policy` consciente; webhooks de stock | `VERIFICADO` el mecanismo |
| R3 | **Elegir headless por moda** y cargar con reimplementar streaming, Early Hints, SEO y hreflang | Media | Alto | La decisión se toma contra los 13 criterios, no por atractivo técnico. §5.3 de `ARCHITECTURE.md` desmonta el argumento falso | `VERIFICADO` |
| R4 | **Diseñar asumiendo capacidades de Plus** que Advanced no tiene | Media | Alto | Restricción ya registrada: checkout intocable, combined listings no disponibles | `VERIFICADO` |
| R5 | **3D que arruina el móvil**: `.glb` pesado, GPU, batería | Media | Alto | Escalado 0→1→2, presupuesto en MB antes de modelar, carga diferida, degradación | `VERIFICADO` los mecanismos |
| R6 | **Script tags muertos el 1 mar 2027** en apps de terceros del stack | Media | Medio, con fecha fija | Auditar con la query `scriptTags` cuando exista tienda; exigir app embed o web pixel | `VERIFICADO` |
| R7 | **Secret key del carrito expuesta** en una arquitectura headless mal planteada | Baja-media | Alto | Nunca en cliente; en opción A no se maneja el cart ID | `VERIFICADO` |
| R8 | **Fallar el gate de accesibilidad 90** por estética de bajo contraste | Media-alta | Medio | Contraste y target táctil como restricción de diseño desde el primer día, no auditoría final | `VERIFICADO` los números |
| R9 | **Desconectar una rama de GitHub por error** → el theme no se puede reconectar, se duplica | Baja | Medio | No conectar hasta tener stack y tienda; documentar que es irreversible | `VERIFICADO` |
| R10 | **Proxy delante de Oxygen** rompiendo SEO y mitigación de bots | Baja | Alto | Prohibido por documentación; registrado | `VERIFICADO` |
| R11 | **Cifras de costo erróneas** por venir de fuentes secundarias | Media | Medio | Confirmar con la facturación real antes de modelar margen | `DOCUMENTADO` |
| R12 | **Modelo de producto irreversible mal elegido** (producto por modelo vs por color) | Media | Alto | Decidir antes de cargar catálogo; combined listings no son opción sin Plus | `VERIFICADO` |
| R13 | **No medir el uso del 3D** y quedarse con un coste que no aporta | Media | Medio | Instrumentar su uso desde el principio; §227 obliga a eliminarlo si no se usa | `INFERIDO` |
| R14 | **Lanzar sin textos legales reales** (envíos, devoluciones, garantía) | Media | Alto: legal y confianza | Placeholder explícito; **nunca inventar políticas** (§191) | regla aplicada |
| R15 | **Apps de terceros que degradan el rendimiento** con scripts síncronos | Media | Medio | Auditar cada app; Theme Check detecta scripts que bloquean el parser | `VERIFICADO` |

---

## 19. Costos recurrentes potenciales

**Todo `DOCUMENTADO`, no verificado:** `help.shopify.com` y `shopify.com` están bloqueados por la
política de egress de este entorno. Confirmar antes de modelar margen.

### 19.1 Coste de plataforma

| Concepto | Importe | Nivel |
| --- | --- | --- |
| Shopify Advanced | 399 USD/mes, o ~299 USD/mes con facturación anual (−25 %) | `DOCUMENTADO` |
| Comisión a pasarela de pago externa en Advanced | 0,6 % | `DOCUMENTADO` |
| **Oxygen** | **0 USD** — incluido sin cargo extra en planes pagos | `VERIFICADO` |
| Métodos de pago **manuales** (contra entrega, transferencia) | **Exentos** de la comisión de pasarela externa | `DOCUMENTADO` — **materialmente relevante** |

### 19.2 El cruce que cambia el cálculo

`INFERIDO` sobre los dos datos anteriores: si el grueso del volumen es contra entrega y los métodos
manuales están exentos, la comisión de 0,6 % de Advanced aplica a **mucho menos volumen del que
parece**. Entonces Advanced se justifica por **capacidades** (Shopify Functions, market overrides,
doble rate limit del Admin API) y no por ahorro de comisión.

Si en cambio el volumen de tarjeta es alto, la comisión pasa a ser el factor dominante y hay que
sumar además la comisión propia de la pasarela colombiana. **Las dos ramas son muy distintas y
ninguna está verificada.**

### 19.3 Costes variables según decisiones pendientes

| Concepto | Cuándo aparece | Nivel |
| --- | --- | --- |
| Hosting adicional (Vercel/Netlify/Cloudflare) | Solo si se autoaloja en vez de usar Oxygen | `VERIFICADO` que Oxygen evita este coste |
| Pasarela colombiana (PSE, Nequi, Daviplata, Efecty) | Comisión propia, además de la de Shopify | `DOCUMENTADO` |
| Apps de terceros (contra entrega por municipio, upsell, reseñas) | Según lo que no se resuelva nativamente | `PENDIENTE` |
| Producción de modelos 3D | Solo si U2 justifica nivel 1 o 2 | `PENDIENTE` de U8 |
| Producción fotográfica | Casi con seguridad necesaria | `PENDIENTE` de U7 |
| Dominio | Anual | `PENDIENTE` de U10 |
| Fulfillment Dropi | Según su modelo comercial | `NO VERIFICADO` |

### 19.4 Coste que el proyecto evita deliberadamente

Al no construir ERP, CRM, inventario, pedidos, pagos ni fulfillment propios, el proyecto evita el
coste recurrente más caro de todos: **mantener software que Shopify ya mantiene gratis**. Es el
argumento económico de la directiva de alcance, y es correcto.
