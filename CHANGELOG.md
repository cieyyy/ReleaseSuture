# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) 的结构，并计划从稳定版本开始遵循语义化版本。

## [Unreleased]

## [0.1.1] - 2026-07-20

### Fixed

- 左侧“风险报告”和“发布顺序”改为扫描完成后可用的页面导航；
- 报告生成后自动在桌面软件内展示风险摘要与可折叠证据；
- 发布顺序支持展开人工门禁，并可从阻断项跳转到对应风险证据。

### Changed

- 切换证据或报告目录时使旧结果失效，避免误看上一轮报告。

### Added

- 开源治理文档、双语 README、CI、Issue/PR 模板和 Dependabot 配置。

## [0.1.0] - 2026-07-17

### Added

- 离线发布证据模型和 JSON/Markdown 报告；
- SQL、Kubernetes YAML、JAR 与 Web dist 扫描器；
- 新旧产物 SHA-256 变化清单；
- Windows Electron 桌面界面与桌面图标；
- 网络、子进程、权限和路径边界测试。

[Unreleased]: https://github.com/cieyyy/ReleaseSuture/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/cieyyy/ReleaseSuture/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/cieyyy/ReleaseSuture/releases/tag/v0.1.0
