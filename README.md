# 墨题 · 题庄每日精选

一个给电纸书用的每日刷题网页。选好年级、学科和每科题量后，每天从题庄题库取题；全部答完再统一判分，逐题展示答案与解析。

界面按电纸书习惯做：宣纸底色、黑框硬边、无圆角、无动画、无外部字体和图标；前端使用 ES5 + XMLHttpRequest，不依赖现代框架，兼容较旧的 WebKit 浏览器。

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

## 安全：Key 放在哪里

Key 只放在服务器本机文件里，浏览器永远拿不到：

```
/home/Daniel/workspace/opencode/ink-tizhuang/.env.local
```

内容：

```ini
TIZHUANG_API_KEY=你的题庄Key
TIZHUANG_MCP_URL=https://tizhuang.qcscience.cc/mcp
```

这个文件已经设置为 `600` 权限，并写入 `.gitignore`。前端只请求本机的 `/api/paper`，由 `server.js` 在服务端加上 `X-API-Key` 去问题庄 MCP。

> 不要把 Key 写进 `index.html`、`assets/app.js` 或任何会发给浏览器的文件。

## 启动

需要 Node.js 18 或更高版本（使用内置 `fetch`）。

```bash
cd /home/Daniel/workspace/opencode/ink-tizhuang
node server.js
# 或
npm start
```

默认监听 `0.0.0.0:4173`：

- 电脑本机：`http://localhost:4173`
- 电纸书：`http://电脑局域网IP:4173`（启动日志会打印局域网地址）

如果只想本机访问，设置环境变量 `HOST=127.0.0.1`。

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
- 教材版本列表来自题庄元数据接口，不消耗取题额度；同一学段+年级的列表会在服务器 `.cache/editions/` 缓存 7 天。
- 知识点搜索也来自题庄元数据接口，不消耗取题额度；服务端内存缓存 30 分钟。
- 同一天、同一设置（学段/年级/学科/教材版本/知识点/题量/题型）会使用服务器 `.cache/papers/` 和浏览器 `localStorage` 缓存，不会重复扣额度。
- 修改设置会清空今日作答并重新取题（会再次消耗额度）。
- 首页“学习档案”里会显示最近一次取题后的剩余额度。
- 服务器缓存保留 14 天，启动时自动清理过期文件。

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

演示模式：

- 页面地址加 `?demo=1`：不访问题庄，使用内置演示题。
- 取题失败时，首页也有“用演示题目预览”按钮。
- 演示题目会明确标注“演示题目”，不会冒充真实题库。

## 目录

```
index.html            页面骨架
assets/styles.css     电纸书风格样式
assets/app.js         前端逻辑（ES5）
server.js             静态服务 + 题庄 MCP 代理 + 缓存
lib/mcp.js            MCP Streamable HTTP 客户端
lib/tizhuang.js       题庄取题、题目归一化、判分数据
lib/format.js         HTML 白名单清洗 + LaTeX 简化
lib/mock.js           演示题目
tools/mcp-probe.js    MCP 调试脚本
.env.local            你的 Key（不提交）
```

## 已知限制

- 题庄返回的题目质量、题型标注和答案由题庄负责；个别题可能存在标注错误。
- 教材版本由题庄元数据提供，部分年级/学科可能没有版本数据；若所选版本在题库中没有可用题目，服务端会自动改用“不限版本”并在首页提示。
- 知识点按知识树分支匹配，会包含子知识点；若所选知识点在题库中没有可用题目，服务端会自动改用整科出题并在首页提示。
- “混合题型”里少数填空题实际把选项写在了题干中，仍会按填空处理。
- 老电纸书浏览器对 `position: fixed`、图片缩放的支持可能有差异；页面主体不依赖这些特性。
- 局域网内能打开页面的人都能使用这套题庄额度；如果网络环境不可信，请设置 `HOST=127.0.0.1` 或加反向代理认证。
