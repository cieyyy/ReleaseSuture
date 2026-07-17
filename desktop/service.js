import path from 'node:path';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { renderMarkdown } from '../src/lib/report.js';
import { scanCase } from '../src/scan-case.js';

const MAX_PATH_LENGTH = 4_096;

function requireLocalPath(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label}不能为空`);
  }
  if (value.length > MAX_PATH_LENGTH || value.includes('\0')) {
    throw new Error(`${label}不是有效的本地路径`);
  }
  return path.resolve(value);
}

export function isSameOrInside(parentPath, candidatePath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relative === ''
    || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function requireDirectory(directoryPath, label) {
  const details = await stat(directoryPath);
  if (!details.isDirectory()) throw new Error(`${label}必须是目录`);
}

export async function runDesktopScan({ casePath, outputPath }) {
  const absoluteCasePath = requireLocalPath(casePath, '证据目录');
  const absoluteOutputPath = requireLocalPath(outputPath, '报告目录');
  await requireDirectory(absoluteCasePath, '证据目录');

  if (isSameOrInside(absoluteCasePath, absoluteOutputPath)) {
    throw new Error('报告目录不能位于证据目录内部，请选择证据目录旁边的独立目录');
  }

  const report = await scanCase(absoluteCasePath);
  await mkdir(absoluteOutputPath, { recursive: true });
  await requireDirectory(absoluteOutputPath, '报告目录');

  const jsonPath = path.join(absoluteOutputPath, 'report.json');
  const markdownPath = path.join(absoluteOutputPath, 'report.md');
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(markdownPath, renderMarkdown(report), 'utf8');

  return {
    report,
    output: {
      directory: absoluteOutputPath,
      jsonPath,
      markdownPath,
    },
  };
}
