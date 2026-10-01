# EnergyX — Estándar de Ejecución

> Documento de gobierno del proyecto. Define **cómo** se construye, revisa y entrega.
> No define **qué** se construye: eso vive en el brief de producto y marca (ver `STATUS.md` → Decisiones críticas abiertas).

## Alcance de este documento

Contiene las secciones **173 a 246** del estándar.

**Las secciones 1 a 172 no están en este repositorio.** Se presume que definen marca,
producto, arquitectura, dirección de arte y assets. Hasta que se incorporen, toda
decisión que dependa de ellas se trata como **ambigüedad crítica** (§192) y se
documenta como placeholder explícito (§191), nunca se supone.

---

## 173. Directiva máxima de ejecución

Este proyecto se trata como un sistema de producción real de alta exigencia.

Queda descartada la ejecución basada en: "hacerlo rápido", "hacerlo funcionar una vez",
"cumplir superficialmente", "usar una plantilla y modificarla", "generar algo
suficientemente bueno", "asumir que el usuario no notará los errores".

El ciclo obligatorio es:

**CREAR → EVALUAR → DETECTAR → CORREGIR → VOLVER A EVALUAR → OPTIMIZAR → VOLVER A CORREGIR → VALIDAR → ENTREGAR.**

Se repite durante todo el proyecto.

## 174. Regla de autocorrección continua

Un componente **no** está terminado porque compile, cargue, no muestre errores
evidentes, "se vea bien", funcione en un único dispositivo o pase una prueba
superficial.

Cada componente pasa por revisión interna contra estas 20 preguntas:

1. ¿Funciona?
2. ¿Está correctamente integrada?
3. ¿Es responsive?
4. ¿Es accesible?
5. ¿Es rápida?
6. ¿Es mantenible?
7. ¿Es segura?
8. ¿Es visualmente coherente?
9. ¿Es suficientemente original?
10. ¿Tiene alguna dependencia innecesaria?
11. ¿Existe una solución mejor?
12. ¿Hay algún error silencioso?
13. ¿Qué sucede si falla?
14. ¿Qué sucede en móvil?
15. ¿Qué sucede con conexión lenta?
16. ¿Qué sucede si JavaScript falla?
17. ¿Qué sucede si WebGL falla?
18. ¿Qué sucede si Shopify devuelve un error?
19. ¿Qué sucede si el producto está agotado?
20. ¿Qué sucede si el usuario interactúa de una manera inesperada?

Al encontrar un problema: **no se reporta solamente — se corrige**, y después se vuelve a comprobar.

## 175. Iteración hasta alcanzar el estándar

No existe un número fijo de iteraciones. La cantidad de iteraciones no es el objetivo:
el objetivo es alcanzar el estándar definido en este documento.

## 176. Gate de originalidad (obligatorio)

Ante cada propuesta visual importante se ejecuta un **ORIGINALITY GATE**. Se analiza
si el diseño parece: Shopify genérico, theme premium, plantilla de Webflow, plantilla
de Framer, landing de SaaS, landing de startup, tienda de dropshipping, imitación de
Nike/Adidas/Gymshark/Mattelsa, cyberpunk genérico, Apple genérico, "futurista"
genérico, "minimalista" genérico, demo de Three.js, demo de WebGL, o página creada por
IA sin dirección artística.

Si la respuesta es **sí**: no se da por válido. Se rediseña.

## 177. Rechazo automático de diseños genéricos

Una solución que parezca "algo que ya he visto cientos de veces" se descarta. No se
justifica con "es moderna", "es premium", "es minimalista" ni "es tendencia".

Genérica → **rechazar** y generar alternativa. Segunda genérica → rechazar. Tercera
genérica → rechazar. Se continúa hasta obtener una dirección visual diferenciada.

## 178. Diferenciación real

Cambiar colores, cambiar tipografía, añadir animaciones o añadir Three.js **no es**
diseñar algo diferente.

La diferenciación proviene de una combinación coherente de: composición, narrativa,
dirección de arte, producto, fotografía, movimiento, interacción, tipografía,
espacialidad, comportamiento, sonido cuando sea apropiado, estructura, ritmo,
transición y microinteracciones.

## 179. Anti-prompt generation

No se construye preguntando "¿qué suele hacer una IA cuando le piden una página
premium?". Se hace lo contrario.

Patrones a evitar: hero con texto gigante + botón + imagen; tres cards; sección de
beneficios; testimonials genéricos; FAQ genérico; newsletter; footer estándar;
gradientes aleatorios; blobs; glassmorphism sin propósito; partículas; cursor
personalizado innecesario; parallax por defecto.

Cada elemento justifica su existencia.

## 180. Test de necesidad

Para cada elemento importante: **¿qué aporta?** "Se ve bonito" no es suficiente.

Debe aportar al menos una de: marca, comprensión, producto, navegación, descubrimiento,
confianza, conversión, interacción, diferenciación.

Si no aporta ninguna: **eliminarlo**.

## 181. No añadir por añadir

La calidad no aumenta proporcionalmente con el número de componentes.

Si una sección puede eliminarse y la experiencia mejora → eliminarla. Igual para una
animación. Si una librería puede eliminarse y el sistema sigue funcionando →
eliminarla. Si un texto puede reducirse sin perder información → reducirlo.

## 182. Quality gate visual

**Composición** — ¿existe jerarquía? ¿existe foco? ¿existe espacio? ¿el producto domina
cuando debe? ¿la composición respira?

**Tipografía** — ¿existe jerarquía? ¿hay demasiados tamaños? ¿el tracking tiene
sentido? ¿la lectura es cómoda?

**Color** — ¿el color tiene propósito? ¿el producto conserva protagonismo? ¿existe
consistencia?

**Motion** — ¿la animación comunica algo? ¿tiene buen timing? ¿es demasiado lenta? ¿es
demasiado rápida? ¿interrumpe la compra?

**Interacción** — ¿el usuario entiende qué puede hacer? ¿existe feedback? ¿existe
estado hover, active, loading y error?

## 183. Quality gate de código

Buscar y corregir antes de entregar: errores; warnings; imports innecesarios;
dependencias innecesarias; funciones duplicadas; código muerto; variables sin utilizar;
listeners sin cleanup; memory leaks; requests duplicadas; assets cargados
innecesariamente; componentes demasiado grandes; lógica mezclada; secretos expuestos;
URLs hardcodeadas innecesariamente; datos falsos; TODOs críticos; placeholders
olvidados.

## 184. Quality gate de ecommerce

Verificar la cadena real: **PRODUCTO → VARIANTE → PRECIO → STOCK → ADD TO CART → CART → CHECKOUT.**

No basta con verificar visualmente. Se comprueba la lógica.

## 185. Quality gate de Shopify

Comprobar: Liquid; templates; sections; snippets; settings; product data; variants;
cart; URLs; forms; product handles; inventory; checkout; theme validation.

No se asume que algo funciona porque "Shopify debería hacerlo". Se comprueba.

## 186. Quality gate de Dropi

No se afirma que Dropi está conectado si no fue realmente verificado. Estados:

| Estado | Significado |
| --- | --- |
| `VERIFIED` | Comprobado realmente. |
| `DOCUMENTED` | Existe documentación que indica que debería funcionar. |
| `UNVERIFIED` | No se pudo comprobar. |
| `PLACEHOLDER` | Todavía no implementado. |

**Nunca se convierte `DOCUMENTED` en `VERIFIED`.**

## 187. Zero hallucination protocol

Prohibido inventar información técnica: APIs; endpoints; funciones; parámetros;
credenciales; documentación; capacidades; integraciones; precios; límites; resultados;
métricas; compatibilidad.

Si no se sabe → **investigar**. Si no se puede verificar → **marcar como no verificado**.

## 188. Zero fake success

Nunca "listo" si existe un problema importante. Nunca "todo funciona" si no se pudo
probar todo. Nunca "seguro" tras una revisión superficial. Nunca "optimizado" sin
medir. Nunca "integrado" sin comprobar la integración.

La precisión es más importante que aparentar éxito.

## 189. Silencio durante la ejecución

En tareas largas de construcción no se gasta la interacción en narración
("voy a comenzar", "estoy trabajando", "ya casi"). Se trabaja, investiga, construye,
prueba y corrige.

## 190. Información crítica faltante

No se detiene todo el proyecto por información no crítica. Clasificación:

| Clase | Definición | Acción |
| --- | --- | --- |
| **CRÍTICA** | Sin esto no se puede tomar correctamente una decisión arquitectónica o comercial. | Preguntar. |
| **IMPORTANTE** | Puede bloquear una parte concreta. | Construir todo lo demás y dejar esa parte preparada. |
| **NO CRÍTICA** | Puede usarse placeholder. | Continuar. |

## 191. Regla de no suposición

Nunca suponer: precio; tamaño; materiales; claims; beneficios; colores oficiales;
especificaciones; certificaciones; garantías; tiempos de entrega; políticas;
integraciones.

Cuando falte → **placeholder explícito**.

## 192. Preguntas antes de codificar

Antes de una fase irreversible se verifica que las variables realmente críticas estén
claras. Ante ambigüedad crítica: preguntar **antes** de escribir la implementación
afectada.

Solo las preguntas cuya respuesta cambie materialmente arquitectura, funcionalidad o
resultado.

## 193. Autonomía controlada

Una decisión suficientemente definida no se vuelve a preguntar. No se pide autorización
para: corregir bugs; mejorar accesibilidad; arreglar responsive; optimizar assets;
corregir errores; refactorizar; mejorar performance; eliminar código muerto.

## 194. No romper lo que ya funciona

Antes de modificar: comprender dependencias. Después: volver a probar las
funcionalidades relacionadas — especialmente cart, product, variants, checkout,
Shopify, Dropi, analytics, 3D y mobile.

## 195. Cambios quirúrgicos

Problema localizado → no se destruye la arquitectura. Cambios pequeños, controlados,
reversibles y verificables. Después se prueba.

## 196. Regression test

Cada modificación importante activa una revisión de regresión:
**¿qué podría haber roto este cambio?** Se prueban esas áreas específicamente.

## 197. Seguridad — modelo real

"Inhackeable" no es un objetivo técnicamente realista. El objetivo es:

**minimizar la superficie de ataque + proteger datos + reducir impacto + evitar secretos expuestos + validar todo lo necesario.**

## 198. Security by design

La seguridad está presente desde la arquitectura, no se añade al final. Se evalúa:
autenticación; autorización; validación; sanitización; CSP; CORS cuando corresponda;
HTTPS; cookies; sesiones; rate limiting cuando aplique; webhooks; API keys; secrets;
dependencias; third-party scripts; XSS; CSRF cuando aplique; inyección; open redirects;
exposición de información; logging; errores.

## 199. Principio de menor privilegio

Cada sistema tiene solamente los permisos necesarios. No se otorgan permisos excesivos,
scopes innecesarios, acceso administrativo innecesario ni secretos en frontend.

## 200. Shopify security

Siempre que Shopify pueda encargarse de una operación sensible, **se usa Shopify**. No
se reconstruye autenticación, pagos, gestión de pedidos ni seguridad de checkout sin
una razón técnica real.

## 201. Secret management

Nunca se introducen API keys privadas en: HTML; CSS; JavaScript cliente; Liquid
público; Git; repositorios; assets; screenshots; documentación pública.

## 202. Environment variables

Los secretos viven en el mecanismo de configuración del entorno, diferenciando
**development / staging / production**. Nunca se copian secretos de producción al
código.

## 203. Webhook security

Si se usan webhooks: verificar autenticidad; validar payload; no confiar ciegamente en
datos externos; controlar replay cuando corresponda; responder correctamente; evitar
operaciones duplicadas.

## 204. Idempotencia

Las operaciones críticas se diseñan para evitar duplicaciones: pedidos; webhooks;
sincronizaciones; eventos de pago; operaciones con proveedores.

## 205. Dependency security

Antes de instalar una dependencia se comprueba: reputación; mantenimiento; versión;
vulnerabilidades conocidas; licencia; tamaño; necesidad real.

Si no es necesaria: **no se instala**.

## 206. Blockchain — regla correcta

No se agrega blockchain para decir que la web tiene blockchain. Solo se evalúa ante un
caso de uso concreto: trazabilidad verificable; propiedad digital; autenticidad;
certificación; programa específico de activos digitales.

Sin necesidad real: **no se usa blockchain**.

La seguridad principal viene de: Shopify + HTTPS + secure secrets + validation +
access control + secure APIs + dependency security + monitoring + backups/recovery +
secure development.

## 207. Threat model

Antes del lanzamiento se identifica al menos: **activo** (qué queremos proteger),
**amenaza** (qué podría salir mal), **vector** (cómo podría ocurrir), **impacto** (qué
pasaría) y **mitigación** (cómo lo reducimos).

## 208. Ataques a considerar

XSS; inyección; manipulación de precios del lado cliente; manipulación de variantes;
abuso de endpoints; exposición de secretos; dependencia vulnerable; webhook spoofing;
scraping excesivo; spam; bots; credential stuffing cuando aplique; abuso de APIs;
errores de autorización.

## 209. Regla de precio

Nunca se confía exclusivamente en el precio enviado por el navegador. La fuente de
verdad comercial permanece en la plataforma de ecommerce. El frontend solamente
representa el estado.

## 210. Regla de inventario

Nunca se confía exclusivamente en el stock enviado por el navegador. El
backend/ecommerce es la fuente de verdad.

## 211. Regla de checkout

Nunca se construye un checkout falso para "simular" producción sin marcarlo claramente.
Si es demo: **DEMO CHECKOUT**. Si es producción: **CHECKOUT REAL**.

## 212. QA automatizable

Siempre que sea razonable se crea o utiliza: lint; type checking; build; tests; theme
validation; accessibility checks; dependency audit. Se automatiza todo lo repetitivo
automatizable.

## 213. QA visual

Con herramientas de captura o preview disponibles, se utilizan. Se compara desktop,
tablet y mobile buscando: overflow; clipping; texto cortado; elementos superpuestos;
botones inaccesibles; imágenes deformadas; canvas incorrecto; spacing inconsistente.

## 214. QA de edge cases

No solo el caso feliz. Se prueba: producto existe; producto agotado; variante agotada;
imagen ausente; video ausente; modelo 3D ausente; precio cambiado; producto sin
descripción; conexión lenta; JavaScript falla; WebGL falla; usuario con reduced motion;
pantalla pequeña; pantalla grande.

## 215. Error boundaries

Un error en una parte visual no destruye toda la tienda. Si falla el 3D, no deben
fallar producto + precio + add to cart.

## 216. Fail safe

Cuando algo falle: **degradar elegantemente**. Nunca pantalla blanca, `undefined`,
stack trace para el usuario ni error técnico ilegible.

## 217. Regla de performance absoluta

Cada elemento pesado justifica su coste. Para cada 3D, video, animación, font, script e
imagen: ¿qué valor aporta? ¿cuánto pesa? ¿cuándo se carga? ¿puede cargarse después?
¿existe una alternativa más barata?

## 218. Budget de JavaScript

El JavaScript existe por una razón. Se prioriza HTML + CSS + APIs nativas del navegador
cuando sean suficientes.

## 219. Budget de assets

Una experiencia premium no se convierte en una experiencia pesada. Se controla: número
de imágenes; peso; resolución; formatos; videos; modelos; texturas.

## 220. Mobile performance gate

Antes de considerar terminado se comprueba especialmente: carga inicial; scroll; touch;
3D; video; memoria; batería; input responsiveness.

## 221. Premium = rápido

Una experiencia lenta no se considera premium. La percepción de calidad incluye
**velocidad**.

## 222. Wow = controlado

Un efecto espectacular que rompe scroll, consume GPU, bloquea interacción, molesta,
distrae o dificulta comprar se reduce o se elimina.

## 223. Control de calidad antes de cada entrega

Antes de responder al usuario se ejecuta:

| Check | Pregunta |
| --- | --- |
| Build | ¿Compila? |
| Function | ¿Funciona? |
| Data | ¿Usa datos reales cuando corresponde? |
| Security | ¿Hay secretos o vulnerabilidades evidentes? |
| Performance | ¿Hay recursos innecesarios? |
| Responsive | ¿Funciona en mobile? |
| Accessibility | ¿Puede usarse con teclado y reduced motion? |
| Visual | ¿Se ve realmente bien? |
| Originality | ¿Parece genérico? |
| Ecommerce | ¿Puede comprarse realmente? |
| Truth | ¿Estoy afirmando algo que no verifiqué? |

Si una respuesta importante es **no**: no se entrega todavía.

## 224. Stop conditions

Solo se detiene la ejecución para pedir información cuando:

1. falta una decisión crítica;
2. continuar obligaría a inventar información;
3. una credencial necesaria no está disponible;
4. una integración real requiere acceso que no existe;
5. existe una decisión irreversible que depende de información del propietario.

En cualquier otro caso: **continuar**.

## 225. No esperar permiso para corregir

No se pregunta "¿quieres que arregle este error?" — si está en alcance, se arregla.
Igual con optimizar y con responsive: forman parte del proyecto.

## 226. No satisfacerse con el primer resultado

El primer resultado demuestra **dirección**, no calidad final. Se intenta superar la
primera solución: ¿puedo hacer esto más simple, más rápido, más original y más
elegante? Si sí, se hace.

## 227. Kill your darlings

Una idea visual espectacular que perjudique performance, UX, accesibilidad,
mantenimiento o conversión se elimina. No se enamora uno de su propia implementación.

## 228. Product first

| Conflicto | Gana |
| --- | --- |
| Efecto vs producto | **Producto** |
| Animación vs compra | **Compra** |
| Tecnología vs performance | **Performance** |
| Complejidad vs mantenibilidad | La solución que resuelva el problema con menos complejidad innecesaria |

## 229. Decisión de diseño

No se copia literalmente a Nike, Adidas, Apple, Balenciaga, Arc'teryx, On, Salomon,
Gymshark, Mattelsa, Aesop ni otras marcas. Se pueden estudiar principios, UX, ritmo,
composición, fotografía e interacción, pero la solución final tiene identidad propia.

## 230. Referencias

Al analizar referencias se separa **inspiración** (qué principio aprendimos) de
**implementación** (cómo lo convertimos en algo propio). No se copia "esta sección se
parece a X".

## 231. Diseño como sistema

La página no es una colección de momentos aislados: existe **un lenguaje**. El mismo
lenguaje aparece en navegación, 3D, fotografía, videos, tipografía, botones,
transiciones, cart, checkout transition y estados.

## 232. Consistencia

¿El mismo botón se comporta igual? ¿El mismo tipo de interacción tiene el mismo
feedback? ¿Las animaciones tienen la misma física? ¿Las sombras siguen el mismo
lenguaje? ¿Los radios son consistentes? ¿Los espacios tienen lógica?

## 233. Mantenimiento futuro

Se diseña pensando: **otro desarrollador debe poder entender esto**. Si solamente lo
entiende su autor, está mal diseñado.

## 234. Regla de entrega

La entrega no termina en "este es el código". Termina en
**sistema funcional + validado + documentado**.

## 235. Informe de autoverificación final

Antes de entregar se genera la tabla de estado por área: Arquitectura, Shopify, Dropi,
Ecommerce, 3D, Motion, Mobile, Performance, Security, SEO, Accessibility, Analytics,
Assets, Claims.

**Nunca se marca `VERIFIED` sin evidencia.** (Estado vivo en `STATUS.md`.)

## 236. Reporte de limitaciones

Lo que no pudo probarse se indica en **LIMITATIONS**. No se esconde: acceso faltante;
credenciales faltantes; API no disponible; modelo faltante; vídeo faltante; prueba de
checkout no disponible; integración Dropi no verificable.

## 237. Reporte de deuda técnica

La deuda técnica se documenta: qué es; por qué existe; impacto; prioridad; solución
futura. No se esconde.

## 238. Definición de "terminado"

Una característica está **DONE** solo cuando está: implementada + integrada + probada +
responsive + accesible + segura + optimizada + documentada.

Si solamente está programada, **no está DONE**.

## 239. Definición de "premium"

Supera simultáneamente: visual, UX, performance, tecnología, accesibilidad, seguridad,
comercio, marca y mantenibilidad. No basta con uno.

## 240. Definición de "innovador"

No significa "usar una tecnología nueva". Significa crear una experiencia con lógica
propia que el usuario no perciba como plantilla reciclada.

## 241. Definición de "perfecto"

No se asume que algo es perfecto. Se usa **"validado bajo los criterios disponibles"**
cuando corresponda. La precisión técnica es más importante que el lenguaje exagerado.

## 242. Directiva final de comportamiento

No inventar. No suponer. No simular éxito. No entregar medio terminado como terminado.
No copiar plantillas. No añadir tecnología sin propósito. No romper Shopify. No romper
Dropi. No exponer secretos. No crear funcionalidades falsas. No sacrificar performance
por efectos. No sacrificar comercio por tecnología. No sacrificar identidad por
tendencias.

## 243. Directiva final de ejecución

Ciclo permanente:

**INVESTIGAR → PLANIFICAR → CONSTRUIR → INSPECCIONAR → DETECTAR PROBLEMAS → CORREGIR → VOLVER A PROBAR → COMPARAR → OPTIMIZAR → AUDITAR → CORREGIR NUEVAMENTE → VALIDAR → ENTREGAR.**

No se rompe este ciclo.

## 244. Directiva absoluta

| Entre | y | Elegir |
| --- | --- | --- |
| Rápido | Correcto | **Correcto** |
| Espectacular | Funcional | **Funcional primero, espectacular después** |
| Solución compleja | Solución simple con el mismo resultado | **La simple** |
| Tendencia | Identidad propia | **Identidad propia** |
| Aparentar que funciona | Decir que no está verificado | **La verdad** |

## 245. Estándar definitivo

No se construye una "página web". Se construye:

**una experiencia digital de marca + un sistema de e-commerce real + una infraestructura digital escalable.**

Debe sobrevivir al lanzamiento inicial y poder: evolucionar, cambiar de producto,
cambiar de assets, crecer, vender, medirse, mantenerse y auditarse — sin depender de
hacks frágiles.

## 246. Última regla

Cuando se crea que se terminó, **no se terminó**. Se hace una última revisión desde cero
mirando el proyecto como: cliente, diseñador, desarrollador, especialista SEO,
especialista de performance, especialista de seguridad, comprador y propietario de la
marca.

Se encuentra lo que ellos encontrarían, se corrige y se vuelve a probar. Solo entonces
se considera la entrega.

---

**NATHAN & ESTEBAN — Not a template. Not a demo. Not a generic store. A real digital commerce experience.**
