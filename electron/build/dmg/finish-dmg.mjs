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

// latest-mac.yml: the arm64 and x64 DMGs are built one after the other (they share the disk name "AV Look Book",
// so building them at the same time collides), each run writing its own yml; rebuild ONE from the finished DMGs,
// in electron-builder's layout: arm64 first, path / sha512 = the first file.
const ymls = fs.readdirSync(dir).filter((f) => /^latest-mac.*\.yml$/.test(f));
if (ymls.length) {
  const yaml = require('js-yaml');
  const docs = ymls.map((f) => yaml.load(fs.readFileSync(path.join(dir, f), 'utf8')) || {});
  const names = Object.keys(results).sort((a, b) => (b.includes('arm64') - a.includes('arm64')) || a.localeCompare(b));
  const files = names.map((n) => ({ url: n, sha512: results[n].sha512, size: results[n].size }));
  const doc = { version: docs[0].version, files, path: files[0].url, sha512: files[0].sha512,
    releaseDate: docs.map((d) => d.releaseDate).filter(Boolean).sort().pop() || new Date().toISOString() };
  for (const f of ymls) fs.rmSync(path.join(dir, f));
  fs.writeFileSync(ymlPath(), yaml.dump(doc, { lineWidth: 8000 }));
  console.log('wrote latest-mac.yml for', names.join(', '));
}
function ymlPath() { return path.join(dir, 'latest-mac.yml'); }
