<p align="center">
  <img src="./assets/icon.png" width="128" alt="ReleaseSuture icon">
</p>

<h1 align="center">ReleaseSuture</h1>

<p align="center">An offline, read-only release evidence compiler.</p>

<p align="center">
  <a href="./README.md">简体中文</a> · English
</p>

ReleaseSuture analyzes user-supplied, sanitized copies of SQL scripts, Kubernetes manifests, JAR files, and web artifacts. It produces a unified, traceable risk report before a release reaches production.

> [!IMPORTANT]
> ReleaseSuture does not connect to clusters, databases, registries, servers, or business systems. It never deploys, remediates, rolls back, or executes the commands shown in a report. Never submit production data or credentials to the repository, issues, or evidence folders.

## Highlights

- Offline by design: the core source does not import network or subprocess modules.
- Read-only evidence input with report-only local output.
- Stable JSON and human-readable Markdown reports.
- SHA-256 fingerprints and sanitized evidence excerpts.
- SQL, Kubernetes YAML, JAR, and web distribution checks.
- Shared scanning core for the CLI and Windows desktop app.

## Quick start

Node.js 22 or later is required. The CLI core uses only the Node.js standard library.

```powershell
node .\src\cli.js scan .\examples\risky-release --output .\tmp\example-report
npm test
```

The scan writes exactly two report files: `report.json` and `report.md`.

## Windows desktop app

Electron dependencies are required only for desktop development and packaging:

```powershell
npm install
npm run desktop:start
npm run desktop:package
```

The packaged executable is written to `out/ReleaseSuture-win32-x64/ReleaseSuture.exe`.

## Evidence layout

```text
release-case/
├── live-snapshot/
├── old-artifacts/
└── new-artifacts/
    ├── db/*.sql
    ├── k8s/*.yaml
    ├── backend/*.jar
    └── web/**
```

The evidence directory must be prepared and sanitized outside ReleaseSuture.

## Decision model

- `BLOCKED`: explicit Critical/High blockers exist in target artifacts.
- `REVIEW_REQUIRED`: high-risk findings in the supplied current-state evidence need review.
- `READY_FOR_MANUAL_REVIEW`: no blocking rule matched; this is not proof that a production release is safe.

## Documentation

- [Architecture](./docs/ARCHITECTURE.md)
- [Safety model](./SAFETY.md)
- [Security policy](./SECURITY.md)
- [Contributing](./CONTRIBUTING.md)
- [Open-source readiness](./docs/OPEN_SOURCE_READINESS.md)

## License

[Apache License 2.0](./LICENSE)
