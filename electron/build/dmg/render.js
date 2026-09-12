// Render the DMG background (1x + 2x) and a preview mockup to PNG with Electron.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;   // run: cd electron && npx electron build/dmg/render.js, then: tiffutil -cathidpicheck background.png background@2x.png -out background.tiff
const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function shot(file, w, h, zoom, out){
  const win = new BrowserWindow({ width: w * zoom, height: h * zoom, show: true, frame: false, resizable: false, x: 40, y: 40,
    webPreferences: { sandbox: true, contextIsolation: true } });
  await win.loadFile(path.join(DIR, file));
  await win.webContents.executeJavaScript('document.documentElement.style.zoom=' + zoom + '; "ok"');
  await wait(900);
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: w * zoom, height: h * zoom });
  // capturePage returns at the display DPR (2 on this Mac) → downscale to the intended pixel size.
  const png = img.resize({ width: w * zoom, height: h * zoom }).toPNG();
  fs.writeFileSync(path.join(DIR, out), png);
  console.log(out, w * zoom + 'x' + h * zoom, png.length, 'bytes');
  win.close();
}
app.whenReady().then(async () => {
  try {
    await shot('background.html', 660, 500, 1, 'background.png');
    await shot('background.html', 660, 500, 2, 'background@2x.png');
    await shot('preview.html', 660, 500, 2, 'preview@2x.png');
  } catch (e) { console.error('render failed:', e); }
  app.exit(0);
});
