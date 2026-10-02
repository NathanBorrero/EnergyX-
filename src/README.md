# Lógica de storefront — Nathan & Esteban

Código que **sobrevive a las decisiones pendientes**.

## Por qué existe esto antes de elegir el stack

La arquitectura (theme Liquid · Hydrogen · sitio propio) sigue sin decidirse: depende de la
dirección de arte y del concepto de 3D, que son del propietario. Ver
[`../docs/REQUIREMENTS.md`](../docs/REQUIREMENTS.md) §2.1.

Pero hay lógica que **no depende de ninguna de las dos cosas** y que es exactamente donde se gana o
se pierde la conversión en calzado. Esa se puede construir y probar ya:

| Módulo | Qué resuelve | Por qué no espera |
| --- | --- | --- |
| [`lib/variant-matrix.js`](lib/variant-matrix.js) | Qué combinaciones Color × Talla existen y cuáles se pueden comprar | Previene un fallo verificado en Shopify. Puro, sin DOM |
| [`lib/size-advisor.js`](lib/size-advisor.js) | Recomendar talla desde la medida real del pie en cm | Es la palanca de margen más barata contra el RTO. Aritmética pura |
| [`lib/product-jsonld.js`](lib/product-jsonld.js) | Datos estructurados `ProductGroup` + `hasVariant` para footwear | No hay evidencia de que Shopify los genere. Pura transformación de datos |
| [`lib/analytics-taxonomy.js`](lib/analytics-taxonomy.js) | Qué se mide, de dónde sale, qué permiso requiere, y la aritmética que separa la métrica bonita de la real | Con contra entrega, pedido creado ≠ venta. Pura |
| [`lib/shopify-semantics.js`](lib/shopify-semantics.js) | La normalización de opciones y la definición de «comprable», una sola vez | Nació de la auditoría: estaba duplicada en dos módulos con dos implementaciones distintas |
| [`lib/product-contract.js`](lib/product-contract.js) | La forma canónica de un producto, y su validación | Una sola forma elimina la segunda traducción desde Shopify, que es donde divergen |
| [`lib/shopify-adapter.js`](lib/shopify-adapter.js) | Respuesta de Shopify → producto canónico. Admin API y Storefront API | Único sitio que conoce la forma de Shopify. Si cambia, se cambia aquí |
| [`lib/size-selected-event.js`](lib/size-selected-event.js) | Emite `ne:size_selected` con el estado real de la combinación | Mecanismo verificado. `publish` se inyecta, así que es probable sin navegador |
| [`lib/cart-line.js`](lib/cart-line.js) | La puerta entre «eligió talla» y «hay algo en el carrito». Produce `CartLineInput` o explica por qué no | Usa la misma matriz que el selector, así que no puede discrepar de lo que la interfaz mostró |
| [`lib/cod-guard.js`](lib/cod-guard.js) | Validación pre-checkout para contra entrega: teléfono, dirección, municipio | Obligado: la UI dentro del checkout es solo Plus. Y es donde se combate el RTO |
| [`lib/responsive-image.js`](lib/responsive-image.js) | Plan responsive: escalera de anchos, `sizes` y banderas de carga. **No construye URLs del CDN** | El LCP se gana decidiendo qué anchos pedir, que depende del diseño. Las URLs son de la plataforma |
| [`lib/a11y-contrast.js`](lib/a11y-contrast.js) | Contraste WCAG y tamaño de objetivo táctil | Permite validar la paleta **antes** de pintar, en vez de descubrir el fallo en la auditoría final |

Ambos son ESM sin dependencias y sin tocar el DOM. Funcionan igual dentro de un theme Liquid, en
React, en Vue o en vanilla. **Ninguna línea se tira cuando se elija el stack.**

## Restricciones autoimpuestas

- **Cero dependencias** (§205). Verificado: `dependencies` y `devDependencies` vacíos.
- **Funciones puras.** Sin estado global, sin DOM, sin `fetch`. Así son probables sin navegador.
- **Degradar, no explotar** (§216). Entrada `null`, malformada o incompleta devuelve un resultado
  utilizable, nunca una excepción. Hay pruebas para cada caso.
- **Ningún dato de negocio dentro del código.** Ni tallas, ni medidas, ni materiales, ni precios.
  Todo entra como argumento (§191).

## Pruebas

Runner nativo de Node, sin framework.

```bash
npm test          # 321 pruebas
npm run test:watch
```

Cobertura de los casos que importan: matriz incompleta, agotado frente a inexistente, selección
parcial, reconciliación al cambiar de color, producto de una sola opción, el máximo de 3 opciones de
Shopify, entrada defectuosa, fuera de rango, tabla sucia y desordenada, y la regresión de coma
flotante.

## Lo que ya encontraron las pruebas

**Un bug de coma flotante, real, no teórico.** Las longitudes en cm se escriben con un decimal, pero
`25.9 - 25.2` da `0.6999999999999957` mientras `26.6 - 25.9` da `0.7000000000000028`. Dos distancias
que debían empatar no empataban, así que la regla de desempate nunca se aplicaba y se recomendaba la
talla menor — justo el error que provoca devoluciones. Corregido con tolerancia, y con prueba de
regresión para que no vuelva (§196).

## Dos reglas que estos módulos encodan, y son fáciles de incumplir

**1. En datos estructurados, lo ausente no se fabrica.** `product-jsonld.js` omite toda propiedad
cuyo dato no venga en la entrada: sin precio no hay `offers`, sin marca no hay `brand`, sin
`availableForSale` no se declara disponibilidad. Un dato inventado en JSON-LD es una declaración
falsa ante un buscador, no un detalle de implementación.

**2. Los eventos estándar de storefront no son analítica.** Shopify lo dice textualmente: se
disparan *aunque el comprador no haya consentido el seguimiento*, así que sirven para reaccionar en
la página, no para recoger datos de comportamiento. Para analítica van los web pixels, que respetan
el consentimiento. `analytics-taxonomy.js` marca qué etapa pertenece a cada mundo para que no se
mezclen.

## `ne:size_selected` — qué representa y qué no

**Representa:** que el navegador dijo que alguien eligió una talla. Nada más.

**No representa, y no puede usarse para medirlo:** ventas · ingresos · stock · pedidos · entregas ·
devoluciones · RTO.

La razón no es cautela. Shopify documenta que los eventos personalizados los puede publicar
cualquiera, **incluido un visitante desde la consola del navegador**. El dato es entrada no
confiable: sirve para comportamiento agregado, no para sostener una cifra. El ingreso real vive en
el webhook `orders/paid`.

Decisiones de diseño, y su razón:

| Decisión | Por qué |
| --- | --- |
| El payload **no lleva precio** | Incluirlo invitaría a sumar ingresos desde un evento de cliente |
| No comprueba consentimiento | Publicar no es recoger. El pixel que se suscribe es quien lo respeta, vía Customer Privacy API. Duplicar esa garantía la haría divergir |
| Lleva el `status` de la combinación | Distingue «eligió su talla» de «intentó una agotada» y de «intentó una que no existe en ese color». Eso informa sobre devoluciones y sobre catálogo |
| Deduplica por talla y producto | Un selector dispara su callback en cada interacción, y reconciliar al cambiar de color vuelve a fijar la misma talla. Sin deduplicar, el embudo contaría varias donde hubo una |
| Si `publish` lanza, se traga el error | Un fallo de analítica no puede romper la compra (§215) |

## Comprobaciones

```bash
npm run check     # 10 comprobaciones, falla con código de salida
```

No es CI: es un script sin dependencias con invariantes reales. Cada comprobación se validó
**inyectando el fallo que debe detectar**: import roto, ciclo de importación, token de Shopify,
export muerto, `console.log` olvidado, dependencia añadida y enlace de documentación roto. Las siete
se detectaron.

Lo que **no** comprueba todavía, y por qué: Theme Check exige Shopify CLI y que el stack sea Liquid,
las dos cosas pendientes; los presupuestos de performance exigen una página desplegada y datos
reales, e inventar un umbral sería inventar información.

## Dos cosas que estos módulos aprovechan y suelen pasarse por alto

**Las atribuciones de línea de carrito persisten al pedido.** Eso las convierte en un canal
**autoritativo**, al contrario que un evento de analítica de cliente. `sizeFitAttributes()` guarda
qué talla recomendó el sistema frente a qué talla eligió el comprador, así que después se puede
cruzar con si ese pedido se entregó o se devolvió. **Esa correlación no se puede obtener de un
pixel**, y es la que dice si el desajuste de talla explica el RTO.

**Sin lista de cobertura, `checkCodCoverage` devuelve `UNKNOWN`, nunca `OK`.** No saber si se
entrega no es poder entregar. Devolver `OK` por defecto sería la suposición que fabrica RTO. La lista
de municipios **se inyecta**: Colombia tiene más de mil y la cobertura depende de la transportadora,
así que inventarla produciría pedidos que nadie puede entregar.

## La colisión que `a11y-contrast.js` anticipa

El proyecto se fijó una media de Lighthouse de accesibilidad **≥ 90**. La estética premium habitual
—tipografía fina, gris claro sobre blanco, texto pequeño, botones etéreos— **falla** 4.5:1 de
contraste y 24×24 px de objetivo táctil.

Descubrirlo en la auditoría final obliga a rehacer la paleta. `auditPalette()` permite validarla en
cuanto exista la dirección de arte, antes de pintar un solo píxel. Hay una prueba que demuestra que
el gris claro típico de marca "premium" suspende.

## Límites de confianza

Ningún módulo puede verificar de dónde viene su entrada. Eso lo decide quien los llama, y por eso
los límites se declaran aquí en lugar de darse por supuestos.

| Dato | Origen admisible | Nunca |
| --- | --- | --- |
| `price` | Servidor: Liquid o Storefront API | Un valor leído del DOM o editable en el cliente (§209) |
| `availableForSale` | Servidor | Un flag calculado en el navegador (§210) |
| Tabla de tallas | Metaobject `size_chart` de Shopify | Constantes dentro del código |
| Medida del pie | Entrada del comprador — **no confiable**, se valida | Asumir que es un número razonable |
| Eventos personalizados de analítica | **No confiable**: Shopify documenta que un visitante puede publicarlos desde la consola del navegador | Sostener una cifra de negocio sobre ellos |

Los módulos defienden lo que pueden defender: entrada malformada degrada en lugar de explotar, un
precio no numérico no se emite, una moneda malformada impide la oferta, y la serialización escapa lo
que podría romper el documento. **Lo que no pueden hacer es saber si un precio correcto en forma es
el precio real.** Eso solo lo garantiza que venga del servidor.

El checkout, el cobro y el stock siguen siendo de Shopify. Estos módulos solo deciden qué se
muestra.

### Endurecimiento aplicado tras la auditoría

| # | Problema medido | Corrección |
| --- | --- | --- |
| S1 | Un nombre de producto con `</script>` podía romper el documento | Se escapa `<` |
| S2 | U+2028 y U+2029 pasaban crudos | Se escapan: defensa en profundidad si la cadena acaba en un contexto JS |
| S3/S4 | Un `optionMap` con `property: 'constructor'` escribía `"constructor"` en el grafo | Lista de propiedades prohibidas y forma de identificador obligatoria; lo rechazado se expone con `rejectedIn()` |
| S6 | `"00042"` se emitía como precio | Decimal estricto sin ceros a la izquierda ni notación científica |
| S7 | `"COP\"><script>"` se emitía como moneda | Forma ISO 4217 obligatoria; si no, no hay oferta |

No hay pretensión de invulnerabilidad: son capas que reducen superficie y evitan publicar datos
falsos. Lo que queda fuera del alcance de estos módulos está dicho arriba.

## Los tres estados, y por qué no son dos

`variant-matrix.js` distingue:

| Estado | Significado | Qué debe hacer la interfaz |
| --- | --- | --- |
| `available` | Existe y se puede comprar | Seleccionable |
| `unavailable` | Existe pero está agotada | Visible, marcada, con opción de aviso |
| `nonexistent` | No existe en el catálogo | Visible pero inerte, o ausente — nunca como si estuviera agotada |

Casi todos los selectores de talla mezclan los dos últimos. En footwear, donde la matriz talla ×
color casi nunca está completa, esa confusión es la razón por la que tantas páginas de producto se
sienten rotas: ofrecen una talla, el comprador la elige, y no pasa nada.

## Lo que esto NO es

No es un sistema de inventario, ni una capa sobre Shopify, ni un framework. Shopify sigue siendo la
fuente de verdad de precio, stock, carrito y checkout. Esto solo decide **qué se le muestra al
comprador y cómo**, que es nuestro trabajo.
