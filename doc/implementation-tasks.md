# Solobase 实施任务清单

> 基于 `data-infra-design.md` v4（2026-04-13）拆解  
> 状态：[ ] 待做 · [~] 进行中 · [x] 完成  
> 当前分支：demo/bento-concept

---

## 当前状态快照

| 层 | 现状 | 设计目标 |
|----|------|---------|
| 数据存储 | JSON 文件（pipeline_output.json 22.5MB、feed.json 410KB） | Turso (libSQL/SQLite) + Drizzle ORM |
| 爬取 | ✅ 4 个 crawler 已实现（Jike/V2EX/Linux.do/PH） | 不变，加 launchd 调度 |
| Pipeline | ✅ `scripts/pipeline/run.ts` 已实现（标准化→过滤→输出） | 迁移到 DB 写入 |
| LLM 处理 | ❌ 无 Enrichment Agent | Pass 1 (Haiku) + Pass 2 (Sonnet) |
| Editorial | ❌ 无审核流 | 飞书卡片 → /admin |
| 发布 | `build-feed.ts` 读 JSON → feed.json | 读 DB publish_status=published |
| 原生输入 | `/api/submit` 写文件，无 AI | AI Intake Engine |
| 认领 | ❌ 无 | /claim/[slug] + verify agent |
| 调度 | 手动触发 | launchd + Vercel Cron |

**积压数据量**：pipeline_output.json 含 ~4188 条待处理记录（爬取已完成，LLM 尚未跑）

---

## Phase 1：数据库迁移（3-5 天）

> **完成标志**：所有数据在 Turso，`(source, source_id)` 唯一约束验证通过，build-feed 从 DB 读取

### 1.1 安装依赖 + 初始化

```bash
pnpm add @libsql/client drizzle-orm
pnpm add -D drizzle-kit
```

- [ ] 创建 Turso 数据库：`turso db create solobase`（本地开发暂用 file:./local.db）
- [x] 配置 `.env.local`：`ONE_API_BASE_URL`、`ONE_API_KEY`、`DATABASE_URL_LOCAL`
- [x] 创建 `db/client.ts`（本地/远程自动切换）
- [x] 创建 `drizzle.config.ts`

**完成条件**：`npx drizzle-kit studio` 能连上并显示空库

---

### 1.2 实现 normalizeUrl 工具函数

- [x] 创建 `scripts/utils/normalize-url.ts`（三个边缘用例验证通过）

**完成条件**：函数对以上三个用例输出正确结果

---

### 1.3 Drizzle Schema 建表

- [x] 创建 `db/schema.ts`（15 张表，含 relations() 声明）
  - content_items · projects（含 `urlNormalized`）· makers
  - junction tables · inference_runs · editorial_actions
  - submissions · maker_auth · product_updates
  - embeddings · dedup_candidates · media_cache
- [ ] projects 表补充 `urlStatus` + `urlLastChecked` 字段（v4 新增，见 data-infra-design.md 5.2）
  - `urlStatus text default 'unknown'`  // unknown | live | unreachable | dead
  - `urlLastChecked integer (timestamp)`
- [x] 运行迁移，`UNIQUE ON (source, source_id)` 约束验证通过

**完成条件**：`drizzle-kit studio` 显示所有表，重复 migrate 不报错

---

### 1.4 迁移脚本：pipeline_output.json → Turso

- [x] 创建并运行 `scripts/migrate/from-json.ts`
  - 4188 条 content_items 迁移完成，幂等验证通过
  - feed.json 中的 129 条 projects 也已迁移（已重置为 unpublished，从零开始新架构）

**完成条件**：二次运行幂等，content_items 总数与 pipeline_output.json 行数一致 ✅

---

### 1.5 build-feed.ts 切换数据源

- [x] 修改 `scripts/build-feed.ts`：新增 `--from-db` flag，从 DB 读取；DB 为空时 fallback JSON

**完成条件**：运行 `build-feed.ts --from-db` 能生成结构一致的输出 ✅

---

### 1.6 launchd 调度配置

- [ ] 创建 `~/Library/LaunchAgents/co.solobase.pipeline.plist`（内容见 data-infra-design.md 十一章）
- [ ] 加载：`launchctl load ~/Library/LaunchAgents/co.solobase.pipeline.plist`
- [ ] 验证：`launchctl list | grep solobase`

**完成条件**：plist 加载成功，能触发 `npm run pipeline:daily`

---

## Phase 2：LLM 处理层（3-5 天）

> **完成标志**：inferred_type 覆盖率 100%，override_rate 可计算

### 2.1 one-api 配置

- [x] 创建 `scripts/config/ai.ts`（one-api 路由，Haiku + Sonnet 均已验证可达）

**完成条件**：两个模型各返回一次正确响应 ✅

---

### 2.2 Enrichment Agent — Pass 1（Haiku，分类+提取）

- [x] 创建 `scripts/agents/enrich.ts`
  - 确定性噪声过滤（5条规则）+ Pass 1（Haiku, tool_use + Zod）+ Pass 2（Sonnet）
  - 关键修复：inferredProductStage 使用 `.catch(null)` 兼容 LLM 越界枚举值
  - import.meta.url 防止模块副作用（主函数不在 import 时执行）

**完成条件**：50条样本测试通过，include/exclude/review 分类质量确认 ✅

---

### 2.3 Enrichment Agent — Pass 2（Sonnet，编辑摘要）

- [x] 在 enrich.ts 内实现（仅 rec=include/review 触发，Pass 2 失败降级不阻塞）

**完成条件**：rec=include 的记录有 editorialSummary ✅

---

### 2.4 去重候选检测（Phase 1 Deterministic）

- [x] 在 enrich.ts Step 5 实现（normalizeUrl 精确匹配 → dedup_candidates）

**完成条件**：已知重复产品被写入 dedup_candidates ✅

---

### 2.5 冷启动全量处理

- [x] 创建 `scripts/migrate/enrich-all.ts`（并发 3，`--limit=N` 预览，断点续跑）
- [~] 冷启动处理中：~179/4320 已完成，50条样本质量确认 OK，待继续跑完剩余

```bash
npx tsx scripts/migrate/enrich-all.ts          # 全量（~4132 条待处理）
npx tsx scripts/migrate/enrich-all.ts --limit=50  # 预览用
```

**完成条件**：llmProcessedAt 覆盖率 100%，error_rate < 5%

---

### 2.6 媒体富化（enrich-media）

> **前置**：2.5 冷启动完成后执行

- [ ] 创建 `scripts/agents/enrich-media.ts`（对所有 `media IS NULL` 的记录补图）
- [ ] 三级优先级（见 data-infra-design.md 6.3）：
  1. `media_raw[0]`（帖子原图，已有，质量最高）
  2. OG Image 抓取（`fetch` + 解析 `<meta property="og:image">`，存 `media_cache`）
  3. Microlink 截图（仅 `editorial_rec=include` 记录，节省配额）
- [ ] 写 `content_items.media` + `content_items.mediaSource`（`post_image` / `og_image` / `screenshot`）
- [ ] 写 `media_cache` 表（防止重复请求同一 URL，7 天冷却）
- [ ] 统计：各级来源命中数量，无图（TextCard 降级）数量

```bash
npx tsx scripts/agents/enrich-media.ts
# 预期：帖子原图 ~40%，OG image ~35%，无图 ~25%
```

**完成条件**：include 类内容的 media 覆盖率 > 70%

---

## Phase 3：Editorial Workflow（3-5 天）

> **完成标志**：飞书卡片驱动日常审核，editorial 决策写回 DB

### 3.1 飞书 Interactive Card Bot

- [ ] 在飞书开放平台创建应用，配置 Bot + Interactive Card 权限
- [ ] 配置 `.env.local`：`FEISHU_APP_ID`, `FEISHU_APP_SECRET`, `FEISHU_CHAT_ID`
- [ ] 创建 `src/app/api/feishu/callback/route.ts`（接收按钮回调）
  - 验证飞书签名
  - 解析 action（approve_publish / approve_hold / skip）
  - 写 DB：`review_status`, `publish_status`, `editorial_actions`
  - 触发 Publisher Agent

**卡片三态按钮**：
- `[✓ 收录发布]` → `review_status=approved, publish_status=published`
- `[✓ 收录不发布]` → `review_status=approved, publish_status=unpublished`
- `[✗ 跳过]` → `review_status=rejected`

**完成条件**：点击飞书卡片按钮，DB 状态正确更新

---

### 3.2 Editorial Digest Agent

- [ ] 创建 `scripts/agents/digest.ts`
- [ ] 查询逻辑（优先级排序，见 data-infra-design.md 9.1）：
  1. native_submitted / maker_verified 内容（最高）
  2. rec=include + conf≥0.85
  3. rec=include + conf<0.85
  4. rec=review
  5. rec=exclude（折叠）
- [ ] 生成日报文本 + 卡片批次（按优先级顺序）
- [ ] 调用飞书 API 发送

**完成条件**：本地运行 `npx tsx scripts/agents/digest.ts`，飞书收到日报

---

### 3.3 Publisher Agent（增量 build）

- [ ] 创建 `scripts/agents/publisher.ts`
- [ ] 查询新发布记录（`published_at_editorial > last_build_time`）
- [ ] 增量更新 `data/feed.json`（合并新记录，不全量重跑）
- [ ] 记录 `last_build_time` 到 `data/.build-state.json`

**完成条件**：审核一条记录后 feed.json 在 2 秒内更新

---

### 3.4 Vercel Cron 配置

- [ ] 创建/修改 `vercel.json`：
  ```json
  {
    "crons": [
      { "path": "/api/cron/digest",        "schedule": "0 23 * * *" },
      { "path": "/api/cron/weekly-review", "schedule": "0 1 * * MON" }
    ]
  }
  ```
- [ ] 创建 `src/app/api/cron/digest/route.ts`（调用 digest agent）
- [ ] 创建 `src/app/api/cron/weekly-review/route.ts`（WeeklyMetrics 计算 + 飞书周报）
- [ ] 配置 `CRON_SECRET` 防止非 Vercel 调用

**完成条件**：deploy 后 Vercel Dashboard 显示 cron 任务，每日 07:00 北京时间飞书收到日报

---

## Phase 4：原生输入层（1 周）

> **完成标志**：第一个 maker 通过 /submit 提交产品并成功发布

> **前置**：Phase 1 已完成（submissions/makerAuth 表存在）

### 4.1 AI Intake Engine

- [ ] 创建 `src/app/api/intake/route.ts`（三个 action，见 data-infra-design.md 7.2）
  - `analyze_url`：Jina Reader + Microlink + dedup 检查 + LLM 提取
  - `analyze_story`：LLM 故事分析（Sonnet）
  - `confirm_submission`：写 submissions + 触发轻审核
- [ ] 轻审核逻辑（native_submitted 四项检查，见 7.3 节）
  - 通过 → `review_status=approved, publish_status=published`（自动入 feed）
  - 不通过 → 进编辑队列优先处理

**完成条件**：PostMan 测试三个 action 全部返回正确结构

---

### 4.2 /submit 产品提交流

- [ ] 创建 `src/app/submit/page.tsx`（三步流程）
  - Step 1：URL 输入框 → 调用 `analyze_url` → 显示预填充结果
  - Step 2：故事输入区（「你为什么做这个？」）→ 调用 `analyze_story` → AI 实时结构化
  - Step 3：确认页 → Maker 可修改任意字段 → `confirm_submission`
- [ ] makerOverrides 追踪：记录 maker 修改了哪些 AI 预填充字段

**完成条件**：从 URL 到确认提交全流程走通，submissions 表有新记录

---

### 4.3 Magic Link 邮件发送

- [ ] 集成 Resend（或 Nodemailer + SMTP）
- [ ] 配置 `.env.local`：`RESEND_API_KEY`
- [ ] 创建 `src/lib/magic-link.ts`：生成 token + 发送邮件 + 验证 token
- [ ] 邮件模板：简洁，附产品名称和登录链接

**完成条件**：输入邮箱，60 秒内收到 magic link，点击后可继续操作

---

### 4.4 /submit/post 经验帖写作（可与 4.2 并行）

- [ ] 创建 `src/app/submit/post/page.tsx`
- [ ] 自由输入区 + AI 实时提示（识别内容类型、询问补充信息、生成标题候选）
- [ ] 写入 submissions（type=post_write）→ content_items（source=native）

---

## Phase 5：认领流（3-5 天）

> **完成标志**：第一个认领完成，trust_level=maker_verified

### 5.1 /admin/claims 界面（Path A 主控）

- [ ] 创建 `src/app/admin/claims/page.tsx`
- [ ] 列表：所有 submissions WHERE type='claim_request'，显示状态（见 data-infra-design.md 8.3）
- [ ] 操作：
  - 「发送新邀请」→ 生成 claimInviteToken（7 天有效）+ 复制链接
  - 「标记核实」→ `makers.wechatVerified=true` + 填写备注
  - 「轻审批」（Path B）→ trust_level 升级为 maker_verified

**完成条件**：编辑能在界面生成邀请链接并看到认领状态

---

### 5.2 /claim/[slug] 认领页

- [ ] 创建 `src/app/claim/[slug]/page.tsx`
- [ ] Path A（有 invite token）：验证 token 有效期 → 展示产品现有信息（爬取来源）→ 进入认领流程
- [ ] Path B（无 token）：展示自助申请表单（见 data-infra-design.md 8.4）
- [ ] TokenExpiredPage：token 过期时展示"请联系编辑重新发送链接"

**完成条件**：有效 token 下展示正确产品信息，过期 token 展示过期提示

---

### 5.3 认领完成后端

- [ ] 创建 `src/app/api/claim/complete/route.ts`（见 data-infra-design.md 8.2）
  - 验证 token
  - 发送 magic link
  - 更新 submission 状态
  - upsertMaker + projectMakerLinks
  - 升级 trust_level → maker_verified
  - 写 editorial_actions（action=claim_approve）
  - 飞书通知

**完成条件**：完整走通 Path A 认领流程，projects.trustLevel 变为 maker_verified

---

### 5.4 verify-claim Agent（Path B 自动轮询）

- [ ] 创建 `scripts/agents/verify-claim.ts`（每 10 分钟）
- [ ] 三种验证实现（类型安全，无 as any）：
  - `domain_txt`：DNS TXT 记录查询
  - `github_file`：raw.githubusercontent.com 请求
  - `jike_bio`：即刻公开 profile HTML 抓取
- [ ] 重复认领防护：同一 targetProjectId 已有 confirmed 认领时跳过并通知
- [ ] 验证通过后：trust_level → native_submitted + 飞书「待审批」通知

**完成条件**：Path B 三种验证方式各通过一次测试

---

### 5.5 字段写权限实现（native_submitted patch 流）

> 对应 data-infra-design.md 7.4 节的映射表

- [ ] native_submitted maker 修改字段 → 写入 `submissions.makerOverrides`，**不直接写 projects 表**
- [ ] 编辑轻审批通过 → merge makerOverrides 到 projects 对应字段
- [ ] maker_verified 直接写 projects，但过滤 editorial 专属字段（featuredInsight, editorNotes, is_editors_pick）

**完成条件**：native_submitted maker 的修改在编辑审批前不影响 feed 展示

---

## Phase 6：可观测 + /admin（1 周）

> **完成标志**：override_rate 稳定 10-25%，每周收到 metrics 报告

### 6.1 WeeklyMetrics 实现

- [ ] 创建 `scripts/agents/weekly-review.ts`
- [ ] 计算所有 WeeklyMetrics 字段（见 data-infra-design.md 十二章）
- [ ] override_rate > 25% 时附带 prompt 优化建议

**完成条件**：本地运行输出完整 metrics JSON

---

### 6.2 Next.js /admin 主界面

- [ ] 创建 `src/app/admin/page.tsx`（Inbox 风格）
- [ ] 键盘快捷键：j/k（上下），y（approve+publish），u（approve+hold），n（reject），e（编辑备注）
- [ ] 卡片显示：优先级排序 + 颜色标记（深绿/浅绿/黄/灰）
- [ ] 环境变量密码保护（middleware.ts）

---

### 6.3 /admin/dedup 去重确认

- [ ] 创建 `src/app/admin/dedup/page.tsx`
- [ ] 列表：dedup_candidates WHERE status='pending'
- [ ] 操作：merge（合并两个实体）/ dismiss（确认是不同产品）/ split（撤销误合并）
- [ ] merge 操作写 editorial_actions（可回退）

---

### 6.4 URL 健康检测 Agent

- [ ] 创建 `scripts/agents/url-health.ts`（每周日凌晨运行）
- [ ] 对所有 `projects WHERE entity_status IN ('active','unreachable')` 做 HEAD 请求
- [ ] 状态流转：
  - 2xx/3xx → `url_status=live`，entity_status 恢复 active
  - 失败 → 失败计数 +1；连续 ≥3 次 → `url_status=unreachable`，`entity_status=unreachable`
  - unreachable ≥30 天 → 检查 Wayback Machine；无近期存档 → `url_status=dead`
- [ ] 写 `projects.urlLastChecked`
- [ ] 飞书周报附带：新增失联 N 个、恢复 M 个
- [ ] launchd plist 或 Vercel Cron 调度（每周日 00:00）

**完成条件**：跑一次后 projects 的 urlStatus 字段有值，失联产品被正确标记

---

## Phase 7：产品快速更新（Phase 5 后）

- [ ] 产品详情页「发布更新」入口（仅 maker_verified 可见）
- [ ] ProductUpdates 时间线展示
- [ ] 快速更新自动更新 `project.stage` 和 metrics
- [ ] 零审核直接发布（product_updates 表，不经过 submissions 流）

---

## Phase 8-10（延迟决策）

| Phase | 触发条件 | 主要工作 |
|-------|---------|---------|
| 8：向量富化 | feed 产品数 > 500，数据质量稳定 | 全量 embedding + sqlite-vec + AI 推荐排序 |
| 9：MCP Server | Phase 8 完成 | @modelcontextprotocol/sdk，语义搜索 API |
| 10：原生主导 | maker 贡献 > 爬取 | 爬取降级为发现机制，主体转向 maker 直贡 |

---

## 依赖关系图

```
Phase 1（DB 迁移）
  └─ Phase 2（LLM 处理）
       └─ Phase 3（Editorial Workflow）
            ├─ Phase 4（原生输入，可与 3 并行）
            │    └─ Phase 7（产品快速更新）
            └─ Phase 5（认领流，可与 4 并行）
                 └─ Phase 6（/admin + 可观测）
                      └─ Phase 8（向量富化）
                           └─ Phase 9（MCP）
```

**可并行**：Phase 4 和 Phase 5 在 Phase 3 完成后可同时推进（各自独立的路由和流程）

---

## 附录 A：新增文件清单（按 Phase）

| Phase | 文件 | 说明 |
|-------|------|------|
| 1 | `db/client.ts` | Turso/libSQL 连接 |
| 1 | `db/schema.ts` | 完整 Drizzle schema |
| 1 | `drizzle.config.ts` | drizzle-kit 配置 |
| 1 | `scripts/utils/normalize-url.ts` | URL 规范化工具 |
| 1 | `scripts/migrate/from-json.ts` | JSON → DB 迁移 |
| 2 | `scripts/config/ai.ts` | one-api 模型配置 |
| 2 | `scripts/agents/enrich.ts` | Enrichment Agent |
| 2 | `scripts/migrate/enrich-all.ts` | 冷启动全量 LLM 处理 |
| 3 | `src/app/api/feishu/callback/route.ts` | 飞书按钮回调 |
| 3 | `scripts/agents/digest.ts` | 日报 Agent |
| 3 | `scripts/agents/publisher.ts` | 增量 build Agent |
| 3 | `src/app/api/cron/digest/route.ts` | Vercel Cron 端点 |
| 3 | `src/app/api/cron/weekly-review/route.ts` | Vercel Cron 端点 |
| 4 | `src/app/api/intake/route.ts` | AI Intake Engine |
| 4 | `src/app/submit/page.tsx` | 产品提交流 |
| 4 | `src/app/submit/post/page.tsx` | 经验帖写作 |
| 4 | `src/lib/magic-link.ts` | Magic link 工具 |
| 5 | `src/app/admin/claims/page.tsx` | 认领管理界面 |
| 5 | `src/app/claim/[slug]/page.tsx` | 认领页 |
| 5 | `src/app/api/claim/complete/route.ts` | 认领完成 API |
| 5 | `scripts/agents/verify-claim.ts` | Path B 验证轮询 |
| 6 | `src/app/admin/page.tsx` | /admin 主界面 |
| 6 | `src/app/admin/dedup/page.tsx` | 去重确认界面 |
| 6 | `scripts/agents/weekly-review.ts` | 周报 Agent |

---

## 附录 B：环境变量汇总

```bash
# Turso
DATABASE_URL=libsql://solobase-xxx.turso.io
DATABASE_AUTH_TOKEN=xxx
DATABASE_URL_LOCAL=file:./local.db

# AI（one-api 中转）
ONE_API_BASE_URL=https://xxx
ONE_API_KEY=sk-xxx

# 飞书
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_CHAT_ID=oc_xxx

# 邮件（Resend）
RESEND_API_KEY=re_xxx
MAGIC_LINK_BASE_URL=https://solobase.co

# 安全
CRON_SECRET=xxx           # Vercel Cron 保护
ADMIN_PASSWORD=xxx         # /admin 密码保护

# 现有（保留）
JIKE_COOKIE=xxx
PH_API_TOKEN=xxx
FEISHU_WEBHOOK=xxx
```
