import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createFinding } from '../lib/finding.js';
import { lineNumberAt, relativePosix } from '../lib/utils.js';

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function cleanReference(reference) {
  const withoutQuery = reference.split(/[?#]/)[0];
  try {
    return decodeURIComponent(withoutQuery);
  } catch {
    return withoutQuery;
  }
}

function isExternalReference(reference) {
  return /^(?:https?:|data:|mailto:|tel:|javascript:|#|\/\/)/i.test(reference)
    || reference.includes('{{')
    || reference.includes('<%');
}

function isWithinRoot(rootPath, candidatePath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return relative === ''
    || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export async function scanHtmlFile({ absolutePath, relativePath, sha256, scope, caseRoot }) {
  const text = await readFile(absolutePath, 'utf8');
  const findings = [];
  const references = [];
  const pattern = /\b(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const rawReference = match[1].trim();
    if (!rawReference || isExternalReference(rawReference)) continue;
    const reference = cleanReference(rawReference);
    if (!reference) continue;

    const distRoot = path.dirname(absolutePath);
    const targetPath = reference.startsWith('/')
      ? path.join(distRoot, reference.replace(/^\/+/, ''))
      : path.resolve(path.dirname(absolutePath), reference);

    if (!isWithinRoot(caseRoot, targetPath)) {
      references.push({ reference: rawReference, present: false, blockedBySafetyBoundary: true });
      findings.push(createFinding({
        ruleId: 'RS-DIST-004',
        title: `HTML 引用越过了证据目录边界 ${rawReference}`,
        severity: 'high',
        phase: 'frontend',
        scope,
        relativePath,
        sha256,
        line: lineNumberAt(text, match.index),
        excerpt: match[0],
        explanation: '引用解析结果位于用户提供的证据目录之外；安全策略已阻止文件存在性检查。',
        nextCommand: "rg -n '(src|href)=' <html-file>",
        risk: '路径逃逸可能意外引用本机文件，或诱导检查工具读取证据范围之外的数据。',
        rollback: '将引用改为 dist 内的相对路径，并重新生成前端产物。',
      }));
      continue;
    }

    const present = await exists(targetPath);
    references.push({ reference: rawReference, present });

    if (!present) {
      findings.push(createFinding({
        ruleId: 'RS-DIST-001',
        title: `HTML 引用了缺失的静态资源 ${rawReference}`,
        severity: 'medium',
        phase: 'frontend',
        scope,
        relativePath,
        sha256,
        line: lineNumberAt(text, match.index),
        excerpt: match[0],
        explanation: `在 ${relativePosix(caseRoot, targetPath)} 未找到被引用文件。`,
        nextCommand: `Test-Path -LiteralPath '${targetPath}'`,
        risk: '页面可能出现图标、脚本或样式 404；关键 JS 缺失时页面无法启动。',
        rollback: '补齐构建产物或删除错误引用，然后重新生成 dist。',
      }));
    }
  }

  const insecurePattern = /\bhttp:\/\/[^\s"'<>]+/gi;
  while ((match = insecurePattern.exec(text)) !== null) {
    findings.push(createFinding({
      ruleId: 'RS-DIST-002',
      title: '前端产物包含明文 HTTP 地址',
      severity: 'medium',
      phase: 'frontend',
      scope,
      relativePath,
      sha256,
      line: lineNumberAt(text, match.index),
      excerpt: match[0],
      explanation: 'HTTPS 页面访问 HTTP API 或资源时可能被浏览器按混合内容阻止。',
      nextCommand: "rg -n 'http://' <dist-directory>",
      risk: '接口调用或静态资源加载可能失败，传输内容也可能被篡改。',
      rollback: '改用 HTTPS 或相对地址，并恢复上一版 dist。',
    }));
  }

  return { findings, references };
}

export function sourceMapFinding({ relativePath, sha256, scope }) {
  return createFinding({
    ruleId: 'RS-DIST-003',
    title: '生产前端产物包含 source map',
    severity: 'low',
    phase: 'frontend',
    scope,
    relativePath,
    sha256,
    line: 1,
    excerpt: relativePath,
    explanation: 'source map 可能暴露源码结构、内部路径和注释。',
    nextCommand: "Get-ChildItem <dist-directory> -Recurse -Filter '*.map'",
    risk: '增加源码信息暴露面和产物体积。',
    rollback: '关闭生产 source map 或限制该文件的公网访问。',
  });
}
