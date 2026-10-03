/*
  Lector GLB mínimo y honesto.

  QUÉ LEE
  Mallas (POSITION, NORMAL, TEXCOORD_0, índices), jerarquía de nodos con matrix
  o TRS, materiales PBR (baseColorFactor, baseColorTexture, metallic, roughness)
  e imágenes embebidas o por URI.

  QUÉ NO LEE
  Draco, skins, animaciones y morph targets. Si un archivo los necesita, lo dice
  en voz alta en vez de dibujar algo incompleto y llamarlo bien.
*/
const COMP = {
  5120: { array: Int8Array, size: 1 },
  5121: { array: Uint8Array, size: 1 },
  5122: { array: Int16Array, size: 2 },
  5123: { array: Uint16Array, size: 2 },
  5125: { array: Uint32Array, size: 4 },
  5126: { array: Float32Array, size: 4 },
};
const NUM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export function parseGLB(buffer) {
  const dv = new DataView(buffer);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('No es un archivo GLB (falta la firma glTF).');
  const version = dv.getUint32(4, true);
  if (version !== 2) throw new Error(`GLB versión ${version}: este lector sólo entiende la 2.`);
  const total = dv.getUint32(8, true);
  if (total > buffer.byteLength) throw new Error('El GLB declara más bytes de los que tiene: está truncado.');

  let json = null, bin = null, off = 12;
  while (off + 8 <= total) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    const start = off + 8;
    if (start + len > buffer.byteLength) throw new Error('Un chunk del GLB se sale del archivo.');
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, len)));
    else if (type === 0x004e4942) bin = new Uint8Array(buffer, start, len);
    off = start + len + ((4 - (len % 4)) % 4);
  }
  if (!json) throw new Error('El GLB no trae chunk JSON.');
  return build(json, bin, buffer);
}

export function parseGLTFJSON(json, bin) { return build(json, bin, null); }

function build(g, bin) {
  const needed = (g.extensionsRequired || []).filter((e) => e !== 'KHR_materials_unlit');
  if (needed.length) throw new Error(`Este modelo exige extensiones que no leo: ${needed.join(', ')}.`);

  const buffers = (g.buffers || []).map((b, i) => {
    if (b.uri === undefined) {
      if (!bin) throw new Error('El modelo apunta al buffer binario y no hay chunk BIN.');
      return bin;
    }
    if (b.uri.startsWith('data:')) return b64(b.uri);
    throw new Error(`El buffer ${i} está en un archivo aparte (${b.uri}); sólo leo GLB autocontenido.`);
  });

  const view = (i) => {
    const v = g.bufferViews[i];
    const base = buffers[v.buffer || 0];
    return { base, byteOffset: (base.byteOffset || 0) + (v.byteOffset || 0), byteLength: v.byteLength, byteStride: v.byteStride || 0 };
  };

  function read(ai) {
    const a = g.accessors[ai];
    const n = NUM[a.type], c = COMP[a.componentType];
    if (!n || !c) throw new Error(`Accessor ${ai} con tipo que no entiendo.`);
    const out = new (a.componentType === 5126 ? Float32Array : c.array)(a.count * n);
    if (a.bufferView === undefined) return out; // ceros, como manda la especificación
    const v = view(a.bufferView);
    const stride = v.byteStride || n * c.size;
    const src = new DataView(v.base.buffer, v.byteOffset + (a.byteOffset || 0), v.byteLength - (a.byteOffset || 0));
    const get = {
      5120: (o) => src.getInt8(o), 5121: (o) => src.getUint8(o),
      5122: (o) => src.getInt16(o, true), 5123: (o) => src.getUint16(o, true),
      5125: (o) => src.getUint32(o, true), 5126: (o) => src.getFloat32(o, true),
    }[a.componentType];
    for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) out[i * n + k] = get(i * stride + k * c.size);
    return out;
  }

  const images = (g.images || []).map((im) => {
    if (im.uri && im.uri.startsWith('data:')) return im.uri;
    if (im.bufferView !== undefined) {
      const v = view(im.bufferView);
      const blob = new Blob([new Uint8Array(v.base.buffer, v.byteOffset, v.byteLength)], { type: im.mimeType || 'image/png' });
      return URL.createObjectURL(blob);
    }
    return null; // imagen externa: el material cae a su color plano
  });

  const materials = (g.materials || []).map((m, i) => {
    const p = m.pbrMetallicRoughness || {};
    const texIdx = p.baseColorTexture ? p.baseColorTexture.index : -1;
    const src = texIdx >= 0 && g.textures && g.textures[texIdx] ? g.textures[texIdx].source : undefined;
    return {
      name: m.name || `material_${i}`,
      baseColor: p.baseColorFactor || [1, 1, 1, 1],
      metallic: p.metallicFactor !== undefined ? p.metallicFactor : 1,
      roughness: p.roughnessFactor !== undefined ? p.roughnessFactor : 1,
      image: src !== undefined ? images[src] : null,
      doubleSided: !!m.doubleSided,
      alphaMode: m.alphaMode || 'OPAQUE',
    };
  });
  materials.push({ name: 'por_defecto', baseColor: [0.86, 0.85, 0.83, 1], metallic: 0, roughness: 0.6, image: null, doubleSided: true, alphaMode: 'OPAQUE' });
  const DEF = materials.length - 1;

  // ───────────────────────────────────────────────────── nodos → matrices mundo
  const parts = [];
  const walk = (ni, parent) => {
    const nd = g.nodes[ni];
    const local = nd.matrix ? nd.matrix.slice() : trs(nd.translation, nd.rotation, nd.scale);
    const world = mul(parent, local);
    if (nd.mesh !== undefined) {
      for (const pr of g.meshes[nd.mesh].primitives) {
        if (pr.mode !== undefined && pr.mode !== 4) continue; // sólo triángulos
        const pos = pr.attributes.POSITION;
        if (pos === undefined) continue;
        parts.push({
          name: nd.name || g.meshes[nd.mesh].name || `malla_${ni}`,
          position: read(pos),
          normal: pr.attributes.NORMAL !== undefined ? read(pr.attributes.NORMAL) : null,
          uv: pr.attributes.TEXCOORD_0 !== undefined ? read(pr.attributes.TEXCOORD_0) : null,
          index: pr.indices !== undefined ? read(pr.indices) : null,
          material: pr.material !== undefined ? pr.material : DEF,
          world,
        });
      }
    }
    for (const ch of nd.children || []) walk(ch, world);
  };
  const scene = g.scenes && g.scenes[g.scene || 0];
  const roots = scene && scene.nodes ? scene.nodes : (g.nodes || []).map((_, i) => i);
  for (const r of roots) walk(r, IDENT);
  if (!parts.length) throw new Error('El modelo no trae ninguna malla de triángulos.');

  for (const p of parts) {
    if (!p.normal) p.normal = normalesDeCara(p);
    applyWorld(p);
  }
  const bounds = caja(parts);
  const tris = parts.reduce((s, p) => s + (p.index ? p.index.length : p.position.length / 3) / 3, 0);
  const verts = parts.reduce((s, p) => s + p.position.length / 3, 0);
  return { parts, materials, bounds, tris, verts, generator: (g.asset && g.asset.generator) || '' };
}

const IDENT = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
function trs(t, r, s) {
  const [x,y,z,w] = r || [0,0,0,1], [sx,sy,sz] = s || [1,1,1], [tx,ty,tz] = t || [0,0,0];
  const x2=x+x, y2=y+y, z2=z+z;
  const xx=x*x2, xy=x*y2, xz=x*z2, yy=y*y2, yz=y*z2, zz=z*z2, wx=w*x2, wy=w*y2, wz=w*z2;
  return [
    (1-(yy+zz))*sx, (xy+wz)*sx, (xz-wy)*sx, 0,
    (xy-wz)*sy, (1-(xx+zz))*sy, (yz+wx)*sy, 0,
    (xz+wy)*sz, (yz-wx)*sz, (1-(xx+yy))*sz, 0,
    tx, ty, tz, 1,
  ];
}
function mul(a, b) { // column-major, a·b
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
  }
  return o;
}
function applyWorld(p) {
  const m = p.world;
  if (m.every((v, i) => v === IDENT[i])) return;
  const P = p.position, N = p.normal;
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i], y = P[i+1], z = P[i+2];
    P[i]   = m[0]*x + m[4]*y + m[8]*z  + m[12];
    P[i+1] = m[1]*x + m[5]*y + m[9]*z  + m[13];
    P[i+2] = m[2]*x + m[6]*y + m[10]*z + m[14];
    const nx = N[i], ny = N[i+1], nz = N[i+2];
    let a = m[0]*nx + m[4]*ny + m[8]*nz, b = m[1]*nx + m[5]*ny + m[9]*nz, c = m[2]*nx + m[6]*ny + m[10]*nz;
    const L = Math.hypot(a, b, c) || 1;
    N[i] = a/L; N[i+1] = b/L; N[i+2] = c/L;
  }
  p.world = IDENT;
}
function normalesDeCara(p) {
  const P = p.position, N = new Float32Array(P.length);
  const n = p.index ? p.index.length : P.length / 3;
  for (let i = 0; i + 2 < n; i += 3) {
    const a = (p.index ? p.index[i] : i) * 3, b = (p.index ? p.index[i+1] : i+1) * 3, c = (p.index ? p.index[i+2] : i+2) * 3;
    const ux = P[b]-P[a], uy = P[b+1]-P[a+1], uz = P[b+2]-P[a+2];
    const wx = P[c]-P[a], wy = P[c+1]-P[a+1], wz = P[c+2]-P[a+2];
    const nx = uy*wz-uz*wy, ny = uz*wx-ux*wz, nz = ux*wy-uy*wx;
    for (const o of [a, b, c]) { N[o]+=nx; N[o+1]+=ny; N[o+2]+=nz; }
  }
  for (let i = 0; i < N.length; i += 3) {
    const L = Math.hypot(N[i], N[i+1], N[i+2]) || 1;
    N[i]/=L; N[i+1]/=L; N[i+2]/=L;
  }
  return N;
}
function caja(parts) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) for (let i = 0; i < p.position.length; i += 3) for (let k = 0; k < 3; k++) {
    const v = p.position[i + k];
    if (v < min[k]) min[k] = v;
    if (v > max[k]) max[k] = v;
  }
  return { min, max, size: max.map((v, i) => v - min[i]), center: max.map((v, i) => (v + min[i]) / 2) };
}
function b64(uri) {
  const s = atob(uri.slice(uri.indexOf(',') + 1));
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}
