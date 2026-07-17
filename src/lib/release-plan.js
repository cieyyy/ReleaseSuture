function hasRule(findings, rulePrefix, severities = null) {
  return findings.some((finding) => finding.ruleId.startsWith(rulePrefix)
    && (!severities || severities.includes(finding.severity)));
}

function blockingForPhase(findings, phase) {
  return findings
    .filter((finding) => finding.phase === phase
      && finding.scope === 'target'
      && ['critical', 'high'].includes(finding.severity))
    .map((finding) => finding.id);
}

export function buildReleasePlan(report) {
  const { findings, inventory } = report;
  const containsSql = inventory.files.some((file) => file.kind === 'sql');
  const containsJar = inventory.files.some((file) => file.kind === 'jar');
  const containsFrontend = inventory.files.some((file) => file.kind === 'html' || file.kind === 'source-map');
  const containsK8s = inventory.files.some((file) => file.kind === 'k8s-yaml');
  const databaseBlockers = blockingForPhase(findings, 'database');
  const backendBlockers = blockingForPhase(findings, 'backend');
  const frontendBlockers = blockingForPhase(findings, 'frontend');
  const kubernetesBlockers = blockingForPhase(findings, 'kubernetes');

  const steps = [
    {
      order: 1,
      phase: 'identity',
      title: '人工确认离线材料的来源与目标环境',
      state: 'manual',
      gate: '所有文件均为脱敏副本，SHA256 已记录，未使用任何在线连接。',
      blockers: [],
    },
  ];

  if (containsSql) {
    steps.push({
      order: steps.length + 1,
      phase: 'database',
      title: '审查并验证最小增量数据库迁移',
      state: databaseBlockers.length ? 'blocked' : 'manual',
      gate: hasRule(findings, 'RS-SQL-007')
        ? '禁止使用全量初始化脚本；必须重新生成最小增量迁移。'
        : '迁移需在隔离数据库验证，并在任何业务变更前由人工确认备份与回滚。',
      blockers: databaseBlockers,
    });
  }

  if (containsJar) {
    steps.push({
      order: steps.length + 1,
      phase: 'backend',
      title: '验证后端产物与数据库兼容性',
      state: [...databaseBlockers, ...backendBlockers].length ? 'blocked' : 'manual',
      gate: '确认 JAR 版本不可变、迁移责任明确、启动配置不包含凭证。',
      blockers: [...databaseBlockers, ...backendBlockers],
    });
  }

  if (containsK8s) {
    steps.push({
      order: steps.length + 1,
      phase: 'kubernetes',
      title: '人工审核 K8s 目标清单',
      state: kubernetesBlockers.length ? 'blocked' : 'manual',
      gate: '副本、策略、镜像摘要、探针和资源声明满足目标环境要求。',
      blockers: kubernetesBlockers,
    });
  }

  if (containsFrontend) {
    steps.push({
      order: steps.length + 1,
      phase: 'frontend',
      title: '验证前端静态资源完整性',
      state: frontendBlockers.length ? 'blocked' : 'manual',
      gate: 'index.html 引用资源完整，接口协议和基础路径经过离线审核。',
      blockers: frontendBlockers,
    });
  }

  steps.push({
    order: steps.length + 1,
    phase: 'handoff',
    title: '交付人工变更评审，不自动执行任何操作',
    state: report.summary.decision === 'BLOCKED' ? 'blocked' : 'manual',
    gate: 'ReleaseSuture 只生成证据包；连接、修改和发布不属于工具能力。',
    blockers: report.summary.blockingFindingIds,
  });

  return steps;
}
