# EnergyX

> **Estado: sin implementación.** Este repositorio contiene, por ahora, únicamente el
> estándar de ejecución del proyecto y su informe de verificación.

El producto, la marca, la dirección de arte y el stack técnico **no están definidos en
este repositorio**. No se documentan aquí por una razón explícita: suponerlos estaría
prohibido por el propio estándar del proyecto (§191, no suposición) y afirmarlos sin
evidencia también (§187, zero hallucination).

## Documentación

| Documento | Contenido |
| --- | --- |
| [`docs/STANDARD.md`](docs/STANDARD.md) | Estándar de ejecución, §173–§246. Cómo se construye, revisa y entrega. |
| [`docs/STATUS.md`](docs/STATUS.md) | Estado verificado del proyecto y del entorno, limitaciones, deuda técnica y decisiones críticas abiertas. |
| [`docs/DISCOVERY.md`](docs/DISCOVERY.md) | Base de hechos de plataforma (Shopify, themes, Hydrogen, Storefront API, checkout, 3D, performance, analytics, seguridad, costos), opciones de arquitectura y sus restricciones verificadas. |

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
