import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const IGNORED_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  '.release-suture',
  'release-suture-report',
]);

export async function sha256File(filePath) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

export function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex');
}

export async function walkFiles(rootPath) {
  const files = [];

  async function visit(currentPath) {
    const entries = await readdir(currentPath, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;

      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile()) {
        files.push(absolutePath);
      }
    }
  }

  await visit(rootPath);
  return files;
}

export function relativePosix(rootPath, filePath) {
  return path.relative(rootPath, filePath).split(path.sep).join('/');
}

export function scopeFromPath(relativePath) {
  const first = relativePath.split('/')[0].toLowerCase();
  if (first === 'live-snapshot') return 'live';
  if (first === 'old-artifacts') return 'old';
  if (first === 'new-artifacts') return 'target';
  return 'target';
}

export function sanitizeExcerpt(value, maxLength = 240) {
  let text = String(value ?? '')
    .replace(/(["']?(?:password|passwd|secret|token|api[_-]?key)["']?\s*[:=]\s*)[^\s,;]+/gi, '$1<redacted>')
    .replace(/(Authorization:\s*(?:Bearer|Basic)\s+)[^\s]+/gi, '$1<redacted>')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length > maxLength) text = `${text.slice(0, maxLength - 1)}…`;
  return text;
}

export function lineNumberAt(text, index) {
  if (index < 0) return 1;
  return text.slice(0, index).split('\n').length;
}

export async function fileSize(filePath) {
  const details = await stat(filePath);
  return details.size;
}

export function severityRank(severity) {
  return {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
  }[severity] ?? 5;
}

export function isYaml(relativePath) {
  return /\.ya?ml$/i.test(relativePath);
}

export function isSql(relativePath) {
  return /\.sql$/i.test(relativePath);
}

export function isJar(relativePath) {
  return /\.jar$/i.test(relativePath);
}

export function isHtml(relativePath) {
  return /\.html?$/i.test(relativePath);
}
