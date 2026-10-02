# Nathan & Esteban

> **Estado: el theme existe y está verificado.** Stack decidido, theme de Shopify escrito de cero,
> y **17 comprobaciones** que pasan: 321 pruebas, el linter oficial de Shopify sin infracciones, y
> comportamiento, accesibilidad, rendimiento y seguridad medidos en un navegador real.
> **Cero dependencias de runtime.**

**Objetivo:** el storefront de Nathan & Esteban, una experiencia de footwear premium sobre un
ecommerce real en Shopify.

No es un ERP, ni un CRM, ni un sistema propio de inventario, pedidos, fulfillment o pagos. Si
Shopify ya lo resuelve, se usa Shopify. La complejidad se reserva para lo que el comprador ve y usa.

Lo que **falta** son los datos comerciales —productos, precios, materiales, fotografía, el modelo
3D— y no se inventan: donde no hay dato hay un PLACEHOLDER explícito.

> Nota: el repositorio se llama `EnergyX-` por herencia. Conviene renombrarlo.

## Las dos mitades del código, y la frontera entre ellas

**`src/lib` decide. `theme/` presenta. Un solo archivo conecta, y no decide nada.**

| | Qué es | Cómo se prueba |
| --- | --- | --- |
| [`src/lib/`](src/lib/) | 12 módulos de decisión: qué combinaciones de color y talla existen, qué talla se recomienda, qué se escribe en la línea del carrito, qué contraste cumple. Funciones puras, sin DOM. | **321 pruebas** con el runner de Node |
| [`theme/`](theme/) | Un theme de Shopify (Online Store 2.0) escrito de cero: 12 plantillas JSON, 19 secciones, 10 snippets, el sistema de diseño en CSS. | **Theme Check oficial**, más 13 comprobaciones en Chromium |
| `theme/assets/ne-components.js` | El único JavaScript escrito a mano. Conecta el DOM con los módulos probados. | las mismas 13 |

Si la lógica de qué talla recomendar viviera en el JavaScript del theme, sería código sin pruebas
tomando decisiones de negocio. [`scripts/sync-theme-assets.mjs`](scripts/sync-theme-assets.mjs)
publica los módulos como assets del theme reescribiendo sus imports a un import map —sin bundler, sin
paso de compilación— y una comprobación falla si alguien edita la copia.

## Qué está verificado, y cómo

**La tienda se compra sin JavaScript.** El formulario de producto es un `<form>` real con un
`<select name="id">` funcional. Verificado en un contexto con JavaScript desactivado, y también
bloqueando el módulo a propósito: el control de reserva vuelve.

**Tres estados de combinación, no dos.** «Agotado en tu talla» y «no se fabrica esta talla en este
color» son mensajes distintos, y confundirlos es lo que hace que una ficha de calzado se sienta
rota. Verificado contra una tienda real: el campo `hasVariants` de Shopify no sirve para esto.

**El recomendador de talla, de punta a punta.** Mide el pie, cruza con la tabla real del modelo y
con el stock, y deja el rastro en atribuciones de línea que **persisten al pedido** —el único canal
que permite cruzar después recomendación con devolución.

**El 3D es progresivo y opcional.** Si no hay modelo, si falla WebGL, si el dispositivo es modesto o
si el comprador pidió menos movimiento, la fotografía sigue siendo la experiencia completa. No hay
ninguna demo de 3D fabricada para aparentar avance.

Detalle de todo lo comprobado por ejecución, incluidos los defectos encontrados y los límites que no
se pudieron cruzar: [`docs/VERIFICATION-LOG.md`](docs/VERIFICATION-LOG.md).

## Documentación

| Documento | Contenido |
| --- | --- |
| [`docs/PROJECT-MAP.md`](docs/PROJECT-MAP.md) | **Empieza aquí.** Jerarquía de verdad, estado por fase y decisiones cerradas. |
| [`docs/STATUS.md`](docs/STATUS.md) | Estado por área con su nivel de verificación, limitaciones y decisiones abiertas. |
| [`docs/VERIFICATION-LOG.md`](docs/VERIFICATION-LOG.md) | Lo comprobado **por ejecución**, los defectos que eso encontró, y las correcciones a afirmaciones propias. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | §4bis: por qué el stack es theme de Shopify y no headless. Más los modelos de seguridad, rendimiento, producto/variantes y carrito→checkout. |
| [`docs/DISCOVERY.md`](docs/DISCOVERY.md) | Base de hechos de plataforma verificados y capacidad real de la conexión. |
| [`docs/STANDARD.md`](docs/STANDARD.md) | El estándar de ejecución, §173–§246. |
| [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) | Requisitos, reversibilidad y auditoría de contradicciones. |
| [`docs/STRATEGY.md`](docs/STRATEGY.md) | Estrategias por área: footwear y RTO, 3D/AR, accesibilidad, SEO, analítica, riesgos y costos. |
| [`docs/REPO-STATE.md`](docs/REPO-STATE.md) | Qué existe, qué está terminado y qué depende de quién. |
| [`docs/THIRD-OPTION-ANALYSIS.md`](docs/THIRD-OPTION-ANALYSIS.md) | Las cuatro vías para la tercera opción de producto, sin decisión. |
| [`shopify/`](shopify/) | Modelo de datos de footwear validado contra el esquema, y el **pixel personalizado** listo para pegar. |

## Comprobaciones

```bash
npm test          # 321 pruebas, runner nativo de Node
npm run check     # las 17 comprobaciones
```

Dos de ellas necesitan herramientas que **no se versionan**, para que el repositorio siga con cero
dependencias:

```bash
NE_SHOPIFY_CLI=/ruta/a/shopify \
NE_PLAYWRIGHT=/ruta/a/playwright/index.js \
  npm run check
```

Sin ellas, esas comprobaciones se declaran **`N/E` — NO EJECUTADA**, nunca `OK`. Una comprobación
que no corrió no da ninguna garantía, y presentarla como verde es fabricar un éxito.

**Cada comprobación se validó inyectando el fallo que debe detectar.** Eso es lo que distingue una
comprobación de un adorno, y está registrado en `VERIFICATION-LOG.md`.

## Lo que falta, y de quién depende

| Pendiente | Depende de |
| --- | --- |
| Catálogo real: productos, variantes, precios, materiales | **el dueño**. No se inventa. |
| Assets: fotografía, modelo `.glb`, tipografía definitiva | **el dueño**. El theme ya los acepta. |
| La tienda Shopify de Nathan & Esteban | **el dueño**. La conexión actual apunta a otra tienda. |
| Desplegar el theme | la tienda, más permitir su dominio en la red del entorno (`VERIFICATION-LOG.md` §11.5) |
| Lighthouse y métricas de campo | una página desplegada. No se estiman. |
| Auditoría con lector de pantalla | una página desplegada |
| Destino de los eventos de analítica | decisión sobre servicio. Hoy el pixel no envía nada. |
| Integración Dropi | credenciales y documentación reales. Hoy es `DOCUMENTED`. |
| Secciones §1–172 del estándar | **el dueño**. Anunciadas cuatro veces, nunca recibidas. |

## Seguridad

Ninguna credencial, clave privada ni secreto entra en este repositorio, en assets ni en código de
cliente. Los secretos viven en la configuración del entorno.

Todo lo que hay en `theme/` **se sirve al navegador**: lo descarga cualquiera. Hay una comprobación
que busca formas de secreto —no palabras— en esos archivos, y seis más sobre la superficie real del
theme, que encontraron un XSS reflejado por el término de búsqueda.
