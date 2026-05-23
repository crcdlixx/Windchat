# WindChat 开发指南

面向维护者和新贡献者的代码导览  
整理日期：2026-05-11

## 目录

- [文档目标](#文档目标)
- [当前实现快照](#当前实现快照)
- [仓库结构](#仓库结构)
- [本地启动与部署](#本地启动与部署)
- [整体架构](#整体架构)
- [后端开发指南](#后端开发指南)
- [前端开发指南](#前端开发指南)
- [数据库设计](#数据库设计)
- [环境变量](#环境变量)
- [常见开发任务](#常见开发任务)
- [安全模型与注意事项](#安全模型与注意事项)
- [建议的质量检查](#建议的质量检查)
- [推荐改进路线](#推荐改进路线)
- [关键 API 摘要](#关键-api-摘要)

## 文档目标

本文档面向准备维护、二次开发或部署 WindChat 的开发者。内容基于当前仓库源码整理，重点回答四个问题：

- 这个项目由哪些服务组成，启动链路是什么？
- 后端、前端、数据库和 WebSocket 分别承担什么职责？
- 修改常见功能时应从哪些文件入手？
- 当前代码里有哪些实现细节、限制和维护风险需要先知道？

读码范围包括：

- 根目录部署文件：`docker-compose.yml`、`.env.example`、`nginx/nginx.conf`
- 后端源码：`backend/src`
- 数据库初始化与迁移：`backend/db`
- 前端源码：`frontend/src`
- 前端和后端构建文件：`frontend/Dockerfile`、`backend/Dockerfile`

## 当前实现快照

WindChat 是一个自托管 Web 聊天应用，当前代码采用：

- 后端：Node.js 20、Express、PostgreSQL、WebSocket、JWT、bcrypt、Multer、S3/MinIO SDK。
- 前端：React 18、Vite、React Router、Zustand、Axios、Tailwind CSS、lucide-react。
- 数据层：PostgreSQL 存用户、群组、会话、消息、预密钥、刷新令牌、管理设置与审计日志。
- 文件层：支持 `local`、`minio`、`s3` 三种对象存储模式。
- 部署层：Docker Compose 编排 PostgreSQL、MinIO、backend、frontend、nginx。

**重要提醒：** 当前私聊内容已经接入 Signal Protocol 会话层；群聊消息、附件内容和个人备忘录也会在浏览器端加密后再交给后端保存或转发。后端仍可见消息类型、发送者、会话或群组 ID、TTL、时间戳、附件对象 key 和密文大小等元数据；群聊使用共享 AES-GCM key，不是完整 Signal Sender Keys 设备模型。

默认 Docker 配置使用 `local` 文件存储。只有在 `.env` 中设置 `STORAGE_TYPE=minio` 并使用 `docker compose --profile minio up -d` 时，才会启动和使用内置 MinIO。

## 仓库结构

```text
Windchat/
  .env.example
  docker-compose.yml
  README.md
  nginx/
    nginx.conf
  backend/
    Dockerfile
    package.json
    config/config.yaml
    db/
      init.sql
      migrations/
        001_add_settings.sql
        002_add_email_totp.sql
    scripts/
      compute-integrity.js
    src/
      index.js
      db/pool.js
      jobs/cleanup.js
      middleware/
        auth.js
        turnstile.js
      routes/
        auth.js
        users.js
        keys.js
        conversations.js
        groups.js
        messages.js
        storage.js
        files.js
        admin.js
      services/
        email.js
        fileStorage.js
        messageService.js
      utils/
        integrityCheck.js
        logger.js
      ws/server.js
  frontend/
    Dockerfile
    package.json
    vite.config.js
    tailwind.config.js
    src/
      App.jsx
      main.jsx
      index.css
      lib/
        api.js
        crypto.js
        hooks.js
        i18n.js
        websocket.js
      stores/
        authStore.js
        chatStore.js
        sidebarStore.js
      pages/
        LoginPage.jsx
        RegisterPage.jsx
        ChatLayout.jsx
        JoinGroupPage.jsx
      components/
        AdminView.jsx
        ChatView.jsx
        MessageInput.jsx
        MessageBubble.jsx
        Sidebar.jsx
        ...
```

## 本地启动与部署

### Docker Compose 启动

推荐先复制环境变量模板：

```bash
cp .env.example .env
```

至少需要修改以下敏感项：

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `MINIO_ROOT_PASSWORD`
- `S3_SECRET_KEY`
- `ADMIN_SECRET`

使用 MinIO：

```bash
docker compose --profile minio up -d
```

不使用 MinIO，而使用外部 S3 或本地文件存储：

```bash
docker compose up -d
```

默认访问入口是 `http://localhost`。根目录 `nginx/nginx.conf` 会把请求转发到对应服务：

- `/api/*` 转发到后端 Express，并去掉 `/api` 前缀。
- `/ws` 转发到后端 WebSocket。
- `/files/*` 转发到后端文件服务。
- 其他路径转发到前端 SPA。

### 前后端分开开发

后端：

```bash
cd backend
npm install
npm run dev
```

后端默认读取 `DATABASE_URL`、JWT 密钥、对象存储配置等环境变量，并监听 `PORT`，默认 `4000`。

前端：

```bash
cd frontend
npm install
npm run dev
```

Vite 配置位于 `frontend/vite.config.js`。开发服务器会代理：

- `/api` 到 `http://localhost:4000`
- `/ws` 到 `ws://localhost:4000`
- `/files` 到 `http://localhost:4000`

### 构建

前端构建命令：

```bash
cd frontend
npm run build
```

后端生产启动命令：

```bash
cd backend
npm start
```

后端 Dockerfile 会在镜像构建阶段执行：

```bash
node scripts/compute-integrity.js
```

该脚本会计算 `backend/src` 的 SHA-256 目录摘要并写入 `backend/src_integrity.txt`，生产启动与健康检查时会验证源码完整性。

## 整体架构

### 请求链路

```text
Browser
  |
  v
nginx :80
  |-- /api/*  -> backend:4000  Express REST API
  |-- /ws     -> backend:4000  WebSocket
  |-- /files  -> backend:4000  local file proxy
  `-- /*      -> frontend:80   React SPA

backend
  |-- PostgreSQL: users, conversations, groups, messages, settings
  |-- MinIO/S3/local storage: uploaded file payloads
  `-- node-cron: expired message, temporary group, token cleanup
```

### 服务职责

| 模块 | 职责 |
| --- | --- |
| nginx | 对外入口、API 反向代理、WebSocket 升级、前端 SPA 转发、基础限流。 |
| backend | 鉴权、用户资料、密钥包、会话、群组、消息、文件、个人备忘、管理接口、实时事件。 |
| frontend | 登录注册、聊天界面、群组界面、管理界面、个人中心、备忘录、WebSocket 客户端。 |
| PostgreSQL | 持久化业务数据和管理数据。 |
| MinIO/S3/local | 保存附件和图片文件；数据库仅保存对象 key。 |
| cleanup job | 每分钟标记过期消息、删除过期附件、解散过期临时群、清理过期 refresh token 和旧的一次性预密钥。 |

## 后端开发指南

### 入口文件

后端入口是 `backend/src/index.js`。它负责：

- 加载环境变量。
- 创建 Express app 与 HTTP server。
- 配置 Helmet、CORS、JSON body limit。
- 注册 REST 路由。
- 注册 `/health` 与 `/integrity`。
- 调用 `setupWebSocket(server)` 挂载 WebSocket。
- 启动数据库连接测试与定时清理任务。
- 生产环境执行源码完整性检查。

新增全局中间件、基础安全头、全局错误处理或新路由时，从这里接入。

### 数据库连接

`backend/src/db/pool.js` 使用 `pg.Pool`，通过 `DATABASE_URL` 建立连接池：

- 最大连接数：20。
- idle timeout：30 秒。
- connection timeout：5 秒。

所有路由和服务直接导入 `pool` 执行 SQL。涉及多表一致性时使用 `pool.connect()` 并手动 `BEGIN/COMMIT/ROLLBACK`，注册用户和创建群组已经使用了这种模式。

### 鉴权与权限

`backend/src/middleware/auth.js` 提供三个中间件：

- `authenticateToken`：读取 `Authorization: Bearer <token>`，使用 `JWT_SECRET` 验证 access token。
- `requireAdmin`：允许 `admin` 与 `superadmin`。
- `requireSuperAdmin`：仅允许 `superadmin`。

access token 在 `backend/src/routes/auth.js` 中生成，有效期 15 分钟。refresh token 有效期 7 天，服务端只保存 SHA-256 哈希。刷新时会删除旧 refresh token 并签发新 token，属于轮换式 refresh token。

### 验证码

`backend/src/middleware/turnstile.js` 在配置了 `TURNSTILE_SECRET_KEY` 时启用 Cloudflare Turnstile 校验。未配置 secret 时直接放行。登录与注册路由都接入了该中间件。

### 路由总览

| 文件 | 主要接口与职责 |
| --- | --- |
| `routes/auth.js` | 注册、登录、TOTP 登录挑战、TOTP 启用/关闭、邮箱验证码、refresh token、logout、公开配置。 |
| `routes/users.js` | 当前用户资料、更新资料、修改密码、搜索用户、按 ID 查询用户。 |
| `routes/keys.js` | 获取用户预密钥包、替换当前设备 Signal identity bundle、上传一次性预密钥、更新 signed prekey。 |
| `routes/conversations.js` | 创建或获取私聊会话、列出我的会话、修改私聊 TTL。 |
| `routes/groups.js` | 创建群、列出我的群、搜索公开群、加入群、成员列表、邀请、踢出、禁言、清空消息、解散群、更新群设置。 |
| `routes/messages.js` | 查询私聊消息、查询群消息、删除消息。 |
| `routes/files.js` | 上传附件、获取文件 URL、本地存储模式下发送文件。 |
| `routes/storage.js` | 读取和保存个人备忘录。 |
| `routes/admin.js` | 管理统计、用户管理、角色管理、服务设置、审计日志、群组管理。 |

### 认证流程

注册流程：

1. 前端通过 `@privacyresearch/libsignal-protocol-typescript` 生成 Signal identity key、registration id、signed prekey 和一次性 prekeys。
2. 前端调用 `POST /auth/register`，提交用户名、密码、显示名和公钥材料。
3. 后端检查注册开关、用户名格式、密码长度。
4. 后端使用 bcrypt 哈希密码。
5. 后端写入 `users`、`user_storage`、`one_time_prekeys`。
6. 后端签发 access token 和 refresh token。
7. 前端把私钥材料、self-copy 加密 key 和后续 session state 保存到 localStorage，key 为 `wc_identity_<userId>` 与 `wc_signal_<userId>:*`。

登录流程：

1. 前端调用 `POST /auth/login`。
2. 后端检查用户是否存在、是否封禁、密码是否正确。
3. 如果用户启用了 TOTP，但本次没有提交验证码，后端返回 `requires_totp` 和 5 分钟挑战 token。
4. 前端提交 `POST /auth/totp-challenge` 完成二次验证。
5. 后端签发 access token 和 refresh token。
6. 前端把 token 写入 Zustand 持久化 store，并设置 Axios 默认 Authorization header。
7. 如果当前浏览器没有本地 Signal identity，前端会生成新的 identity bundle 并调用 `PUT /keys/identity` 上传。这会让该设备重新建立会话，旧设备会话不自动同步。

### 消息写入与实时分发

实时消息入口是 `backend/src/ws/server.js`。连接方式：

```text
wss://host/ws?token=<accessToken>
```

连接建立时：

- 服务端从 query string 读取 token。
- 使用 `JWT_SECRET` 验证。
- 将 WebSocket 连接登记到 `Map<userId, Set<WebSocket>>`。
- 更新用户 `last_seen`。
- 返回 `connected` 事件。

发送消息时：

1. 私聊发送前，前端检查本地是否已有与对方的 Signal session；没有则调用 `GET /keys/:userId/bundle` 获取对方 prekey bundle。
2. 前端调用 `encryptMessage` 生成 Signal encrypted envelope，并附带一份本机 local self-copy，便于发送者刷新后读取自己的消息。
3. 客户端发送 `message:send`。
4. 后端根据 `conversation_id` 或 `group_id` 检查成员资格。
5. 群组消息会额外检查禁言状态，并要求 `windchat-group-aes-gcm` 加密 payload。
6. 后端计算有效 TTL，不能超过环境变量 `MAX_MESSAGE_TTL_HOURS`。
7. `services/messageService.js` 插入 `messages` 表。
8. 后端把 `message:new` 广播给会话双方或群组成员。

### WebSocket 事件

客户端到服务端：

| 事件 | 说明 |
| --- | --- |
| `message:send` | 发送私聊或群消息。必须带 `encrypted_payload`，并带 `conversation_id` 或 `group_id` 之一。 |
| `message:delete` | 删除消息。发送者可删自己的消息；群 owner 或 moderator 可删群消息。 |
| `typing:start` | 输入状态开始。 |
| `typing:stop` | 输入状态停止。 |
| `ping` | 心跳，服务端返回 `pong`。 |

服务端到客户端：

| 事件 | 说明 |
| --- | --- |
| `connected` | WebSocket 连接成功。 |
| `message:new` | 新消息。 |
| `message:deleted` | 消息被删除。 |
| `typing:start` | 其他用户开始输入。 |
| `typing:stop` | 其他用户停止输入。 |
| `error` | 服务端错误或无效事件。 |
| `pong` | 心跳响应。 |

### 文件存储

默认部署建议使用 `STORAGE_TYPE=local`，文件写入 backend 容器挂载的 `local_storage` volume。该模式不需要额外对象存储服务。

如果使用 MinIO：

1. `.env` 设置 `STORAGE_TYPE=minio`。
2. 使用 `docker compose --profile minio up -d` 启动。
3. 后端会在首次上传或生成下载 URL 时检查并创建 `S3_BUCKET`。

Nginx 根配置设置了 `client_max_body_size 50m`，需要与 `MAX_FILE_SIZE_MB` 保持一致，否则大文件会在到达后端前被 Nginx 拒绝。

文件上传入口是 `backend/src/routes/files.js`，实际存储逻辑在 `backend/src/services/fileStorage.js`。

支持三种模式：

- `local`：写入容器内 `LOCAL_STORAGE_DIR`，默认 `/app/storage`。
- `minio`：使用 S3 SDK，开启 `forcePathStyle`。
- `s3`：使用外部 S3 兼容服务。

上传接口只返回对象 key、原文件名、大小和 MIME。消息表中的 `file_ref` 保存 key。过期消息清理任务会根据 `file_ref` 删除对应对象。

### 个人备忘录

`backend/src/routes/storage.js` 保存个人备忘录的客户端加密 payload：

- `GET /storage` 返回当前用户内容。
- `PUT /storage` 保存内容。
- 保存时从 `server_settings.max_storage_kb` 读取动态限制。
- 数据库约束上限是 10MB，应用默认限制是 1MB。

### 管理后台

`backend/src/routes/admin.js` 统一使用：

```js
router.use(authenticateToken, requireAdmin)
```

普通管理员可以：

- 查看统计。
- 列出用户。
- 封禁或解封用户。
- 查看和修改部分服务设置。
- 查看审计日志。
- 查看群组列表。

超级管理员额外可以：

- 修改用户角色。
- 删除用户。
- 管理删除群组。

首次创建超级管理员的方式是先注册普通账号，然后在数据库里执行：

```sql
UPDATE users SET role='superadmin' WHERE username='your_username';
```

### 定时清理任务

`backend/src/jobs/cleanup.js` 使用 node-cron，每分钟执行：

- 查找过期且未删除、有附件的消息，删除附件对象。
- 将过期消息标记为 `is_deleted=true`。
- 将过期临时群组标记为 `is_dissolved=true`。
- 删除过期 refresh token。
- 删除 30 天前已使用的一次性预密钥。

注意：消息不是从数据库物理删除，而是软删除。文件对象会尝试删除。

### 源码完整性检查

构建阶段 `backend/scripts/compute-integrity.js` 计算 `backend/src` 的目录哈希。运行时 `backend/src/utils/integrityCheck.js` 重新计算并比较。

- 生产环境启动时会记录完整性验证结果。
- `GET /health` 返回 `integrity` 与当前 hash。
- `GET /integrity` 返回详细结果。
- 开发环境缺少 `src_integrity.txt` 时会被视作有效，方便本地开发。

## 前端开发指南

### 路由结构

入口组件是 `frontend/src/App.jsx`：

- `/login`：未登录访问登录页。
- `/register`：未登录访问注册页。
- `/join/group/:groupId`：已登录后加入群组页面。
- `/*`：已登录进入主聊天布局。

主布局是 `frontend/src/pages/ChatLayout.jsx`。它负责：

- 登录后连接 WebSocket。
- 加载私聊会话和群组。
- 渲染侧边栏。
- 挂载欢迎页、聊天页、备忘录页、管理页。

### 状态管理

| Store | 职责 |
| --- | --- |
| `stores/authStore.js` | 登录、注册、TOTP 挑战、刷新 token、登出、加载用户资料。通过 Zustand persist 保存 token 与用户。 |
| `stores/chatStore.js` | 会话列表、群组列表、当前聊天、按会话缓存消息、输入状态、TTL 更新、本地过期消息清理。 |
| `stores/sidebarStore.js` | 侧边栏展开/收起状态，主要用于移动端和桌面端布局切换。 |

### API 客户端

`frontend/src/lib/api.js` 创建 Axios 实例：

- 默认 `baseURL` 为 `VITE_API_URL` 或 `/api`。
- 启动时从 localStorage 的 `windchat-auth` 读取 access token。
- 对 403 响应做 refresh token 自动刷新。
- 刷新失败时清理登录状态并跳转 `/login`。

新增前端 API 调用时应优先复用这个实例，而不是直接使用 `fetch` 或新建 Axios。

### WebSocket 客户端

`frontend/src/lib/websocket.js` 负责：

- 从 auth store 获取 access token。
- 连接 `VITE_WS_URL` 或 `/ws`。
- 每 30 秒发送 `ping`。
- 断开后 3 秒重连。
- 收到 `message:new` 时写入 chat store。
- 收到删除和输入状态事件时更新本地状态。

新增实时事件时，需要同时修改后端 `backend/src/ws/server.js` 和前端 `frontend/src/lib/websocket.js`。

### 聊天界面

`frontend/src/components/ChatView.jsx` 是消息页主组件。它负责：

- 根据 URL 参数 `type` 和 `id` 判断私聊或群聊。
- 从 store 读取消息、输入状态、会话/群组信息。
- 进入页面时调用 `loadMessages`。
- 每 5 秒清理本地已过期消息。
- 发送消息、上传文件、发送 typing 事件。
- 修改会话或群组 TTL。

`frontend/src/components/MessageInput.jsx` 负责输入框、附件选择、Markdown 工具按钮和 TTL 选择。

`frontend/src/components/MessageBubble.jsx` 负责渲染消息、Markdown 消毒、附件下载、删除和 TTL 信息弹窗。

### Markdown 渲染

消息气泡中使用：

- `marked` 把 Markdown 转 HTML。
- `DOMPurify` 做 HTML 消毒。
- `dangerouslySetInnerHTML` 渲染已消毒结果。

修改 Markdown 能力时，应保持 DOMPurify 仍在链路中，避免 XSS 风险。

### 前端加密相关代码

`frontend/src/lib/crypto.js` 当前包含：

- 初始化 `@privacyresearch/libsignal-protocol-typescript`，设置浏览器 WebCrypto 和 Curve25519 实现。
- 生成 Signal identity key pair、registration id、signed prekey 和一次性 prekeys。
- 导出 public key bundle 供后端保存，保存 local private bundle 到浏览器 localStorage。
- 实现 Signal storage adapter：identity state、prekeys、signed prekey、session records。
- 私聊发送时通过 `SessionBuilder.processPreKey` 建立会话，再用 `SessionCipher.encrypt` 生成 Signal envelope。
- 私聊接收时根据 envelope type 调用 `decryptPreKeyWhisperMessage` 或 `decryptWhisperMessage`。
- 为发送者保存 local self-copy。Signal 密文面向接收方设备，发送端不能直接用同一份密文解出自己的历史消息，因此 self-copy 使用本地随机 key 加密，仍不上传明文。
- 支持群聊 AES-GCM payload、附件 AES-GCM blob、个人备忘录 AES-GCM payload，以及用户密码派生 vault key 的本地密钥备份/恢复。

当前限制：

- Signal Protocol 只用于私聊；群聊当前使用共享群 key，不具备完整 Sender Keys 的设备级成员管理。
- 群 key 通过浏览器本地存储、vault 备份和邀请链接 hash 分发；成员移除后的 key 轮换策略仍需继续完善。
- 附件内容已端到端加密，但对象 key、密文大小和下载授权元数据仍对服务端可见。
- 多设备依赖 vault 恢复本地密钥材料；没有可解密 vault 时，新浏览器登录会发布新的 identity bundle，旧会话需要重新建立。

### 国际化与文案

`frontend/src/lib/i18n.js` 采用内置字典：

- 根据 `navigator.language` 选择中文或英文。
- `t(key, ...args)` 负责简单占位符替换。
- 没有引入 i18next 等完整国际化框架。

当前源码和文档应统一按 UTF-8 保存。涉及中文文案的大改动时，建议在构建前用 `rg "�|鈥|涓|鍔"` 之类的模式快速扫一遍，避免 mojibake 回归。

## 数据库设计

数据库初始化脚本位于 `backend/db/init.sql`。

### 核心表

| 表 | 说明 |
| --- | --- |
| `users` | 用户表，包含账号、密码哈希、展示信息、角色、封禁状态、身份公钥、signed prekey、邮箱和 TOTP 字段。 |
| `one_time_prekeys` | 一次性预密钥池，用于后续 E2E 会话建立。 |
| `user_storage` | 用户个人备忘录，按 user id 一行。 |
| `groups` | 群组，支持 public、password、private，支持临时群与消息 TTL。 |
| `group_members` | 群成员关系，含 member、moderator、owner 角色和禁言状态。 |
| `conversations` | 双人私聊会话，强制 `user_a < user_b`，避免重复会话。 |
| `messages` | 消息表，私聊和群聊共用。通过 CHECK 约束保证 `conversation_id` 与 `group_id` 二选一。 |
| `message_reads` | 已读记录表。当前代码中暂未看到完整读回执业务链路。 |
| `refresh_tokens` | refresh token 哈希。 |
| `server_settings` | 管理后台可改的服务端配置。 |
| `audit_log` | 管理与安全相关操作日志。 |
| `email_verification_codes` | 邮箱验证码。新部署由 `init.sql` 创建，已有部署由迁移 `002_add_email_totp.sql` 补齐。 |

### 迁移现状

仓库包含：

- `backend/db/migrations/001_add_settings.sql`
- `backend/db/migrations/002_add_email_totp.sql`

`backend/src/db/migrate.js` 会按文件名顺序执行 `backend/db/migrations/*.sql`，并用 `schema_migrations` 记录已应用文件，重复运行会跳过已执行迁移。后端 Docker 镜像启动时会先运行 `npm run migrate`，再执行 `npm start`。部署新环境时，Docker PostgreSQL 仍会先执行 `init.sql`；已有环境可通过 `npm run migrate` 补齐增量变更。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `POSTGRES_DB` | PostgreSQL 数据库名。 |
| `POSTGRES_USER` | PostgreSQL 用户名。 |
| `POSTGRES_PASSWORD` | PostgreSQL 密码，必须替换。 |
| `DATABASE_URL` | 后端实际连接串，Docker Compose 会根据 PostgreSQL 变量拼出。 |
| `JWT_SECRET` | access token 签名密钥，必须使用强随机值。 |
| `JWT_REFRESH_SECRET` | refresh token 签名密钥，必须使用强随机值且不要与 access token 共用。 |
| `STORAGE_TYPE` | `local`、`minio` 或 `s3`。默认建议 `local`；使用内置 MinIO 时必须同时启动 `minio` profile。 |
| `S3_ENDPOINT` | S3/MinIO endpoint。 |
| `S3_ACCESS_KEY` | 对象存储访问 key。 |
| `S3_SECRET_KEY` | 对象存储 secret。 |
| `S3_BUCKET` | 对象存储 bucket。 |
| `MAX_MESSAGE_TTL_HOURS` | 服务端消息 TTL 硬上限，默认 24。 |
| `DEFAULT_MESSAGE_TTL_SECONDS` | 默认消息 TTL。 |
| `TURNSTILE_SITE_KEY` | Cloudflare Turnstile 前端 site key，可空。 |
| `TURNSTILE_SECRET_KEY` | Turnstile 后端 secret，可空；为空时不校验。 |
| `SMTP_*` | 邮箱验证码发送配置。 |
| `VITE_API_URL` | 前端构建时注入的 API 地址，默认 `/api`。 |
| `VITE_WS_URL` | 前端构建时注入的 WebSocket 地址，默认 `/ws`。 |
| `NODE_ENV` | 生产环境设为 `production` 时启用启动期完整性日志。 |

## 常见开发任务

### 新增 REST 接口

1. 在 `backend/src/routes` 下创建或修改对应路由文件。
2. 需要登录态时加 `authenticateToken`。
3. 需要管理员权限时加 `requireAdmin` 或 `requireSuperAdmin`。
4. 涉及数据库写入时优先使用参数化 SQL。
5. 在 `backend/src/index.js` 注册新路由前缀。
6. 前端通过 `frontend/src/lib/api.js` 调用。

### 新增 WebSocket 事件

1. 在 `backend/src/ws/server.js` 的 `handleMessage` 中增加 case。
2. 把业务逻辑拆成独立函数，保持权限校验和广播对象清晰。
3. 如果事件会修改数据库，明确是否需要事务。
4. 在 `frontend/src/lib/websocket.js` 的 `handleIncoming` 中处理服务端事件。
5. 如果需要主动发送，封装调用 `sendWsMessage` 的 UI 逻辑。

### 新增数据库字段

1. 修改 `backend/db/init.sql`，保证新部署环境正确。
2. 新建 `backend/db/migrations/*.sql`，保证已有部署可升级。
3. 新增迁移后运行 `npm run migrate` 验证脚本可重复执行。
4. 修改相关 SQL 查询和返回字段。
5. 修改前端类型假设、渲染逻辑或 store。

### 新增设置项

1. 在 `server_settings` 默认插入中新增 key。
2. 在 `backend/src/routes/admin.js` 的 `allowed` 数组里加入 key。
3. 在 `frontend/src/components/AdminView.jsx` 添加表单控件。
4. 在业务路由中读取该 setting。

### 新增前端页面

1. 在 `frontend/src/pages` 或 `frontend/src/components` 中创建组件。
2. 在 `frontend/src/App.jsx` 或 `ChatLayout.jsx` 中添加 Route。
3. 如果页面需要侧边栏入口，修改 `frontend/src/components/Sidebar.jsx`。
4. 文案写入 `frontend/src/lib/i18n.js`。
5. API 调用复用 `frontend/src/lib/api.js`。

## 安全模型与注意事项

### 已经具备的安全措施

- 密码使用 bcrypt 哈希。
- access token 与 refresh token 分离。
- refresh token 只保存哈希，刷新时轮换。
- 登录和注册有 Express rate limit。
- 可选 Cloudflare Turnstile。
- Helmet 设置基本安全头和 CSP。
- Markdown 渲染经过 DOMPurify。
- 管理接口统一鉴权并区分 admin/superadmin。
- `maintenance_mode`、`require_email`、`require_totp` 会在认证中间件和 WebSocket 握手中强制执行。
- 本地文件存储会通过短期签名 URL 给图片和附件访问授权，避免 `<img>` 缺少 Authorization header。
- 私聊文本使用 Signal Protocol 会话层在浏览器中加密，后端只保存 encrypted envelope。
- 私钥材料和 Signal session state 留在浏览器 localStorage。
- 生产构建中有源码完整性校验机制。

### 需要优先修正或确认的风险

- **Signal 覆盖范围有限。** 当前只有私聊文本接入 Signal Protocol；群聊文本、文件内容和个人备忘录不属于该加密链路。
- **本地密钥没有备份/同步。** 换浏览器或清空 localStorage 后会生成新的 Signal identity bundle，旧消息和旧会话可能无法解密或需要重新建立。
- **未实现身份安全提示。** 如果对方 identity key 变化，当前产品层没有给用户展示安全码比对或身份变更确认流程。
- **编码回归风险。** 中文文案和文档需要继续保持 UTF-8 保存，避免不同编辑器或终端设置造成 mojibake。

## 建议的质量检查

当前项目没有测试脚本。建议至少建立以下检查：

- 后端 JavaScript 语法检查：对 `backend/src/**/*.js` 执行 `node --check`。
- 前端构建检查：执行 `npm run build`。
- 数据库迁移检查：在临时数据库中依次跑 `init.sql` 和 migrations。
- API 冒烟检查：注册、登录、刷新 token、创建私聊、发送消息、创建群、上传附件。
- WebSocket 冒烟检查：连接、发送消息、删除消息、输入状态、断线重连。
- 安全回归检查：未登录访问、普通用户访问 admin、封禁用户登录、TOTP 挑战、Markdown XSS。

## 推荐改进路线

如果要把 WindChat 推向稳定版本，建议按优先级推进：

1. 修复文件编码和明显语法问题，确保前后端能稳定构建。
2. 为私聊 Signal identity 变更增加用户可见的安全提示和安全码验证。
3. 设计群组密钥分发、成员变更后的密钥轮换和多端设备策略。
4. 设计端到端加密附件方案。
5. 增加后端单元测试、API 集成测试和前端构建检查。
6. 增加结构化错误处理中间件，统一错误格式和日志上下文。

## 关键 API 摘要

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/auth/config` | 获取公开配置，如 Turnstile site key。 |
| POST | `/auth/register` | 注册账号并上传公钥材料。 |
| POST | `/auth/login` | 登录，可能返回 TOTP 挑战。 |
| POST | `/auth/totp-challenge` | 完成 TOTP 登录挑战。 |
| POST | `/auth/refresh` | 使用 refresh token 换新 token。 |
| POST | `/auth/logout` | 删除 refresh token。 |
| POST | `/auth/totp/setup` | 生成 TOTP secret 和 otpauth URI。 |
| POST | `/auth/totp/verify` | 验证并启用 TOTP。 |
| POST | `/auth/totp/disable` | 密码加 TOTP 验证后关闭 TOTP。 |
| POST | `/auth/send-verification` | 发送邮箱验证码。 |
| POST | `/auth/verify-email` | 验证邮箱验证码。 |
| GET | `/users/me` | 当前用户资料。 |
| PATCH | `/users/me` | 更新显示名、头像。 |
| PATCH | `/users/me/password` | 修改密码并清理 refresh token。 |
| GET | `/users/search` | 搜索用户。 |
| GET | `/keys/:userId/bundle` | 获取用户公钥包和一个一次性预密钥。 |
| PUT | `/keys/identity` | 替换当前登录用户的 Signal identity bundle，并重置服务端 one-time prekeys。 |
| POST | `/keys/prekeys` | 上传新的一次性预密钥。 |
| PUT | `/keys/signed-prekey` | 更新 signed prekey。 |
| GET | `/conversations` | 列出我的私聊会话。 |
| POST | `/conversations` | 创建或获取私聊会话。 |
| PATCH | `/conversations/:id/ttl` | 修改私聊消息 TTL。 |
| GET | `/groups` | 列出我的群组。 |
| POST | `/groups` | 创建群组。 |
| GET | `/groups/public` | 搜索公开或密码群。 |
| POST | `/groups/:id/join` | 加入公开或密码群。 |
| GET | `/groups/:id/members` | 获取群成员。 |
| POST | `/groups/:id/invite` | 邀请成员。 |
| DELETE | `/groups/:id/members/:userId` | 踢出成员。 |
| POST | `/groups/:id/members/:userId/mute` | 禁言成员。 |
| DELETE | `/groups/:id/messages` | 清空群消息。 |
| DELETE | `/groups/:id` | 解散群组。 |
| PATCH | `/groups/:id` | 修改群设置。 |
| GET | `/messages/conversation/:id` | 获取私聊消息。 |
| GET | `/messages/group/:id` | 获取群消息。 |
| DELETE | `/messages/:id` | 删除消息。 |
| GET | `/storage` | 获取个人备忘录。 |
| PUT | `/storage` | 保存个人备忘录。 |
| POST | `/files/upload` | 上传附件。 |
| GET | `/files/url/:key` | 获取附件访问 URL。 |
| GET | `/admin/stats` | 管理统计。 |
| GET | `/admin/users` | 用户列表。 |
| POST | `/admin/users/:id/ban` | 封禁用户。 |
| POST | `/admin/users/:id/unban` | 解封用户。 |
| POST | `/admin/users/:id/role` | 修改角色，superadmin only。 |
| GET | `/admin/settings` | 获取服务设置。 |
| PATCH | `/admin/settings` | 修改服务设置。 |
| GET | `/admin/audit` | 审计日志。 |
| GET | `/health` | 健康检查和完整性状态。 |
| GET | `/integrity` | 源码完整性详细结果。 |
