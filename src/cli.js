#!/usr/bin/env node

import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { renderMarkdown } from './lib/report.js';
import { scanCase } from './scan-case.js';

const HELP = `ReleaseSuture v0.1.1

Offline-only release evidence compiler.

Usage:
  release-suture scan <case-directory> [--output <directory>] [--fail-on <severity>]
  release-suture --help
  release-suture --version

Safety:
  - Reads only the local case directory supplied by the user.
  - Does not implement network access, kubectl, SSH, database clients, or subprocess execution.
  - Writes only report.json and report.md in the selected local output directory.
`;

function parseArgs(args) {
  const options = { output: path.resolve('release-suture-report'), failOn: null };
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--output') options.output = path.resolve(args[++index]);
    else if (arg === '--fail-on') options.failOn = args[++index]?.toLowerCase();
    else positional.push(arg);
  }
  return { positional, options };
}

function shouldFail(report, threshold) {
  if (!threshold) return false;
  const ranks = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  if (!(threshold in ranks)) throw new Error(`Unknown severity for --fail-on: ${threshold}`);
  return report.findings.some((finding) => finding.scope === 'target' && ranks[finding.severity] <= ranks[threshold]);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.length === 0) {
    process.stdout.write(HELP);
    return;
  }
  if (args.includes('--version')) {
    process.stdout.write('0.1.1\n');
    return;
  }

  const { positional, options } = parseArgs(args);
  if (positional[0] !== 'scan' || !positional[1]) throw new Error('Expected: scan <case-directory>');

  const report = await scanCase(positional[1]);
  await mkdir(options.output, { recursive: true });
  const jsonPath = path.join(options.output, 'report.json');
  const markdownPath = path.join(options.output, 'report.md');
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(markdownPath, renderMarkdown(report), 'utf8');

  process.stdout.write(`Decision: ${report.summary.decision}\n`);
  process.stdout.write(`Findings: ${report.findings.length}\n`);
  process.stdout.write(`JSON: ${jsonPath}\n`);
  process.stdout.write(`Markdown: ${markdownPath}\n`);
  if (shouldFail(report, options.failOn)) process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`ReleaseSuture error: ${error.message}\n`);
  process.exitCode = 1;
});
