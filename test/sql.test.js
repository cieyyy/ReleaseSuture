import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { scanSqlFile } from '../src/scanners/sql.js';
import { sha256File } from '../src/lib/utils.js';

test('SQL scanner blocks full initialization scripts', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'release-suture-sql-'));
  const filePath = path.join(directory, 'init.sql');
  await writeFile(filePath, [
    'SET FOREIGN_KEY_CHECKS=0;',
    'DROP TABLE IF EXISTS models;',
    'CREATE TABLE models (id bigint primary key);',
    'INSERT INTO models VALUES (1);',
  ].join('\n'));

  const result = await scanSqlFile({
    absolutePath: filePath,
    relativePath: 'new-artifacts/db/init.sql',
    sha256: await sha256File(filePath),
    scope: 'target',
  });
  const ruleIds = new Set(result.findings.map((finding) => finding.ruleId));
  assert.ok(ruleIds.has('RS-SQL-001'));
  assert.ok(ruleIds.has('RS-SQL-007'));
  assert.equal(result.stats.dropStatements, 1);
  assert.equal(result.stats.createTableStatements, 1);
  assert.equal(result.stats.insertStatements, 1);
});

test('SQL scanner flags unsafe NOT NULL additions', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'release-suture-sql-'));
  const filePath = path.join(directory, 'migration.sql');
  await writeFile(filePath, 'ALTER TABLE models\n  ADD COLUMN enabled int NOT NULL;\n');
  const result = await scanSqlFile({
    absolutePath: filePath,
    relativePath: 'new-artifacts/db/migration.sql',
    sha256: await sha256File(filePath),
    scope: 'target',
  });
  assert.ok(result.findings.some((finding) => finding.ruleId === 'RS-SQL-005'));
});
