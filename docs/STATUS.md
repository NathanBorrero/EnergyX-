# EnergyX — Estado de verificación

**Fecha del informe:** 2026-10-02
**Rama:** `claude/dreamy-maxwell-js5745`
**Método:** inspección directa del repositorio y del entorno de ejecución, más investigación de
plataforma sobre documentación oficial. Sin suposiciones (§191).

**Documento hermano:** [`DISCOVERY.md`](DISCOVERY.md) — base de hechos de plataforma verificados,
opciones de arquitectura y sus restricciones.

---

## 1. Estado real del proyecto

El repositorio `NathanBorrero/EnergyX-` estaba **vacío** al iniciar este informe:
0 commits, 0 ramas, 0 archivos. Verificado por dos vías independientes
(`git` local sobre el clon y la API de GitHub, que devolvió
`409 Git Repository is empty`).

**Ahora existe código.** Dos cuerpos, con una frontera deliberada:

- **`src/lib/`** — 12 módulos de decisión, funciones puras, **321 pruebas**, cero dependencias.
  Es donde viven las reglas: qué combinaciones existen, qué talla se recomienda, qué se escribe en
  la línea del carrito, qué contraste cumple.
- **`theme/`** — un theme de Shopify (Online Store 2.0) escrito de cero: 12 plantillas JSON, 18
  secciones, 9 snippets, el sistema de diseño en CSS y un único archivo de JavaScript escrito a
  mano que **no decide nada**: conecta el DOM con esos módulos. Los demás `theme/assets/ne-*.js`
  son copias generadas de `src/lib`, verificadas sin deriva.

**FASE 2 está cerrada.** El stack es **Shopify Theme / Liquid**, por las razones de
`ARCHITECTURE.md`, y el theme pasa el linter oficial de Shopify sin infracciones.

Lo que sigue siendo `PLACEHOLDER` son los **datos comerciales**, no el mecanismo: no hay productos,
precios, materiales ni assets de Nathan & Esteban, y no se inventan.

## 2. Informe de autoverificación (§235)

`VERIFIED` requiere evidencia. Sin código, casi todo es `PLACEHOLDER`.

| Área | Estado | Evidencia / motivo |
| --- | --- | --- |
| Arquitectura | `VERIFIED` (decidida) | **Shopify Theme / Liquid, Online Store 2.0, de cero.** Razonada en `ARCHITECTURE.md` frente a cuatro opciones y confirmada por la directiva Shopify-primero. El theme existe y pasa Theme Check. |
| Shopify — tienda | `VERIFIED`, pero **es la tienda equivocada** | Conectado a **Magisik** (`magisik.store`), plan **Basic**, COP, Colombia. 4 productos, todos de belleza, **cero footwear**. No es Nathan & Esteban. Ver `DISCOVERY.md` §13. |
| Shopify — deploy | `PARTIAL` | **Corregido:** la conexión **sí escribe** archivos de theme no publicado (`themeFilesUpsert` ejecutado con éxito), pero **no puede borrarlos** ni escribir en el theme `MAIN`. Esa asimetría hace de la integración de GitHub la vía de despliegue. Ver `VERIFICATION-LOG.md` §8. |
| Modelo de datos footwear | `VERIFIED` (mecanismo) | Probado por ejecución en el entorno de pruebas: opciones, matriz de variantes, disponibilidad, swatches y guía de tallas. Receta en `shopify/`. Los **datos** siguen siendo `PLACEHOLDER`. |
| Shopify — plataforma | `VERIFIED` | Capacidades, límites y matriz de planes leídos de documentación oficial. Ver `DISCOVERY.md` §1–§7. |
| Dropi | `DOCUMENTED` | Ver §4. Nada comprobado contra una cuenta real. |
| Ecommerce | `PARTIAL` | Ficha de producto, selector de variantes, carrito y formulario de compra implementados y verificados en navegador. **Se compra sin JavaScript** (`<form>` real a la ruta de carrito de Shopify). Falta catálogo real. |
| 3D | `PARTIAL` | Sistema progresivo implementado con `model_viewer_tag` nativo: puertas de WebGL, ahorro de datos, dispositivo modesto y menos movimiento; fallback a fotografía verificado. **Sin modelo `.glb` real**, y no se finge tenerlo. |
| Motion | `PARTIAL` | Una curva de easing y tres duraciones en `ne-tokens.css`. Sin animación decorativa, por dirección de arte. |
| Mobile | `PARTIAL` | Rejilla de dos columnas en móvil, objetivos de pulsado de 44px, `clamp()` en toda la escala tipográfica. **Sin medición en dispositivo real.** |
| Performance | `PARTIAL` | Arquitectura a favor: elegibilidad de streaming verificada por comprobación automática, CSS del primer paint por encima de `content_for_header`, `image_url`/`image_tag` sin forzar formato, módulos diferidos, cero dependencias de runtime. **Sin medición**: exige una página desplegada. |
| Security | `PARTIAL` | Solo política documentada (§197–§211). Sin superficie que auditar. |
| SEO | `PARTIAL` | `ProductGroup` + `hasVariant` + `variesBy` implementado con detección de colisiones de propiedad; metadatos sociales; plantillas JSON. Sin medir en buscador. |
| Accessibility | `PARTIAL` | Paleta validada con el propio `a11y-contrast.js` **antes** de escribir CSS (encontró un borde a 2.37:1 contra un mínimo de 3:1). Foco visible, enlace de salto, estados anunciados a lector de pantalla, 44px de objetivo. **Sin auditoría con lector de pantalla real.** |
| Analytics | `PARTIAL` | `ne:size_selected` implementado y verificado en navegador: publica una vez por talla distinta, nunca lleva dinero, y las atribuciones de línea —que **persisten al pedido**— son el canal autoritativo. |
| Assets | `PLACEHOLDER` | Ningún asset de marca o producto en el repositorio. |
| Claims | `PLACEHOLDER` | Ningún claim de producto conocido ni verificado. |
| Marca / categoría | `VERIFIED` (por el propietario) | Nathan & Esteban, footwear premium. Dirección de arte concreta sigue pendiente (§1–172). |

## 3. Entorno de ejecución — verificado

| Elemento | Estado |
| --- | --- |
| Node | `v22.22.0` — verificado |
| npm | `10.9.4` — verificado |
| Python | `3.11.15` — verificado |
| git | `2.43.0` — verificado |
| Shopify CLI | **no instalado** — verificado |
| Connector Shopify (MCP) | **requiere re-autenticación** — verificado por fallo de llamada |
| Egress de red | restringido por política de la organización — verificado |
| `shopify.dev` | **bloqueado** — verificado. Mitigado vía el conector MCP de Shopify, que devuelve el mismo contenido con su URL |
| `help.shopify.com` | **bloqueado** — verificado. Sin fuente primaria de facturación y comisiones |
| `apps.shopify.com` | **bloqueado** — verificado. Sin auditoría del listado oficial de la app de Dropi |
| `search_docs_chunks` (MCP Shopify) | **funciona sin autenticar** — verificado. Única vía autoritativa a documentación de Shopify en este entorno |

## 4. Dropi — clasificación honesta (§186)

Lo que se encontró en investigación pública, **sin ninguna comprobación contra una
cuenta real**:

| Afirmación | Estado | Fuente |
| --- | --- | --- |
| Dropi es una plataforma de dropshipping/fulfillment de origen colombiano con operación en varios países de LATAM | `DOCUMENTED` | Material público de Dropi y terceros |
| Existe una app oficial en el Shopify App Store ("Dropify", publicada por Dropi) que sincroniza productos y creación de pedidos | `DOCUMENTED` | Listados del App Store vía buscador; **la página del listado no se pudo abrir** (egress bloqueado) |
| La app importa productos de Dropi a Shopify y, al crearse un pedido en Shopify, lo crea en Dropi | `DOCUMENTED` | Descripción del listado vía buscador |
| Existe API propia con credenciales generables desde el panel (Configuración → Desarrolladores) | `UNVERIFIED` | Solo blogs de terceros y documentos subidos a Scribd. **No es documentación oficial autenticable.** |
| Endpoints, parámetros, autenticación y límites concretos de esa API | `UNVERIFIED` | **No se documentan aquí a propósito.** Transcribir endpoints de fuentes no oficiales sería inventar información técnica (§187). |
| Sincronización de inventario en tiempo real Dropi → Shopify | `UNVERIFIED` | No confirmado por fuente fiable |

**Regla aplicada:** nada de lo anterior sube a `VERIFIED` hasta ejecutarlo contra una
cuenta real de Dropi. `DOCUMENTED` nunca se convierte en `VERIFIED` (§186).

## 5. LIMITATIONS (§236)

1. **Secciones 1–172 del estándar no están disponibles.** Presumiblemente contienen
   marca, producto, arquitectura y dirección de arte. Sin ellas, construir implicaría
   inventar (§187) y suponer (§191).
2. **Shopify no es verificable ahora.** El connector pide re-autenticación; no se puede
   leer tienda, productos, variantes, inventario ni probar checkout (§184, §185).
3. **Dropi no es verificable ahora.** Sin cuenta ni credenciales. Documentación oficial
   no accesible públicamente.
4. **Tres hosts de Shopify bloqueados por la política de egress** (`shopify.dev`,
   `help.shopify.com`, `apps.shopify.com`). Consecuencias concretas: no se pudo auditar
   el listado oficial de la app de Dropi ni sus scopes, y **las cifras de planes,
   comisiones y la exención de métodos de pago manuales quedan en `DOCUMENTED`**, no
   verificadas. La documentación técnica de Shopify sí fue accesible vía el conector MCP.
5. **Shopify CLI no instalado.** Sin `theme check` ni `theme dev` hasta instalarlo —
   relevante solo si el stack es un theme Liquid (decisión D2).
6. **Sin QA visual.** No hay aplicación que capturar (§213).
7. **Performance sin medir.** No se afirma nada sobre velocidad (§188).

## 6. Deuda técnica (§237)

| Ítem | Por qué existe | Impacto | Prioridad | Solución |
| --- | --- | --- | --- | --- |
| Estándar incompleto en repo (faltan §1–§172) | No fueron entregadas a esta sesión | Alto: el brief de producto y la dirección de arte no son auditables | Alta | Incorporarlas a `docs/` |
| Sin pipeline de QA (lint, build, tests, a11y, audit) | El stack aún no está decidido (§212) | Medio: nada automatizado | Alta, en cuanto se decida D2 | Configurar junto al scaffold |
| Dropi sin contrato de integración definido | Falta acceso y documentación oficial | Alto si se vende con COD vía Dropi | Alta | Decidir D5 y verificar con cuenta real |

## 7. Decisiones críticas abiertas (§190 CRÍTICA, §192, §224)

Ninguna puede resolverse por placeholder: cada una cambia materialmente la arquitectura
o el resultado comercial.

| ID | Decisión | Por qué es crítica |
| --- | --- | --- |
| **D1** | Secciones 1–172 del estándar (dirección de arte y requisitos) | **ABIERTA.** Marca y categoría ya definidas por el propietario: Nathan & Esteban, footwear premium. Falta la dirección de arte concreta y el peso de cada criterio |
| **D2** | Stack: theme · Hydrogen+Oxygen · Hydrogen preview · sitio propio + Web Components | **ABIERTA.** Cuatro opciones con restricciones ya verificadas en `DISCOVERY.md` §10. Depende de D1 |
| **D3** | Catálogo real de footwear: modelos, tallas, colores, materiales, precios, claims | **ABIERTA, no bloquea arquitectura.** La tienda de N&E no existe aún, así que el catálogo se creará, no se leerá. Hasta entonces, placeholder explícito (§191) |
| ~~D4~~ | ~~Acceso a Shopify~~ | **RESUELTA.** Conexión verificada; apunta a Magisik (Basic). N&E no tiene tienda aún → se necesita un development store. Plan objetivo: **Advanced**. Ver `DISCOVERY.md` §13–§14 |
| **D5** | Dropi: app nativa Dropify vs integración propia por API; cuenta y credenciales | **ABIERTA, degradada.** El propietario la marcó como "cuando corresponda": es condicional, no un requisito de lanzamiento |

**Estado al 2026-10-01:** D4 resuelta. D5 degradada a condicional. D3 no bloquea arquitectura.
**Solo D1 bloquea la recomendación de arquitectura (D2).**

**Refinamiento:** la investigación de plataforma ya acotó el espacio de D2 a cuatro opciones con
sus restricciones verificadas, y añadió dos variables que antes no estaban en la lista — la
naturaleza real del 3D y el plan de Shopify contratado. Ver [`DISCOVERY.md`](DISCOVERY.md) §10–§11.
