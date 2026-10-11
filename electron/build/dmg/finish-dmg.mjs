#!/usr/bin/env node
// AV Look Book — finish the Mac installers after `electron-builder --mac --publish never` (2026-10-10).
//
// Why: the window settings electron-builder writes into the DMG (its dmgbuild .DS_Store) carry a link to the
// background picture that current macOS Finder does not follow, so the install window showed no background
// (tested on an M4 Mac, macOS 26, both APFS and HFS+ images). A .DS_Store written BY FINDER works. So the
// window settings are made once by Finder and kept in build/dmg/DS_Store.template (disk name "AV Look Book",
// window 660 x 528, icons 96 px at 190,296 and 470,296, background .background/background.tiff), and this
// script copies that file into every DMG, then refreshes each DMG's blockmap and its entry in latest-mac.yml.
//
//   node build/dmg/finish-dmg.mjs dist
//
// Remake the template (only when the layout or the disk name changes): see build/dmg/README-dmg.md.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const TEMPLATE = path.join(HERE, 'DS_Store.template');
const dir = path.resolve(process.argv[2] || 'dist');
const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' });
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

if (!fs.existsSync(TEMPLATE)) { console.error('missing ' + TEMPLATE); process.exit(1); }
const dmgs = fs.readdirSync(dir).filter((f) => f.endsWith('.dmg')).map((f) => path.join(dir, f));
if (!dmgs.length) { console.error('no .dmg in ' + dir); process.exit(1); }

const appBuilder = require('app-builder-bin').appBuilderPath;
const results = {};
for (const dmg of dmgs) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avlb-dmg-'));
  const rw = path.join(tmp, 'rw.dmg');
  const out = path.join(tmp, 'out.dmg');
  sh('hdiutil', ['convert', dmg, '-format', 'UDRW', '-o', rw, '-quiet']);
  const att = sh('hdiutil', ['attach', rw, '-readwrite', '-noverify', '-noautoopen', '-nobrowse']);
  const mnt = (att.match(/(\/Volumes\/.*)$/m) || [])[1];
  if (!mnt) { console.error('could not mount ' + rw + '\n' + att); process.exit(1); }
  fs.copyFileSync(TEMPLATE, path.join(mnt, '.DS_Store'));
  if (!fs.existsSync(path.join(mnt, '.background', 'background.tiff'))) { console.error('no .background/background.tiff in ' + dmg); process.exit(1); }
  let detached = false;
  for (let i = 0; i < 6 && !detached; i++) {
    try { sh('hdiutil', ['detach', mnt, '-quiet']); detached = true; } catch (e) { sleep(2000); }
  }
  if (!detached) sh('hdiutil', ['detach', mnt, '-force', '-quiet']);
  sh('hdiutil', ['convert', rw, '-format', 'UDZO', '-imagekey', 'zlib-level=9', '-o', out, '-quiet']);
  fs.copyFileSync(out, dmg);
  fs.rmSync(tmp, { recursive: true, force: true });
  // the blockmap and the size / sha512 electron-builder recorded belong to the old file
  const info = JSON.parse(sh(appBuilder, ['blockmap', '--input', dmg, '--output', dmg + '.blockmap']));
  results[path.basename(dmg)] = { sha512: info.sha512, size: info.size };
  console.log('finished', path.basename(dmg), info.size, 'bytes');
}

const ymlPath = path.join(dir, 'latest-mac.yml');
if (fs.existsSync(ymlPath)) {
  const yaml = require('js-yaml');
  const doc = yaml.load(fs.readFileSync(ymlPath, 'utf8'));
  for (const f of doc.files || []) { const r = results[f.url]; if (r) { f.sha512 = r.sha512; f.size = r.size; } }
  if (doc.path && results[doc.path]) doc.sha512 = results[doc.path].sha512;
  fs.writeFileSync(ymlPath, yaml.dump(doc, { lineWidth: 8000 }));
  console.log('updated latest-mac.yml');
}
