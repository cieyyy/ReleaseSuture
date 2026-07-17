# ReleaseSuture 安全模型

## 结论

ReleaseSuture 的核心进程被设计为离线证据分析器，不具备连接或操作集群、服务器、数据库、镜像仓库和任何业务系统的实现。

## 信任边界

工具只信任两个本地边界：

1. 用户明确传入的证据目录，只读；
2. 用户明确指定的报告目录，仅写入两个报告文件。

证据必须由用户在工具之外准备，并在进入目录前完成脱敏。工具不会主动收集生产信息。

## 明确禁止的能力

- 网络：`http`、`https`、`http2`、`net`、`tls`、`dns`、`dgram`；
- 进程：`child_process`、shell、PowerShell、Bash；
- 远程客户端：`kubectl`、`helm`、SSH、MySQL、Redis、Docker、云 CLI；
- 本机凭据发现：kubeconfig、SSH key、云凭据、浏览器会话；
- 自动修复：修改 YAML/SQL/JAR、发布、重启、删除、回滚、扩缩容；
- 隐式采集：扫描输入目录之外的仓库、主目录或环境配置。

测试会静态检查源码，阻止引入常见网络和子进程模块。

## 桌面进程隔离

- renderer 开启 `contextIsolation` 与 Chromium sandbox，并关闭 Node integration；
- preload 不暴露原始 `ipcRenderer`，只暴露三个固定方法；
- 主进程验证 IPC 发送方必须是随程序打包的本地页面；
- 所有 renderer 权限请求、网络请求、页面导航和新窗口都会被拒绝；
- CSP 设置 `connect-src 'none'`、`object-src 'none'` 和 `frame-src 'none'`；
- UI 使用 `textContent` 构造证据内容，不把不可信文件内容作为 HTML 执行。

## 数据处理

- 每个证据文件记录相对路径、大小和 SHA-256；
- 报告仅保留最小必要的脱敏摘录；
- Secret `stringData` 与疑似密码只产生“存在风险”的结论，原值不会进入 finding；
- 报告中的检查命令是人工建议文本，明确标注“未执行”；
- JAR 解包在内存中完成，不释放其内部文件到磁盘，并限制中央目录、条目数量、压缩数据与解压输出大小；
- HTML 引用解析后必须仍处于证据目录内，路径逃逸只报告风险，不检查目录外文件是否存在。

## 输入攻击面

JAR/ZIP 属于不可信输入。解析器限制中央目录大小、条目数量、压缩与解压大小，并拒绝不支持的压缩格式。后续版本应继续增加单次扫描总读取量和解析耗时上限。

## 报告含义

- `BLOCKED`：发现离线证据中的明确阻断项；
- `REVIEW_REQUIRED`：未发现 critical，但存在需要人工判断的风险；
- `READY_FOR_MANUAL_REVIEW`：规则未命中，不等于发布安全，也不表示已验证生产现状。

所有生产判断都必须由操作者在独立的受控流程中确认。

## 发现安全问题

请不要在公开 Issue 中附带真实凭据、生产配置或业务数据。仅提交最小、脱敏、可复现样例，并在问题标题标注 `security`。
