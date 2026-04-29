# Claude / Codex 桌面端国内镜像

国内可访问的 **Claude Desktop** 与 **Codex Desktop** 镜像站。每天自动检查官方更新，归档全部历史版本，并用 DeepSeek-V4 把官方更新说明翻译成中文。

- 🌍 部署在 Cloudflare Pages + R2，无需 ICP 备案
- 🔓 无需登录、无需 VPN
- 📦 全部安装包均**未经修改**，提供 SHA-256 与官方原始链接
- 🇨🇳 中文版本说明（DeepSeek-V4 自动翻译）
- 📅 每日 UTC 03:00（北京时间 11:00）通过 GitHub Actions 同步

## 仓库结构

```
.
├── manifest.json                # 唯一真相源（git 跟踪，更新后亦上传到 R2）
├── scripts/                     # 抓取 + 上传 + 翻译脚本
│   ├── update.ts                # 主入口
│   ├── validate.ts              # 校验 manifest 中所有 URL 与 sha256
│   ├── sources/                 # 各下载源定义
│   ├── notes/                   # 各官方 release-notes 抓取
│   └── lib/                     # http / r2 / sha / version / translate
├── site/                        # Astro 静态站
└── .github/workflows/
    └── daily-update.yml         # 每日 cron
```

## 镜像的源

| App | 平台 | 来源 |
| --- | --- | --- |
| Claude Desktop | macOS | `https://claude.ai/download/claude/mac` |
| Claude Desktop | Windows | `https://claude.ai/download/claude/windows` |
| Codex Desktop | macOS · Apple Silicon | `https://persistent.oaistatic.com/codex-app-prod/Codex.dmg` |
| Codex Desktop | macOS · Intel | `https://persistent.oaistatic.com/codex-app-prod/Codex-latest-x64.dmg` |
| Codex Desktop | Windows | 仅 Microsoft Store，引导跳转，不镜像 MSIX |

## 部署一次性配置

### 1. Cloudflare R2

1. 在 Cloudflare 控制台创建一个 R2 bucket（例如 `claude-codex-mirror`）。
2. 在 bucket 设置中**启用公共访问**，绑定一个自定义域名（例如 `dl.your-domain.com`）。
3. 在 "R2 → Manage R2 API tokens" 创建一个仅对该 bucket 有 `Object Read & Write` 权限的 Token，记下 `Access Key ID` 与 `Secret Access Key`。
4. 记下你的 `Account ID`（控制台首页右下角）。

### 2. Cloudflare Pages（前端）

1. 在 Cloudflare Pages 中以本仓库创建一个新项目。
2. 构建配置：
   - Root directory: `site`
   - Build command: `npm install && npm run build`
   - Output directory: `dist`
3. 项目创建后到 "Settings → Builds & deployments → Deploy hooks" 创建一个 webhook，复制 URL。

### 3. DeepSeek API

到 <https://platform.deepseek.com> 申请 API key。

### 4. GitHub Secrets

在仓库 Settings → Secrets and variables → Actions 中配置：

| 名称 | 值 |
| --- | --- |
| `R2_ACCOUNT_ID` | Cloudflare 账号 ID |
| `R2_ACCESS_KEY_ID` | R2 Token 的 Access Key |
| `R2_SECRET_ACCESS_KEY` | R2 Token 的 Secret Key |
| `R2_BUCKET` | bucket 名称（如 `claude-codex-mirror`） |
| `R2_PUBLIC_BASE_URL` | bucket 自定义域名（如 `https://dl.your-domain.com`） |
| `DEEPSEEK_API_KEY` | DeepSeek API key |
| `CF_PAGES_DEPLOY_HOOK` | Pages Deploy Hook URL |

## 本地开发

```bash
# 安装依赖
npm install
npm --prefix site install

# 干跑（只探测，不下载、不上传、不翻译）
npm run update -- --dry-run

# 真正执行一次（需要配置好 R2 + DeepSeek 环境变量；建议先 export 到 shell 或写 .env）
npm run update

# 强制重新下载某一个 source
npm run update -- --force --only codex-mac-arm

# 校验 manifest 中所有 URL 是否仍可访问、大小是否一致
npm run validate

# 启动前端预览
npm run site:dev
```

环境变量也可以放进 `.env`（被 `.gitignore` 忽略），用 `node --env-file=.env scripts/update.ts` 调用。

## 端到端验证

1. `npm run update -- --dry-run` —— 看到 4 个 source 都成功探测到大小与文件名。
2. `npm run update` —— manifest.json 出现新版本条目，R2 bucket 中能看到 `claude-desktop/...` 与 `codex-desktop/...` 路径下的文件。
3. `npm run validate` —— 所有 URL HEAD 请求 200 且大小一致。
4. `npm run site:dev` —— 浏览 <http://localhost:4321> 看到首页两张卡片，点击进入版本详情页能看到中文 release notes 与下载按钮。
5. 在 GitHub Actions 手动触发一次 `Daily Update` workflow，观察日志、commit、Pages 自动重建。

## 常见问题

**Q: 在本地跑 `npm run update` 时 Claude 那两个源连接被 reset / 重定向到 `app-unavailable-in-region`？**  
A: Anthropic 对中国大陆等受限地区做了**地域屏蔽**。GitHub Actions 跑在 Azure 美国 IP 段，是被允许的。本地调试时如需复现完整链路，可在 GH Actions 上手动触发 workflow（`Actions → Daily Update → Run workflow`）。

**Q: Anthropic 改了下载 URL 怎么办？**  
A: 修改 `scripts/sources/claude.ts` 里的 `startUrl`。`scripts/lib/http.ts` 默认会跟随 5 层 302。

**Q: Codex 的版本说明经常缺失？**  
A: OpenAI 没有结构化的 release notes。当前从 `developers.openai.com/codex/app` 抓 "What's new" 段落；缺失时前端会显示"官方未发布该版本的更新说明"。如果未来 OpenAI 发布了官方 changelog，更新 `scripts/notes/codex.ts` 即可。

**Q: 国内访问 Cloudflare 慢怎么办？**  
A: 可以在已备案的国内域名上挂一个阿里云 / 腾讯云 CDN，回源到 R2 自定义域名（仅缓存，不持久化）。`R2_PUBLIC_BASE_URL` 改成国内 CDN 域名即可，无需改其他代码。

**Q: 历史版本占用多少存储？**  
A: 每个安装包 150-300MB，按每周一更估算，年增量约 30-60GB。R2 存储 $0.015/GB/月，全年约 $0.5-1。

## 法律与免责

- 本站仅再分发**未经修改**的官方安装包，不提供任何破解、篡改或二次封装。
- 全部文件均在页面显示 **官方原始 URL** 与 **SHA-256 校验值**，用户可自行核验。
- Anthropic、OpenAI 商标归原厂所有；如收到任何一方的下架请求，本站将立即响应。
