# Nathan & Esteban

> **Estado: lógica de storefront en construcción.** La arquitectura sigue pendiente de la dirección
> de arte, pero la lógica que no depende de ella ya está escrita y probada: **254 pruebas, cero
> dependencias**.

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
| [`docs/VERIFICATION-LOG.md`](docs/VERIFICATION-LOG.md) | Lo comprobado **por ejecución real** contra Shopify, incluidas las correcciones a afirmaciones previas y el residuo que no se pudo limpiar. |
| [`docs/THIRD-OPTION-ANALYSIS.md`](docs/THIRD-OPTION-ANALYSIS.md) | Las cuatro vías para la tercera opción de producto, comparadas en diez dimensiones. Análisis, sin decisión. |
| [`docs/REPO-STATE.md`](docs/REPO-STATE.md) | Qué existe, qué está terminado, qué está probado y qué depende de quién. |
| [`docs/PROJECT-MAP.md`](docs/PROJECT-MAP.md) | **Mapa único**: jerarquía de verdad, estado por fase, decisiones ya verificadas y el único bloqueo real. Empieza aquí. |
| [`shopify/`](shopify/) | Modelo de datos de footwear validado contra el esquema, listo para ejecutarse cuando exista la tienda de N&E. |
| [`src/`](src/) | Lógica de storefront que sobrevive a la decisión de arquitectura: disponibilidad de variantes y recomendación de talla. |

## Pruebas

```bash
npm test
```

Doscientas cincuenta y cuatro pruebas, runner nativo de Node, sin dependencias.

```bash
npm run check
```

Diez comprobaciones de calidad, cada una validada inyectando el fallo que debe detectar.

## Antes de escribir el storefront

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
