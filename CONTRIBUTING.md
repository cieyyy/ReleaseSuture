# Contributing to ReleaseSuture

感谢参与 ReleaseSuture。项目优先保证离线安全边界、可解释证据和稳定输出，而不是增加任何生产环境连接能力。

## 开始之前

- 阅读 [README.md](./README.md)、[SAFETY.md](./SAFETY.md) 和 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)；
- 先搜索现有 Issue，避免重复工作；
- 较大的规则、格式或架构变更请先创建 Feature Request；
- Issue、测试和提交中禁止包含真实域名、IP、凭据、集群标识或业务数据。

## 本地开发

要求 Node.js 22+。

```powershell
npm install
npm test
npm run scan:example
```

CLI 核心没有第三方运行时依赖；`npm install` 主要用于桌面开发和打包。

## 分支与提交

- 从最新 `main` 创建短生命周期分支；
- 分支名称建议：`feature/...`、`fix/...`、`docs/...`；
- 提交信息建议使用 `type(scope): summary`，例如 `feat(sql): detect unsafe column rewrite`；
- 一个 Pull Request 聚焦一个主题，避免混入无关格式化。

## 新规则要求

每条规则必须包含：

- 唯一、稳定的规则 ID；
- 明确的严重级别和误报边界；
- 最小化且脱敏的证据摘录；
- 人工验证建议、风险和回滚说明；
- 至少一个命中测试和一个不命中测试。

不得为了实现规则加入网络访问、子进程执行、凭据发现、生产系统客户端或证据目录外扫描。

## Pull Request 检查

提交前执行：

```powershell
npm run check
```

并确认：

- 测试全部通过；
- 没有真实业务文件、域名、IP、凭据或集群标识；
- 不可信归档仍受条目数和解压大小限制；
- 新输出字段向后兼容，或在 PR 中说明迁移方式；
- README、安全模型和变更日志已按需更新；
- 不扩大网络、进程、写入或权限边界。

维护者可能要求补充最小复现样例、威胁分析或回滚说明后再合并。
