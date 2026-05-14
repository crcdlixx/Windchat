# WindChat

WindChat 是一个可自托管的阅后即焚聊天应用，适合小团队、私密社区和个人服务器使用。它把实时聊天、消息自动过期、群组空间、附件分享和管理后台放在一个 Docker 友好的部署包里。

私聊文本会在浏览器中通过 Signal Protocol 会话层加密。群聊加密和附件端到端加密仍在路线图中，因此如果用于高风险通信，请先阅读开发指南中的安全说明。

## 功能亮点

- 实时私聊和群聊。
- 按会话或群组设置消息自动删除时间。
- 私聊文本使用 Signal Protocol 加密。
- 支持公开群、私密群、密码群和临时群。
- 支持本地、MinIO 或 S3 兼容对象存储。
- Markdown 消息渲染，并使用 DOMPurify 做 HTML 消毒。
- 管理后台支持用户、设置、审计日志和完整性检查。
- 可选邮箱验证、TOTP 双因素认证和 Cloudflare Turnstile。
- Docker Compose 一键部署 PostgreSQL、后端、前端和 Nginx。

## 快速开始

```bash
cp .env.example .env
```

编辑 `.env`，替换默认密钥和密码。然后启动服务：

```bash
docker compose up -d
```

默认使用容器内的本地文件存储。如果需要使用内置 MinIO 对象存储，请把 `.env` 中的 `STORAGE_TYPE` 改为 `minio`，并启动 MinIO profile：

```bash
docker compose --profile minio up -d
```

启动后访问 [http://localhost](http://localhost)。

## 创建管理员

先注册一个普通账号，然后在 PostgreSQL 中提升权限：

```sql
UPDATE users SET role = 'superadmin' WHERE username = 'your_username';
```

重新登录后，侧边栏会出现管理入口。

## 文档

技术细节都放在开发指南里：

- [开发指南](docs/windchat_development_guide.md)
- [发布检查清单](docs/release_checklist.md)
- 架构和服务组成
- 本地启动与 Docker 部署
- Signal Protocol 和安全边界
- 数据库结构与迁移
- API 与 WebSocket 事件

## 项目结构

```text
backend/   Express API、WebSocket、定时任务、存储与数据库访问
frontend/  React + Vite 前端
docs/      开发和维护文档
nginx/     反向代理配置
```

## 当前安全边界

WindChat 当前会加密私聊文本。私钥和 Signal session state 保存在浏览器本地，后端保存公钥预密钥包和加密后的消息 envelope。

当前限制：

- 群聊文本尚未接入 Signal 加密。
- 附件文件内容尚未端到端加密。
- 在新浏览器登录会生成新的 Signal identity，旧会话不会自动同步。

更多实现细节和剩余风险请阅读 [开发指南](docs/windchat_development_guide.md)。

## License

当前仓库尚未包含 license 文件。公开分发或用于私有/内部部署之外的场景前，建议先补充明确的许可证。
