import { readFile } from 'node:fs/promises';
import { createFinding } from '../lib/finding.js';

function splitYamlDocuments(text) {
  const lines = text.split(/\r?\n/);
  const documents = [];
  let current = [];
  let startLine = 1;

  for (let index = 0; index < lines.length; index += 1) {
    if (/^---\s*(?:#.*)?$/.test(lines[index])) {
      if (current.some((line) => line.trim())) {
        documents.push({ lines: current, startLine });
      }
      current = [];
      startLine = index + 2;
    } else {
      current.push(lines[index]);
    }
  }
  if (current.some((line) => line.trim())) documents.push({ lines: current, startLine });
  return documents;
}

function valueLine(lines, pattern) {
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(pattern);
    if (match) return { value: match[1]?.trim(), index, text: lines[index].trim() };
  }
  return null;
}

function metadataName(lines) {
  const metadataIndex = lines.findIndex((line) => /^metadata:\s*(?:#.*)?$/.test(line));
  if (metadataIndex < 0) return 'unknown';
  for (let index = metadataIndex + 1; index < lines.length; index += 1) {
    if (/^[^\s#]/.test(lines[index])) break;
    const match = lines[index].match(/^\s+name:\s*([^\s#]+)/);
    if (match) return match[1];
  }
  return 'unknown';
}

function addFinding(findings, base, details) {
  findings.push(createFinding({ ...base, ...details, phase: 'kubernetes' }));
}

function workloadFindings(document, base, kind, name) {
  const findings = [];
  const { lines, startLine } = document;
  const replicas = valueLine(lines, /^\s*replicas:\s*(\d+)/);
  const strategy = valueLine(lines, /^\s*type:\s*(Recreate|RollingUpdate)\s*(?:#.*)?$/i);
  const images = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*image:\s*["']?([^\s"'#]+)["']?/);
    if (match) images.push({ value: match[1], index, text: lines[index].trim() });
  }

  if (replicas && Number(replicas.value) <= 1) {
    addFinding(findings, base, {
      ruleId: 'RS-K8S-001',
      title: `${kind}/${name} 只有单副本`,
      severity: 'high',
      line: startLine + replicas.index,
      excerpt: replicas.text,
      explanation: '单副本工作负载在重建、调度或镜像拉取期间没有可用副本兜底。',
      nextCommand: `kubectl get ${kind.toLowerCase()} ${name} -n <namespace> -o jsonpath='{.spec.replicas}{"\\n"}'`,
      risk: '发布期间可能产生业务中断。',
      rollback: '保留旧镜像摘要和 Deployment 修订；发布前确认是否允许短暂停机。',
    });
  }

  if (strategy?.value?.toLowerCase() === 'recreate') {
    addFinding(findings, base, {
      ruleId: 'RS-K8S-002',
      title: `${kind}/${name} 使用 Recreate 策略`,
      severity: 'high',
      line: startLine + strategy.index,
      excerpt: strategy.text,
      explanation: 'Recreate 会先终止旧 Pod，再创建新 Pod；与单副本组合时必然形成不可用窗口。',
      nextCommand: `kubectl get ${kind.toLowerCase()} ${name} -n <namespace> -o jsonpath='{.spec.strategy.type}{"\\n"}'`,
      risk: '新版本启动失败时，服务会保持不可用直到人工回滚。',
      rollback: `kubectl rollout undo ${kind.toLowerCase()}/${name} -n <namespace>`,
    });
  }

  for (const image of images) {
    const lastSegment = image.value.split('/').at(-1);
    const missingTag = !lastSegment.includes(':') && !image.value.includes('@sha256:');
    const latestTag = /:latest$/i.test(image.value);
    if (missingTag || latestTag) {
      addFinding(findings, base, {
        ruleId: 'RS-K8S-003',
        title: `${kind}/${name} 使用不可追溯镜像标签`,
        severity: 'high',
        line: startLine + image.index,
        excerpt: image.text,
        explanation: '缺少固定标签或使用 latest 会让同一清单在不同时间拉取不同镜像。',
        nextCommand: `kubectl get ${kind.toLowerCase()} ${name} -n <namespace> -o jsonpath='{.spec.template.spec.containers[*].image}{"\\n"}'`,
        risk: '无法可靠复现版本，也无法证明回滚拉取的是原镜像。',
        rollback: '使用不可变版本标签并记录镜像 digest。',
      });
    }
  }

  const documentText = lines.join('\n');
  if (!/^\s*readinessProbe:\s*/m.test(documentText)) {
    addFinding(findings, base, {
      ruleId: 'RS-K8S-004',
      title: `${kind}/${name} 缺少 readinessProbe`,
      severity: 'medium',
      line: startLine,
      excerpt: `kind: ${kind}; metadata.name: ${name}`,
      explanation: '没有就绪探针时，Pod 启动后可能在应用尚未可用时接收流量。',
      nextCommand: `kubectl get ${kind.toLowerCase()} ${name} -n <namespace> -o yaml | rg -n 'readinessProbe'`,
      risk: '发布初期可能出现 502/503 或请求失败。',
      rollback: '补充与真实健康端点一致的就绪探针；变更前保留原清单。',
    });
  }

  if (!/^\s*livenessProbe:\s*/m.test(documentText)) {
    addFinding(findings, base, {
      ruleId: 'RS-K8S-005',
      title: `${kind}/${name} 缺少 livenessProbe`,
      severity: 'low',
      line: startLine,
      excerpt: `kind: ${kind}; metadata.name: ${name}`,
      explanation: '进程存活但内部死锁时，Kubernetes 可能无法自动恢复。',
      nextCommand: `kubectl get ${kind.toLowerCase()} ${name} -n <namespace> -o yaml | rg -n 'livenessProbe'`,
      risk: '部分应用失活场景不能被自动重启。',
      rollback: '先在测试环境验证探针阈值，避免错误探针引发重启循环。',
    });
  }

  if (!/^\s*resources:\s*/m.test(documentText)) {
    addFinding(findings, base, {
      ruleId: 'RS-K8S-006',
      title: `${kind}/${name} 未声明资源请求与限制`,
      severity: 'medium',
      line: startLine,
      excerpt: `kind: ${kind}; metadata.name: ${name}`,
      explanation: '缺少 requests/limits 会降低调度可预测性，并放大节点资源争抢风险。',
      nextCommand: `kubectl get ${kind.toLowerCase()} ${name} -n <namespace> -o jsonpath='{.spec.template.spec.containers[*].resources}{"\\n"}'`,
      risk: '高负载时可能挤压其他工作负载，或因调度估算失真导致节点不稳定。',
      rollback: '先观察历史用量，再逐步设置 requests 和 limits。',
    });
  }

  return findings;
}

export async function scanK8sFile({ absolutePath, relativePath, sha256, scope }) {
  const text = await readFile(absolutePath, 'utf8');
  const documents = splitYamlDocuments(text);
  const findings = [];
  const resources = [];

  for (const document of documents) {
    const kindMatch = valueLine(document.lines, /^kind:\s*([^\s#]+)/);
    if (!kindMatch) continue;
    const kind = kindMatch.value;
    const name = metadataName(document.lines);
    const namespaceMatch = valueLine(document.lines, /^\s*namespace:\s*([^\s#]+)/);
    resources.push({ kind, name, namespace: namespaceMatch?.value ?? null });

    const base = { scope, relativePath, sha256 };
    if (/^(Deployment|StatefulSet|DaemonSet)$/i.test(kind)) {
      findings.push(...workloadFindings(document, base, kind, name));
    }

    const documentText = document.lines.join('\n');
    if (/^Secret$/i.test(kind) && /^stringData:\s*$/m.test(documentText)) {
      const index = document.lines.findIndex((line) => /^stringData:\s*$/.test(line));
      addFinding(findings, base, {
        ruleId: 'RS-K8S-007',
        title: `Secret/${name} 在清单中包含 stringData`,
        severity: 'high',
        line: document.startLine + Math.max(index, 0),
        excerpt: 'stringData: <redacted>',
        explanation: '明文 Secret 容易进入 Git、构建日志和发布包。',
        nextCommand: `kubectl get secret ${name} -n <namespace> -o jsonpath='{.metadata.name}{"\\n"}'`,
        risk: '数据库密码、Token 或 API Key 可能泄露。',
        rollback: '轮换已暴露凭证，并改用 External Secrets、密钥服务或受控注入。',
      });
    }

    if (/^Ingress$/i.test(kind) && !/^\s*tls:\s*/m.test(documentText)) {
      addFinding(findings, base, {
        ruleId: 'RS-K8S-008',
        title: `Ingress/${name} 未声明 TLS`,
        severity: 'medium',
        line: document.startLine,
        excerpt: `kind: Ingress; metadata.name: ${name}`,
        explanation: '该 Ingress 清单未显示 TLS 配置，需要确认是否由上游网关统一终止 HTTPS。',
        nextCommand: `kubectl get ingress ${name} -n <namespace> -o jsonpath='{.spec.tls}{"\\n"}'`,
        risk: '若上游没有 TLS 终止，客户端流量可能以明文传输。',
        rollback: '保留原 Ingress；验证证书和入口控制器配置后再启用 TLS。',
      });
    }
  }

  return { findings, resources };
}
