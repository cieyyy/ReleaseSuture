# ReleaseSuture 离线发布证据报告

生成时间：2026-07-20T06:27:43.063Z

案例目录：`examples\risky-release`

安全模式：**OFFLINE_READ_ONLY_ANALYSIS**；网络访问：**NOT_IMPLEMENTED**；外部命令：**NOT_IMPLEMENTED**

## 结论

发布评审状态：**BLOCKED**

- Critical：2
- High：3
- Medium：4
- Low：1
- 文件数：4
- 阻断项：5

ReleaseSuture 只分析用户提供的本地脱敏副本，不连接或操作集群、数据库、服务器、镜像仓库及任何业务系统。

## 判断依据

| 级别 | 规则 | 结论 | 证据 | 范围 |
|---|---|---|---|---|
| CRITICAL | RS-SQL-001 | 检测到破坏性 DROP 语句 | new-artifacts/db/full-init.sql:2 | target |
| CRITICAL | RS-SQL-007 | 文件特征符合全量初始化/重建脚本 | new-artifacts/db/full-init.sql:2 | target |
| HIGH | RS-K8S-001 | Deployment/demo-api 只有单副本 | new-artifacts/k8s/app.yaml:7 | target |
| HIGH | RS-K8S-002 | Deployment/demo-api 使用 Recreate 策略 | new-artifacts/k8s/app.yaml:9 | target |
| HIGH | RS-K8S-003 | Deployment/demo-api 使用不可追溯镜像标签 | new-artifacts/k8s/app.yaml:20 | target |
| MEDIUM | RS-SQL-006 | SQL 暂时关闭外键检查 | new-artifacts/db/full-init.sql:1 | target |
| MEDIUM | RS-K8S-004 | Deployment/demo-api 缺少 readinessProbe | new-artifacts/k8s/app.yaml:1 | target |
| MEDIUM | RS-K8S-006 | Deployment/demo-api 未声明资源请求与限制 | new-artifacts/k8s/app.yaml:1 | target |
| MEDIUM | RS-DIST-001 | HTML 引用了缺失的静态资源 /missing-logo.svg | new-artifacts/web/index.html:5 | target |
| LOW | RS-K8S-005 | Deployment/demo-api 缺少 livenessProbe | new-artifacts/k8s/app.yaml:1 | target |

### 新旧产物变化

| 逻辑路径 | 是否变化 | 旧 SHA256 | 新 SHA256 |
|---|---:|---|---|
| - | - | - | - |

### 建议的人工评审顺序

| 顺序 | 阶段 | 步骤 | 状态 | 门禁 |
|---:|---|---|---|---|
| 1 | identity | 人工确认离线材料的来源与目标环境 | manual | 所有文件均为脱敏副本，SHA256 已记录，未使用任何在线连接。 |
| 2 | database | 审查并验证最小增量数据库迁移 | blocked | 禁止使用全量初始化脚本；必须重新生成最小增量迁移。 |
| 3 | kubernetes | 人工审核 K8s 目标清单 | blocked | 副本、策略、镜像摘要、探针和资源声明满足目标环境要求。 |
| 4 | frontend | 验证前端静态资源完整性 | manual | index.html 引用资源完整，接口协议和基础路径经过离线审核。 |
| 5 | handoff | 交付人工变更评审，不自动执行任何操作 | blocked | ReleaseSuture 只生成证据包；连接、修改和发布不属于工具能力。 |

## 下一步命令

> 以下命令仅写入报告供人工参考，ReleaseSuture 不会执行。

```text
rg -n -i '\bDROP\s+(TABLE|DATABASE|SCHEMA)\b' <sql-file>
rg -n -i '^(DROP|CREATE TABLE|INSERT INTO)' <sql-file>
kubectl get deployment demo-api -n <namespace> -o jsonpath='{.spec.replicas}{"\n"}'
kubectl get deployment demo-api -n <namespace> -o jsonpath='{.spec.strategy.type}{"\n"}'
kubectl get deployment demo-api -n <namespace> -o jsonpath='{.spec.template.spec.containers[*].image}{"\n"}'
rg -n -i 'FOREIGN_KEY_CHECKS' <sql-file>
kubectl get deployment demo-api -n <namespace> -o yaml | rg -n 'readinessProbe'
kubectl get deployment demo-api -n <namespace> -o jsonpath='{.spec.template.spec.containers[*].resources}{"\n"}'
Test-Path -LiteralPath 'examples\risky-release\new-artifacts\web\missing-logo.svg'
kubectl get deployment demo-api -n <namespace> -o yaml | rg -n 'livenessProbe'
```

## 风险

- **RS-SQL-001-69c8243b2e51**：可能造成结构和数据不可恢复丢失，并中断依赖该对象的应用。
- **RS-SQL-007-395766544827**：导入现有数据库可能先清理结构和数据，再写入初始化数据。
- **RS-K8S-001-8bca086fa814**：发布期间可能产生业务中断。
- **RS-K8S-002-ee1c608b5d36**：新版本启动失败时，服务会保持不可用直到人工回滚。
- **RS-K8S-003-51ca76f07d85**：无法可靠复现版本，也无法证明回滚拉取的是原镜像。
- **RS-SQL-006-a76a73ab3004**：脚本失败或漏掉恢复语句时，连接会继续处于弱校验状态。
- **RS-K8S-004-e3bb022adc36**：发布初期可能出现 502/503 或请求失败。
- **RS-K8S-006-13e0b733f90f**：高负载时可能挤压其他工作负载，或因调度估算失真导致节点不稳定。
- **RS-DIST-001-79d99a694927**：页面可能出现图标、脚本或样式 404；关键 JS 缺失时页面无法启动。
- **RS-K8S-005-7851e7e2d441**：部分应用失活场景不能被自动重启。

## 回滚

- **RS-SQL-001-69c8243b2e51**：执行前只能通过完整备份或快照保障恢复；执行后无法依赖普通应用回滚恢复数据。
- **RS-SQL-007-395766544827**：不要执行该文件；从新旧 schema 中单独生成、审核并测试最小增量迁移。
- **RS-K8S-001-8bca086fa814**：保留旧镜像摘要和 Deployment 修订；发布前确认是否允许短暂停机。
- **RS-K8S-002-ee1c608b5d36**：kubectl rollout undo deployment/demo-api -n <namespace>
- **RS-K8S-003-51ca76f07d85**：使用不可变版本标签并记录镜像 digest。
- **RS-SQL-006-a76a73ab3004**：确认同一连接中重新启用外键检查，并执行孤儿数据核验。
- **RS-K8S-004-e3bb022adc36**：补充与真实健康端点一致的就绪探针；变更前保留原清单。
- **RS-K8S-006-13e0b733f90f**：先观察历史用量，再逐步设置 requests 和 limits。
- **RS-DIST-001-79d99a694927**：补齐构建产物或删除错误引用，然后重新生成 dist。
- **RS-K8S-005-7851e7e2d441**：先在测试环境验证探针阈值，避免错误探针引发重启循环。

---

本报告是静态证据，不是发布授权，也不会自动执行其中任何命令。
