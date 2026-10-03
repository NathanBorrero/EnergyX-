"""
Genera una SUELA DE ESTUDIO en formato GLB, por procedimiento.

NO es el producto. Es una forma geométrica para poder juzgar el visor —la luz,
los controles, el cambio de material, la vista inferior— antes de que exista el
modelo real. Va etiquetada como estudio en todas partes.

Se construye así:
  · un contorno de planta paramétrico (antepié ancho, cintura estrecha, talón
    redondo), que es lo que hace que se lea como una suela y no como una pastilla;
  · tres anillos en altura —base, chaflán, cara superior— extruidos;
  · la cara inferior con relieve de tacos, que es lo que da a THE FOUNDATION
    algo que mirar;
  · normales por vértice calculadas de las caras, para que la luz se comporte.
"""
import json, math, struct

N = 160          # puntos del contorno
LARGO = 0.30     # metros
ALTO = 0.034
CHAFLAN = 0.010

def ancho(t):
    """Semiancho del pie en la posición t ∈ [0,1], de talón a punta."""
    # talón redondo, cintura marcada hacia 0.42, antepié ancho hacia 0.72
    talon   = 0.052 * math.exp(-((t - 0.07) / 0.11) ** 2)
    cintura = 0.040 + 0.012 * math.sin(math.pi * min(t / 0.55, 1.0))
    antepie = 0.020 * math.exp(-((t - 0.74) / 0.16) ** 2)
    punta   = max(0.0, 1.0 - ((t - 0.90) / 0.14) ** 2) if t > 0.90 else 1.0
    return (max(talon, cintura) + antepie) * (punta ** 0.55)

def centro(t):
    """La línea media se desvía ligeramente: un pie no es simétrico."""
    return 0.006 * math.sin(math.pi * t) - 0.004 * t

def contorno(n):
    """Contorno cerrado, en sentido antihorario visto desde arriba."""
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        # se recorre el perímetro: mitad derecha de talón a punta, y vuelta
        t = (1 - math.cos(a)) / 2
        lado = 1 if a < math.pi else -1
        x = centro(t) + lado * ancho(t)
        z = (t - 0.5) * LARGO
        pts.append((x, z))
    return pts

def tacos(x, z):
    """Relieve de la cara inferior. Surcos transversales que se curvan."""
    u = z / LARGO
    surco = math.sin(u * 46.0 + 1.8 * math.sin(x * 26.0)) 
    banda = math.exp(-((u - 0.30) / 0.30) ** 2) + 0.8 * math.exp(-((u + 0.33) / 0.22) ** 2)
    return 0.0028 * banda * (0.5 + 0.5 * surco)

base = contorno(N)
verts, norms, tris = [], [], []

# ── tres anillos: base (con tacos), chaflán, cara superior
anillos = []
for nivel, (escala, y) in enumerate([(1.0, 0.0), (1.0, CHAFLAN), (0.88, ALTO)]):
    anillo = []
    for (x, z) in base:
        xx, zz = x * escala, z * escala
        yy = y - (tacos(xx, zz) if nivel == 0 else 0.0)
        anillo.append((xx, yy, zz))
    anillos.append(anillo)

idx = {}
def v(p):
    if p not in idx:
        idx[p] = len(verts)
        verts.append(p)
    return idx[p]

# paredes entre anillos
for a in range(len(anillos) - 1):
    for i in range(N):
        j = (i + 1) % N
        p0, p1 = anillos[a][i], anillos[a][j]
        p2, p3 = anillos[a + 1][j], anillos[a + 1][i]
        tris += [[v(p0), v(p1), v(p2)], [v(p0), v(p2), v(p3)]]

# tapa inferior, en abanico hacia centros por sección
cen_b = [ (sum(p[0] for p in anillos[0]) / N, min(p[1] for p in anillos[0]) - 0.0004, sum(p[2] for p in anillos[0]) / N) ]
cb = v(cen_b[0])
for i in range(N):
    j = (i + 1) % N
    tris.append([cb, v(anillos[0][j]), v(anillos[0][i])])

# tapa superior, ligeramente hundida: una suela tiene cuenca
top = anillos[-1]
cen_t = (sum(p[0] for p in top) / N, ALTO - 0.004, sum(p[2] for p in top) / N)
ct = v(cen_t)
for i in range(N):
    j = (i + 1) % N
    tris.append([ct, v(top[i]), v(top[j])])

# ── normales por vértice, promediadas de las caras
norms = [[0.0, 0.0, 0.0] for _ in verts]
for a, b, c in tris:
    pa, pb, pc = verts[a], verts[b], verts[c]
    u = (pb[0]-pa[0], pb[1]-pa[1], pb[2]-pa[2])
    w = (pc[0]-pa[0], pc[1]-pa[1], pc[2]-pa[2])
    n = (u[1]*w[2]-u[2]*w[1], u[2]*w[0]-u[0]*w[2], u[0]*w[1]-u[1]*w[0])
    for k in (a, b, c):
        norms[k][0] += n[0]; norms[k][1] += n[1]; norms[k][2] += n[2]
for n in norms:
    L = math.sqrt(n[0]**2 + n[1]**2 + n[2]**2) or 1.0
    n[0] /= L; n[1] /= L; n[2] /= L

# ── empaquetado GLB
pos_b = b"".join(struct.pack("<3f", *p) for p in verts)
nor_b = b"".join(struct.pack("<3f", *n) for n in norms)
idx_b = b"".join(struct.pack("<3I", *t) for t in tris)
def pad(b): return b + b"\x00" * ((4 - len(b) % 4) % 4)
bin_blob = pad(pos_b) + pad(nor_b) + pad(idx_b)
o_pos, o_nor = 0, len(pad(pos_b))
o_idx = o_nor + len(pad(nor_b))

mins = [min(p[k] for p in verts) for k in range(3)]
maxs = [max(p[k] for p in verts) for k in range(3)]

gltf = {
  "asset": {"version": "2.0", "generator": "NATHAN & ESTEBAN · suela de estudio (no es el producto)"},
  "scene": 0,
  "scenes": [{"nodes": [0], "name": "Estudio"}],
  "nodes": [{"mesh": 0, "name": "SUELA_ESTUDIO"}],
  "meshes": [{"name": "suela", "primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1}, "indices": 2, "material": 0}]}],
  "materials": [{
     "name": "MATERIAL_PRINCIPAL",
     "pbrMetallicRoughness": {"baseColorFactor": [0.09, 0.09, 0.085, 1.0], "metallicFactor": 0.0, "roughnessFactor": 0.62},
     "doubleSided": False,
  }],
  "accessors": [
    {"bufferView": 0, "componentType": 5126, "count": len(verts), "type": "VEC3", "min": mins, "max": maxs},
    {"bufferView": 1, "componentType": 5126, "count": len(norms), "type": "VEC3"},
    {"bufferView": 2, "componentType": 5125, "count": len(tris) * 3, "type": "SCALAR"},
  ],
  "bufferViews": [
    {"buffer": 0, "byteOffset": o_pos, "byteLength": len(pos_b), "target": 34962},
    {"buffer": 0, "byteOffset": o_nor, "byteLength": len(nor_b), "target": 34962},
    {"buffer": 0, "byteOffset": o_idx, "byteLength": len(idx_b), "target": 34963},
  ],
  "buffers": [{"byteLength": len(bin_blob)}],
}

json_b = pad(json.dumps(gltf, separators=(",", ":")).encode("utf-8")).replace(b"\x00", b" ")
glb = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(json_b) + 8 + len(bin_blob))
glb += struct.pack("<II", len(json_b), 0x4E4F534A) + json_b
glb += struct.pack("<II", len(bin_blob), 0x004E4942) + bin_blob
open("sole-study.glb", "wb").write(glb)
print(f"GLB escrito · {len(verts)} vértices · {len(tris)} triángulos · {len(glb)/1024:.0f} KB")
