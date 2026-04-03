# Logto Fork — 二次开发记录

> 本仓库 fork 自 [logto-io/logto](https://github.com/logto-io/logto)，托管于 [github.com/zzmark/logto](https://github.com/zzmark/logto)，用于内部二次开发与私有化部署。
> 本文件记录所有相对上游的改动，以及对应的文档链接。

---

## CI/CD 调整

### 镜像发布

- **触发条件**：仅在推送 `v*` tag 时触发构建与发布（原上游为 master push）
- **目标镜像仓库**：`ghcr.io/zzmark/logto:{tag}`（原上游推送至 DockerHub `svhd/logto` 和 GHCR `ghcr.io/logto-io/logto`）
- **构建工具**：标准 `docker/build-push-action` + Buildx（原上游使用付费 Depot 服务）
- **多平台支持**：`linux/amd64`, `linux/arm64`

**相关文件**：[`.github/workflows/release.yml`](.github/workflows/release.yml)

**所需权限/Secrets**：

| 项 | 说明 |
|----|------|
| `packages: write` permission | workflow 已配置，推送到 `ghcr.io/zzmark/logto` 无需额外 Secret |

### 已关闭的 Workflow

| Workflow 文件 | 关闭原因 |
|--------------|----------|
| `master-codecov-report.yml` | 不使用 Codecov |
| `repository-dispatch.yml` | 移除对上游 `logto-io/cloud` 仓库的远程调用 |

**相关文件**：
- [`.github/workflows/master-codecov-report.yml`](.github/workflows/master-codecov-report.yml)
- [`.github/workflows/repository-dispatch.yml`](.github/workflows/repository-dispatch.yml)

### 其他改动

- `main.yml`：移除 CI 测试流程中的 Codecov 上报步骤

**相关文件**：[`.github/workflows/main.yml`](.github/workflows/main.yml)

---

<!-- 后续二次开发内容在此追加 -->
