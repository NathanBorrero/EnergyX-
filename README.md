# Nathan & Esteban

> **Estado: sin implementación.** Este repositorio contiene documentación de arquitectura
> y verificación. Todavía no hay código, y es deliberado.

**Objetivo del proyecto:** construir **la página web / storefront de Nathan & Esteban**, una
experiencia digital de footwear premium conectada a un e-commerce real sobre Shopify.

No es un ERP, ni un CRM, ni un sistema de inventario, pedidos, fulfillment o pagos propio. Si
Shopify ya resuelve algo, se usa Shopify. La complejidad técnica se reserva para lo que el cliente
ve y usa.

La dirección de arte concreta y el stack técnico **no están definidos todavía**. No se documentan
aquí por una razón explícita: suponerlos estaría prohibido por el propio estándar del proyecto
(§191, no suposición) y afirmarlos sin evidencia también (§187, zero hallucination).

> Nota: el repositorio se llama `EnergyX-` por herencia. Conviene renombrarlo antes de que haya
> código.

## Documentación

| Documento | Contenido |
| --- | --- |
| [`docs/STANDARD.md`](docs/STANDARD.md) | Estándar de ejecución, §173–§246. Cómo se construye, revisa y entrega. |
| [`docs/STATUS.md`](docs/STATUS.md) | Estado verificado del proyecto y del entorno, limitaciones, deuda técnica y decisiones críticas abiertas. |
| [`docs/DISCOVERY.md`](docs/DISCOVERY.md) | Base de hechos de plataforma (Shopify, themes, Hydrogen, Storefront API, checkout, 3D, performance, analytics, seguridad, costos), opciones de arquitectura y capacidad real de la conexión. |
| [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) | Requisitos conocidos y desconocidos, decisiones reversibles vs irreversibles, y auditoría de contradicciones entre todas las instrucciones. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Comparación objetiva de alternativas, y modelos de seguridad, rendimiento, producto/variantes/inventario, carrito→checkout y Shopify→Dropi. |
| [`docs/STRATEGY.md`](docs/STRATEGY.md) | Estrategias por área: footwear y RTO, 3D/AR, accesibilidad, SEO, analytics, testing, despliegue, riesgos y costos. |

## Antes de escribir código

Hay cinco decisiones críticas abiertas (D1–D5 en [`docs/STATUS.md`](docs/STATUS.md)), refinadas
tras la investigación de plataforma en [`docs/DISCOVERY.md`](docs/DISCOVERY.md) §11.

Dos de ellas — el brief de marca y producto, y la elección de stack — bloquean cualquier
implementación: construir antes de resolverlas significaría tirar el trabajo o inventar
información. El espacio de opciones ya está investigado y sus restricciones están verificadas;
lo que falta es el criterio de ponderación, que vive en el brief.

## Convenciones de seguridad

Ninguna credencial, API key privada ni secreto entra en este repositorio, en assets ni
en código de cliente (§201, §202). Los secretos viven en la configuración del entorno,
separados por development / staging / production.
