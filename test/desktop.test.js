import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runDesktopScan } from '../desktop/service.js';

test('desktop service writes exactly two reports without external access', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'release-suture-desktop-'));
  const casePath = path.join(parent, 'case');
  const dbPath = path.join(casePath, 'new-artifacts', 'db');
  const outputPath = path.join(parent, 'report');
  await mkdir(dbPath, { recursive: true });
  await writeFile(path.join(dbPath, 'init.sql'), 'DROP TABLE demo;\nCREATE TABLE demo(id int);\nINSERT INTO demo VALUES(1);\n');

  const result = await runDesktopScan({ casePath, outputPath });
  const outputFiles = (await readdir(outputPath)).sort();
  const json = JSON.parse(await readFile(path.join(outputPath, 'report.json'), 'utf8'));

  assert.deepEqual(outputFiles, ['report.json', 'report.md']);
  assert.equal(result.report.summary.decision, 'BLOCKED');
  assert.equal(json.safety.networkAccess, 'NOT_IMPLEMENTED');
  assert.equal(json.safety.subprocessExecution, 'NOT_IMPLEMENTED');
});

test('desktop service rejects a report directory inside the evidence directory', async () => {
  const casePath = await mkdtemp(path.join(tmpdir(), 'release-suture-boundary-'));
  await assert.rejects(
    runDesktopScan({ casePath, outputPath: path.join(casePath, 'report') }),
    /不能位于证据目录内部/,
  );
});

test('desktop renderer and IPC use restrictive Electron security settings', async () => {
  const [main, preload, html, renderer, packager] = await Promise.all([
    readFile(path.resolve('desktop/main.js'), 'utf8'),
    readFile(path.resolve('desktop/preload.cjs'), 'utf8'),
    readFile(path.resolve('desktop/index.html'), 'utf8'),
    readFile(path.resolve('desktop/renderer.js'), 'utf8'),
    readFile(path.resolve('scripts/package-desktop.mjs'), 'utf8'),
  ]);

  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /setPermissionCheckHandler\(\(\) => false\)/);
  assert.match(main, /setPermissionRequestHandler/);
  assert.match(main, /will-navigate/);
  assert.match(main, /action:\s*'deny'/);
  assert.match(main, /cancel:\s*!details\.url\.startsWith\('file:\/\/'\)/);
  assert.match(main, /isTrustedSender/);
  assert.match(main, /release-suture\.ico/);
  assert.doesNotMatch(main, /node:(?:http|https|http2|net|tls|dns|dgram|child_process)/);
  assert.doesNotMatch(main, /\bshell\b/);
  assert.match(packager, /release-suture\.ico/);

  assert.match(preload, /contextBridge\.exposeInMainWorld/);
  assert.doesNotMatch(preload, /ipcRenderer\.(?:send|sendSync|on|once)\s*\(/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /object-src 'none'/);
  assert.match(html, /frame-src 'none'/);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.doesNotMatch(renderer, /\b(?:fetch|WebSocket|XMLHttpRequest)\b/);
  assert.doesNotMatch(renderer, /\.innerHTML\s*=/);
});
