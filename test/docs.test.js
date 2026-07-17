import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'out' || entry.name === 'tmp') continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(absolutePath));
    else if (entry.name.endsWith('.md')) files.push(absolutePath);
  }
  return files;
}

test('open-source metadata points to the canonical repository', async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(packageJson.private, true, 'npm publishing must remain opt-in');
  assert.equal(packageJson.license, 'Apache-2.0');
  assert.equal(packageJson.repository.url, 'git+https://github.com/cieyyy/ReleaseSuture.git');
  assert.equal(packageJson.bugs.url, 'https://github.com/cieyyy/ReleaseSuture/issues');
});

test('relative links in project Markdown resolve to local files', async () => {
  const files = await markdownFiles(process.cwd());
  for (const file of files) {
    const markdown = await readFile(file, 'utf8');
    const links = markdown.matchAll(/!?(?:\[[^\]]*\])\(([^)]+)\)/g);
    for (const [, rawTarget] of links) {
      const target = rawTarget.trim().replace(/^<|>$/g, '').split('#')[0];
      if (!target || /^[a-z]+:/i.test(target)) continue;
      const absoluteTarget = path.resolve(path.dirname(file), decodeURIComponent(target));
      await assert.doesNotReject(access(absoluteTarget), `${path.relative(process.cwd(), file)} -> ${target}`);
    }
  }
});

test('published text does not contain local workstation paths', async () => {
  const files = await markdownFiles(process.cwd());
  files.push(path.resolve('package.json'));
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    assert.doesNotMatch(text, /[A-Z]:\\(?:Users\\[^\\]+|资料\\)/i, path.relative(process.cwd(), file));
  }
});
