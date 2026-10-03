const { chromium } = require('/opt/node-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.css': 'text/css' };
const srv = http.createServer((req, res) => {
  const f = path.join(__dirname, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'viewer.html');
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

const VISTAS = process.argv[2] ? process.argv[2].split(',') : ['3/4', 'Perfil', 'Punta', 'Talón', 'Planta', 'Suela'];
const SUF = { '3/4': '34', 'Perfil': 'perfil', 'Punta': 'punta', 'Talón': 'talon', 'Planta': 'planta', 'Suela': 'suela' };

(async () => {
  await new Promise((r) => srv.listen(8099, r));
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await p.goto('http://127.0.0.1:8099/viewer.html', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__listo && window.__listo(), null, { timeout: 60000 }).catch(() => {});

  const err = await p.locator('#error').evaluate((el) => (el.hidden ? '' : el.textContent));
  const estado = await p.locator('#estado').textContent();
  const datos = await p.locator('#datos').evaluate((dl) => [...dl.children].map((c) => c.textContent).join(' '));
  console.log('ESTADO:', estado.trim());
  console.log('DATOS :', datos.trim());
  if (err) console.log('ERROR EN PAGINA:', err.trim());

  fs.mkdirSync(path.join(__dirname, 'shots'), { recursive: true });
  for (const v of VISTAS) {
    await p.locator(`#vistas button:text-is("${v}")`).click();
    await p.waitForTimeout(1400);
    await p.locator('#stage').screenshot({ path: path.join(__dirname, 'shots', `v-${SUF[v] || v}.png`) });
  }
  // una pasada con la estructura visible, para ver la malla
  await p.locator('#vistas button:text-is("3/4")').click();
  await p.locator('#malla').click();
  await p.waitForTimeout(2500);
  await p.locator('#stage').screenshot({ path: path.join(__dirname, 'shots', 'z-malla.png') });
  await p.locator('#malla').click();
  // acabado negro, que es donde se ven los defectos de forma
  await p.locator('#acabados button:text-is("Black")').click();
  await p.waitForTimeout(1600);
  await p.locator('#stage').screenshot({ path: path.join(__dirname, 'shots', 'z-black.png') });

  if (errs.length) console.log('JS:', errs.slice(0, 8).join(' | '));
  else console.log('JS: sin errores');
  await b.close();
  srv.close();
})();
