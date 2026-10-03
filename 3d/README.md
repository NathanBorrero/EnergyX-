# Estudio 3D · zapatilla de cancha N&E

Un modelo 3D **fuera de la página**: no está puesto en la tienda, no es una
sección del theme y no toca el rendimiento de NATHAN & ESTEBAN.

**Visor publicado:** https://claude.ai/artifact/3gqeJhQjALR1hbsKkmcojP

---

## Qué es

Una **zapatilla baja de cancha** (court low-top) modelada por código:

- **Cupsole en cuña** — lisa, con ranura de costado y escalón del piso. Más
  gruesa en el talón (27 mm) que en la punta (19 mm).
- **Tope de puntera** cosido, con perforaciones.
- **Las dos bandas de NATHAN & ESTEBAN**, en relieve de 4 mm sobre el cuarto,
  cosidas por los dos cantos. 12 mm de ancho real, inclinadas ~56°.
- **Ojales metálicos** y **cordones planos** (cinta, no cordón redondo).
- **Pespunte de paneles**: puntera, talonera, ribete del cordonaje y la unión
  del corte con la suela.
- **Piso** de onda fina transversal con pivote circular en el antepié y surco
  de flexión en la cintura.

## Qué NO es

- **No es el producto final.** Es un estudio de forma.
- **Las dos bandas sí son de NATHAN & ESTEBAN** y por eso están modeladas.
- **No reproduce nada de terceros**: la foto de referencia lleva un nombre
  grabado en la talonera que es de otra empresa, y eso no se copia.
- **Las medidas y los colores son PLACEHOLDER** hasta que exista el zapato real.
- La tipografía del visor también es PLACEHOLDER: la de la marca no está decidida.

## Archivos

| Archivo | Qué hace |
|---|---|
| `make_sneaker.py` | Genera `MODEL.glb`. Sin dependencias: `python3 make_sneaker.py`. |
| `make_sole.py` | Estudio anterior, sólo la suela. Genera `sole-study.glb`. |
| `MODEL.glb` | El modelo. 50.624 triángulos, 28.059 vértices, 962 KB, 9 materiales. |
| `visor/artifact.html` | El visor publicado, en un solo archivo. |
| `visor/viewer.html` + `glb.js` + `render.js` | El mismo visor en módulos, para trabajar. |
| `visor/shoot.cjs` `movil.cjs` `tonos.cjs` | Las comprobaciones: render por vistas, móvil 390 px, tono medido. |
| `render/` | Los renders con los que se verificó la forma. |

## Cómo está hecho el modelo

Secciones transversales a lo largo de una horma. Cada sección es un arco:
`θ=0` en el canto de la entresuela, `θ=π/2` en lo alto del empeine, `θ=π` en el
canto contrario. El corte cubre de `θ=0` hasta `θ_borde(t)`.

Donde `θ_borde(t) = π/2` el corte se cierra por arriba — talón y puntera.
Donde `θ_borde(t) < π/2` hay **agujero**: la entrada del pie y el cordonaje.

Esa única función (`ABRE` en el código) es la que separa un zapato de un bulto.
Cambiar la horma (`ANCHO`, `ALTO`, `ABRE`) cambia el zapato entero de forma
coherente, que es como funciona el CAD de calzado de verdad.

Las bandas, el pespunte, las perforaciones y los ojales **no** salen de
desplazar la superficie: a esta resolución eso da papilla, no detalle. Son
geometría aparte, con su propio material.

Piezas y materiales: `CORTE`, `CUELLO`, `ENTRESUELA`, `PISO`, `PLANTILLA`,
`HERRAJE`, `CORDONES`, `PERFORACION`, `PESPUNTE`.

## Cómo está hecho el visor

Sin librerías y sin CDN de terceros: lector GLB propio y WebGL2 directo.

- Luz de tres puntos, sombra proyectada con stencil y suelo de papel.
- Acabados **ORIGINAL / WHITE / GREY / BLACK**. El cambio conserva la relación
  tonal entre materiales y recoloca el conjunto; el herraje sigue siendo metal.
  Los anclajes están en luz lineal, calibrados contra el tono medido en pantalla.
- Vistas 3/4, perfil, punta, talón, planta y suela. Órbita con ratón, dedo o
  teclado. Rueda para acercar.
- **Estructura** enseña la malla. **Fondo** cambia a oscuro.
- **Sustituir el modelo**: se suelta un `.glb` encima o se elige con el botón.
  Se lee en el navegador; no se sube a ningún sitio.

El lector entiende mallas, jerarquía de nodos, materiales PBR y texturas
embebidas. **No** entiende Draco, skins, animaciones ni morph targets: si un
archivo los necesita, lo dice en voz alta en vez de dibujar algo incompleto.

## Para sustituirlo por el zapato real

El visor acepta cualquier `.glb` autocontenido. Cuando exista el modelo real de
NATHAN & ESTEBAN, se suelta encima y este estudio deja de hacer falta.
