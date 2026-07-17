import { severityRank } from './utils.js';

function escapeTable(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function findingTable(findings) {
  if (!findings.length) return '未发现规则命中项。';
  const rows = findings.map((finding) => [
    finding.severity.toUpperCase(),
    finding.ruleId,
    finding.title,
    `${finding.evidence.path}:${finding.evidence.line}`,
    finding.scope,
  ].map(escapeTable).join(' | '));
  return [
    '| 级别 | 规则 | 结论 | 证据 | 范围 |',
    '|---|---|---|---|---|',
    ...rows.map((row) => `| ${row} |`),
  ].join('\n');
}

function manualCommands(findings) {
  const commands = [...new Set(findings.map((finding) => finding.nextCommand).filter(Boolean))];
  if (!commands.length) return '无。';
  return [
    '> 以下命令仅写入报告供人工参考，ReleaseSuture 不会执行。',
    '',
    '```text',
    ...commands,
    '```',
  ].join('\n');
}

export function renderMarkdown(report) {
  const counts = report.summary.severityCounts;
  const sortedFindings = [...report.findings].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  const planRows = report.releasePlan.map((step) => `| ${step.order} | ${escapeTable(step.phase)} | ${escapeTable(step.title)} | ${escapeTable(step.state)} | ${escapeTable(step.gate)} |`);
  const changedRows = report.inventory.changes.length
    ? report.inventory.changes.map((change) => `| ${escapeTable(change.key)} | ${change.changed ? '是' : '否'} | ${escapeTable(change.oldSha256?.slice(0, 12) ?? '-')} | ${escapeTable(change.newSha256?.slice(0, 12) ?? '-')} |`).join('\n')
    : '| - | - | - | - |';

  return `# ReleaseSuture 离线发布证据报告

生成时间：${report.generatedAt}

案例目录：\`${escapeTable(report.case.path)}\`

安全模式：**${report.safety.mode}**；网络访问：**${report.safety.networkAccess}**；外部命令：**${report.safety.subprocessExecution}**

## 结论

发布评审状态：**${report.summary.decision}**

- Critical：${counts.critical}
- High：${counts.high}
- Medium：${counts.medium}
- Low：${counts.low}
- 文件数：${report.inventory.files.length}
- 阻断项：${report.summary.blockingFindingIds.length}

ReleaseSuture 只分析用户提供的本地脱敏副本，不连接或操作集群、数据库、服务器、镜像仓库及任何业务系统。

## 判断依据

${findingTable(sortedFindings)}

### 新旧产物变化

| 逻辑路径 | 是否变化 | 旧 SHA256 | 新 SHA256 |
|---|---:|---|---|
${changedRows}

### 建议的人工评审顺序

| 顺序 | 阶段 | 步骤 | 状态 | 门禁 |
|---:|---|---|---|---|
${planRows.join('\n')}

## 下一步命令

${manualCommands(sortedFindings)}

## 风险

${sortedFindings.length
    ? sortedFindings.map((finding) => `- **${finding.id}**：${finding.risk}`).join('\n')
    : '- 未发现规则风险；这不代表发布绝对安全，仍需人工评审。'}

## 回滚

${sortedFindings.length
    ? sortedFindings.map((finding) => `- **${finding.id}**：${finding.rollback}`).join('\n')
    : '- 本工具没有执行任何变更，无需工具侧回滚。'}

---

本报告是静态证据，不是发布授权，也不会自动执行其中任何命令。
`;
}
