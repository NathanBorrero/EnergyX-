# Desplegar el theme

> **Nada de esto se ha ejecutado.** La tienda de Nathan & Esteban no existe todavía, y la política de
> red del entorno de desarrollo deniega el dominio de la tienda disponible, así que no se pudo
> comprobar el resultado de una subida (`VERIFICATION-LOG.md` §11.5). Lo que sigue son los pasos con
> los hechos de plataforma que **sí** están verificados, marcando qué es `VERIFICADO` y qué no.

## Lista corta

1. Crear la tienda de Nathan & Esteban. **No reutilizar la tienda existente.**
2. Conectar el repositorio por **Online Store → Themes → Add theme → Connect from GitHub**, apuntando
   a la rama de trabajo.
3. **Previsualizar.** No publicar todavía.
4. Cargar el catálogo real y los metaobjects (`shopify/README.md`).
5. Revisar los ajustes del theme en el editor: tipografía, 3D, contra entrega, analítica.
6. Pegar el pixel personalizado (`shopify/pixel/README.md`).
7. Medir con Lighthouse sobre la URL de previsualización, con `?pb=0`.
8. Publicar.

## 1. La tienda

El theme asume una tienda **de Nathan & Esteban**. La conexión de desarrollo actual apunta a otra
tienda, que no es este proyecto, y de ahí no debe salir ningún dato como si fuera de N&E.

Dos hechos verificados que condicionan el catálogo:

| Hecho | Valor | Consecuencia |
| --- | --- | --- |
| Máximo de opciones por producto | **3** | Color + Talla deja una libre. No caben Color + Talla + Ancho + otra. |
| Máximo de variantes por producto | **2048** | Holgado para calzado. |
| Combined listings | **solo Shopify Plus** | Un producto por modelo, con opciones. **No hay URL por color.** |
| Shopify Payments en Colombia | no disponible | El pago se resuelve con otra pasarela o contra entrega. |
| `supportedDigitalWallets` | **vacío** | No hay checkout acelerado. Todo el peso de conversión cae en el storefront. |

Ese último punto es el que justifica el esfuerzo puesto en la ficha de producto: no hay un botón de
pago rápido que salve una ficha mediocre.

## 2. Conectar por GitHub, no subir por API

**Por qué la integración de GitHub y no la API:** se comprobó por ejecución que la conexión
`themeFilesUpsert` **escribe** archivos de theme, pero `themeFilesDelete` está **bloqueado**
(`VERIFICATION-LOG.md` §8). Con esa asimetría, un despliegue por API puede añadir y no puede
retirar, y un archivo huérfano en un theme es un archivo que se sirve. Con git, el control de altas y
bajas está en el repositorio.

### Pero la API sí sirve para actualizar, y así se hizo en el banco de pruebas

`VERIFICADO` ejecutándolo (`VERIFICATION-LOG.md` §20): **`themeFilesUpsert` reemplaza un archivo EN
SITIO** en un theme no publicado. No hace falta crear un theme nuevo por cada cambio, que es lo que
yo había supuesto mal.

El ciclo completo, los cuatro pasos:

1. `stagedUploadsCreate` con `resource: FILE` → devuelve un destino firmado.
2. `POST` multipart a `shopify-staged-uploads.storage.googleapis.com` con los parámetros que devolvió,
   y el archivo al final. Responde **201** y un `ETag` que es el md5 de lo subido: ahí ya se puede
   comprobar que llegaron los bytes correctos.
3. `themeFilesUpsert` con `body: { type: URL, value: <resourceUrl> }`. Devuelve un job.
4. Cuando el job está `done`, consultar `checksumMd5` del archivo y **compararlo con el md5 local**.

El paso 4 no es opcional. Sin él, lo único que se sabe es que la mutación no dio error.

### Y después, comprobar que la tienda y el repositorio no se han separado

```bash
node scripts/theme-diff.mjs shopify/theme-remote-manifest.json
```

Compara los 62 archivos. Dos avisos sobre cómo leerlo:

- Para las **plantillas JSON** el checksum de Shopify **no sirve**: Shopify las reescribe y su
  checksum no corresponde a nada reproducible en local (§20.2). La herramienta las compara
  semánticamente, con la huella guardada en el retrato.
- El retrato es una **foto con fecha**. Que coincida demuestra que cada archivo del theme es idéntico
  al que Shopify tenía **entonces**; no demuestra lo que Shopify sirve ahora.

Para refrescar el retrato hace falta el volcado de la Admin API **con los cuerpos de las
plantillas**:

```bash
node scripts/theme-diff.mjs --snapshot volcado.json > shopify/theme-remote-manifest.json
```

Tres cosas que conviene saber **antes** de conectar, porque después pesan (`DOCUMENTADO`, no
verificado contra una tienda):

- La sincronización es **bidireccional y no se puede desactivar.** Cualquier edición que alguien haga
  en el editor de código del admin vuelve al repositorio como un commit.
- Solo acepta la **estructura de carpetas por defecto** de un theme. Es exactamente la razón por la
  que este theme no tiene paso de compilación y usa un import map: un `dist/` obligaría a una rama de
  despliegue aparte.
- Una rama **desconectada no se puede reconectar**: al volver a conectarla se crea un theme nuevo.
  Así que no conviene desconectar para «probar».

La rama de trabajo actual es `claude/dreamy-maxwell-js5745`.

## 3. Previsualizar antes de publicar

Publicar es lo único realmente visible para un comprador. Antes:

- Recorrer portada, colección, ficha de producto, carrito y carrito vacío.
- Probar la ficha **con JavaScript desactivado**: tiene que poderse comprar. Es un requisito del
  diseño, no una cortesía, y está verificado en Chromium — pero verificarlo también en la tienda real
  cuesta un minuto.
- Probar una combinación que **no exista** (una talla que no se fabrique en un color) y comprobar que
  el mensaje es «no se fabrica», distinto de «agotado».

## 4. Catálogo y metaobjects

El orden y las operaciones están en [`../shopify/README.md`](../shopify/README.md), con las
operaciones GraphQL ya validadas contra el esquema en `footwear-data-model.graphql`.

Lo que el theme necesita para que sus piezas aparezcan:

| Pieza del theme | Qué necesita | Si falta |
| --- | --- | --- |
| Guía de tallas y recomendador | metaobject `size_chart` con medidas reales, referenciado desde el producto | no se muestra. **No se inventa una tabla**: una equivalencia falsa provoca justo las devoluciones que esto evita. |
| Nota de horma | metaobject `fit_profile` | no se muestra |
| Swatches de color | metaobject estándar `shopify--color-pattern`, con `image` para una foto del material | cae al cuadrado de color plano |
| Visor 3D y AR | un `.glb` real subido como media del producto | no aparece ningún control de 3D. La fotografía es la experiencia completa. |
| Ficha técnica | metafields de corte, suela y cuidado | la fila sale como `PENDIENTE`, no inventada |

**Contrato que hay que respetar al cargar:** la etiqueta de cada fila de `size_chart` debe coincidir
con el **valor** de la opción de talla. Si la opción «Talla» tiene el valor `42`, la fila debe ser
`label: "42"`. La comparación tolera espacios y mayúsculas, pero no dos nomenclaturas distintas: eso
es un error de carga de catálogo que deja el recomendador sin cruzar con el stock.

## 5. Ajustes del theme

| Ajuste | Qué hace | Nota |
| --- | --- | --- |
| Tipografía (cuerpo y display) | `font_picker` de Shopify | **DECISION PENDING.** Se cambia en el editor sin tocar código, y no hay hosting de fuentes externo. |
| `product_3d_mode` | `off` / `on_demand` / `eager` | `on_demand` es el valor sensato. `eager` se degrada solo en dispositivos modestos o con menos movimiento pedido. |
| Guía de tallas / recomendador | muestran las piezas de talla | sin metaobject no aparecen, estén activadas o no |
| Pago contra entrega | activa el bloque de cobertura en el carrito | **con la lista vacía no se muestra nada.** Sin cobertura real no se afirma cobertura. |
| Evento de talla | publica `ne:size_selected` | activado por defecto |

## 6. El pixel

[`../shopify/pixel/README.md`](../shopify/pixel/README.md). Resumen: Settings → Customer events →
Add custom pixel, pegar el archivo, conectar con el permiso de **Analytics**.

Con `DESTINATION` vacío **no envía nada**: hay que poner la URL del recolector cuando exista. No se
inventó un endpoint.

## 7. Medir, de verdad

Solo aquí se puede medir lo que no se pudo medir en desarrollo. Método verificado:

- **CPU 4× y 4G lento a la vez** (1,6 Mbps / 750 Kbps / 150 ms RTT).
- **Tres ejecuciones, y se toma la mediana.** Una sola medición no dice nada.
- **`?pb=0`** en la URL para desactivar la barra de previsualización, que si no entra en la medida.

Umbrales de la tienda de themes: rendimiento **≥60** y accesibilidad **≥90** de media entre portada,
colección y ficha, en escritorio y en móvil. El peso de la puntuación de velocidad es **colección
43%, ficha 40%, portada 17%**: la colección es lo que más cuenta, y es contraintuitivo.

Lo que ya está medido en local y debería sostenerse: **44 KB comprimidos** de CSS + JS en la ficha,
**desplazamiento de maquetación 0.0000**, y la ficha descargando **seis** módulos y no los doce que
el import map declara.

## 8. Publicar

Y después, lo único que no se puede automatizar desde aquí: mirar la tienda como la mira un
comprador, en un teléfono de verdad, con la red de verdad.
