"""
Zapatilla baja de cancha (court low-top) modelada por código, en GLB.

QUÉ ES
Una zapatilla de cancha con cupsole en cuña: paneles de piel cosidos, puntera
con tope, perforaciones, ojales metálicos, cordones PLANOS, entresuela lisa con
una ranura de costado y piso de onda con pivote circular en el antepié.

QUÉ NO ES
No es una copia de ninguna marca. No lleva las tres bandas laterales, ni
logotipo, ni nombre grabado en la talonera: eso es identidad de otra empresa.
Se modela la TIPOLOGÍA, que es lo que NATHAN & ESTEBAN necesita para su diseño.

LA IDEA GEOMÉTRICA
Cada sección transversal es un arco: th=0 en el canto de la entresuela,
th=pi/2 en lo alto del empeine, th=pi en el canto contrario. El corte cubre de
th=0 hasta th_borde(t). Donde th_borde(t) = pi/2 el corte se cierra por arriba
(talón y puntera). Donde th_borde(t) < pi/2 hay AGUJERO: entrada del pie y
cordonaje. Esa sola función separa un zapato de un bulto.

La suela NO es de altura constante: es una cuña, más gruesa en el talón. Por eso
la cota de arranque del corte es una función de t, no un número.
"""
import json, math, os, struct

# ───────────────────────────────────────────────────────────────── proporciones
LARGO     = 0.285          # m · talla ~40
PISO_ALTO = 0.0085         # piso (la goma de abajo)
EXP       = 2.0 / 2.55     # exponente de la superelipse de la sección
T_A, T_B  = 0.048, 0.715   # donde empieza y acaba la abertura del corte

def interp(tabla, t):
    """
    Spline cúbico monótono sobre las anclas (t, valor). Con smoothstep por
    tramos la curva se aplana en cada ancla y el contorno sale festoneado.
    """
    n = len(tabla)
    t = min(max(t, tabla[0][0]), tabla[-1][0])
    i = 0
    while i < n - 2 and t > tabla[i + 1][0]:
        i += 1
    t0, v0 = tabla[i]; t1, v1 = tabla[i + 1]
    h = t1 - t0
    if h <= 0:
        return v1
    k = (t - t0) / h
    tm, vm = tabla[i - 1] if i > 0 else (t0 - h, v0 - (v1 - v0))
    tp, vp = tabla[i + 2] if i + 2 < n else (t1 + h, v1 + (v1 - v0))
    d = (v1 - v0) / h
    m0 = h * (v1 - vm) / (t1 - tm)
    m1 = h * (vp - v0) / (tp - t0)
    if d == 0 or m0 * d < 0: m0 = 0.0
    elif abs(m0) > 3 * abs(d * h): m0 = 3 * d * h
    if d == 0 or m1 * d < 0: m1 = 0.0
    elif abs(m1) > 3 * abs(d * h): m1 = 3 * d * h
    k2 = k * k; k3 = k2 * k
    return (2*k3 - 3*k2 + 1) * v0 + (k3 - 2*k2 + k) * m0 + (-2*k3 + 3*k2) * v1 + (k3 - k2) * m1

# semiancho de la planta, antes del redondeo de los extremos
ANCHO = [(0.00, 0.0400), (0.08, 0.0438), (0.20, 0.0412), (0.34, 0.0358),
         (0.46, 0.0358), (0.60, 0.0442), (0.72, 0.0494), (0.84, 0.0468),
         (0.92, 0.0404), (1.00, 0.0310)]
# altura de la sección sobre la entresuela
ALTO  = [(0.00, 0.0462), (0.048, 0.0578), (0.10, 0.0672), (0.18, 0.0726),
         (0.26, 0.0694), (0.38, 0.0590), (0.50, 0.0492), (0.62, 0.0396),
         (0.72, 0.0338), (0.84, 0.0272), (0.94, 0.0192), (1.00, 0.0118)]
# fracción del arco que se quita: 0 = cerrado, 0.7 = boca ancha
ABRE  = [(0.000, 0.00), (T_A, 0.00), (0.100, 0.36), (0.170, 0.62), (0.230, 0.70),
         (0.300, 0.60), (0.380, 0.40), (0.460, 0.28), (0.550, 0.20),
         (0.630, 0.13), (0.690, 0.05), (T_B, 0.00), (1.000, 0.00)]
# altura TOTAL de la suela: es una CUÑA, no un bloque
SUELA = [(0.00, 0.0272), (0.14, 0.0270), (0.32, 0.0248), (0.52, 0.0218),
         (0.72, 0.0196), (0.88, 0.0190), (1.00, 0.0196)]

REDOND_T, REDOND_P = 0.074, 0.086      # longitud de los casquetes redondeados

def w(t):
    """Semiancho con los extremos cerrados en semicírculo, no en punta."""
    r = 1.0
    if t < REDOND_T:
        r *= math.sqrt(max(0.0, 1.0 - ((REDOND_T - t) / REDOND_T) ** 2))
    if t > 1.0 - REDOND_P:
        r *= math.sqrt(max(0.0, 1.0 - ((t - (1.0 - REDOND_P)) / REDOND_P) ** 2))
    return interp(ANCHO, t) * r

def hh(t):    return interp(ALTO, t)
def suela(t): return interp(SUELA, t)
def z(t):     return (t - 0.5) * LARGO
def eje(t):   return 0.0040 * math.sin(math.pi * t) - 0.0026 * t

def th_borde(t):
    return (math.pi / 2) * (1.0 - interp(ABRE, t))

# ════════════════════════════════════════════════ costuras y perforaciones
# Lo que hace que la referencia se lea como piel cosida y no como plástico:
# los paneles. Cada costura es un surco de ~1 mm en la superficie del corte.
COSTURA_T = [(0.790, 0.0021, 0.0052),    # tope de puntera
             (0.205, 0.0021, 0.0055)]    # talonera

# ─────────────────────────────────────────────── LAS DOS BANDAS · marca N&E
# Dos bandas diagonales en relieve sobre el cuarto, de la suela al cordonaje.
# Van en RELIEVE, no hundidas, y con pespunte a cada lado, como una pieza
# de piel cosida encima. Son la marca de NATHAN & ESTEBAN.
BANDA_V0, BANDA_V1 = 0.090, 0.660
# Más empinadas que tumbadas: una banda tumbada mide 5 mm de ancho real por
# mucho que ocupe en t, y se lee como un arañazo en vez de como una pieza.
BANDAS     = [(0.396, 0.470), (0.474, 0.548)]   # t en v0 → t en v1, por banda
BANDA_HW   = 0.0256                              # semiancho en t ≈ 12 mm reales
BANDA_H    = 0.0040                              # relieve: se ve y se toca
BANDA_FILO = 0.0030                              # caída del canto, corta

def _banda_k(v):
    return (v - BANDA_V0) / (BANDA_V1 - BANDA_V0)

def _banda_tope(k):
    """Extremos redondeados: una banda cosida no acaba en escuadra."""
    f = 1.0
    if k < 0.075:
        f = math.sqrt(max(0.0, 1.0 - ((0.075 - k) / 0.075) ** 2))
    if k > 0.925:
        f = min(f, math.sqrt(max(0.0, 1.0 - ((k - 0.925) / 0.075) ** 2)))
    return f

def bandas(t, v):
    if v < BANDA_V0 or v > BANDA_V1:
        return 0.0
    k = _banda_k(v)
    tope = _banda_tope(k)
    r = 0.0
    for ta, tb in BANDAS:
        e = abs(t - (ta + (tb - ta) * k))
        if e < BANDA_HW + BANDA_FILO:
            f = 1.0 if e <= BANDA_HW else 1.0 - (e - BANDA_HW) / BANDA_FILO
            r = max(r, f * tope)
    return BANDA_H * r

def _perfo_filas():
    """Filas de perforación: en el tope de puntera y en el cuarto, como la foto."""
    p = []
    for i in range(7):                                   # arco sobre la puntera
        k = i / 6
        p.append((0.820 + 0.052 * math.sin(math.pi * k), 0.26 + 0.52 * k))
    for fila, v0 in ((0, 0.30), (1, 0.40)):              # dos filas en el vamp
        for i in range(6):
            p.append((0.686 + 0.030 * i / 5, v0 + 0.038 * fila))
    return p
PERFOS = _perfo_filas()

def detalle(t, v):
    """Surcos de costura y perforaciones, en unidades de radio relativo."""
    d = 0.0
    for ct, prof, anch in COSTURA_T:
        d -= prof * math.exp(-((t - ct) / anch) ** 2)
    d += bandas(t, v)
    return d

def seccion(t, th, radial=1.0, v=None):
    c, s = math.cos(th), math.sin(th)
    rx = (abs(c) ** EXP) * (1 if c >= 0 else -1)
    ry = abs(s) ** EXP
    r = radial
    if v is not None:
        r += detalle(t, v) / max(w(t), 1e-4)
    return (eje(t) + rx * w(t) * r, suela(t) + ry * hh(t), z(t))

# ═════════════════════════════════════════════════════════════════ malla
class Pieza:
    def __init__(self, material):
        self.mat = material; self.P = []; self.N = []; self.I = []

    def rejilla(self, G, cerrar_u=False, voltear=False):
        nu, nv = len(G), len(G[0])
        base = len(self.P)
        for fila in G:
            for p in fila:
                self.P.append(p); self.N.append([0.0, 0.0, 0.0])
        idx = lambda u, v: base + (u % nu) * nv + v
        lim = nu if cerrar_u else nu - 1
        for u in range(lim):
            for v in range(nv - 1):
                a, b, c, d = idx(u, v), idx(u + 1, v), idx(u + 1, v + 1), idx(u, v + 1)
                if voltear: a, b, c, d = d, c, b, a
                self._quad(a, b, c, d)
        return self

    def _quad(self, a, b, c, d):
        for tri in ((a, b, c), (a, c, d)):
            if self._tri(*tri):
                self.I += list(tri)

    def _tri(self, a, b, c):
        pa, pb, pc = self.P[a], self.P[b], self.P[c]
        u = [pb[i] - pa[i] for i in range(3)]
        v = [pc[i] - pa[i] for i in range(3)]
        n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]
        L = math.sqrt(sum(k*k for k in n))
        if L < 1e-12:
            return False
        for i in (a, b, c):
            for k in range(3):
                self.N[i][k] += n[k] / L
        return True

    def tubo(self, camino, radio, n=9, cerrado=False, tapas=True, plano=0.0):
        """
        Barrido a lo largo de un camino. `plano` aplasta la sección: 0 = cordón
        redondo, 0.2 = cinta. Los cordones de la referencia son PLANOS.
        """
        m = len(camino)
        tang = []
        for i in range(m):
            a = camino[(i - 1) % m] if cerrado else camino[max(0, i - 1)]
            b = camino[(i + 1) % m] if cerrado else camino[min(m - 1, i + 1)]
            tang.append(norm([b[k] - a[k] for k in range(3)]))
        up = [0.0, 1.0, 0.0]
        X0 = norm(cross(up, tang[0])) if abs(dot(up, tang[0])) < 0.95 else norm(cross([1.0, 0.0, 0.0], tang[0]))
        ejes = [X0]
        for i in range(1, m):
            ejes.append(transportar(ejes[-1], tang[i - 1], tang[i]))
        if cerrado:
            fin = transportar(ejes[-1], tang[-1], tang[0])
            ang = math.atan2(dot(cross(X0, fin), tang[0]), dot(X0, fin))
            for i in range(m):
                ejes[i] = girar(ejes[i], tang[i], -ang * i / m)
        marcos = [(ejes[i], cross(tang[i], ejes[i])) for i in range(m)]
        G = []
        for i, c in enumerate(camino):
            X, Y = marcos[i]
            r = radio(i / max(1, m - 1)) if callable(radio) else radio
            ry = r * (plano if plano > 0 else 1.0)
            fila = []
            for j in range(n + 1):
                a = 2 * math.pi * (j % n) / n
                ca, sa = math.cos(a), math.sin(a)
                if plano > 0:                     # sección de cinta, con cantos
                    ca = math.copysign(abs(ca) ** 0.55, ca)
                    sa = math.copysign(abs(sa) ** 0.55, sa)
                fila.append((c[0] + X[0]*ca*r + Y[0]*sa*ry,
                             c[1] + X[1]*ca*r + Y[1]*sa*ry,
                             c[2] + X[2]*ca*r + Y[2]*sa*ry))
            G.append(fila)
        self.rejilla(G, cerrar_u=cerrado)
        if tapas and not cerrado:
            for extremo, inv in ((0, True), (len(G) - 1, False)):
                self.abanico(G[extremo][:n], inv)
        return self

    def abanico(self, aro, invertir):
        cen = [sum(p[k] for p in aro) / len(aro) for k in range(3)]
        b0 = len(self.P)
        self.P.append(cen); self.N.append([0.0, 0.0, 0.0])
        for p in aro:
            self.P.append(list(p)); self.N.append([0.0, 0.0, 0.0])
        for j in range(len(aro)):
            a, b = b0 + 1 + j, b0 + 1 + (j + 1) % len(aro)
            orden = (b0, b, a) if invertir else (b0, a, b)
            if self._tri(*orden):
                self.I += list(orden)
        return self

    def soldar(self, umbral=0.55):
        """
        Une los vértices que ocupan la misma posición. Donde dos trozos de malla
        se tocan quedan duplicados con normales distintas y se ve una costura
        falsa. Sólo se unen si sus normales apuntan parecido: los cantos de
        verdad siguen vivos.
        """
        grupos, mapa = {}, [0] * len(self.P)
        P2, N2 = [], []
        for i, (p, n) in enumerate(zip(self.P, self.N)):
            L = math.sqrt(sum(k*k for k in n)) or 1.0
            u = [k / L for k in n]
            clave = (round(p[0], 7), round(p[1], 7), round(p[2], 7))
            encontrado = -1
            for j, rep in grupos.get(clave, []):
                if sum(rep[k] * u[k] for k in range(3)) > umbral:
                    encontrado = j
                    break
            if encontrado < 0:
                encontrado = len(P2)
                P2.append(list(p)); N2.append(list(n))
                grupos.setdefault(clave, []).append((encontrado, u))
            else:
                for k in range(3):
                    N2[encontrado][k] += n[k]
            mapa[i] = encontrado
        self.P, self.N = P2, N2
        I = [mapa[i] for i in self.I]
        self.I = [i for t in range(0, len(I), 3)
                    for i in I[t:t+3] if len(set(I[t:t+3])) == 3]
        return self

    def cerrar(self):
        for i, n in enumerate(self.N):
            L = math.sqrt(sum(k*k for k in n)) or 1.0
            self.N[i] = [k / L for k in n]
        return self

def girar(v, eje, ang):
    c, s = math.cos(ang), math.sin(ang)
    cr = cross(eje, v); d = dot(eje, v)
    return [v[k] * c + cr[k] * s + eje[k] * d * (1 - c) for k in range(3)]

def transportar(X, T0, T1):
    """Lleva el marco de una tangente a la siguiente por el giro mínimo."""
    v = cross(T0, T1)
    L = math.sqrt(sum(k*k for k in v))
    Y = X if L < 1e-9 else girar(X, [k / L for k in v], math.atan2(L, dot(T0, T1)))
    return norm([Y[k] - T1[k] * dot(Y, T1) for k in range(3)])

def norm(v):
    L = math.sqrt(sum(k*k for k in v)) or 1.0
    return [k / L for k in v]
def cross(a, b): return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
def dot(a, b):   return sum(a[i]*b[i] for i in range(3))

# ═══════════════════════════════════════════════════════ 1 · CORTE (el upper)
NT, NV = 152, 22
corte = Pieza(0)
for lado in (1, -1):
    G = []
    for i in range(NT + 1):
        t = i / NT
        tb = th_borde(t)
        abierto = interp(ABRE, t) > 0.08
        fila = []
        for j in range(NV + 1):
            v = j / NV
            th = v * tb if lado == 1 else math.pi - v * tb
            ribete = 0.030 * math.exp(-((v - 0.862) / 0.040) ** 2) if abierto else 0.0
            fila.append(seccion(t, th, radial=1.0 - 0.052 * v ** 2.2 - ribete, v=v))
        G.append(fila)
    corte.rejilla(G, voltear=(lado == -1))

# ══════════════════════════════════════════════════ 2 · CUELLO (el borde)
cuello = Pieza(1)
camino, NR = [], 104
for i in range(NR + 1):
    t = T_A + (T_B - T_A) * (i / NR)
    camino.append(seccion(t, th_borde(t), radial=1.0 - 0.052))
for i in range(NR, -1, -1):
    t = T_A + (T_B - T_A) * (i / NR)
    camino.append(seccion(t, math.pi - th_borde(t), radial=1.0 - 0.052))
def radio_cuello(k):
    d = min(abs(k - 0.13), abs(k - 0.87)) * 2.4
    return 0.0028 + 0.0046 * math.exp(-(d / 0.26) ** 2)
cuello.tubo(camino, radio_cuello, n=8, cerrado=True)

# ═══════════════════════════════════════════════════════════ 3 · CUPSOLE
# Pared lisa con una ranura de costado y un escalón donde empieza el piso.
# La referencia NO tiene nervios: eso era un error del modelo anterior.
def radio_suela(t, f):
    """f ∈ [0,1] de la base del piso al tope de la entresuela."""
    pf = PISO_ALTO / suela(t)
    if f <= pf:
        u = f / pf
        e = 0.957 + 0.043 * u ** 0.75                 # el piso entra abajo
        e -= 0.010 * math.exp(-((u - 0.86) / 0.10) ** 2)   # escalón del canto
    else:
        u = (f - pf) / (1.0 - pf)
        e = 1.000 + 0.016 * (1.0 - ((u - 0.30) / 0.72) ** 2)   # panza suave
        e -= 0.011 * math.exp(-((u - 0.255) / 0.050) ** 2)     # ranura de costado
        e -= 0.030 * max(0.0, (u - 0.87) / 0.13) ** 1.7        # se mete bajo el corte
    return e

def punto_suela(t, lado, f):
    return (eje(t) + lado * w(t) * radio_suela(t, f), suela(t) * f, z(t))

NS = 120
PERIM = [(i / NS, 1) for i in range(NS + 1)] + [(i / NS, -1) for i in range(NS - 1, 0, -1)]

entresuela = Pieza(2)
piso = Pieza(3)
F_PISO = 0.30                                  # fracción de altura que es piso
NIV = 16
for pieza, f0, f1, niv in ((piso, 0.0, F_PISO, 5), (entresuela, F_PISO, 1.0, NIV)):
    G = [[punto_suela(t, l, f0 + (f1 - f0) * (k / niv)) for k in range(niv + 1)]
         for t, l in PERIM]
    pieza.rejilla(G, cerrar_u=True, voltear=True)

# ─────────────────────────────────────────────────────────── piso: la rodadura
def tacos(t, lat):
    """Onda tipo espiga, con pivote circular en el antepié y surco de flexión."""
    x, zz = lat * w(t), (t - 0.5) * LARGO
    onda = math.sin(zz * 760.0 + 2.1 * math.sin(x * 52.0))
    campo = 0.50 + 0.50 * onda
    d = math.hypot(x * 1.08, zz - (0.735 - 0.5) * LARGO) / 0.036
    if d < 1.0:                                 # pivote: anillos concéntricos
        campo = 0.50 + 0.50 * math.cos(d * math.pi * 7.0)
    campo *= min(1.0, (1.0 - abs(lat)) / 0.11)  # 0 justo en el borde
    campo *= 1.0 - 0.80 * math.exp(-((t - 0.465) / 0.026) ** 2)   # flexión
    campo *= min(1.0, (t - 0.030) / 0.05, (0.975 - t) / 0.05)
    return 0.0013 * max(0.0, campo)

NB, NL = 96, 34
G = []
for i in range(NB + 1):
    t = i / NB
    borde = abs(punto_suela(t, 1, 0.0)[0] - eje(t))
    G.append([(eje(t) + (-1.0 + 2.0 * (j / NL)) * borde,
               -tacos(t, -1.0 + 2.0 * (j / NL)), z(t)) for j in range(NL + 1)])
piso.rejilla(G, voltear=True)

# ═════════════════════════════════════════════════════════ 4 · PLANTILLA
plantilla = Pieza(4)
G = []
for i in range(49):
    t = 0.048 + (0.805 - 0.048) * (i / 48)
    fila = []
    for j in range(19):
        lat = -1.0 + 2.0 * (j / 18)
        hundido = 0.0035 * (1 - lat ** 2) * math.exp(-((t - 0.17) / 0.14) ** 2)
        fila.append((eje(t) + lat * w(t) * 0.90, suela(t) + 0.0055 - hundido, z(t)))
    G.append(fila)
plantilla.rejilla(G)

# ═══════════════════════════════════════════════════════════ 5 · LENGÜETA
lengueta = Pieza(1)
TA, TB = 0.325, 0.700
def semi_lengueta(t):
    k = (t - TA) / (TB - TA)
    tope = abs(seccion(t, th_borde(t))[0] - eje(t)) * 0.94
    sw = min(0.0280 - 0.0085 * k, max(0.0035, tope))
    if k < 0.08:
        sw *= math.sqrt(max(0.0, 1.0 - ((0.08 - k) / 0.08) ** 2)) * 0.55 + 0.45
    return max(sw, 0.0006)

G, NTL, NC = [], 40, 16
for i in range(NTL + 1):
    t = TA + (TB - TA) * (i / NTL)
    k = i / NTL
    sw = semi_lengueta(t)
    base = suela(t) + hh(t) * (0.728 + 0.036 * (1 - k) ** 1.8)
    grosor = 0.0082 * (1 - 0.45 * k) * (1 - max(0.0, (k - 0.93) / 0.07) ** 2)
    fila = []
    for j in range(NC + 1):
        a = 2 * math.pi * j / NC
        ca, sa = math.cos(a), math.sin(a)
        ca = math.copysign(abs(ca) ** 0.50, ca)
        sa = math.copysign(abs(sa) ** 0.55, sa)
        fila.append((eje(t) + sw * ca, base + grosor * sa, z(t) - 0.0035 * (1 - k)))
    G.append(fila)
lengueta.rejilla(G)
lengueta.abanico(G[0][:NC], True)
lengueta.abanico(G[NTL][:NC], False)

# ═══════════════════════════════════════════════════ 6 · OJALES Y CORDONES
T_OJAL = [0.668, 0.602, 0.532, 0.457, 0.380]
def punto_ojal(t, lado):
    th = th_borde(t) - 0.150
    return seccion(t, th if lado == 1 else math.pi - th, radial=1.0 - 0.042)

def normal_corte(t, th):
    """Normal aproximada de la superficie del corte, por diferencias."""
    e = 1e-3
    a = seccion(t, th); b = seccion(t, th + e); c = seccion(min(1.0, t + e), th)
    u = [b[k] - a[k] for k in range(3)]
    v = [c[k] - a[k] for k in range(3)]
    n = cross(v, u)
    if dot(n, [a[0] - eje(t), a[1] - (suela(t) + hh(t) * 0.45), 0.0]) < 0:
        n = [-k for k in n]
    return norm(n)

def circulo(c, n, radio, m=16):
    """Circunferencia de radio `radio` centrada en c, en el plano normal a n."""
    a = norm(cross(n, [0.0, 0.0, 1.0] if abs(n[2]) < 0.9 else [1.0, 0.0, 0.0]))
    b = cross(n, a)
    return [(c[0] + radio * (a[0]*math.cos(g) + b[0]*math.sin(g)),
             c[1] + radio * (a[1]*math.cos(g) + b[1]*math.sin(g)),
             c[2] + radio * (a[2]*math.cos(g) + b[2]*math.sin(g)))
            for g in [2*math.pi*i/m for i in range(m)]]

ojales = Pieza(5)
for t in T_OJAL:
    for lado in (1, -1):
        th = th_borde(t) - 0.150
        th = th if lado == 1 else math.pi - th
        c = punto_ojal(t, lado)
        n = normal_corte(t, th)
        c = tuple(c[k] + n[k] * 0.0004 for k in range(3))
        ojales.tubo(circulo(c, n, 0.0036, 16), 0.0011, n=8, cerrado=True)

# ─────────────────────────────────────────────── perforaciones, como geometría
perfora = Pieza(7)
for pt, pv in PERFOS:
    tb = th_borde(pt)
    for lado in (1, -1):
        th = pv * tb if lado == 1 else math.pi - pv * tb
        c = seccion(pt, th, radial=1.0 - 0.052 * pv ** 2.2, v=pv)
        n = normal_corte(pt, th)
        fuera = tuple(c[k] + n[k] * 0.0002 for k in range(3))
        dentro = tuple(c[k] - n[k] * 0.0016 for k in range(3))
        perfora.tubo([fuera, dentro], 0.0010, n=8)

# ───────────────────────────────────────────────────────── pespunte de paneles
# Un hilo fino con el radio modulado: a tamaño real se lee como puntadas.
pespunte = Pieza(8)
def hilo(camino, puntadas):
    if len(camino) < 2:
        return
    pespunte.tubo(camino, lambda k: 0.00042 + 0.00030 * abs(math.sin(k * puntadas * math.pi)),
                  n=6, tapas=False)

def borde_arco(t, v, lado, fuera=0.0014):
    tb = th_borde(t)
    th = v * tb if lado == 1 else math.pi - v * tb
    c = seccion(t, th, radial=1.0 - 0.052 * v ** 2.2, v=v)
    n = normal_corte(t, th)
    return tuple(c[k] + n[k] * fuera for k in range(3))

for ct in (0.790, 0.205):                       # puntera y talonera, de canto a canto
    for lado in (1, -1):
        hilo([borde_arco(ct, j / 24, lado) for j in range(25)], 16)
for lado in (1, -1):                            # los dos cantos de cada banda
    for ta, tb in BANDAS:
        for s_ in (1, -1):
            cam = []
            for i in range(41):
                k = i / 40
                if _banda_tope(k) < 0.45:
                    continue
                v = BANDA_V0 + (BANDA_V1 - BANDA_V0) * k
                cam.append(borde_arco((ta + (tb - ta) * k) + s_ * BANDA_HW, v, lado, 0.0028))
            hilo(cam, 24)
for lado in (1, -1):                            # ribete del cordonaje
    hilo([borde_arco(T_A + (T_B - T_A) * i / 46, 0.792, lado) for i in range(47)], 32)
for lado in (1, -1):                            # unión del corte con la suela
    hilo([borde_arco(0.030 + 0.940 * i / 56, 0.048, lado) for i in range(57)], 40)

cordones = Pieza(6)
def arco(p, q, alzado, n=15):
    m = [(p[k] + q[k]) / 2 for k in range(3)]
    m[1] += alzado
    return [tuple((1-u)**2 * p[k] + 2*(1-u)*u * m[k] + u*u * q[k] for k in range(3))
            for u in [i / (n - 1) for i in range(n)]]

izq = [punto_ojal(t, 1) for t in T_OJAL]
der = [punto_ojal(t, -1) for t in T_OJAL]
PLANO = 0.19                                    # cinta, no cordón redondo
cordones.tubo(arco(izq[0], der[0], 0.0028), 0.0048, n=10, plano=PLANO)
for i in range(len(T_OJAL) - 1):
    alza = 0.0050 + 0.0011 * i
    cordones.tubo(arco(izq[i], der[i + 1], alza), 0.0048, n=10, plano=PLANO)
    cordones.tubo(arco(der[i], izq[i + 1], alza), 0.0048, n=10, plano=PLANO)
for p, s in ((izq[-1], 1), (der[-1], -1)):      # dos cabos, recogidos
    fin = seccion(0.300, th_borde(0.300) - 0.26 if s == 1 else math.pi - th_borde(0.300) + 0.26)
    cordones.tubo(arco(p, (fin[0], fin[1] - 0.004, fin[2]), 0.0062), 0.0046, n=10, plano=PLANO)

PIEZAS = [corte, cuello, entresuela, piso, plantilla, lengueta, ojales,
          cordones, perfora, pespunte]
for p in PIEZAS:
    p.soldar().cerrar()

# ═══════════════════════════════════════════════════════════════════ 7 · GLB
# Crudo, no blanco óptico: la referencia es piel color hueso sobre suela crema.
MATERIALES = [
  {"name": "CORTE",      "pbrMetallicRoughness": {"baseColorFactor": [0.930, 0.912, 0.868, 1], "metallicFactor": 0.0, "roughnessFactor": 0.46}},
  {"name": "CUELLO",     "pbrMetallicRoughness": {"baseColorFactor": [0.916, 0.896, 0.850, 1], "metallicFactor": 0.0, "roughnessFactor": 0.62}},
  {"name": "ENTRESUELA", "pbrMetallicRoughness": {"baseColorFactor": [0.948, 0.930, 0.874, 1], "metallicFactor": 0.0, "roughnessFactor": 0.60}},
  {"name": "PISO",       "pbrMetallicRoughness": {"baseColorFactor": [0.906, 0.886, 0.828, 1], "metallicFactor": 0.0, "roughnessFactor": 0.78}},
  {"name": "PLANTILLA",  "pbrMetallicRoughness": {"baseColorFactor": [0.800, 0.780, 0.730, 1], "metallicFactor": 0.0, "roughnessFactor": 0.88}},
  {"name": "HERRAJE",    "pbrMetallicRoughness": {"baseColorFactor": [0.760, 0.588, 0.286, 1], "metallicFactor": 0.95, "roughnessFactor": 0.26}},
  {"name": "CORDONES",   "pbrMetallicRoughness": {"baseColorFactor": [0.962, 0.952, 0.930, 1], "metallicFactor": 0.0, "roughnessFactor": 0.92}},
  {"name": "PERFORACION","pbrMetallicRoughness": {"baseColorFactor": [0.300, 0.288, 0.262, 1], "metallicFactor": 0.0, "roughnessFactor": 0.95}},
  {"name": "PESPUNTE",   "pbrMetallicRoughness": {"baseColorFactor": [0.862, 0.836, 0.776, 1], "metallicFactor": 0.0, "roughnessFactor": 0.94}},
]

def pad(b, fill=b"\x00"):
    return b + fill * ((4 - len(b) % 4) % 4)

blob, accessors, bufferViews, primitives = b"", [], [], []
for p in PIEZAS:
    if not p.I:
        continue
    pos = b"".join(struct.pack("<3f", *v) for v in p.P)
    nor = b"".join(struct.pack("<3f", *n) for n in p.N)
    corto = len(p.P) <= 65535
    idx = b"".join(struct.pack("<H" if corto else "<I", i) for i in p.I)
    mins = [min(v[k] for v in p.P) for k in range(3)]
    maxs = [max(v[k] for v in p.P) for k in range(3)]
    for datos, tgt in ((pos, 34962), (nor, 34962), (idx, 34963)):
        blob = pad(blob)
        bufferViews.append({"buffer": 0, "byteOffset": len(blob), "byteLength": len(datos), "target": tgt})
        blob += datos
    b0 = len(bufferViews) - 3
    accessors.append({"bufferView": b0,     "componentType": 5126, "count": len(p.P), "type": "VEC3", "min": mins, "max": maxs})
    accessors.append({"bufferView": b0 + 1, "componentType": 5126, "count": len(p.N), "type": "VEC3"})
    accessors.append({"bufferView": b0 + 2, "componentType": 5123 if corto else 5125, "count": len(p.I), "type": "SCALAR"})
    a0 = len(accessors) - 3
    primitives.append({"attributes": {"POSITION": a0, "NORMAL": a0 + 1}, "indices": a0 + 2, "material": p.mat})

blob = pad(blob)
gltf = {
  "asset": {"version": "2.0", "generator": "NATHAN & ESTEBAN · estudio de tipologia · PLACEHOLDER, no es producto final"},
  "scene": 0,
  "scenes": [{"nodes": [0]}],
  "nodes": [{"mesh": 0, "name": "ZAPATILLA_ESTUDIO"}],
  "meshes": [{"name": "zapatilla", "primitives": primitives}],
  "materials": MATERIALES,
  "accessors": accessors,
  "bufferViews": bufferViews,
  "buffers": [{"byteLength": len(blob)}],
}

json_b = pad(json.dumps(gltf, separators=(",", ":")).encode("utf-8"), b" ")
glb  = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(json_b) + 8 + len(blob))
glb += struct.pack("<II", len(json_b), 0x4E4F534A) + json_b
glb += struct.pack("<II", len(blob), 0x004E4942) + blob
SALIDA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "MODEL.glb")
open(SALIDA, "wb").write(glb)

NOMBRES = ["corte", "cuello", "entresuela", "piso", "plantilla", "lengueta",
           "ojales", "cordones", "perforacion", "pespunte"]
print(f"{SALIDA} · {sum(len(p.P) for p in PIEZAS)} vertices · "
      f"{sum(len(p.I) for p in PIEZAS)//3} triangulos · {len(glb)/1024:.0f} KB")
for n, p in zip(NOMBRES, PIEZAS):
    print(f"   {n:12} {len(p.I)//3:6} tri  {len(p.P):6} vert")
