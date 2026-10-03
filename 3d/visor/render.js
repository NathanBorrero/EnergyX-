/*
  Render de estudio: luz de tres puntos, sombra proyectada y suelo de papel.
  Sin librerías. WebGL2 directo.
*/
const VS = `#version 300 es
in vec3 aPos; in vec3 aNor; in vec2 aUv;
uniform mat4 uViewProj; uniform vec3 uCenter; uniform float uSpin;
out vec3 vPos; out vec3 vNor; out vec2 vUv;
void main() {
  float c = cos(uSpin), s = sin(uSpin);
  vec3 q = aPos - uCenter;
  vec3 p = vec3(c * q.x + s * q.z, q.y, -s * q.x + c * q.z) + uCenter;
  vec3 n = vec3(c * aNor.x + s * aNor.z, aNor.y, -s * aNor.x + c * aNor.z);
  vPos = p; vNor = n; vUv = aUv;
  gl_Position = uViewProj * vec4(p, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec3 vPos; in vec3 vNor; in vec2 vUv;
uniform vec3 uEye; uniform vec4 uBase; uniform float uRough; uniform float uMetal;
uniform sampler2D uTex; uniform float uHasTex;
uniform float uFloorY; uniform float uBackface;
out vec4 frag;

vec3 luz(vec3 N, vec3 V, vec3 L, vec3 col, float rough, vec3 base, float metal) {
  float nl = max(dot(N, L), 0.0);
  vec3 H = normalize(L + V);
  float a = max(rough * rough, 0.0025);
  float nh = max(dot(N, H), 0.0);
  float d = (nh * nh * (a * a - 1.0) + 1.0);
  float ggx = (a * a) / (3.14159265 * d * d);
  float f0 = mix(0.045, 1.0, metal);
  vec3 spec = col * ggx * f0 * nl;
  vec3 diff = base * col * nl * (1.0 - metal) / 3.14159265;
  return diff + spec;
}

void main() {
  vec3 N = normalize(vNor);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(uEye - vPos);
  vec4 base = uBase;
  if (uHasTex > 0.5) base *= texture(uTex, vUv);
  if (uBackface > 0.5 && !gl_FrontFacing) { frag = vec4(0.78, 0.12, 0.45, 1.0); return; }

  // ambiente hemisférico: cielo arriba, rebote del papel abajo
  float sky = 0.5 + 0.5 * N.y;
  vec3 amb = mix(vec3(0.46, 0.45, 0.43), vec3(0.92, 0.92, 0.94), sky) * base.rgb;
  // oclusión de contacto con el suelo
  float h = clamp((vPos.y - uFloorY) / 0.035, 0.0, 1.0);
  amb *= mix(0.46, 1.0, pow(h, 0.65));

  vec3 c = amb * 0.74;
  c += luz(N, V, normalize(vec3(-0.55, 0.78, 0.62)), vec3(2.55, 2.52, 2.46), uRough, base.rgb, uMetal);
  c += luz(N, V, normalize(vec3( 0.86, 0.26, 0.34)), vec3(0.66, 0.66, 0.70), uRough, base.rgb, uMetal);
  c += luz(N, V, normalize(vec3( 0.10, 0.42,-0.92)), vec3(0.74, 0.73, 0.70), uRough, base.rgb, uMetal);

  c = c / (c + vec3(0.92));                  // compresión de altas luces
  c = pow(c * 1.42, vec3(1.0 / 2.2));
  frag = vec4(min(c, vec3(1.0)), base.a);
}`;

const SUELO_VS = `#version 300 es
in vec2 aXz;
uniform mat4 uViewProj; uniform float uFloorY; uniform float uExtent; uniform vec3 uCenter;
out vec2 vXz;
void main() { vXz = aXz * uExtent; gl_Position = uViewProj * vec4(vXz.x + uCenter.x, uFloorY, vXz.y + uCenter.z, 1.0); }`;

const SUELO_FS = `#version 300 es
precision highp float;
in vec2 vXz;
uniform vec2 uHuella; uniform vec3 uPaper; uniform float uExtent;
out vec4 frag;
void main() {
  // sombra de contacto: elipse de la huella, borde suave
  float d = length(vec2(vXz.x / uHuella.x, vXz.y / uHuella.y));
  float s = 1.0 - smoothstep(0.55, 2.05, d);
  // el plano se funde con el fondo en su borde: si no, se ve el horizonte
  float borde = smoothstep(0.30, 0.88, length(vXz) / uExtent);
  vec3 c = uPaper * mix(1.0, 0.80, s * 0.92);
  frag = vec4(mix(c, uPaper, borde), 1.0);
}`;

const SOMBRA_VS = `#version 300 es
in vec3 aPos;
uniform mat4 uViewProj; uniform float uFloorY; uniform vec3 uLuz; uniform vec3 uCenter; uniform float uSpin;
void main() {
  float c = cos(uSpin), s = sin(uSpin);
  vec3 q = aPos - uCenter;
  vec3 p = vec3(c * q.x + s * q.z, q.y, -s * q.x + c * q.z) + uCenter;
  float k = (p.y - uFloorY) / max(uLuz.y, 0.001);
  vec3 g = vec3(p.x - uLuz.x * k, uFloorY + 0.0004, p.z - uLuz.z * k);
  gl_Position = uViewProj * vec4(g, 1.0);
}`;

const SOMBRA_FS = `#version 300 es
precision highp float; out vec4 frag;
void main() { frag = vec4(0.0, 0.0, 0.0, 1.0); }`;

export function crearRender(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: true, stencil: true, alpha: false, preserveDrawingBuffer: true });
  if (!gl) throw new Error('Este navegador no da WebGL2.');

  const malla = prog(gl, VS, FS);
  const suelo = prog(gl, SUELO_VS, SUELO_FS);
  const sombra = prog(gl, SOMBRA_VS, SOMBRA_FS);

  const quad = gl.createVertexArray();
  gl.bindVertexArray(quad);
  const qb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, qb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, 1,1, -1,-1, 1,1, -1,1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  let modelo = null, lotes = [], blanca = null;

  function subir(m) {
    for (const l of lotes) { gl.deleteVertexArray(l.vao); l.bufs.forEach((b) => gl.deleteBuffer(b)); if (l.lineas) gl.deleteBuffer(l.lineas); }
    lotes = [];
    modelo = m;
    for (const p of m.parts) {
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const bufs = [];
      bufs.push(atrib(gl, 0, p.position, 3));
      bufs.push(atrib(gl, 1, p.normal, 3));
      bufs.push(atrib(gl, 2, p.uv || new Float32Array((p.position.length / 3) * 2), 2));
      let ebo = null, count;
      if (p.index) {
        ebo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
        const u32 = p.index instanceof Uint32Array ? p.index : new Uint32Array(p.index);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, u32, gl.STATIC_DRAW);
        bufs.push(ebo);
        count = u32.length;
      } else count = p.position.length / 3;
      gl.bindVertexArray(null);
      const mat = m.materials[p.material] || m.materials[m.materials.length - 1];
      lotes.push({ vao, bufs, count, indexado: !!p.index, mat, tex: mat.image ? textura(gl, mat.image) : null, nombre: p.name, lineas: null, nLineas: 0, p });
    }
  }

  function lineasDe(l) {
    if (l.lineas) return l;
    const p = l.p, set = new Set(), arr = [];
    const n = p.index ? p.index.length : p.position.length / 3;
    const push = (a, b) => {
      const k = a < b ? a * 4294967296 + b : b * 4294967296 + a;
      if (set.has(k)) return;
      set.add(k); arr.push(a, b);
    };
    for (let i = 0; i + 2 < n; i += 3) {
      const a = p.index ? p.index[i] : i, b = p.index ? p.index[i+1] : i+1, c = p.index ? p.index[i+2] : i+2;
      push(a, b); push(b, c); push(c, a);
    }
    gl.bindVertexArray(l.vao);
    l.lineas = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, l.lineas);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(arr), gl.STATIC_DRAW);
    l.nLineas = arr.length;
    gl.bindVertexArray(null);
    return l;
  }

  function dibujar(o) {
    const { ancho, alto, viewProj, eye, paper, color, estructura, backface, spin, floorY, huella, extent, center, conSuelo } = o;
    gl.viewport(0, 0, ancho, alto);
    gl.clearColor(paper[0], paper[1], paper[2], 1);
    gl.clearDepth(1);
    gl.clearStencil(0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    if (conSuelo) {
      gl.useProgram(suelo);
      gl.bindVertexArray(quad);
      u3(gl, suelo, 'uPaper', paper);
      gl.uniformMatrix4fv(loc(gl, suelo, 'uViewProj'), false, viewProj);
      gl.uniform1f(loc(gl, suelo, 'uFloorY'), floorY);
      gl.uniform1f(loc(gl, suelo, 'uExtent'), extent);
      gl.uniform2f(loc(gl, suelo, 'uHuella'), huella[0], huella[1]);
      u3(gl, suelo, 'uCenter', center);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindVertexArray(null);

      // sombra proyectada, marcada una vez en el stencil para que no se acumule
      gl.enable(gl.STENCIL_TEST);
      gl.stencilFunc(gl.ALWAYS, 1, 0xff);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
      gl.colorMask(false, false, false, false);
      gl.depthMask(false);
      gl.useProgram(sombra);
      gl.uniformMatrix4fv(loc(gl, sombra, 'uViewProj'), false, viewProj);
      gl.uniform1f(loc(gl, sombra, 'uFloorY'), floorY);
      u3(gl, sombra, 'uLuz', [-0.55, 0.78, 0.62]);
      u3(gl, sombra, 'uCenter', center);
      gl.uniform1f(loc(gl, sombra, 'uSpin'), spin);
      for (const l of lotes) {
        gl.bindVertexArray(l.vao);
        if (l.indexado) { gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, l.bufs[l.bufs.length - 1]); gl.drawElements(gl.TRIANGLES, l.count, gl.UNSIGNED_INT, 0); }
        else gl.drawArrays(gl.TRIANGLES, 0, l.count);
      }
      gl.bindVertexArray(null);
      gl.colorMask(true, true, true, true);
      gl.depthMask(true);
      gl.stencilFunc(gl.EQUAL, 1, 0xff);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(suelo);
      gl.bindVertexArray(quad);
      u3(gl, suelo, 'uPaper', [paper[0] * 0.30, paper[1] * 0.30, paper[2] * 0.31]);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
      gl.disable(gl.STENCIL_TEST);
    }

    gl.useProgram(malla);
    gl.uniformMatrix4fv(loc(gl, malla, 'uViewProj'), false, viewProj);
    u3(gl, malla, 'uEye', eye);
    u3(gl, malla, 'uCenter', center);
    gl.uniform1f(loc(gl, malla, 'uSpin'), spin);
    gl.uniform1f(loc(gl, malla, 'uFloorY'), floorY);
    gl.uniform1f(loc(gl, malla, 'uBackface'), backface ? 1 : 0);
    gl.uniform1i(loc(gl, malla, 'uTex'), 0);

    for (const l of lotes) {
      const tono = color ? color(l.mat) : null;
      const base = tono ? tono.base : l.mat.baseColor;
      const rough = tono && tono.rough !== undefined ? tono.rough : l.mat.roughness;
      gl.uniform4f(loc(gl, malla, 'uBase'), base[0], base[1], base[2], base[3] !== undefined ? base[3] : 1);
      gl.uniform1f(loc(gl, malla, 'uRough'), Math.max(0.045, rough));
      gl.uniform1f(loc(gl, malla, 'uMetal'), tono && tono.metal !== undefined ? tono.metal : l.mat.metallic);
      gl.uniform1f(loc(gl, malla, 'uHasTex'), l.tex ? 1 : 0);
      if (l.tex) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, l.tex); }
      gl.bindVertexArray(l.vao);
      if (l.indexado) { gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, l.bufs[l.bufs.length - 1]); gl.drawElements(gl.TRIANGLES, l.count, gl.UNSIGNED_INT, 0); }
      else gl.drawArrays(gl.TRIANGLES, 0, l.count);
      gl.bindVertexArray(null);
    }

    if (estructura) {
      gl.useProgram(malla);
      gl.uniform1f(loc(gl, malla, 'uHasTex'), 0);
      gl.uniform4f(loc(gl, malla, 'uBase'), 0.06, 0.06, 0.055, 1);
      gl.uniform1f(loc(gl, malla, 'uRough'), 1);
      gl.uniform1f(loc(gl, malla, 'uMetal'), 0);
      gl.uniform1f(loc(gl, malla, 'uBackface'), 0);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      for (const l of lotes) {
        lineasDe(l);
        gl.bindVertexArray(l.vao);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, l.lineas);
        gl.drawElements(gl.LINES, l.nLineas, gl.UNSIGNED_INT, 0);
        gl.bindVertexArray(null);
      }
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }
  }

  return { gl, subir, dibujar, get modelo() { return modelo; } };
}

function prog(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const sh = gl.createShader(t);
    gl.shaderSource(sh, s);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('Shader: ' + gl.getShaderInfoLog(sh));
    gl.attachShader(p, sh);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link: ' + gl.getProgramInfoLog(p));
  p._loc = {};
  return p;
}
function loc(gl, p, n) { if (!(n in p._loc)) p._loc[n] = gl.getUniformLocation(p, n); return p._loc[n]; }
function u3(gl, p, n, v) { gl.uniform3f(loc(gl, p, n), v[0], v[1], v[2]); }
function atrib(gl, i, data, n) {
  const b = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, data instanceof Float32Array ? data : new Float32Array(data), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(i);
  gl.vertexAttribPointer(i, n, gl.FLOAT, false, 0, 0);
  return b;
}
function textura(gl, src) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([200, 200, 200, 255]));
  const im = new Image();
  im.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, im);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  };
  im.src = src;
  return t;
}

// ───────────────────────────────────────────────────────────────── cámara
export function matrices(o) {
  const { azim, elev, dist, center, aspecto, fov } = o;
  const ce = Math.cos(elev), se = Math.sin(elev);
  const eye = [center[0] + dist * ce * Math.sin(azim), center[1] + dist * se, center[2] + dist * ce * Math.cos(azim)];
  const view = mirar(eye, center, [0, 1, 0]);
  const f = 1 / Math.tan(fov / 2), near = dist * 0.02, far = dist * 12;
  const proj = [f / aspecto,0,0,0, 0,f,0,0, 0,0,(far+near)/(near-far),-1, 0,0,2*far*near/(near-far),0];
  return { eye, viewProj: mm(proj, view) };
}
function mirar(e, c, up) {
  let z = [e[0]-c[0], e[1]-c[1], e[2]-c[2]];
  let L = Math.hypot(...z) || 1; z = z.map((v) => v / L);
  let x = [up[1]*z[2]-up[2]*z[1], up[2]*z[0]-up[0]*z[2], up[0]*z[1]-up[1]*z[0]];
  L = Math.hypot(...x) || 1; x = x.map((v) => v / L);
  const y = [z[1]*x[2]-z[2]*x[1], z[2]*x[0]-z[0]*x[2], z[0]*x[1]-z[1]*x[0]];
  return [x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0,
          -(x[0]*e[0]+x[1]*e[1]+x[2]*e[2]), -(y[0]*e[0]+y[1]*e[1]+y[2]*e[2]), -(z[0]*e[0]+z[1]*e[1]+z[2]*e[2]), 1];
}
function mm(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
  return o;
}
