# WindChat 发布检查清单

这份清单用于发布前最后确认。它不替代开发指南，只记录上线前必须跑的检查和必须替换的配置。

## 必须替换的环境变量

服务暴露到公网或真实用户前，先替换 `.env` 里的占位密钥：

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `ADMIN_SECRET`
- 使用 MinIO 时替换 `MINIO_ROOT_PASSWORD`
- 使用 MinIO 或外部 S3 时替换 `S3_SECRET_KEY`

JWT 和管理密钥建议使用足够长的随机值。本机可用下面的 PowerShell 命令生成：

```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

公网部署还需要确认：

- `NODE_ENV=production`
- `CORS_ORIGIN` 设置为实际访问域名，不依赖默认的 `*`
- 域名和 TLS 由外层反向代理或负载均衡处理
- 需要防机器人时配置 `TURNSTILE_SECRET_KEY`
- 需要邮箱验证时配置 `SMTP_HOST`、`SMTP_USER`、`SMTP_PASS` 和 `SMTP_FROM`

## 构建和依赖检查

在仓库根目录运行：

```powershell
docker compose config --quiet
```

后端检查：

```powershell
cd backend
npm audit --omit=dev --registry=https://registry.npmjs.org
$files = Get-ChildItem -Path src -Recurse -Filter *.js
foreach ($file in $files) { node --check $file.FullName }
```

前端检查：

```powershell
cd frontend
npm audit --omit=dev --registry=https://registry.npmjs.org
npm run build
```

前端构建目前可能出现这些警告：Signal 依赖里的 `path`/`fs` 被 Vite 标记为浏览器兼容外部模块、`qrcode.react` 同时被静态和动态导入、主 chunk 超过 500 kB。只要生产构建成功、浏览器冒烟测试通过，这些不是发布阻塞项。

完整 `npm audit` 会报告 Vite/esbuild 的开发服务器相关告警。该问题影响开发服务器暴露场景，不影响 `npm run build` 生成的静态产物；后续可以单独安排 Vite 大版本升级。

## Docker 冒烟测试

重建并启动：

```powershell
docker compose up -d --build
```

检查服务状态：

```powershell
docker compose ps
curl.exe -sS -f http://localhost/api/health
curl.exe -sS -f -I http://localhost/
```

服务稳定后查看最近日志：

```powershell
docker compose logs --since=5m backend nginx
```

容器重建期间，如果浏览器正在自动重连 WebSocket，nginx 可能短暂记录 upstream connection refused。所有容器健康后仍持续出现的错误才应视为发布阻塞项。

## 手动产品冒烟测试

发布前至少在浏览器里走一遍：

- 两个用户注册、登录。
- 创建或打开私聊。
- 双方互发私聊文本，确认 Signal 加密消息可收发。
- 上传并发送图片或文件，确认不需要刷新页面。
- 接收方可以预览或下载附件。
- 双方刷新页面后，最近消息仍能正常渲染。
- 创建群组并发送群消息。
- 管理后台的用户、设置、审计日志和完整性页面能正常打开。

## 当前发布说明

- 私聊文本已经在浏览器中使用 Signal Protocol 会话加密。
- 群聊文本、附件内容和个人备忘录已在浏览器端加密；服务端仍可见必要路由和存储元数据。
- Signal 私钥材料、群 key、备忘录 key 和会话状态保存在浏览器 localStorage，并通过用户密码加密后的 vault 做恢复备份。换浏览器或清空本地存储且无法解开 vault 时，旧会话可能需要重新建立。
- 项目目前还没有自动化测试套件，所以发布前的手动冒烟测试仍然必要。
