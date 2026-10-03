# Cumplimiento legal y accesibilidad

Este documento cruza el checklist que me pasaste con **lo que de verdad está hecho**, lo que el
theme soporta pero necesita contenido tuyo, y lo que no es del theme en absoluto.

La división importa: hay cosas que son código y las puedo verificar ejecutándolas, y hay cosas que
son **texto legal y datos de tu negocio**, que no invento (§191). Un theme que fabrica una política
de privacidad es peor que uno que no la tiene, porque parece que cumple.

---

## 1. Hecho y verificado por ejecución

Cada uno tiene una comprobación que **falla si alguien lo rompe**, y cada comprobación se validó
inyectándole el fallo que debe detectar.

| Punto del checklist | Cómo está resuelto | Dónde se comprueba |
| --- | --- | --- |
| **Contraste de colores** | Cada par de color validado contra WCAG sobre la página **renderizada**, no sobre los tokens. Compone por opacidad acumulada, porque un `opacity` ningún medidor de color lo ve | `check-a11y` 1 y 2 |
| **Sitio accesible** | Foco visible y en orden de DOM, un solo `h1`, sin saltos de nivel de encabezado, áreas de pulsado medidas (mínimo 24×24) | `check-a11y` 3, 4 y 5 |
| **Formularios por teclado** | La ficha se compra, el carrito se actualiza y los filtros se aplican **con JavaScript desactivado**. Todo son `<form>` reales y `<details>` nativos | `check-components` 8, 8ter y 16 |
| **Texto alternativo** | Ninguna imagen sin `alt` en las cinco páginas | `check-a11y` 5 |
| **Etiquetas claras** | Ningún control de formulario sin nombre accesible | `check-a11y` 5 |
| **Integraciones de terceros** | **Cero.** Ninguna petición sale del origen en ninguna de las cinco páginas. El vídeo de YouTube/Vimeo vive en un `<template>` y no carga hasta el clic | `check-components` 8ante y 12 |
| **Consentimiento de cookies** | El theme **no pone ninguna cookie, ni escribe en `localStorage` ni en `sessionStorage`**. El consentimiento queda donde le corresponde: el banner de Shopify y su API de privacidad | `check-components` 8ante |
| **Seguimiento de analíticas** | El pixel es nativo de Shopify, **está condicionado al consentimiento** (`analyticsProcessingAllowed`) y hoy **no envía nada**: su destino está vacío. No reenvía dinero | `check-theme` 6quater, `shopify/pixel/README.md` |
| **Eliminar reseñas falsas** | No hay reseñas. No se ha inventado ninguna | — |
| **Afirmaciones sin respaldo** | Ninguna. Y hay un guardián que **prohíbe** que entren: garantías, superlativos, porcentajes absolutos, materiales, certificaciones, gratuidades y condiciones de envío o devolución en los textos del theme | `check-security` 7 |
| **Solo datos necesarios** | El theme pide **una sola cosa** al comprador además de lo que Shopify necesita: la medida del pie, y solo si pide una recomendación de talla. Ver el punto 2 | — |

---

## 2. Un dato personal que sí recoge el theme, y qué se hizo

La guía de tallas pide **la medida del pie en centímetros**. Si el comprador pide recomendación, esa
medida **viaja con el pedido** en un atributo de línea (`_ne_foot_length_cm`).

**Por qué existe:** es el único canal fiable para saber si la talla recomendada evitó una
devolución. Sin él, el recomendador no se puede evaluar y acaba siendo decoración.

**El problema que tenía:** el guion bajo del nombre hace que Shopify lo **oculte** en el carrito y en
la caja. Así que el comprador escribía una medida de su cuerpo en lo que parece una calculadora, y
acababa guardada en su pedido **sin que se lo dijeran y sin poder verla**.

**Lo que se hizo:** una frase donde se escribe la medida, antes de pedirla.

> Si pides una recomendación, la medida se guarda con tu pedido para saber si acertamos con la talla.

**Lo que falta, y es tuyo:** tu política de privacidad tiene que decir qué se hace con ese dato,
cuánto se conserva y cómo se pide que se borre. Eso es texto legal y **no lo invento**.

---

## 3. El theme lo soporta — falta que publiques el contenido

Estos **ya funcionan en cuanto existan en el admin de Shopify**. Si no existen, el theme no pinta
nada: no finge que los hay.

| Punto | Qué hace el theme | Qué tienes que hacer tú |
| --- | --- | --- |
| **Política de privacidad** | El pie enlaza automáticamente todas las políticas publicadas | Admin → Configuración → **Políticas** |
| **Política de cookies** | Igual | Igual |
| **Política de reembolsos** | Igual | Igual |
| **Términos y condiciones** | Igual | Igual |
| **Datos del negocio** | El pie tiene un campo de texto enriquecido —razón social, identificación fiscal, domicilio, contacto— que se pinta **solo si lo rellenas** | Editor del theme → Pie → **Datos del negocio** |
| **Consentimiento de cookies** | El theme no pone cookies; el banner lo pone Shopify | Admin → Configuración → **Privacidad de los clientes** → activar el banner y la región |
| **Seguimiento de analíticas** | El pixel está listo y gated por consentimiento | Pegar el pixel y **decidir el destino** (`shopify/pixel/README.md`) |
| **Consentimiento en formularios** | El único formulario que recoge datos personales es el de contacto, que lo genera Shopify | Añadir tu casilla de consentimiento si tu jurisdicción la exige |

---

## 4. Fuera del theme — es tuyo

| Punto | Por qué no es del theme |
| --- | --- |
| **Copyright de imágenes** | Las fotos son tuyas o licenciadas por ti. El theme no trae ninguna: todo son `PLACEHOLDER` marcados |
| **Leyes locales** | Depende de dónde vendas. En Colombia: Ley 1581 de 2012 (datos personales), Estatuto del Consumidor (Ley 1480 de 2011), y el régimen de la SIC. No soy quien para redactarlo |
| **Eliminar reseñas falsas** | No hay reseñas que eliminar. Si instalas una app de reseñas, la responsabilidad pasa a esa app |

---

## 5. Lo que NO puedo verificar desde aquí, y lo digo

| Qué | Por qué |
| --- | --- |
| Lighthouse real y métricas de campo | La política de red del entorno deniega el dominio de la tienda y `cdn.shopify.com` |
| Auditoría con lector de pantalla de verdad | Hace falta una persona con VoiceOver o NVDA. Las comprobaciones miden estructura y nombres accesibles, que **no es lo mismo** que escuchar la página |
| Que el banner de consentimiento de Shopify se comporte como esperas | Exige la tienda publicada |
| Revisión legal de los textos | No soy abogado y no voy a fingir que lo soy |

---

## 6. Resumen en una línea

**Todo lo que es código está hecho y verificado.** Lo que falta es **texto legal y datos de tu
negocio**, que son tuyos, y una revisión legal de alguien que sepa.

---

### Dónde podemos profundizar

- Los textos legales concretos que te exige vender calzado en Colombia con pago contra entrega.
- Qué decirle exactamente a tu política de privacidad sobre la medida del pie.
- Si quieres que el consentimiento de cookies bloquee también el pixel propio antes de que Shopify
  lo haga, que hoy ya lo hace pero se puede endurecer.
