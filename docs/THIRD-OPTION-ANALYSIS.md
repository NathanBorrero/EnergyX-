# La tercera opción de producto — análisis

**Fecha:** 2026-10-01
**Estado:** análisis. **Sin decisión.** La elección es del propietario.

## Niveles de afirmación usados en este documento

| Etiqueta | Significado |
| --- | --- |
| `VERIFIED` | Comprobado por ejecución contra Shopify o leído de documentación oficial |
| `DOCUMENTED` | Fuente secundaria plausible, **sin confirmar contra fuente primaria** |
| `INFERRED` | Razonamiento propio sobre datos verificados. Es mi lectura, no un hecho |
| `NOT VERIFIED` | No se pudo comprobar |
| `DECISION PENDING` | Depende de una decisión del propietario |

**Ninguna conclusión de este documento se apoya solo en `DOCUMENTED` o `INFERRED` sin decirlo.**

## El hecho que fuerza el análisis

`resourceLimits.maxProductOptions` = **3**. `VERIFICADO` en vivo y por prueba negativa: añadir
una cuarta opción se rechaza con `OPTIONS_OVER_LIMIT`. Evidencia en
[`VERIFICATION-LOG.md`](VERIFICATION-LOG.md) §3.

Color + Talla consume 2 de 3. **Queda una sola.** Y las *combined listings*, que serían la salida
limpia para modelar por color, son **solo Plus**.

Esto es **irreversible** una vez cargado el catálogo: cambiar la estructura de opciones implica
recrear productos, y con ello perder handles, URLs e historial.

---

## Las cuatro vías

| | Opciones | Variantes con 5 colores × 10 tallas |
| --- | --- | --- |
| **A** | Color + Talla | **50** |
| **B** | Color + Talla + Ancho/Horma (2 anchos) | **100** |
| **C** | Color + Talla + Material (2 materiales) | **100** |
| **D** | Color + Talla + otra (p. ej. acabado, altura de caña) | 100+ |

Ninguna se acerca al límite de 2.048 variantes. **El límite de variantes no es la restricción
real.** Las restricciones reales son otras nueve.

---

## Comparación por dimensión

### 1. UX

| | Lectura |
| --- | --- |
| **A** | Dos decisiones. El comprador elige color y talla, que es lo que espera de un zapato. |
| **B** | Tres decisiones, y la tercera **la mayoría no sabe responderla**. Pocos compradores conocen su ancho de pie. Introduce una pregunta que genera duda justo antes de comprar. |
| **C** | Tres decisiones, pero el material **es visible**: se entiende sin explicación. Menos fricción cognitiva que el ancho. |
| **D** | Depende. Si el eje es visible (acabado, altura), se comporta como C. Si es técnico, como B. |

**Riesgo de B y D-técnico:** una pregunta que el comprador no sabe contestar no reduce devoluciones,
las aumenta — porque elige al azar.

### 2. Variantes

| | Lectura |
| --- | --- |
| **A** | 50. Manejable a mano. |
| **B/C/D** | 100. Duplica todo: carga de catálogo, revisión, QA de la matriz. |

El doble de variantes también duplica la probabilidad de **matriz incompleta**, que es precisamente
el caso que obliga al motor de disponibilidad de tres estados
([`../src/lib/variant-matrix.js`](../src/lib/variant-matrix.js)).

### 3. Inventario

| | Lectura |
| --- | --- |
| **A** | 50 SKU que contar, reponer y conciliar. |
| **B** | 100 SKU, y el ancho **no se puede sustituir**: si falta el 2E en la 42, no sirve el D. Fragmenta el stock en celdas que se agotan solas. |
| **C** | 100 SKU. Igual de fragmentado, pero el material suele tener demanda más desigual, así que el riesgo de stock muerto es mayor. |
| **D** | Igual que C. |

**Regla general:** cada opción añadida divide el inventario, no lo suma. Más celdas, cada una con
menos rotación y más probabilidad de quedarse agotada o muerta.

### 4. Dropi

| | Lectura |
| --- | --- |
| **A** | El proveedor tiene que surtir 50 combinaciones. Viable. |
| **B** | Requiere que **el proveedor realmente fabrique y almacene ambos anchos**. En dropshipping LATAM eso es improbable. `NO VERIFICADO`: no hay cuenta de Dropi con la que comprobar su catálogo. |
| **C** | Lo mismo: el proveedor debe tener ambos materiales en todas las tallas. |
| **D** | Lo mismo. |

**Esto puede ser decisivo y no depende de nosotros.** Si el fulfillment es por Dropi, la tercera
opción solo existe si el proveedor la tiene. Ofrecer un eje que el proveedor no surte genera
cancelaciones, que con contra entrega son RTO.

→ **Dependencia: verificar el catálogo real del proveedor antes de decidir B, C o D.**

### 5. Complejidad

| | Lectura |
| --- | --- |
| **A** | Dos ejes: el motor de disponibilidad ya cubre el caso y está probado. |
| **B/C/D** | Tres ejes. El motor ya soporta 3 (hay prueba para ello), pero la **interfaz** se complica: tres selectores en una pantalla de móvil, y la reconciliación al cambiar un eje afecta a dos. |

Coste de código: bajo, ya está resuelto. Coste de diseño: real.

### 6. SEO

| | Lectura | Nivel |
| --- | --- | --- |
| **A** | Un `ProductGroup` con `variesBy` de dos ejes: color y talla. | `VERIFIED` que el modelo existe y funciona |
| **B** | **Problema medido, no supuesto.** schema.org no tiene propiedad para el ancho de calzado. Mapearlo a `size` lo hace chocar con la talla: la auditoría del módulo midió que se emitía `size: "D"`, es decir **el ancho sobrescribía la talla y se publicaba un dato falso**. Corregido omitiendo el ancho; expresarlo requiere resolver antes el modelado | `VERIFIED` por ejecución |
| **C** | `https://schema.org/material` figura entre las propiedades que Google admite como eje de variación | `DOCUMENTED` — ver aviso abajo |
| **D** | `https://schema.org/pattern` también figura en esa lista. Un eje sin propiedad propia caería en el mismo problema que B | `DOCUMENTED` |

> **Aviso de verificación.** La lista de propiedades que Google admite en `variesBy`
> (`color`, `size`, `material`, `pattern`, `suggestedAge`, `suggestedGender`) proviene de
> **fuentes secundarias**: `developers.google.com` y `schema.org` están **bloqueados por la política
> de egress de este entorno**, así que no pude leer la fuente primaria.
>
> Por tanto **la supuesta ventaja SEO de C sobre B no es una conclusión**, es una hipótesis
> `DOCUMENTED` pendiente de confirmar. Lo que **sí** está verificado por ejecución es el problema de
> B, porque lo medí en el propio código.
>
> Para elevarla a `VERIFIED` hace falta: leer la documentación de Google de datos estructurados de
> variantes desde una red sin ese bloqueo, y pasar la salida real por la prueba de resultados
> enriquecidos.

Lo que sí es `VERIFIED` en los cuatro casos: **ninguna da URL propia por color**, porque eso exige
combined listings, que son solo Plus.

### 7. Devoluciones (RTO)

| | Lectura |
| --- | --- |
| **A** | La talla es la causa principal. Se combate con guía de tallas y medida en cm, **no con una opción más**. |
| **B** | **Puede reducir devoluciones por horma** — si y solo si el comprador sabe su ancho. Si elige al azar, las aumenta. |
| **C** | Impacto **neutro o negativo**: el material no cambia el calce, y añade una decisión más en la que equivocarse. |
| **D** | Normalmente neutro. |

**Lo más relevante de todo el análisis:** la palanca contra el RTO ya está construida y no gasta
ninguna opción. Es [`../src/lib/size-advisor.js`](../src/lib/size-advisor.js) con datos reales en el
metaobject `size_chart`, más una nota de horma en un **metafield**.

Una nota de horma como metafield ("calza estrecho / fiel / amplio") informa sin obligar a elegir y
**no consume la tercera opción**. En la mayoría de catálogos de footwear eso captura casi todo el
beneficio de B sin ninguno de sus costes.

### 8. Escalabilidad

| | Lectura |
| --- | --- |
| **A** | Deja la tercera opción **libre**. Es una opción real sobre el futuro: aparece una necesidad que hoy no se ve y hay sitio. |
| **B/C/D** | Agota los tres huecos. Cualquier eje futuro exige rehacer el catálogo o pasar a Plus. |

Mantener el hueco 3 libre tiene valor, aunque hoy no se use. Gastarlo sin necesidad probada es
vender una opción por nada.

### 9. Mantenimiento

| | Lectura |
| --- | --- |
| **A** | 50 celdas que revisar. Un humano puede auditarlas. |
| **B/C/D** | 100 celdas. La auditoría manual deja de ser práctica y hay que automatizarla. |

Y con §233 en mente: otro desarrollador entiende Color + Talla de inmediato. Color + Talla + Ancho
necesita explicación de dominio.

### 10. Experiencia móvil

| | Lectura |
| --- | --- |
| **A** | Dos selectores. Caben sobre el pliegue junto al precio y al botón de compra. |
| **B/C/D** | Tres selectores. Algo se baja del pliegue: el precio, el botón, o la decisión. Con target táctil mínimo de 24×24 px (`VERIFICADO`) y sin checkout acelerado (`VERIFICADO`: `supportedDigitalWallets` vacío), cada fricción añadida pesa el doble. |

**Es mobile-first y sin pago acelerado.** Un selector más es el coste más caro de la lista, y el
menos visible en una hoja de cálculo.

---

## La vía transversal: metafields y metaobjects

Lo que el propietario planteó como cuarta consideración, y que se puede combinar con cualquiera de
las cuatro:

| Información | ¿Variante? | Mecanismo correcto | Nivel |
| --- | --- | --- | --- |
| Color | **Sí** | Opción + `shopify--color-pattern` con imagen de material | `VERIFICADO` |
| Talla | **Sí** | Opción | `VERIFICADO` |
| Ancho / horma **como aviso** | **No** | Metafield de producto | `VERIFICADO` el mecanismo |
| Ancho **como SKU distinto** | Sí | Opción, y gasta el hueco 3 | — |
| Material del corte y de la suela | **No** | Metafield | `VERIFICADO` |
| Tabla de tallas y medidas | **No** | Metaobject `size_chart` | `VERIFICADO` por ejecución |
| Cuidado, garantía, origen | **No** | Metafield | `VERIFICADO` |
| Altura de caña, drop, peso | **No** | Metafield | `VERIFICADO` |

**El criterio que separa variante de metafield:** ¿es un **SKU distinto que hay que almacenar,
contar y enviar por separado**? Si sí, es variante. Si solo es información sobre el producto, es
metafield — y entonces no consume opción, no fragmenta inventario y no añade un selector al móvil.

Casi todo lo que la gente convierte en opción es, en realidad, metafield.

---

## Resumen para decidir

| Dimensión | A | B | C | D |
| --- | --- | --- | --- | --- |
| UX | ✅ | ⚠️ pregunta difícil | 🟡 visible | depende |
| Variantes | ✅ 50 | 🟡 100 | 🟡 100 | 🟡 100+ |
| Inventario | ✅ | ⚠️ fragmenta, no sustituible | ⚠️ riesgo de stock muerto | ⚠️ |
| Dropi | ✅ | ❌ exige que el proveedor lo surta `NOT VERIFIED` | ❌ ídem `NOT VERIFIED` | ❌ ídem `NOT VERIFIED` |
| Complejidad | ✅ | 🟡 | 🟡 | 🟡 |
| SEO | ✅ `VERIFIED` | ⚠️ colisión medida `VERIFIED` | 🟡 posible ventaja `DOCUMENTED` | 🟡 `DOCUMENTED` |
| Devoluciones | 🟡 se ataca por otra vía `VERIFIED` el mecanismo | 🟡 **si** se conoce el ancho `INFERRED` | ⚠️ neutro o peor `INFERRED` | 🟡 `INFERRED` |
| Escalabilidad | ✅ deja hueco | ❌ agota | ❌ agota | ❌ agota |
| Mantenimiento | ✅ | 🟡 | 🟡 | 🟡 |
| Móvil | ✅ | ⚠️ tercer selector | ⚠️ | ⚠️ |

### Lo que el análisis sí establece, sin elegir

1. **El límite de variantes no es la restricción.** 100 variantes está muy por debajo de 2.048.
   Las restricciones reales son inventario, proveedor de fulfillment y móvil. — `VERIFIED` el
   límite; `INFERRED` que las otras tres pesan más.
2. **Mapear el ancho a datos estructurados está roto hoy**, y eso sí lo medí: sobrescribía la talla.
   — `VERIFIED`.
3. **Ni C ni D tienen justificación de devoluciones.** El material y el acabado no cambian el calce.
   Si se eligen, es por razón comercial. — `INFERRED`.
4. **B es la única con un beneficio plausible de devoluciones**, condicionado a dos cosas que no
   pude comprobar: que el proveedor surta ambos anchos (`NOT VERIFIED`, requiere Dropi) y que el
   comprador conozca el suyo (`DECISION PENDING`, es conocimiento de mercado del propietario).
   — `INFERRED`.
5. **Casi todo el beneficio de B se obtiene sin gastar la opción**, con una nota de horma en
   metafield más la guía de tallas en metaobject. — `VERIFIED` que el mecanismo existe y funciona
   (ejecutado); `INFERRED` que captura "casi todo" el beneficio.
6. **A conserva el hueco 3.** — `VERIFIED` que solo hay tres; `INFERRED` que conservarlo tiene valor.

### Lo que falta para poder decidir

| # | Dato | De quién |
| --- | --- | --- |
| 1 | ¿El catálogo del proveedor ofrece de verdad más de un ancho o material por modelo? | **Requiere Dropi. `NOT VERIFIED`** — sin cuenta ni credenciales no hay forma de comprobarlo, y no se va a suponer |
| 2 | ¿El público objetivo conoce su ancho de pie? | Propietario / conocimiento de mercado |
| 3 | ¿La línea de producto tendrá materiales distintos del mismo modelo, o modelos distintos? | Propietario. Decisión de producto |
| 4 | ¿Hay un eje de variación propio del concepto de marca que no esté en esta lista? | §1–172 |

**Mientras 1 y 3 sigan sin respuesta, cargar catálogo con tres opciones es una apuesta
irreversible.** Cargarlo con dos no cierra ninguna puerta que importe hoy.
