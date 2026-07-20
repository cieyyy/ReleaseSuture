import path from 'node:path';
import { stat } from 'node:fs/promises';
import { buildReleasePlan } from './lib/release-plan.js';
import {
  fileSize,
  isHtml,
  isJar,
  isSql,
  isYaml,
  relativePosix,
  scopeFromPath,
  severityRank,
  sha256File,
  walkFiles,
} from './lib/utils.js';
import { sourceMapFinding, scanHtmlFile } from './scanners/dist.js';
import { scanJarFile } from './scanners/jar.js';
import { scanK8sFile } from './scanners/k8s.js';
import { scanSqlFile } from './scanners/sql.js';

function kindFromPath(relativePath) {
  if (isSql(relativePath)) return 'sql';
  if (isJar(relativePath)) return 'jar';
  if (isYaml(relativePath)) return 'k8s-yaml';
  if (isHtml(relativePath)) return 'html';
  if (/\.map$/i.test(relativePath)) return 'source-map';
  return 'other';
}

function logicalArtifactKey(relativePath) {
  return relativePath.replace(/^(?:old-artifacts|new-artifacts)\//i, '');
}

function buildChanges(files) {
  const grouped = new Map();
  for (const file of files.filter((item) => ['old', 'target'].includes(item.scope))) {
    const key = logicalArtifactKey(file.path);
    const group = grouped.get(key) ?? {};
    if (file.scope === 'old') group.old = file;
    if (file.scope === 'target') group.target = file;
    grouped.set(key, group);
  }

  return [...grouped.entries()]
    .filter(([, group]) => group.old && group.target)
    .map(([key, group]) => ({
      key,
      changed: group.old.sha256 !== group.target.sha256,
      oldSha256: group.old.sha256,
      newSha256: group.target.sha256,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function summarize(findings) {
  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const finding of findings) severityCounts[finding.severity] += 1;
  const targetBlockers = findings.filter((finding) => finding.scope === 'target'
    && ['critical', 'high'].includes(finding.severity));
  const liveWarnings = findings.filter((finding) => finding.scope === 'live'
    && ['critical', 'high'].includes(finding.severity));

  let decision = 'READY_FOR_MANUAL_REVIEW';
  if (targetBlockers.length) decision = 'BLOCKED';
  else if (liveWarnings.length) decision = 'REVIEW_REQUIRED';

  return {
    decision,
    severityCounts,
    blockingFindingIds: targetBlockers.map((finding) => finding.id),
  };
}

export async function scanCase(casePath) {
  const absoluteCasePath = path.resolve(casePath);
  const details = await stat(absoluteCasePath);
  if (!details.isDirectory()) throw new Error(`Case path is not a directory: ${absoluteCasePath}`);

  const absoluteFiles = await walkFiles(absoluteCasePath);
  const inventoryFiles = [];
  const findings = [];
  const scannerData = { sql: {}, k8s: {}, jars: {}, html: {} };

  for (const absolutePath of absoluteFiles) {
    const relativePath = relativePosix(absoluteCasePath, absolutePath);
    const scope = scopeFromPath(relativePath);
    const sha256 = await sha256File(absolutePath);
    const size = await fileSize(absolutePath);
    const kind = kindFromPath(relativePath);
    const fileRecord = { path: relativePath, scope, kind, size, sha256 };
    inventoryFiles.push(fileRecord);

    if (kind === 'sql') {
      const result = await scanSqlFile({ absolutePath, relativePath, sha256, scope });
      findings.push(...result.findings);
      scannerData.sql[relativePath] = result.stats;
    } else if (kind === 'k8s-yaml') {
      const result = await scanK8sFile({ absolutePath, relativePath, sha256, scope });
      findings.push(...result.findings);
      scannerData.k8s[relativePath] = result.resources;
    } else if (kind === 'jar') {
      const result = await scanJarFile({ absolutePath, relativePath, sha256, scope });
      findings.push(...result.findings);
      scannerData.jars[relativePath] = result.inventory;
    } else if (kind === 'html') {
      const result = await scanHtmlFile({ absolutePath, relativePath, sha256, scope, caseRoot: absoluteCasePath });
      findings.push(...result.findings);
      scannerData.html[relativePath] = result.references;
    } else if (kind === 'source-map') {
      findings.push(sourceMapFinding({ relativePath, sha256, scope }));
    }
  }

  findings.sort((a, b) => severityRank(a.severity) - severityRank(b.severity)
    || a.evidence.path.localeCompare(b.evidence.path)
    || a.evidence.line - b.evidence.line);

  const report = {
    schemaVersion: 1,
    tool: { name: 'ReleaseSuture', version: '0.1.1' },
    generatedAt: new Date().toISOString(),
    safety: {
      mode: 'OFFLINE_READ_ONLY_ANALYSIS',
      networkAccess: 'NOT_IMPLEMENTED',
      subprocessExecution: 'NOT_IMPLEMENTED',
      externalWrites: 'NOT_IMPLEMENTED',
      localWrites: 'REPORT_FILES_ONLY',
    },
    case: { path: absoluteCasePath },
    inventory: {
      files: inventoryFiles,
      changes: buildChanges(inventoryFiles),
    },
    scannerData,
    findings,
    summary: summarize(findings),
  };
  report.releasePlan = buildReleasePlan(report);
  return report;
}
