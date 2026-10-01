# Estado del repositorio

**Fecha:** 2026-10-01 · tras la auditoría cruzada de módulos.
**Pruebas:** 142, todas pasando. **Dependencias:** 0.

---

## 1. Archivos

```
README.md
package.json                            sin dependencias, type: module
.gitignore

docs/
  STANDARD.md                           estándar §173–246
  STATUS.md                             estado por área
  DISCOVERY.md                          hechos de plataforma
  VERIFICATION-LOG.md                   lo comprobado por ejecución
  REQUIREMENTS.md                       requisitos, reversibilidad, contradicciones
  ARCHITECTURE.md                       comparación y modelos
  STRATEGY.md                           estrategias por área
  THIRD-OPTION-ANALYSIS.md              las cuatro vías, sin decidir
  REPO-STATE.md                         este archivo

shopify/
  README.md
  footwear-data-model.graphql           validado contra el esquema, NO ejecutado en N&E

src/
  README.md                             incluye límites de confianza
  lib/
    shopify-semantics.js                foldKey · isPurchasable · hasAvailabilityData
    variant-matrix.js                   disponibilidad de combinaciones
    size-advisor.js                     recomendación de talla
    product-jsonld.js                   datos estructurados
    analytics-taxonomy.js               embudo consciente de contra entrega
    __tests__/
      variant-matrix.test.js
      size-advisor.test.js
      product-jsonld.test.js
      analytics-taxonomy.test.js
      audit-fixes.test.js               regresiones de la auditoría y de seguridad
```

---

## 2. Módulos: estado real

| Módulo | Estado | Pruebas | Qué le falta |
| --- | --- | --- | --- |
| `shopify-semantics.js` | **Terminado** | Cubierto | Nada. Son tres funciones con una responsabilidad |
| `variant-matrix.js` | **Terminado para su alcance** | Completo: matriz incompleta, tres estados, reconciliación, 1–3 opciones, entrada defectuosa, nombres no canónicos | Nada funcional. Falta usarlo en una página |
| `size-advisor.js` | **Terminado para su alcance** | Completo: exacto, entre tallas, fuera de rango, tabla sucia, regresión de coma flotante, cruce con stock | **Datos reales de tabla de tallas** (`DECISION PENDING`) |
| `product-jsonld.js` | **Funcionalmente terminado, no validado externamente** | Completo en lógica y seguridad | **Pasar la salida por la prueba de resultados enriquecidos de Google.** No se pudo: `developers.google.com` bloqueado |
| `analytics-taxonomy.js` | **Terminado como definición** | Completo en integridad y aritmética | Dos etapas con mecanismo `NOT VERIFIED`: entrega y RTO |

### Probado de verdad frente a parcialmente probado

**Probado de verdad** — comportamiento verificado con asserts:
toda la lógica de los cinco módulos, incluidos los casos límite de §214, la entrada malformada de
§216 y las cinco regresiones de seguridad.

**Parcialmente probado** — la lógica está probada, el contrato externo no:

| Qué | Por qué está incompleto |
| --- | --- |
| JSON-LD contra Google | `developers.google.com` y `schema.org` bloqueados por egress. Los niveles de requisito son `DOCUMENTED` |
| Taxonomía contra datos reales | Las etapas de entrega y RTO no se pueden confirmar sin pedidos reales |
| `footwear-data-model.graphql` | Validado contra el esquema y ejecutado en el entorno de pruebas; **no ejecutado en la tienda de N&E**, que no existe |

**Sin probar porque no existe:** la página. No hay theme, ni componente, ni plantilla.

---

## 3. Qué depende de §1–172

| Bloqueado | Consecuencia de no tenerlo |
| --- | --- |
| **Dirección de arte** | No hay propuesta visual posible sin inventar (§187) |
| **Concepto de 3D** | Decide entre fotografía, `model-viewer` nativo o WebGL propio, y eso influye en el stack |
| **Peso de los 13 criterios** | Sin ponderación, elegir arquitectura es preferencia, no decisión |
| **Decisión de arquitectura (D2)** | Depende de los tres anteriores. Es la única cosa que impide empezar el storefront |

Nada de los cinco módulos depende de §1–172: son funciones puras sin DOM, reutilizables en Liquid,
React o Vue.

---

## 4. Qué depende de información real de Dropi

| Bloqueado | Estado |
| --- | --- |
| Si el proveedor surte más de un ancho o material por modelo | `NOT VERIFIED`. Decide si B, C o D son siquiera posibles |
| API real de Dropi: endpoints, autenticación, límites, idempotencia | `NOT VERIFIED`. **No se transcriben desde fuentes no oficiales** (§187) |
| Sincronía de inventario Dropi → Shopify | `NOT VERIFIED`. Es el riesgo de oversell (R2) |
| Confirmación de entrega y de RTO | `NOT VERIFIED`. Puede venir de Dropi y no de Shopify |
| Scopes que la app de Dropi solicita | `NOT VERIFIED`. `apps.shopify.com` bloqueado |

Dropi es **condicional** por decisión del propietario, no requisito de lanzamiento. Nada se marcará
como integrado sin ejecutarlo contra una cuenta real (§186).

---

## 5. Qué depende de una decisión del propietario

| # | Decisión | Por qué solo él puede tomarla |
| --- | --- | --- |
| 1 | Dirección de arte | Es la identidad de la marca |
| 2 | Concepto de 3D: ¿qué debe entender el comprador que hoy no puede? | Decisión creativa, no técnica |
| 3 | Tercera opción de producto: A, B, C o D | Análisis entregado. Irreversible tras cargar catálogo |
| 4 | Catálogo real: modelos, colores, tallas, materiales, precios | Datos de negocio. `PLACEHOLDER` hasta entonces |
| 5 | Tabla de tallas con medidas reales | Del fabricante o por medición física. Inventarla causaría el RTO que se intenta evitar |
| 6 | ¿Lanzamiento solo Colombia o multi-mercado? | Afecta a market overrides y hreflang |
| 7 | Textos legales: envíos, devoluciones, garantía, privacidad | No se inventan (§191) |
| 8 | Quién mantiene el sistema tras el lanzamiento | Pesa en la elección de stack (§233) |
| 9 | ¿Se renombra el repositorio de `EnergyX-` a algo de N&E? | Cosmético pero conviene antes de conectar GitHub a una tienda |

---

## 6. Bloqueos reales

Solo uno impide avanzar en la dirección principal:

> **No se puede empezar el storefront sin decidir la arquitectura, y la arquitectura depende de la
> dirección de arte y del concepto de 3D, que están en §1–172.**

Todo lo demás tiene camino: la lógica se construye y se prueba, el modelo de datos está validado y
esperando a que exista la tienda, y la documentación registra lo verificado y lo que no.

### Residuo conocido

Un archivo que no se pudo borrar: `snippets/ne-write-probe-delete-me.liquid` en el theme **no
publicado** de la tienda de pruebas. `themeFilesDelete` está bloqueado por política de seguridad. Es
un comentario Liquid, no ejecuta nada, y el theme no está publicado. Se elimina a mano desde el admin.
