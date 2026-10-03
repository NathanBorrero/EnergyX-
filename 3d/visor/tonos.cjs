const { chromium } = require('/opt/node-tools/node_modules/playwright');
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
  const p = await b.newPage({ viewport: { width: 900, height: 740 } });
  await p.goto('http://127.0.0.1:8099/viewer.html', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__listo && window.__listo(), null, { timeout: 60000 });
  for (const a of ['Original', 'White', 'Grey', 'Black']) {
    await p.locator(`#acabados button:text-is("${a}")`).click();
    await p.waitForTimeout(1500);
    await p.locator('#stage').screenshot({ path: path.join(__dirname, 'shots', `t-${a.toLowerCase()}.png`) });
    // tono medio del zapato, leído del propio pixel
    const v = await p.evaluate(() => {
      const c = document.getElementById('lienzo');
      const g = c.getContext('webgl2');
      const px = new Uint8Array(4 * c.width * c.height);
      g.readPixels(0, 0, c.width, c.height, g.RGBA, g.UNSIGNED_BYTE, px);
      // el fondo es claro y uniforme: se mide la banda central
      let s = 0, n = 0;
      for (let y = Math.floor(c.height * 0.35); y < c.height * 0.60; y++)
        for (let x = Math.floor(c.width * 0.35); x < c.width * 0.65; x++) {
          const i = (y * c.width + x) * 4;
          s += px[i]; n++;
        }
      return Math.round(s / n);
    });
    console.log(`${a.padEnd(9)} tono medio ${v}/255`);
  }
  await b.close(); srv.close();
})();
