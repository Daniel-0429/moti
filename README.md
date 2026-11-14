# 墨题 · 题庄每日精选

> **Vibe Coding 项目**：本项目在 AI 代理辅助下，以对话驱动的方式完成需求、实现和调试。代码以可运行、易读为目标，正式使用前建议自行审查。

一个给电纸书用的每日刷题网页。选好年级、学科和每科题量后，每天从题庄题库取题；全部答完再统一判分，逐题展示答案与解析。

界面按电纸书习惯做：宣纸底色、黑框硬边、无圆角、无动画、无外部字体和图标；前端使用 ES5 + XMLHttpRequest，不依赖现代框架，兼容较旧的 WebKit 浏览器。

后端有两套可运行的形态，共用同一份 `lib/` 逻辑：

- **Cloudflare Pages + Pages Functions（推荐）**：静态页面走全球 CDN，`/api/*` 由 Pages Functions 代理题庄；Key 存在 Cloudflare 的加密环境变量里，浏览器完全接触不到。
- **Node 本地服务**：零依赖 `server.js`，适合局域网或电纸书直连。

## 功能

- 学段：小学 1-6 年级、初中 7-9 年级、高中 1-3 年级
- 学科：按学段展示全部学科，可多选
- 教材版本：每个学科可单独选择教材版本（如人教版、北师大版、部编版），默认“不限版本”
- 知识点：每个学科可单独选择知识点（含子知识点），留空则整科出题
- 每科题量：1-10 题统一设置
- 题型：默认“选择题”（全部按钮作答）；可选“混合题型”（含填空、判断）
- 每日一套：同一天、同一设置优先使用缓存，不重复消耗题庄额度
- 答题卡、上一题/下一题、随时返回（自动保存）
- 交卷后统一判分：总分、分科正确率、错题筛选、逐题解析
- 学习档案、今日作答、历史成绩都保存在浏览器 `localStorage`
- 连续打卡天数、最近完成记录

## 如何获取题庄 Key

1. 打开题庄账户页并免费注册：

   https://tizhuang.qcscience.cc/account?mode=register

   注册后默认每天 150 题；未注册游客是 50 题 / 24 小时。

2. 登录后进入账户页，找到「Key 与接入」→「我的 Key」。

3. 在「新 Key 名称」里填一个用途，例如 `moti`，点「＋ 新建 Key」。

4. 创建后立即点「复制完整 Key」，把 Key 保存到安全的地方。

5. 把 Key 配到服务端。两种部署方式任选一种：

   **Cloudflare Pages（线上）**：在 Cloudflare Pages 项目的 `Settings → Environment variables` 里添加：

   ```ini
   TIZHUANG_API_KEY=粘贴你的Key
   TIZHUANG_MCP_URL=https://tizhuang.qcscience.cc/mcp
   ```

   把 `TIZHUANG_API_KEY` 设为 **Secret / 加密**。也可以用命令行：

   ```bash
   npx wrangler pages secret put TIZHUANG_API_KEY --project-name moti
   ```

   **Node 本地服务**：写入 `.env.local`：

   ```ini
   TIZHUANG_API_KEY=粘贴你的Key
   TIZHUANG_MCP_URL=https://tizhuang.qcscience.cc/mcp
   ```

   然后 `chmod 600 .env.local`。

6. 验证：打开 `/api/status`，看到 `"keyConfigured": true` 即配置成功。

注意事项：

- Key 等同于账户密码，只放在服务端环境变量或 `.env.local`，不要写进前端、截图或聊天记录。
- 每把 Key 可以单独「吊销」；如果泄露，立即在账户页吊销并新建一把。
- 如果之后无法再次读取完整 Key，只能新建一把并吊销旧的。
- 服务端把 Key 放进 `X-API-Key` 请求头访问 `https://tizhuang.qcscience.cc/mcp`，浏览器不会拿到 Key。

## 安全：Key 放在哪里

**Cloudflare Pages**：Key 只存在 Pages 项目的加密环境变量（Secret）里。构建产物 `public/` 中没有任何密钥；浏览器只请求同域的 `/api/paper`，由 Pages Function 在服务端加 `X-API-Key`。

**Node 本地服务**：Key 只放在本机 `.env.local`，浏览器只请求 `/api/paper`。

两种方式都不会把 Key 写进 `index.html`、`public/assets/app.js` 或任何会发给浏览器的文件。

## 部署到 Cloudflare Pages

前置：Cloudflare 账号、`npx wrangler`（或全局安装的 `wrangler`）。

### 方式一：命令行部署

```bash
# 1. 登录
npx wrangler login

# 2. 创建 Pages 项目（首次）
npx wrangler pages project create moti --production-branch main

# 3. 配置 Key（按提示粘贴，存为加密 Secret）
npx wrangler pages secret put TIZHUANG_API_KEY --project-name moti

# 4. 部署
npx wrangler pages deploy public --project-name moti
```

部署完成后会得到一个 `https://moti.pages.dev` 之类的地址。

### 方式二：连接 GitHub 自动部署

1. 打开 Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git。
2. 选择仓库 `Daniel-0429/moti`，分支 `main`。
3. 构建配置：
   - Framework preset：`None`
   - Build command：留空
   - Build output directory：`public`
4. 在 `Settings → Environment variables` 添加 `TIZHUANG_API_KEY`（加密），可选 `TIZHUANG_MCP_URL`。
5. 保存并部署。之后每次 push 到 `main` 都会自动发布。

### 可选：开启 KV 缓存（推荐）

不开 KV 也能用，但同一天同一套配置的试卷无法跨请求复用，会重复消耗题庄额度。开启后试卷缓存 14 天、教材版本缓存 7 天。

```bash
npx wrangler kv namespace create MOTI_CACHE
```

把返回的 `id` 填入 `wrangler.toml` 并取消注释：

```toml
[[kv_namespaces]]
binding = "MOTI_CACHE"
id = "你的 namespace id"
```

然后重新部署。

### 自定义域名

在 Pages 项目的 `Custom domains` 里绑定自己的域名即可；页面和接口同域，不需要额外配置 CORS。

### 保护额度

部署到公网后，任何能打开页面的人都能通过 `/api/paper` 消耗你的题庄额度。Key 本身不会泄露，但额度会被别人用掉。建议至少选一种：

- **Cloudflare Access（推荐）**：在 Zero Trust 里给 Pages 域名加一条 Access 应用，只允许自己的邮箱登录。
- **Cloudflare WAF 速率限制**：对 `/api/*` 设置每 IP 每分钟请求上限。
- 只在家里局域网用 Node 模式，不部署公网。

## 本地运行

需要 Node.js 18 或更高版本（使用内置 `fetch`）。

### Node 本地服务（局域网 / 电纸书直连）

```bash
node server.js
# 或
npm start
```

默认监听 `0.0.0.0:4173`：

- 电脑本机：`http://localhost:4173`
- 电纸书：`http://电脑局域网IP:4173`（启动日志会打印局域网地址）

如果只想本机访问，设置环境变量 `HOST=127.0.0.1`。

### 模拟 Cloudflare Pages 环境

```bash
cp .dev.vars.example .dev.vars   # 填入 Key
npx wrangler pages dev public --kv MOTI_CACHE
```

`.dev.vars` 已被 `.gitignore` 忽略，不会提交。

## 使用流程

1. 第一次打开：选学段 → 年级 → 勾选学科 → 按学科选择教材版本（可留空为不限）→ 按学科选择知识点（可留空）→ 选每科题量 → 选择题型 → 保存并开始。
2. 首页会自动取当天题目；点“开始答题”。
3. 作答过程中可以点答题卡跳题、点“返回”回首页，答案会自动保存。
4. 点“交卷”后统一判分，进入成绩页；可以“只看错题”逐题看解析。
5. 第二天打开会自动取新题；同一天重复打开使用缓存。

教材版本会随年级变化：换年级或学段后，之前选的版本会自动清空，需要重新选择。版本列表来自题庄元数据，不消耗取题额度。

知识点用关键词搜索后勾选，例如“一元一次方程”。选择的是知识树分支，会包含它的子知识点；每科最多选 10 个。换年级或学段后，已选知识点也会清空。

## 数据与额度

- 每次真正取题都会消耗题庄账户的当日额度；请求题数 = 学科数 × 每科题量。
- 教材版本列表来自题庄元数据接口，不消耗取题额度；同一学段+年级的列表会缓存 7 天。
- 知识点搜索也来自题庄元数据接口，不消耗取题额度；服务端内存缓存 30 分钟。
- 同一天、同一设置（学段/年级/学科/教材版本/知识点/题量/题型）会使用服务端试卷缓存和浏览器 `localStorage`，不会重复扣额度。
- 缓存位置：Node 模式在 `.cache/papers/`、`.cache/editions/`；Cloudflare 模式在 KV 命名空间 `MOTI_CACHE`（未绑定 KV 时退化为不缓存）。
- “今天”统一按北京时间（UTC+8）计算，避免 Cloudflare 的 UTC 时区导致跨天不一致。
- 修改设置会清空今日作答并重新取题（会再次消耗额度）。
- 首页“学习档案”里会显示最近一次取题后的剩余额度。
- Node 模式的服务端缓存保留 14 天，启动时自动清理过期文件；KV 通过 `expirationTtl` 自动过期。

## 题型与判分说明

- 选择题：按选项字母精确判分。
- 多选题：选项集合完全一致才判对。
- 判断题：统一归一化为“对/错”。
- 填空题：按文本比对，会忽略空格、全角/半角、常见标点；同一题多个空用“；”分隔时按完整答案比对。表述不同仍可能误判，电纸书打字慢时建议使用“选择题”模式。
- 数学公式：服务端把常见 LaTeX 转成上标、下标、分数、根号等基础 HTML；不加载 MathJax，保证旧浏览器可用。复杂公式的排版会简化。
- 图片：题干和选项中的题庄图片会直接显示（仅允许题庄图床域名）。

## 调试

查看题庄 MCP 工具和元数据：

```bash
node tools/mcp-probe.js
node tools/mcp-probe.js list_subjects
node tools/mcp-probe.js list_editions '{"subject_id":2,"phase_id":2,"grade_id":200}'
node tools/mcp-probe.js search_knowledge_points '{"subject_id":2,"phase_id":2,"keyword":"一元一次方程","limit":10}'
node tools/mcp-probe.js search_questions '{"subject":"数学","grade":"七年级","limit":1,"random":true,"include_solutions":true}'
```

`list_editions` 的 `phase_id`：1 小学、2 初中、3 高中。

注意：`search_questions` / `get_question` 会消耗额度，调试时请少取题。

服务端接口：

- `POST /api/paper`：取当天题目；请求体 `{stage, grade, subjects, perSubject, mode, editions?, editionNames?, knowledge?, demo?, force?}`
- `GET /api/editions?stage=junior&grade=200`：取该年级各学科的教材版本列表（元数据，不消耗额度）
- `GET /api/knowledge?stage=junior&subject=2&keyword=一元一次方程`：搜索知识点（元数据，不消耗额度；不带 keyword 返回顶层节点）
- `GET /api/status`：Key 是否配置、最近额度
- `GET /api/quota`：问题庄查询额度
- `GET /api/tools`：列出 MCP 工具（调试用）

Node 与 Cloudflare 两套部署的接口路径、请求体和返回结构完全一致。

演示模式：

- 页面地址加 `?demo=1`：不访问题庄，使用内置演示题。
- 取题失败时，首页也有“用演示题目预览”按钮。
- 演示题目会明确标注“演示题目”，不会冒充真实题库。

## 目录

```
public/index.html         页面骨架
public/assets/styles.css  电纸书风格样式
public/assets/app.js      前端逻辑（ES5）
functions/api/*.js        Cloudflare Pages Functions 路由
lib/worker.js             Pages Functions 的请求处理与 KV 缓存
lib/mcp.js                MCP Streamable HTTP 客户端（Node / Workers 通用）
lib/tizhuang.js           题庄取题、题目归一化、判分数据
lib/format.js             HTML 白名单清洗 + LaTeX 简化
lib/hash.js               纯 JS SHA-1（不依赖 Node crypto）
lib/mock.js               演示题目
server.js                 Node 本地服务（静态托管 + API + 文件缓存）
tools/mcp-probe.js        MCP 调试脚本
wrangler.toml             Cloudflare Pages 配置
.env.local                你的 Key（Node 模式，不提交）
.dev.vars                 wrangler 本地 Key（不提交）
```

## 已知限制

- 题庄返回的题目质量、题型标注和答案由题庄负责；个别题可能存在标注错误。
- 教材版本由题庄元数据提供，部分年级/学科可能没有版本数据；若所选版本在题库中没有可用题目，服务端会自动改用“不限版本”并在首页提示。
- 知识点按知识树分支匹配，会包含子知识点；若所选知识点在题库中没有可用题目，服务端会自动改用整科出题并在首页提示。
- “混合题型”里少数填空题实际把选项写在了题干中，仍会按填空处理。
- 老电纸书浏览器对 `position: fixed`、图片缩放的支持可能有差异；页面主体不依赖这些特性。
- Cloudflare 免费版 Functions 有 CPU 时间限制；本项目大部分时间在等待题庄响应，通常不受影响，但一次取很多学科时可能接近超时。
- 未绑定 KV 时 Pages 模式不缓存试卷，同一天重复打开会重复消耗题庄额度；建议按上面的步骤创建 `MOTI_CACHE`。
- 局域网内能打开页面的人都能使用这套题庄额度；如果网络环境不可信，请设置 `HOST=127.0.0.1` 或加反向代理认证。部署到公网时，建议在 Cloudflare 侧加 Access 或限流，避免额度被他人消耗。
