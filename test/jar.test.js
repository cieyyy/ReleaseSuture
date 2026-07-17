import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { scanJarFile } from '../src/scanners/jar.js';
import { sha256File } from '../src/lib/utils.js';

function storedZip(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const [name, value] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name);
    const data = Buffer.from(value);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    localParts.push(local, nameBuffer, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, nameBuffer);
    localOffset += local.length + nameBuffer.length + data.length;
  }

  const centralBuffer = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(entries).length, 8);
  eocd.writeUInt16LE(Object.keys(entries).length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralBuffer, eocd]);
}

test('JAR scanner inventories migrations and blocks embedded credentials/destructive SQL', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'release-suture-jar-'));
  const filePath = path.join(directory, 'backend-1.0.0.jar');
  const jar = storedZip({
    'META-INF/MANIFEST.MF': 'Implementation-Version: 1.0.0\n',
    'BOOT-INF/classes/application.properties': 'spring.datasource.password=do-not-print-me\n',
    'BOOT-INF/classes/db/migration/V12__danger.sql': 'DROP TABLE users;\n',
  });
  await writeFile(filePath, jar);
  const result = await scanJarFile({
    absolutePath: filePath,
    relativePath: 'new-artifacts/backend/backend-1.0.0.jar',
    sha256: await sha256File(filePath),
    scope: 'target',
  });
  const rules = new Set(result.findings.map((finding) => finding.ruleId));
  assert.ok(rules.has('RS-JAR-004'));
  assert.ok(rules.has('RS-JAR-005'));
  assert.equal(result.inventory.migrationEntries.length, 1);
  assert.doesNotMatch(JSON.stringify(result.findings), /do-not-print-me/);
});
