const { chromium, devices } = require('/opt/node-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary' };
const srv = http.createServer((req, res) => {
  const f = path.join(__dirname, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'viewer.html');
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
(async () => {
  await new Promise((r) => srv.listen(8099, r));
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://127.0.0.1:8099/viewer.html', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__listo && window.__listo(), null, { timeout: 60000 }).catch(() => {});
  const r = await p.evaluate(() => {
    const chicos = [...document.querySelectorAll('button, input, a[href]')]
      .map((e) => ({ t: (e.textContent || e.type || '').trim().slice(0, 14), w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) }))
      .filter((e) => e.h > 0 && (e.h < 24 || e.w < 24));
    return {
      ancho: document.documentElement.clientWidth,
      scrollX: document.documentElement.scrollWidth,
      desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      chicos,
      origenes: performance.getEntriesByType('resource').map((e) => new URL(e.name).origin).filter((v, i, a) => a.indexOf(v) === i),
    };
  });
  console.log(JSON.stringify(r, null, 1));
  console.log('errores JS:', errs.length ? errs.join(' | ') : 'ninguno');
  await p.screenshot({ path: path.join(__dirname, 'shots', 'm-390.png'), fullPage: true });
  await b.close(); srv.close();
})();
