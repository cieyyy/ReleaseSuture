import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const projectRoot = path.resolve(import.meta.dirname, '..');
const buildCache = path.join(projectRoot, '.desktop-build-cache');
const temporaryDirectory = path.join(tmpdir(), 'release-suture-packager');

await mkdir(temporaryDirectory, { recursive: true });
process.env.ELECTRON_CACHE = path.join(buildCache, 'electron');
process.env.LOCALAPPDATA = path.join(buildCache, 'localappdata');
process.env.APPDATA = path.join(buildCache, 'appdata');

const { packager } = await import('@electron/packager');

const outputPaths = await packager({
  dir: projectRoot,
  name: 'ReleaseSuture',
  executableName: 'ReleaseSuture',
  platform: 'win32',
  arch: 'x64',
  electronVersion: '43.1.1',
  out: path.join(projectRoot, 'out'),
  icon: path.join(projectRoot, 'assets', 'release-suture.ico'),
  overwrite: true,
  asar: true,
  prune: true,
  tmpdir: temporaryDirectory,
  ignore: [
    /[\\/]test(?:[\\/]|$)/,
    /[\\/]tmp(?:[\\/]|$)/,
    /[\\/]examples(?:[\\/]|$)/,
    /[\\/]\.npm-cache(?:[\\/]|$)/,
    /[\\/]\.electron-cache(?:[\\/]|$)/,
    /[\\/]\.localappdata(?:[\\/]|$)/,
    /[\\/]\.appdata(?:[\\/]|$)/,
    /[\\/]\.desktop-build-cache(?:[\\/]|$)/,
  ],
  win32metadata: {
    CompanyName: 'ReleaseSuture Contributors',
    FileDescription: 'Offline release evidence compiler',
    InternalName: 'ReleaseSuture',
    OriginalFilename: 'ReleaseSuture.exe',
    ProductName: 'ReleaseSuture',
  },
});

for (const outputPath of outputPaths) process.stdout.write(`Desktop package: ${outputPath}\n`);
