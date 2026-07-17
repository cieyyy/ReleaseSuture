import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { scanHtmlFile } from '../src/scanners/dist.js';
import { sha256File } from '../src/lib/utils.js';

test('dist scanner reports missing local assets', async () => {
  const caseRoot = await mkdtemp(path.join(tmpdir(), 'release-suture-dist-'));
  const distRoot = path.join(caseRoot, 'new-artifacts', 'web');
  await mkdir(distRoot, { recursive: true });
  const filePath = path.join(distRoot, 'index.html');
  await writeFile(filePath, '<link rel="icon" href="/missing.svg"><script src="https://cdn.example/app.js"></script>');
  const result = await scanHtmlFile({
    absolutePath: filePath,
    relativePath: 'new-artifacts/web/index.html',
    sha256: await sha256File(filePath),
    scope: 'target',
    caseRoot,
  });
  assert.equal(result.findings.filter((finding) => finding.ruleId === 'RS-DIST-001').length, 1);
});

test('dist scanner refuses to inspect references outside the evidence directory', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'release-suture-dist-boundary-'));
  const root = path.join(parent, 'case');
  const dist = path.join(root, 'new-artifacts', 'web');
  await mkdir(dist, { recursive: true });
  await writeFile(path.join(parent, 'outside.txt'), 'must-not-be-inspected');
  const htmlPath = path.join(dist, 'index.html');
  await writeFile(htmlPath, '<a href="../../../outside.txt">outside</a>');
  const sha256 = await sha256File(htmlPath);
  const result = await scanHtmlFile({
    absolutePath: htmlPath,
    relativePath: 'new-artifacts/web/index.html',
    sha256,
    scope: 'target',
    caseRoot: root,
  });
  assert.ok(result.findings.some((finding) => finding.ruleId === 'RS-DIST-004'));
  assert.equal(result.references[0].blockedBySafetyBoundary, true);
});
