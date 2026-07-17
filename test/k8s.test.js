import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { scanK8sFile } from '../src/scanners/k8s.js';
import { sha256File } from '../src/lib/utils.js';

test('K8s scanner finds outage-prone deployment settings', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'release-suture-k8s-'));
  const filePath = path.join(directory, 'deployment.yaml');
  await writeFile(filePath, `apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: demo
spec:
  replicas: 1
  strategy:
    type: Recreate
  template:
    spec:
      containers:
        - name: api
          image: example/api:latest
`);
  const result = await scanK8sFile({
    absolutePath: filePath,
    relativePath: 'new-artifacts/k8s/deployment.yaml',
    sha256: await sha256File(filePath),
    scope: 'target',
  });
  const rules = new Set(result.findings.map((finding) => finding.ruleId));
  assert.ok(rules.has('RS-K8S-001'));
  assert.ok(rules.has('RS-K8S-002'));
  assert.ok(rules.has('RS-K8S-003'));
  assert.ok(rules.has('RS-K8S-004'));
  assert.ok(rules.has('RS-K8S-006'));
});

test('K8s scanner never exposes Secret stringData values', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'release-suture-k8s-'));
  const filePath = path.join(directory, 'secret.yaml');
  await writeFile(filePath, `apiVersion: v1
kind: Secret
metadata:
  name: db
stringData:
  password: super-secret-value
`);
  const result = await scanK8sFile({
    absolutePath: filePath,
    relativePath: 'new-artifacts/k8s/secret.yaml',
    sha256: await sha256File(filePath),
    scope: 'target',
  });
  const finding = result.findings.find((item) => item.ruleId === 'RS-K8S-007');
  assert.ok(finding);
  assert.doesNotMatch(JSON.stringify(finding), /super-secret-value/);
});
