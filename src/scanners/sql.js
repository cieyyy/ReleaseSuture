import { createReadStream } from 'node:fs';
import readline from 'node:readline';
import { createFinding } from '../lib/finding.js';

const MAX_STATEMENT_CHARS = 64 * 1024;

function statementFinding(context, rule) {
  return createFinding({
    ...context,
    ...rule,
    phase: 'database',
  });
}

function analyzeStatement(statement, context) {
  const findings = [];
  const normalized = statement.replace(/\s+/g, ' ').trim();
  if (!normalized) return findings;

  if (/\bDROP\s+(?:TABLE|DATABASE|SCHEMA)\b/i.test(normalized)) {
    findings.push(statementFinding(context, {
      ruleId: 'RS-SQL-001',
      title: '检测到破坏性 DROP 语句',
      severity: 'critical',
      excerpt: normalized,
      explanation: '目标 SQL 会删除表、数据库或 schema，不能作为现有数据库的增量升级脚本直接执行。',
      nextCommand: "rg -n -i '\\bDROP\\s+(TABLE|DATABASE|SCHEMA)\\b' <sql-file>",
      risk: '可能造成结构和数据不可恢复丢失，并中断依赖该对象的应用。',
      rollback: '执行前只能通过完整备份或快照保障恢复；执行后无法依赖普通应用回滚恢复数据。',
    }));
  }

  if (/\bTRUNCATE\s+(?:TABLE\s+)?/i.test(normalized)) {
    findings.push(statementFinding(context, {
      ruleId: 'RS-SQL-002',
      title: '检测到 TRUNCATE 清表语句',
      severity: 'critical',
      excerpt: normalized,
      explanation: 'TRUNCATE 会快速清空整张表，不属于兼容性增量变更。',
      nextCommand: "rg -n -i '\\bTRUNCATE\\b' <sql-file>",
      risk: '整表数据可能被清空，且部分数据库无法通过事务回滚。',
      rollback: '依赖执行前数据库快照或逻辑备份恢复。',
    }));
  }

  if (/\bALTER\s+TABLE\b[\s\S]*\bDROP\s+(?:COLUMN\s+)?/i.test(normalized)) {
    findings.push(statementFinding(context, {
      ruleId: 'RS-SQL-003',
      title: '检测到删除字段的 ALTER TABLE',
      severity: 'high',
      excerpt: normalized,
      explanation: '删除字段可能破坏旧版本应用兼容性，并永久丢失列数据。',
      nextCommand: "rg -n -i 'ALTER\\s+TABLE.*DROP' <sql-file>",
      risk: '旧版本应用、查询和索引可能立即失效。',
      rollback: '先保留字段并停止写入；确认无依赖后再在独立版本中删除。',
    }));
  }

  if (/\bDELETE\s+FROM\b/i.test(normalized) && !/\bWHERE\b/i.test(normalized)) {
    findings.push(statementFinding(context, {
      ruleId: 'RS-SQL-004',
      title: '检测到缺少 WHERE 的 DELETE',
      severity: 'critical',
      excerpt: normalized,
      explanation: '无 WHERE 条件的 DELETE 可能删除目标表全部数据。',
      nextCommand: "rg -n -i '^\\s*DELETE\\s+FROM' <sql-file>",
      risk: '目标表全部行可能被删除。',
      rollback: '只能依赖执行前备份、快照或数据库时间点恢复。',
    }));
  }

  if (/\bALTER\s+TABLE\b[\s\S]*\bADD\s+(?:COLUMN\s+)?[^,;]+\bNOT\s+NULL\b/i.test(normalized)
      && !/\bDEFAULT\b/i.test(normalized)) {
    findings.push(statementFinding(context, {
      ruleId: 'RS-SQL-005',
      title: '新增 NOT NULL 字段但未提供默认值',
      severity: 'high',
      excerpt: normalized,
      explanation: '非空字段没有默认值时，已有数据回填和旧版本写入都可能失败。',
      nextCommand: "rg -n -i 'ADD.*NOT\\s+NULL' <sql-file>",
      risk: '迁移可能失败，或旧版本应用 INSERT 时出现约束错误。',
      rollback: '先新增可空字段，分批回填，再增加约束；回滚时先移除约束。',
    }));
  }

  if (/\bSET\s+FOREIGN_KEY_CHECKS\s*=\s*0\b/i.test(normalized)) {
    findings.push(statementFinding(context, {
      ruleId: 'RS-SQL-006',
      title: 'SQL 暂时关闭外键检查',
      severity: 'medium',
      excerpt: normalized,
      explanation: '关闭外键检查常见于全量导入脚本，也可能让不一致数据进入数据库。',
      nextCommand: "rg -n -i 'FOREIGN_KEY_CHECKS' <sql-file>",
      risk: '脚本失败或漏掉恢复语句时，连接会继续处于弱校验状态。',
      rollback: '确认同一连接中重新启用外键检查，并执行孤儿数据核验。',
    }));
  }

  return findings;
}

export async function scanSqlFile({ absolutePath, relativePath, sha256, scope }) {
  const findings = [];
  const stats = {
    dropStatements: 0,
    createTableStatements: 0,
    insertStatements: 0,
    alterStatements: 0,
  };
  let firstDropLine = 1;
  let firstDropExcerpt = '';
  let statement = '';
  let statementLine = 1;

  const stream = createReadStream(absolutePath, { encoding: 'utf8' });
  const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let lineNumber = 0;

  for await (const rawLine of reader) {
    lineNumber += 1;
    const line = rawLine.trim();
    if (!line || line.startsWith('--') || line.startsWith('#')) continue;

    if (/^INSERT\s+INTO\b/i.test(line)) stats.insertStatements += 1;
    if (/^CREATE\s+TABLE\b/i.test(line)) stats.createTableStatements += 1;
    if (/^ALTER\s+TABLE\b/i.test(line)) stats.alterStatements += 1;
    if (/^DROP\s+(?:TABLE|DATABASE|SCHEMA)\b/i.test(line)) {
      stats.dropStatements += 1;
      if (!firstDropExcerpt) {
        firstDropLine = lineNumber;
        firstDropExcerpt = line;
      }
    }

    const beginsRelevantStatement = /^(?:DROP|TRUNCATE|ALTER|DELETE|SET\s+FOREIGN_KEY_CHECKS)\b/i.test(line);
    if (!statement && !beginsRelevantStatement) continue;
    if (!statement) statementLine = lineNumber;

    statement = `${statement} ${line}`.trim();
    if (statement.length > MAX_STATEMENT_CHARS) statement = statement.slice(0, MAX_STATEMENT_CHARS);

    if (line.includes(';') || statement.length >= MAX_STATEMENT_CHARS) {
      findings.push(...analyzeStatement(statement, {
        scope,
        relativePath,
        sha256,
        line: statementLine,
      }));
      statement = '';
    }
  }

  if (statement) {
    findings.push(...analyzeStatement(statement, {
      scope,
      relativePath,
      sha256,
      line: statementLine,
    }));
  }

  if (stats.dropStatements > 0 && stats.createTableStatements > 0 && stats.insertStatements > 0) {
    findings.push(createFinding({
      ruleId: 'RS-SQL-007',
      title: '文件特征符合全量初始化/重建脚本',
      severity: 'critical',
      phase: 'database',
      scope,
      relativePath,
      sha256,
      line: firstDropLine,
      excerpt: firstDropExcerpt || 'DROP + CREATE TABLE + INSERT combination',
      explanation: `同一文件包含 ${stats.dropStatements} 个 DROP、${stats.createTableStatements} 个 CREATE TABLE 和 ${stats.insertStatements} 个 INSERT 起始行，不能当作增量升级脚本。`,
      nextCommand: "rg -n -i '^(DROP|CREATE TABLE|INSERT INTO)' <sql-file>",
      risk: '导入现有数据库可能先清理结构和数据，再写入初始化数据。',
      rollback: '不要执行该文件；从新旧 schema 中单独生成、审核并测试最小增量迁移。',
    }));
  }

  return { findings, stats };
}
