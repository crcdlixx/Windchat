# WindChat

WindChat 是一个可自托管的阅后即焚聊天应用，适合小团队、私密社区和个人服务器使用。它把实时聊天、消息自动过期、群组空间、附件分享和管理后台放在一个 Docker 友好的部署包里。

私聊文本会在浏览器中通过 Signal Protocol 会话层加密；群聊文本、附件内容和个人备忘录也会在客户端加密后再交给服务端保存或转发。如果用于高风险通信，请先阅读开发指南中的安全说明。

## 功能亮点

- 实时私聊和群聊。
- 按会话或群组设置消息自动删除时间。
- 私聊文本使用 Signal Protocol 加密，群聊、附件和个人备忘录使用浏览器 WebCrypto 加密。
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
- [贡献指南](CONTRIBUTING.md)
- [安全策略](SECURITY.md)
- 架构和服务组成
- 本地启动与 Docker 部署
- Signal Protocol 和安全边界
- 数据库结构与迁移
- API 与 WebSocket 事件

## 发布前检查

推送到 GitHub 前建议至少运行：

```bash
docker compose config --quiet
```

```bash
cd backend
npm audit --omit=dev --registry=https://registry.npmjs.org
```

```bash
cd frontend
npm audit --omit=dev --registry=https://registry.npmjs.org
npm run build
```

GitHub Actions 会在 push 和 pull request 上重复这些核心检查。

## 项目结构

```text
backend/   Express API、WebSocket、定时任务、存储与数据库访问
frontend/  React + Vite 前端
docs/      开发和维护文档
nginx/     反向代理配置
```

## 当前安全边界

WindChat 当前把一对一私聊内容接入 Signal Protocol 会话层加密；群聊消息使用每群组浏览器端 AES-GCM key 加密；附件在上传前用随机 AES-GCM key 加密；个人备忘录在浏览器中加密后保存。私钥、self-copy 加密 key、群组 key、备忘录 key 和 Signal session state 保存在浏览器 `localStorage`，并可通过用户密码派生出的 vault key 加密备份到服务端。

当前限制：

- 群聊加密使用共享群 key 和邀请链接 hash 分发，不是 Signal Sender Keys；成员移除后的历史 key 轮换仍需谨慎处理。
- 消息类型、发送者、会话或群组 ID、TTL、时间戳、附件对象 key 和密文大小等元数据对服务端可见。
- 附件文件名、MIME 类型和附件解密 key 被放在加密消息 payload 内，服务端只保存密文文件对象。
- vault 依赖登录密码解密；没有密码或清空本地存储且无可用 vault 时，旧本地密钥材料无法恢复。
- 多设备仍不是完整设备管理模型；新浏览器登录会优先尝试恢复 vault，否则会生成新的 Signal identity。

更多实现细节和剩余风险请阅读 [开发指南](docs/windchat_development_guide.md)。

## Production HTTPS

Production deployments must use HTTPS so browser encryption APIs are available. See [Production HTTPS Docker Deployment](docs/production_https_docker.md).

## License

WindChat is released under the [MIT License](LICENSE).
