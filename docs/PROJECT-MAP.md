# Nathan & Esteban — Mapa único del proyecto

**Fecha:** 2026-10-01 · FASE 0 completada.
**Objetivo final:** una experiencia digital premium de footwear **+ ecommerce real**. No una
investigación, no una documentación perfecta sin página, no una demo desconectada de Shopify.

---

## 0. Qué partes del prompt maestro existen

| Bloque | Estado | Dónde vive |
| --- | --- | --- |
| **§173–246** | **Recibido e integrado** | [`STANDARD.md`](STANDARD.md) |
| **§1–172** | **NO recibido todavía.** El mensaje que los anunciaba traía el plan de fases en su lugar | — |
| **Plan de fases 0–6** | **Recibido.** Es entrada oficial nueva | §2 de este documento |
| **Jerarquía de verdad** | **Recibida.** Regla de precedencia canónica | §1 de este documento |

**No se inventa nada de §1–172.** Lo que depende de ellos está marcado `DECISION PENDING` y no
bloquea nada que pueda avanzar sin ellos.

El plan de fases llegó cortado en FASE 6 ("No bloquees el proyecto esperando el asset 3D
definitivo"). Lo que falte de FASE 6 en adelante se integrará cuando llegue.

---

## 1. Jerarquía de verdad

Orden de precedencia cuando dos fuentes se contradicen:

1. Datos reales y verificables del proyecto
2. Decisiones explícitas del propietario
3. Documentación oficial vigente
4. Código y comportamiento realmente probado
5. Documentación interna del proyecto
6. Inferencias técnicas razonables
7. Suposiciones

### Etiquetas, usadas con disciplina en todo el repositorio

| Etiqueta | Significado |
| --- | --- |
| `VERIFIED` | Comprobado por ejecución, o leído de documentación oficial |
| `DOCUMENTED` | Fuente secundaria plausible, sin confirmar contra fuente primaria |
| `INFERRED` | Razonamiento propio sobre datos verificados. Es una lectura, no un hecho |
| `NOT VERIFIED` | No se pudo comprobar |
| `DECISION PENDING` | Requiere una decisión del propietario |
| `PLACEHOLDER` | Hueco explícito, sustituible, que no finge ser dato real |

Una inferencia nunca se presenta como hecho. Un placeholder nunca se presenta como dato real.
Ninguna información comercial se inventa.

---

## 2. Estado por fase

| Fase | Estado | Qué falta |
| --- | --- | --- |
| **0 · Consolidación** | ✅ **Hecha** | — |
| **1 · Base técnica** | ✅ **Hecha** | — |
| **2 · Arquitectura del storefront** | ⛔ **Bloqueada** | §1–172: dirección de arte y concepto de 3D |
| **3 · Sistema visual** | ⛔ Bloqueada | Depende de FASE 2 y de §1–172 |
| **4 · Homepage** | ⛔ Bloqueada | Depende de FASE 2 y 3 |
| **5 · Product experience** | 🟡 **Lógica lista, presentación bloqueada** | La lógica de variantes, disponibilidad y talla ya existe y está probada. Falta la capa visual |
| **6 · 3D** | 🟡 Alternativas abiertas | `DECISION PENDING`: el concepto decide el nivel |

### FASE 1 — qué se entregó

Un solo modelo de datos atraviesa los siete módulos, sin lógica duplicada:

```
Respuesta de Shopify (Admin API o Storefront API)
        │
        ▼  shopify-adapter.js          ← el ÚNICO sitio que conoce la forma de Shopify
   Producto canónico                   ← product-contract.js define la forma y la valida
        │
        ├──► variant-matrix.js         available / unavailable / nonexistent
        │         │
        │         └──► purchasableValuesFor()
        │                   │
        ├──► size-advisor.js ◄─────────┘  recomienda y reconcilia con stock real
        │
        ├──► product-jsonld.js         ProductGroup + hasVariant
        │
        └──► analytics-taxonomy.js     embudo consciente de contra entrega

   shopify-semantics.js  ← foldKey · isPurchasable · hasAvailabilityData, una sola vez
```

**170 pruebas, todas pasando. Cero dependencias.**

Lo que esto resolvió: antes `variant-matrix` esperaba `selectedOptions` y `product-jsonld` esperaba
un objeto `options`. Dos formas para el mismo dato significan dos traducciones desde Shopify, y dos
traducciones divergen. Ese defecto ya había aparecido un nivel más abajo con la normalización de
nombres de opción. Ahora hay una sola forma y una sola traducción.

---

## 3. Decisiones ya verificadas — no se vuelven a abrir

| Decisión | Nivel | Evidencia |
| --- | --- | --- |
| Shopify es la fuente de verdad de producto, variante, precio, inventario, carrito y checkout | `VERIFIED` | Decisión del propietario + §200, §209, §210 |
| Plan objetivo **Advanced** | `VERIFIED` | Decisión del propietario |
| El checkout es intocable: sin UI propia ni branding (son solo Plus) | `VERIFIED` | Matriz de planes de la documentación oficial |
| **Un producto por modelo**, con opciones Color + Talla | `VERIFIED` | Combined listings son solo Plus |
| Máximo **3 opciones** por producto | `VERIFIED` | Prueba negativa real: `OPTIONS_OVER_LIMIT` |
| Máximo **2.048 variantes** por producto | `VERIFIED` | `resourceLimits` leído en vivo |
| `hasVariants` **no** indica si una combinación existe | `VERIFIED` | Medido con matriz incompleta |
| Guía de tallas con **metaobject `size_chart`**, sin construir sistema | `VERIFIED` | Definición creada y ejecutada |
| Swatches con **foto del material** vía `shopify--color-pattern` | `VERIFIED` | Estructura leída en vivo |
| Sin billeteras digitales: no hay checkout acelerado | `VERIFIED` | `supportedDigitalWallets` vacío |
| La conexión **escribe** themes no publicados pero **no puede borrar** archivos | `VERIFIED` | Ejecutado |
| Despliegue por **integración de GitHub de Shopify** | `INFERRED` sobre hechos verificados | La asimetría escribir/no-borrar hace frágil la API |
| `DENY` es el valor por defecto de `inventoryPolicy` | `VERIFIED` | Ejecutado |
| Dropi es **condicional**, no requisito de lanzamiento | `VERIFIED` | Decisión del propietario |
| Tres estados de variante, no dos | `VERIFIED` | Implementado y probado; el `VariantSelector` de Hydrogen solo expone `isAvailable` |

---

## 4. Contradicciones: estado tras la integración

| # | Tensión | Resolución |
| --- | --- | --- |
| C1 | §231 pide transición de checkout en el lenguaje de marca · Advanced no lo permite | **Resuelta técnicamente.** La transición es *hacia* el checkout. Toda la marca vive antes del `checkoutUrl` |
| C2 | §245 pide infraestructura escalable · la directiva de alcance prohíbe construir sistemas | **Resuelta.** Escala la página, no se construye infraestructura. Gana la directiva, posterior y explícita |
| C3 | "Productos e inventario reales" · N&E no tiene tienda | **Resuelta en el tiempo.** `PLACEHOLDER` explícito hasta que exista. `placeholderProduct()` lo hace sin fingir |
| C4 | "Integración con Dropi" en objetivos · "cuando corresponda" en hechos | **Resuelta por el propietario.** Condicional |
| C5 | Originalidad radical · umbrales medibles de Lighthouse y accesibilidad | **Resuelta.** Los umbrales son suelo, no techo |
| C6 | 3D "cuando aporte valor" · presupuesto de JS y velocidad | **Resuelta en método.** Tres niveles abiertos; el concepto decide, el presupuesto se fija después |
| C7 | §212 pide lint, tests y validación · no construir infraestructura | **Resuelta.** `theme check` y el runner nativo de Node son higiene, no infraestructura. Cero dependencias |
| C8 | "Marca internacional" · tienda en COP, mercado único | **`DECISION PENDING`.** Advanced ya trae market overrides; no se cierra la puerta |
| C9 | §189 silencio durante ejecución · §188 reportar limitaciones | **Resuelta.** Silencio al trabajar, honestidad al entregar |
| C10 | §175 iteración infinita · un lanzamiento con fecha | **`DECISION PENDING`.** No conozco fecha de lanzamiento |
| C11 | Repositorio `EnergyX-` · proyecto Nathan & Esteban | **Pendiente, cosmético.** Conviene renombrar antes de conectar GitHub a una tienda |
| C12 | FASE 2 pide decidir arquitectura · la decisión depende de §1–172 | **`DECISION PENDING`.** Es el único bloqueo real del proyecto |

Ninguna contradicción se resolvió borrando una regla por ser más antigua. §173–246 no invalida
§1–172: cuando lleguen, se integran como un solo sistema.

---

## 5. El único bloqueo real

> **FASE 2 no puede cerrarse sin §1–172.** La elección de arquitectura depende de la dirección de
> arte y del papel del 3D, y elegirla sin ellos sería preferencia disfrazada de decisión.

Todo lo demás tiene camino abierto, y la prueba es que FASE 0 y FASE 1 se completaron sin ellos.

### Lo que queda por construir y no depende de §1–172

| Qué | Por qué no depende |
| --- | --- |
| Pipeline de QA: `theme check` en CI y presupuesto de Lighthouse | Es higiene, independiente del stack |
| Auditoría de script tags en la tienda de N&E | Requiere tienda, no dirección de arte |
| Ejecutar `footwear-data-model.graphql` en la tienda de N&E | Requiere tienda |
| Instrumentar `ne:size_selected` como evento personalizado | Mecanismo ya verificado |

### Lo que depende de una decisión del propietario

Nueve puntos en [`REPO-STATE.md`](REPO-STATE.md) §5. Los cuatro que mueven la arquitectura:
dirección de arte, concepto de 3D, tercera opción de producto, y tabla de tallas real.
