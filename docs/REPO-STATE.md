# Estado del repositorio

**Fecha:** 2026-10-02 · tras subir el theme optimizado a Shopify y cerrar el hueco que lo permitió.
**Comprobaciones:** 321 pruebas + 16 contratos de theme + 16 en navegador (iPhone) + 5 de
accesibilidad + 6 de rendimiento + 6 de seguridad + Theme Check (0 infracciones) + el theme coincide
con Shopify (62 de 62 archivos). **18/18 pasan, ninguna sin ejecutar.**
**Dependencias de runtime:** 0. **Dependencias opcionales de verificación:** 2, no versionadas.

---

## 1. Qué existe

```
README.md
package.json                            sin dependencias, type: module
.gitignore

docs/
  STANDARD.md                           estándar §173–246
  STATUS.md                             estado por área
  DISCOVERY.md                          hechos de plataforma verificados
  VERIFICATION-LOG.md                   lo comprobado POR EJECUCIÓN (§10: el theme)
  REQUIREMENTS.md                       requisitos, reversibilidad, contradicciones
  ARCHITECTURE.md                       comparación de stacks y modelos de datos
  STRATEGY.md                           estrategias por área
  THIRD-OPTION-ANALYSIS.md              las cuatro vías
  PROJECT-MAP.md                        mapa único de FASE 0
  REPO-STATE.md                         este archivo

shopify/
  README.md                             orden de ejecución para cuando exista la tienda N&E
  footwear-data-model.graphql           validado contra el esquema, NO ejecutado en N&E

src/
  README.md                             incluye límites de confianza
  lib/                                  12 módulos de DECISIÓN, funciones puras
    shopify-semantics.js                foldKey · isPurchasable · hasAvailabilityData
    variant-matrix.js                   tres estados de combinación
    size-advisor.js                     recomendación de talla y cruce con stock
    cart-line.js                        línea de carrito y atribuciones
    size-selected-event.js              evento ne:size_selected
    cod-guard.js                        validación de contra entrega (Colombia)
    product-contract.js                 contrato canónico de producto
    shopify-adapter.js                  Admin API y Storefront API a la forma canónica
    product-jsonld.js                   ProductGroup / hasVariant / variesBy
    analytics-taxonomy.js               embudo consciente de contra entrega
    responsive-image.js                 plan de imagen responsive (no construye URLs)
    a11y-contrast.js                    contraste WCAG y objetivo de pulsado
    __tests__/                          321 pruebas

theme/                                  THEME DE SHOPIFY, Online Store 2.0, escrito de cero
  layout/theme.liquid                   CSS del primer paint sobre content_for_header,
                                        import map, puentes de textos y rutas
  templates/                            12 plantillas, TODAS JSON (requisito de streaming)
  sections/                             18 secciones + 2 grupos
  snippets/                             9 snippets
  config/                               settings_schema.json · settings_data.json
  locales/                              es.default.json · es.default.schema.json
  assets/
    ne-tokens.css                       sistema de diseño: color, tipografía, espacio, rejilla
    ne-base.css                         reset, foco, tipografía, botones, rejilla de producto
    ne-components.css                   estilos de los componentes, UNA fuente
    ne-components.js                    el ÚNICO JavaScript escrito a mano
    ne-*.js                             12 copias GENERADAS de src/lib (no editar)

scripts/
  check.mjs                             18 comprobaciones con código de salida
  check-theme.mjs                       16 contratos entre marcado, script y ajustes
  check-components.mjs                  16 comprobaciones de comportamiento en Chromium (iPhone)
  check-a11y.mjs                        5 de accesibilidad sobre la página renderizada
  check-perf.mjs                        6 de presupuesto y carga, medidas
  theme-diff.mjs                        ¿lo que hay en Shopify es lo que hay aquí?
  check-security.mjs                    6 sobre la superficie real del theme
  sync-theme-assets.mjs                 publica src/lib como assets del theme
  fixtures/
    product-harness.html                ficha de producto (datos ficticios, etiquetados)
    cart-harness.html                   carrito con dos líneas y cobertura contra entrega
    cart-empty-harness.html             carrito vacío, que es un estado aparte
    home-harness.html                   portada (superficie inversa) y colección
    pixel.png                           imagen mínima, sin dependencia externa
```

Los cuatro bancos cargan **el CSS real, los textos reales del archivo de idioma y el mismo bootstrap
de maquetación que `theme.liquid`**. No copias: una copia se desincroniza y entonces la prueba mide
algo que la tienda no tiene. Pasó cuatro veces, y hay comprobaciones que ahora lo impiden.

---

## 2. La frontera que gobierna el código

**`src/lib` decide. `theme` presenta. `ne-components.js` conecta, y no decide nada.**

No es una preferencia de organización. Si la lógica de qué talla recomendar viviera en el
JavaScript del theme, sería código sin pruebas tomando decisiones de negocio, y una segunda
implementación divergiría de la probada. Por eso:

- `src/lib` son funciones puras, sin DOM, con 321 pruebas.
- `scripts/sync-theme-assets.mjs` las publica como assets del theme, reescribiendo los imports
  relativos a especificadores del import map. **No hay bundler ni paso de compilación.**
- La comprobación `assets del theme sincronizados` falla si alguien edita la copia.

### Por qué un import map y no imports relativos

Shopify sirve los assets en plano con un parámetro de versión en la URL. Un
`import './variant-matrix.js'` perdería ese parámetro, y el navegador podría servir una copia
caducada de un módulo junto a otra reciente. El import map de `theme.liquid` resuelve
`ne/variant-matrix` a la URL real con su versión.

---

## 3. Qué está terminado y verificado

| Pieza | Estado | Cómo se verificó |
| --- | --- | --- |
| 12 módulos de `src/lib` | terminado | 321 pruebas, barridos de `null` y de entrada adversaria |
| Sistema de diseño (CSS) | terminado | paleta validada con `a11y-contrast.js` **antes** de escribir CSS |
| Theme: layout, plantillas, secciones, snippets | terminado | **Theme Check: 44 archivos, 0 infracciones** |
| Selector de variantes, tres estados | terminado | Chromium, contra el CSS real |
| Reconciliación de selección | terminado | Chromium: cambiar de color suelta la talla imposible |
| Guía de tallas y recomendador | terminado | Chromium de punta a punta, incluida la coma decimal |
| Atribuciones de línea | terminado | Chromium: viajan las que existen, no las vacías |
| `ne:size_selected` | terminado | Chromium: una vez por talla distinta, sin dinero |
| Añadir al carrito sin recargar | terminado | Chromium, con la ruta de Shopify y la sección real |
| 3D progresivo | terminado (sin asset) | Chromium: los tres modos y el camino de fallo |
| **Compra sin JavaScript** | terminado | Chromium con JavaScript desactivado |
| Carrito sin recargar | terminado | Chromium: los totales los renderiza Shopify, no se recalculan |
| Cobertura contra entrega | terminado | Chromium: responde con lo que sabe y **calla lo que no** |
| Accesibilidad automatizable | terminado | 4 páginas, contraste y objetivos **medidos sobre lo renderizado** |
| Presupuestos de rendimiento | terminado | bytes comprimidos, módulos descargados y desplazamiento medidos |
| Seguridad del theme | terminado | 6 comprobaciones; encontró un XSS reflejado real |
| Pixel personalizado | escrito, sin destino | 6 comprobaciones; `DESTINATION` vacío no envía nada |
| Tubería de comprobaciones | terminado | **cada comprobación validada inyectando su fallo** |

---

## 4. Qué NO está terminado, y de qué depende

| Pendiente | Depende de |
| --- | --- |
| Catálogo real: productos, variantes, precios, materiales | **el dueño**. No se inventa (§191). |
| Assets: fotografía, modelo `.glb`, tipografía definitiva | **el dueño**. El theme ya los acepta. |
| Tienda Shopify de Nathan & Esteban | **el dueño**. La conexión actual apunta a Magisik. |
| Despliegue del theme | la tienda N&E + integración de GitHub (`VERIFICATION-LOG.md` §8) |
| Medición de performance | una página desplegada. Inventar un umbral sería inventar datos. |
| Auditoría con lector de pantalla | una página desplegada |
| Integración Dropi | credenciales y documentación reales. Hoy es `DOCUMENTED`. |
| Secciones §1–172 del estándar | **el dueño**. Anunciadas cuatro veces, nunca recibidas. |

---

## 5. Cómo se ejecutan las comprobaciones

```sh
node scripts/check.mjs          # las 14; las dos opcionales salen como N/E
```

Para ejecutar también las dos opcionales, sin añadirlas al repositorio:

```sh
NE_SHOPIFY_CLI=/ruta/a/shopify \
NE_PLAYWRIGHT=/ruta/a/playwright/index.js \
  node scripts/check.mjs
```

Sin ellas, el informe dice **`N/E` — NO EJECUTADA**, nunca `OK`. Una comprobación que no corrió no
da ninguna garantía, y presentarla como verde es fabricar un éxito (§183).
