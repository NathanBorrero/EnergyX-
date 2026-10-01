# Nathan & Esteban — Requisitos, contradicciones y reversibilidad

**Fecha:** 2026-10-01
**Alcance del proyecto:** construir **la página web / storefront de Nathan & Esteban**.
No un ERP, ni un CRM, ni un sistema de inventario, pedidos, fulfillment o pagos propio.
Todo lo que se construya debe justificarse por cómo mejora la página o su funcionamiento real
como storefront.

**Documentos hermanos:** [`STANDARD.md`](STANDARD.md) · [`DISCOVERY.md`](DISCOVERY.md) ·
[`ARCHITECTURE.md`](ARCHITECTURE.md) · [`STRATEGY.md`](STRATEGY.md) · [`STATUS.md`](STATUS.md)

## Leyenda de clasificación

| Etiqueta | Significado |
| --- | --- |
| `VERIFICADO` | Comprobado por ejecución directa o leído de documentación oficial de Shopify |
| `DOCUMENTADO` | Fuente secundaria plausible, sin comprobar contra fuente primaria ni sistema real |
| `INFERIDO` | Deducción propia a partir de datos verificados. Señalada como tal, no presentada como hecho |
| `NO VERIFICADO` | No se pudo comprobar |
| `PENDIENTE` | Decisión que depende de información que todavía no tengo |

---

## 1. Matriz de requisitos conocidos

### 1.1 Marca y experiencia

| Requisito | Fuente | Nivel |
| --- | --- | --- |
| Marca: Nathan & Esteban, footwear premium | Propietario | `VERIFICADO` |
| Identidad visual propia, no plantilla ni copia de otra marca | Propietario + §176–§178, §229 | `VERIFICADO` |
| Presentar los zapatos de forma espectacular; el producto manda | Propietario + §228 | `VERIFICADO` |
| Navegación premium; experiencia mobile-first | Propietario + §220 | `VERIFICADO` |
| "Premium" = dirección de arte + producto + fotografía/3D + tipografía + composición + interacción + velocidad + claridad + conversión | Propietario | `VERIFICADO` |
| "Premium" **no** = más animaciones + más WebGL + más efectos + más texto | Propietario | `VERIFICADO` |
| Competir visual y técnicamente con una marca internacional | Propietario | `VERIFICADO` |
| Un solo lenguaje de diseño en navegación, producto, carrito, estados y transiciones | §231, §232 | `VERIFICADO` |

### 1.2 Comercio

| Requisito | Fuente | Nivel |
| --- | --- | --- |
| Shopify es la fuente de verdad de producto, variante, precio, inventario, carrito y checkout | Propietario + §200, §209, §210 | `VERIFICADO` |
| Selección correcta de variantes (talla/color) cuando existan | Propietario | `VERIFICADO` |
| Carrito real de Shopify; checkout real de Shopify | Propietario + §211 | `VERIFICADO` |
| Páginas de producto excelentes | Propietario | `VERIFICADO` |
| Preparada para Dropi **cuando sea necesario** — condicional, no requisito de lanzamiento | Propietario | `VERIFICADO` |
| No construir sistema propio de pedidos, pagos, inventario ni fulfillment | Propietario + §200 | `VERIFICADO` |
| Si Shopify ya lo resuelve, usar Shopify. Si Dropi ya lo resuelve, usar Dropi | Propietario | `VERIFICADO` |

### 1.3 Técnico

| Requisito | Fuente | Nivel |
| --- | --- | --- |
| Rápida; una experiencia lenta no es premium | Propietario + §217–§222 | `VERIFICADO` |
| Accesible: teclado, reduced motion, contraste | Propietario + §182, §223 | `VERIFICADO` |
| SEO-friendly | Propietario | `VERIFICADO` |
| Segura: sin secretos expuestos, superficie mínima | Propietario + §197–§211 | `VERIFICADO` |
| Mantenible: otro desarrollador debe poder entenderlo | Propietario + §233 | `VERIFICADO` |
| Preparada para escalar: cambiar producto, assets, crecer | Propietario + §245 | `VERIFICADO` |
| 3D/WebGL/animación **únicamente cuando aporte valor real** | Propietario + §180, §217, §218 | `VERIFICADO` |
| Funcionar en móvil y escritorio | Propietario | `VERIFICADO` |
| Sin blockchain: no hay caso de uso | §206 | `VERIFICADO` |
| Degradación elegante: si falla el 3D, no falla producto/precio/añadir al carrito | §215, §216 | `VERIFICADO` |

### 1.4 Entorno y plataforma — restricciones duras ya verificadas

| Restricción | Nivel | Detalle en |
| --- | --- | --- |
| Plan objetivo **Advanced** → sin UI dentro del checkout ni branding del checkout (son solo Plus) | `VERIFICADO` | `DISCOVERY.md` §14 |
| **Combined listings son solo Plus** → en Advanced, cada modelo de zapato es **un producto** con opciones Color + Talla | `VERIFICADO` | `ARCHITECTURE.md` §8 |
| Límite de **2.048 variantes por producto** | `VERIFICADO` | `ARCHITECTURE.md` §8 |
| **Shopify Functions sí** en Advanced; market overrides sí | `VERIFICADO` | `DISCOVERY.md` §14 |
| N&E **no tiene tienda todavía** → el catálogo se crea, no se lee | `VERIFICADO` | `DISCOVERY.md` §14 |
| La conexión MCP **no tiene herramientas de theme ni de despliegue** | `VERIFICADO` | `DISCOVERY.md` §13 |
| No modificar Magisik; no cambiar de tienda ni revocar la conexión sin autorización explícita | Propietario | `VERIFICADO` |
| Script tags mueren el **1 de marzo de 2027** | `VERIFICADO` | `DISCOVERY.md` §3 |
| El ID de carrito lleva secret key → headless con datos privados exige servidor | `VERIFICADO` | `DISCOVERY.md` §2 |
| Shopify Payments no opera en Colombia | `DOCUMENTADO` | `DISCOVERY.md` §8 |

---

## 2. Matriz de requisitos todavía desconocidos

### 2.1 Bloquean la recomendación de arquitectura

| # | Desconocido | Por qué bloquea | Origen esperado |
| --- | --- | --- | --- |
| U1 | **Dirección de arte concreta**: paleta, tipografía, ritmo, tratamiento fotográfico, referencias y qué principio tomar de cada una | Sin esto, cualquier propuesta visual es invención (§187) y el gate de originalidad no tiene criterio contra el que medirse | §1–172 |
| U2 | **Papel real del 3D en la experiencia** | Decide `<model-viewer>` nativo vs WebGL propio, y con ello cuál de las cuatro arquitecturas gana | §1–172 |
| U3 | **Peso relativo de los 13 criterios** (originalidad, premium, 3D, motion, Shopify, Dropi, performance, seguridad, SEO, accesibilidad, mantenibilidad, conversión, costo) | Sin ponderación no hay decisión defendible, solo preferencia | §1–172 |
| U4 | **Quién mantiene el sistema tras el lanzamiento** | §233. Un desarrollador solo con Hydrogen/React Router es un riesgo distinto que un equipo | §1–172 o propietario |

### 2.2 Bloquean partes concretas, no la arquitectura

| # | Desconocido | Qué bloquea | Mitigación mientras tanto |
| --- | --- | --- | --- |
| U5 | Catálogo real: modelos, tallas, colores, materiales, precios | Datos de producto y claims | Placeholder explícito (§191) |
| U6 | ¿Lanzamiento solo Colombia o multi-mercado? | Market overrides, hreflang, monedas | Diseñar en COP, no cerrar la puerta a mercados |
| U7 | ¿Fotografía de producto existe, o hay que producirla? | Dirección de arte y peso de assets | Placeholder, con presupuesto de MB fijado |
| U8 | ¿Hay modelos 3D de los zapatos, o hay que crearlos? | Estrategia de 3D | `<model-viewer>` como base; sin modelo, no se promete 3D |
| U9 | ¿Cuenta de Dropi y credenciales? | Verificar la integración | Dropi condicional; nada se marca integrado |
| U10 | Dominio definitivo de N&E | DNS, canonical, hreflang | Irrelevante hasta el despliegue |
| U11 | Textos legales: envíos, devoluciones, garantía, privacidad | Páginas legales y confianza | Placeholder explícito; **nunca inventar políticas** (§191) |

### 2.3 Desconocidos que puedo cerrar yo cuando haya acceso

| # | Verificación | Requiere |
| --- | --- | --- |
| U12 | Comisiones reales y exención de métodos manuales | Fuente primaria de Shopify (bloqueada aquí) o la facturación real de la tienda |
| U13 | API real de Dropi, scopes, idempotencia, sincronía de inventario | Cuenta de Dropi |
| U14 | Métodos de pago disponibles en la tienda de N&E | Tienda creada |
| U15 | Lighthouse y Core Web Vitals reales | Algo construido y desplegado |

---

## 3. Matriz de decisiones reversibles vs irreversibles

El criterio: cuánto cuesta cambiar de opinión después.

### 3.1 Irreversibles o muy costosas — exigen estar seguros antes

| Decisión | Por qué cuesta revertir | Estado |
| --- | --- | --- |
| **Stack: theme vs headless** | Reescritura completa del storefront | `PENDIENTE` (depende de U1–U3) |
| **Modelo de datos de producto**: un producto por modelo con Color+Talla, vs un producto por color | Rehacer catálogo, URLs, SEO, enlaces e historial de ventas. Y combined listings, que sería el camino limpio para producto-por-color, **es solo Plus** | `VERIFICADO` el límite; modelo `PENDIENTE` de U5 |
| **Handles de producto y estructura de URLs** | Rompe SEO y enlaces externos | `PENDIENTE` de U5 |
| **Plan de Shopify** | Cambiarlo es posible, pero rediseñar asumiendo Plus y luego no tenerlo tira trabajo | `VERIFICADO`: Advanced |
| **Conexión de una rama de GitHub a un theme** | **No se puede reconectar una rama a un theme tras desconectarla: al reconectar se añade como un theme nuevo** (`VERIFICADO`) | `PENDIENTE` del stack |
| **Dominio** | Migrar dominio arrastra SEO | `PENDIENTE` de U10 |
| **Definiciones de metaobject y metafield** (claves y tipos) | Los datos ya cargados se migran a mano | `PENDIENTE` de U5 |

### 3.2 Reversibles — se pueden iterar sin drama

| Decisión | Costo de cambio |
| --- | --- |
| Paleta, tipografía, escala tipográfica | Bajo si hay tokens de diseño |
| Composición y orden de secciones | Bajo con plantillas JSON o componentes |
| Copys y microcopy | Bajo |
| Animaciones y timings | Bajo |
| Enfoque de 3D: `model-viewer` → WebGL o al revés | Medio, si está encapsulado detrás de un límite claro |
| Imágenes y vídeo de producto | Bajo |
| Apps de terceros | Medio: hay que auditar que no dependan de script tags |
| Contenido de la guía de tallas | Bajo si vive en metaobjects |
| Reglas de Shopify Functions (pago, envío) | Bajo: se despliegan y revierten |

### 3.3 Consecuencia práctica

**Se puede empezar a construir todo lo reversible sin cerrar U1–U3**, siempre que lo irreversible
quede encapsulado. Lo que no se puede es elegir el stack, que es precisamente la primera pieza.
Por eso el repositorio sigue sin código: construir el storefront *es* ejercer la decisión de stack.

---

## 4. Auditoría de contradicciones

Entre §173–246, el brief de proyecto, la directiva de alcance y los hechos verificados.

| # | Tensión | Veredicto | Resolución aplicada |
| --- | --- | --- | --- |
| C1 | §231 pide "checkout transition" dentro del lenguaje de marca · El plan Advanced **no** permite branding ni UI dentro del checkout | **Contradicción real con la plataforma** | La transición es **hacia** el checkout, no el checkout. Toda la marca vive antes del `checkoutUrl`. Documentado en `DISCOVERY.md` §14 |
| C2 | §245 pide "infraestructura digital escalable" · La directiva de alcance prohíbe construir sistemas | **Contradicción aparente** | "Escalable" = la **página** escala en productos, assets y mercados. No significa construir infraestructura. **Gana la directiva de alcance**, que es posterior y explícita |
| C3 | "Productos, variantes, inventario y precios reales" · N&E no tiene tienda ni catálogo | **Contradicción temporal** | Imposible tener datos reales antes de que exista la tienda. Placeholder explícito (§191) hasta que haya catálogo. **Nada se marca como real hasta que lo sea** |
| C4 | Lista de objetivos incluye "Integración con Dropi" · Hechos confirmados dicen "Dropi cuando corresponda" | **Resuelta por el propietario** | Condicional, **no requisito de lanzamiento**. Degradada en `STATUS.md` D5 |
| C5 | §176–§178 exigen originalidad radical · §182 y los umbrales de Shopify (Lighthouse 60, accesibilidad 90, contraste 4.5:1, target táctil 24×24) imponen límites medibles | **Tensión, no contradicción** | Los umbrales son **suelo, no techo**. La originalidad se consigue dentro de ellos. §227 y §228 ya zanjan el conflicto cuando aparezca |
| C6 | "3D/WebGL cuando aporte valor" · §217, §218, §221 imponen presupuesto de JS y velocidad como parte de la calidad | **Tensión productiva** | Se resuelve con `<model-viewer>` nativo como base y WebGL propio solo con justificación explícita. Ver `STRATEGY.md` §12 |
| C7 | §212 pide lint, type checking, build, tests y validación de theme · La directiva de alcance prohíbe infraestructura innecesaria | **Tensión aparente** | `shopify theme check` y Lighthouse en CI son nativos y baratos. Eso es **higiene, no infraestructura**. Ver `STRATEGY.md` §16 |
| C8 | "Marca internacional" · Tienda en COP, Colombia, mercado único | **Sin resolver — falta dato** | `PENDIENTE` (U6). Diseñar en COP sin cerrar la puerta a multi-mercado. Advanced ya trae market overrides |
| C9 | §189 pide silencio durante la ejecución · §188 y §236 exigen reportar limitaciones | **Sin contradicción** | Silencio **durante** el trabajo; honestidad **en la entrega** |
| C10 | §175 "iteración infinita hasta el estándar" · La realidad de un lanzamiento con fecha | **Tensión no resuelta** | `PENDIENTE`: no conozco fecha de lanzamiento. Si existe, cambia qué entra en la primera versión |
| C11 | El repositorio se llama `EnergyX-` · El proyecto es Nathan & Esteban | **Inconsistencia, no contradicción** | Señalado. Conviene renombrarlo antes de que haya código. No lo toqué |

### Contradicciones que **no** encontré

No hay conflicto entre el estándar y la directiva de alcance en lo esencial: §180 (test de
necesidad), §181 (no añadir por añadir), §200 (usar Shopify para lo sensible), §205 (no instalar
dependencias innecesarias), §218 (presupuesto de JS), §227 (kill your darlings) y §228 (product
first) **ya decían exactamente lo mismo** que la directiva de alcance. La directiva la refuerza,
no la corrige.
