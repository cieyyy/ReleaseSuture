# Security Policy

## 支持范围

当前项目处于早期阶段，安全修复优先覆盖最新的 `0.1.x` 版本和 `main`。旧版本是否回补将根据影响范围决定。

## 私下报告安全问题

请不要在公开 Issue、Discussion、Pull Request 或日志中提交漏洞细节、真实凭据、生产配置或业务数据。

推荐通过 GitHub 的 [Private vulnerability reporting](https://github.com/cieyyy/ReleaseSuture/security/advisories/new) 提交：

- 受影响版本或提交；
- 最小化、脱敏的复现步骤；
- 预期影响和攻击前提；
- 可行的修复或缓解建议（如有）。

维护者会确认收到报告、评估影响，并在可行时协调修复与披露时间。请在公开前给予合理修复时间。

## 安全边界

以下内容属于项目重点安全范围：

- 证据目录之外的意外读取或写入；
- 网络、子进程或生产客户端能力被引入；
- Secret、密码或令牌原值进入报告；
- JAR/ZIP 解析导致路径逃逸、资源耗尽或任意代码执行；
- Electron renderer 越权访问 Node、网络、权限或外部页面；
- 不可信证据内容导致 HTML/Markdown 注入。

规则误报、规则覆盖建议和一般 Bug 请使用 Issue 模板。完整设计边界见 [SAFETY.md](./SAFETY.md)。
