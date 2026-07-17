import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { renderMarkdown } from '../src/lib/report.js';
import { scanCase } from '../src/scan-case.js';

test('case scan creates a blocked offline evidence report', async () => {
  const caseRoot = await mkdtemp(path.join(tmpdir(), 'release-suture-case-'));
  const dbRoot = path.join(caseRoot, 'new-artifacts', 'db');
  await mkdir(dbRoot, { recursive: true });
  await writeFile(path.join(dbRoot, 'init.sql'), 'DROP TABLE x;\nCREATE TABLE x(id int);\nINSERT INTO x VALUES(1);\n');
  const report = await scanCase(caseRoot);
  assert.equal(report.summary.decision, 'BLOCKED');
  assert.equal(report.safety.networkAccess, 'NOT_IMPLEMENTED');
  assert.equal(report.safety.subprocessExecution, 'NOT_IMPLEMENTED');
  assert.ok(report.summary.blockingFindingIds.length >= 1);
  assert.match(renderMarkdown(report), /不连接或操作集群、数据库、服务器/);
});

test('source tree does not import network or subprocess modules', async () => {
  const sourceRoot = path.resolve('src');
  const files = [
    'cli.js',
    'scan-case.js',
    'lib/finding.js',
    'lib/release-plan.js',
    'lib/report.js',
    'lib/utils.js',
    'lib/zip.js',
    'scanners/dist.js',
    'scanners/jar.js',
    'scanners/k8s.js',
    'scanners/sql.js',
  ];
  const forbidden = /node:(?:http|https|http2|net|tls|dns|dgram|child_process|cluster|worker_threads)/;
  for (const relativePath of files) {
    const content = await readFile(path.join(sourceRoot, relativePath), 'utf8');
    assert.doesNotMatch(content, forbidden, relativePath);
  }
});
