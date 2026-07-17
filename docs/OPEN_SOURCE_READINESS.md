# Open-source Readiness

此清单用于把当前私有开发仓库安全地转为公开项目。公开可见性属于单独的维护者决策，不应与普通代码提交绑定。

## 已具备

- [x] Apache-2.0 License；
- [x] 中英双语 README；
- [x] 贡献、安全、支持和行为准则；
- [x] Issue 与 Pull Request 模板；
- [x] Windows/Linux CI；
- [x] Dependabot 配置；
- [x] 离线与路径安全测试；
- [x] 示例数据使用无效域名和合成内容。

## 公开前必须复核

- [ ] 再次运行敏感信息、历史提交和大文件扫描；
- [ ] 确认 GitHub 仓库描述、Topics、主页和社交预览图；
- [ ] 启用 Private vulnerability reporting；
- [ ] 为 `main` 配置分支保护和必需 CI；
- [ ] 明确维护者私人联系方式和行为准则执行渠道；
- [ ] 核对 Electron 发行包的第三方许可证与 Notices；
- [ ] 决定是否发布签名的 Windows 安装包以及签名证书管理方式；
- [ ] 创建首个 GitHub Release，并校验 SHA-256；
- [ ] 确认没有把本地缓存、构建产物、报告或对话导出纳入 Git。

## 建议的公开步骤

1. 在私有状态完成 CI 和安全复核；
2. 创建 `v0.1.0` 源码标签及校验值；
3. 配置分支保护和安全报告渠道；
4. 单独将仓库可见性改为 Public；
5. 发布公告并从一个全新目录验证 README 流程。
