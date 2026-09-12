// electron-builder afterPack hook (macOS only).
//
// We ship without an Apple Developer identity for now. electron-builder then
// skips signing entirely, which leaves Electron's stock "linker-signed" ad-hoc
// signature on the main binary but NO seal over the rest of the bundle.
// Gatekeeper reports that as "damaged and can't be opened" — with no way to
// override. Re-signing the whole bundle ad-hoc ("-") gives it a valid seal, so
// macOS shows the normal "Apple could not verify…" prompt and the user can
// choose Open Anyway in System Settings → Privacy & Security.
//
// Once a real Developer ID is configured this hook is harmless: electron-builder
// signs after afterPack and replaces the ad-hoc signature.
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appPath = path.join(context.appOutDir, context.packager.appInfo.productFilename + '.app');
  console.log('  • ad-hoc signing (afterPack) ' + appPath);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=1', appPath], { stdio: 'inherit' });
};
