import { createFinding } from '../lib/finding.js';
import { listZipEntries, readZipEntry } from '../lib/zip.js';

const TEXT_ENTRY_PATTERN = /(?:^|\/)(?:MANIFEST\.MF|application[^/]*\.(?:properties|ya?ml)|pom\.properties|.*\.(?:sql|xml))$/i;
const MIGRATION_PATTERN = /(?:db\/migration\/|liquibase|changelog|migrations?\/).+\.(?:sql|xml|ya?ml)$/i;

function lineOf(text, pattern) {
  const match = text.match(pattern);
  if (!match || match.index === undefined) return 1;
  return text.slice(0, match.index).split(/\r?\n/).length;
}

export async function scanJarFile({ absolutePath, relativePath, sha256, scope }) {
  const findings = [];
  const inventory = {
    entryCount: 0,
    migrationEntries: [],
    configEntries: [],
    manifest: {},
  };

  let entries;
  try {
    entries = await listZipEntries(absolutePath);
    inventory.entryCount = entries.length;
  } catch (error) {
    findings.push(createFinding({
      ruleId: 'RS-JAR-001',
      title: 'JAR 无法作为 ZIP 归档读取',
      severity: 'high',
      phase: 'backend',
      scope,
      relativePath,
      sha256,
      line: 1,
      excerpt: error.message,
      explanation: 'JAR 可能损坏、格式异常，或不是标准 Java 归档。',
      nextCommand: `Get-FileHash -Algorithm SHA256 '${absolutePath}'`,
      risk: '构建或启动阶段可能失败。',
      rollback: '停止使用该产物，重新从可信构建生成并核对 SHA256。',
    }));
    return { findings, inventory };
  }

  inventory.migrationEntries = entries.filter((entry) => MIGRATION_PATTERN.test(entry.name)).map((entry) => entry.name);
  inventory.configEntries = entries.filter((entry) => /application[^/]*\.(?:properties|ya?ml)$/i.test(entry.name)).map((entry) => entry.name);

  if (inventory.migrationEntries.length === 0) {
    findings.push(createFinding({
      ruleId: 'RS-JAR-002',
      title: 'JAR 中未发现数据库迁移文件',
      severity: 'medium',
      phase: 'backend',
      scope,
      relativePath,
      sha256,
      line: 1,
      excerpt: `${entries.length} archive entries; 0 migration entries`,
      explanation: '如果新版本依赖数据库字段变化，需要确认迁移由独立流程负责，而不是遗漏。',
      nextCommand: `jar tf '${absolutePath}' | rg -i 'db/migration|liquibase|changelog'`,
      risk: '新应用可能在缺少字段或表结构不匹配时启动失败。',
      rollback: '保持旧应用版本运行，先完成经过审核的兼容性增量迁移。',
    }));
  }

  if (/SNAPSHOT/i.test(relativePath)) {
    findings.push(createFinding({
      ruleId: 'RS-JAR-003',
      title: '后端产物文件名包含 SNAPSHOT',
      severity: 'medium',
      phase: 'backend',
      scope,
      relativePath,
      sha256,
      line: 1,
      excerpt: relativePath,
      explanation: 'SNAPSHOT 名称不能唯一表达构建内容，必须依赖额外哈希才能追溯。',
      nextCommand: `Get-FileHash -Algorithm SHA256 '${absolutePath}'`,
      risk: '同名文件可能被覆盖，导致发布与回滚版本不明确。',
      rollback: '使用不可变版本号并保存 SHA256；保留上一个经过验证的产物。',
    }));
  }

  for (const entry of entries.filter((item) => TEXT_ENTRY_PATTERN.test(item.name))) {
    if (entry.uncompressedSize > 2 * 1024 * 1024 || entry.name.endsWith('/')) continue;
    let text;
    try {
      text = (await readZipEntry(absolutePath, entry)).toString('utf8');
    } catch {
      continue;
    }

    if (/META-INF\/MANIFEST\.MF$/i.test(entry.name)) {
      for (const line of text.split(/\r?\n/)) {
        const separator = line.indexOf(':');
        if (separator > 0) inventory.manifest[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
      }
    }

    const passwordPattern = /(?:spring\.datasource\.password|datasource:\s*[\s\S]{0,600}?password:)\s*[=:]?\s*([^\s#]+)/i;
    if (passwordPattern.test(text)) {
      findings.push(createFinding({
        ruleId: 'RS-JAR-004',
        title: 'JAR 配置中疑似内置数据库密码',
        severity: 'critical',
        phase: 'backend',
        scope,
        relativePath,
        sha256,
        line: lineOf(text, passwordPattern),
        excerpt: 'spring.datasource.password=<redacted>',
        evidenceLocation: `${relativePath}!${entry.name}`,
        explanation: '数据库凭证不应固化在应用归档中。',
        nextCommand: `jar tf '${absolutePath}' | rg -i 'application.*(properties|yml|yaml)'`,
        risk: '拿到 JAR 的人员可能提取生产或测试数据库凭证。',
        rollback: '立即轮换已暴露凭证，并改用 Secret 或运行时环境变量注入。',
      }));
    }

    const destructivePattern = /\b(?:DROP\s+(?:TABLE|DATABASE|SCHEMA)|TRUNCATE\s+(?:TABLE\s+)?|DELETE\s+FROM\s+[^;\r\n]+(?:;|$))/i;
    const destructiveMatch = text.match(destructivePattern);
    if (MIGRATION_PATTERN.test(entry.name) && destructiveMatch) {
      findings.push(createFinding({
        ruleId: 'RS-JAR-005',
        title: 'JAR 内置迁移包含潜在破坏性 SQL',
        severity: 'critical',
        phase: 'database',
        scope,
        relativePath,
        sha256,
        line: lineOf(text, destructivePattern),
        excerpt: destructiveMatch[0],
        evidenceLocation: `${relativePath}!${entry.name}`,
        explanation: '应用启动时自动执行该迁移可能删除结构或数据。',
        nextCommand: `jar tf '${absolutePath}' | rg -i 'db/migration|liquibase|changelog'`,
        risk: '新 Pod 启动可能触发不可逆数据库变更。',
        rollback: '阻止新版本启动，提取迁移并在隔离数据库中审查；依赖执行前备份恢复。',
      }));
    }
  }

  return { findings, inventory };
}
