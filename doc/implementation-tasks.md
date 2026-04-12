# Solobase 实施任务清单

> 基于 `data-infra-design.md` v4（2026-04-13）拆解  
> 状态：[ ] 待做 · [~] 进行中 · [x] 完成  
> 当前分支：demo/bento-concept  
> 最后同步：2026-04-13

---

## 当前状态快照（2026-04-13 实际）

| 层 | 现状 |
|----|------|
| 数据存储 | ✅ libSQL/SQLite (local.db)，Drizzle ORM，15 张表 |
| 爬取 | ✅ 4 个 crawler（Jike/V2EX/Linux.do/PH），4188 条 content_items |
| LLM 处理 | ✅ 3352/4188 enriched，836 噪声归档 |
| 分类分布 | include: 264 · review: 199 · exclude: 981 |
| 媒体 | [~] 414/3352 已补图（12%），enrich-media 重跑中 |
| Editorial API | ✅ /api/editorial/action，7 种操作，reject/archive 也触发 feed 重建 |
| Admin UI | ✅ 五视图统一后台（待审核/已发布/已跳过/归档/去重） |
| Digest | ✅ scripts/agents/digest.ts，飞书发送验证通过 |
| Publisher | ✅ scripts/agents/publisher.ts，feed.json 重建 |
| Vercel Cron | ✅ vercel.json + /api/cron/digest/route.ts |
| 鉴权 | ✅ middleware.ts 保护 /admin + /api/admin + /api/editorial |
| Submit | ✅ AI prefill + DB 写入验证通过 |
| 生产数据库 | ❌ 仍是 local.db，未创建 Turso 云实例 |
| 飞书 Bot | ✅ credentials 已配，日报发送成功 |

---

## Phase 1：数据库迁移 ✅（基本完成）

### 1.1 安装依赖 + 初始化
- [x] 配置 `.env.local`
- [x] 创建 `db/client.ts`
- [x] 创建 `drizzle.config.ts`
- [ ] **Turso 云实例**：`turso db create solobase`（目前仍用 file:./local.db，上线前必须）

### 1.2 normalizeUrl 工具函数
- [x] `scripts/utils/normalize-url.ts`

### 1.3 Drizzle Schema
- [x] `db/schema.ts`（15 张表，relations 完整）
- [x] projects 表已有 `urlStatus` + `urlLastChecked`（DB 已迁移）

### 1.4 数据迁移
- [x] `scripts/migrate/from-json.ts`（4188 条 content_items，幂等）

### 1.5 build-feed 切换
- [x] `scripts/build-feed.ts --from-db`

### 1.6 launchd 调度
- [ ] `~/Library/LaunchAgents/co.solobase.pipeline.plist`（每日 pipeline 触发）

---

## Phase 2：LLM 处理层 ✅（基本完成）

### 2.1 one-api 配置
- [x] `scripts/config/ai.ts`（Haiku + Sonnet 均验证可达）

### 2.2-2.4 Enrichment Agent
- [x] `scripts/agents/enrich.ts`（Pass 1 Haiku + Pass 2 Sonnet + 去重检测）
- [x] 确定性噪声过滤（5 条规则）
- [x] `dedup_candidates` 写入

### 2.5 冷启动全量处理
- [x] `scripts/migrate/enrich-all.ts`（并发 3，断点续跑）
- [x] 3351/4188 已处理（99.98%），include:139 review:65 分类质量确认 OK

### 2.6 媒体富化
- [x] `scripts/agents/enrich-media.ts` 已创建（三级优先级）
- [ ] **运行 enrich-media**（140 个 include 项目 0 覆盖，待执行）

---

## Phase 3：Editorial Workflow（大部分完成，飞书待配置）

### 3.1 飞书 Interactive Card Bot
- [x] `src/app/api/feishu/callback/route.ts`（URL 验证 + 签名骨架）
- [x] 飞书凭据已配置（APP_ID + APP_SECRET + Webhook）
- [ ] 飞书 Interactive Card 按钮推送（目前只有文字日报）

### 3.2 Editorial Digest Agent
- [x] `scripts/agents/digest.ts`（优先级队列，飞书/本地两用）
- [x] `--dry-run` 测试通过，输出 15 条预览

### 3.3 Publisher Agent
- [x] `scripts/agents/publisher.ts`（从 projects + content_items 重建 feed.json）

### 3.4 Vercel Cron
- [x] `vercel.json`（每日 23:00 UTC 触发 digest）
- [x] `src/app/api/cron/digest/route.ts`（CRON_SECRET 保护）
- [ ] `src/app/api/cron/weekly-review/route.ts`（周报，待创建）

### 3.5 /admin 鉴权
- [x] `src/middleware.ts`（Basic Auth 保护 /admin + /api/admin + /api/editorial）

### 3.6 架构说明
> `approve_publish` 操作将 content_item 标记为 published，进入 feed.posts。
> feed.projects 来自 projects 表，目前靠 native 提交（Phase 4）和认领（Phase 5）填充。
> 冷启动期间 feed 以 posts 为主是合理的临时状态。

---

## Phase 4：原生输入层 [ ] 待做

### 4.1 AI Intake Engine
- [x] `src/app/api/intake/route.ts`（analyze_url / analyze_story / confirm）
- [x] `src/app/api/submit/prefill/route.ts`：Jina Reader + Claude Haiku，真实 AI 替换 stub
- [x] `src/app/api/submit/route.ts`：写入 submissions 表，异步 URL 可达性检查

### 4.2 /submit 产品提交流
- [x] `src/app/submit/page.tsx` + `src/components/submit/SubmitForm.tsx`（已有完整 UI）
- [x] prefill → confirm → DB 写入全链路验证通过

### 4.3 Magic Link 邮件
- [ ] `src/lib/magic-link.ts` + Resend 集成

### 4.4 /submit/post 经验帖写作
- [ ] `src/app/submit/post/page.tsx`

---

## Phase 5：认领流 [ ] 待做

### 5.1 /admin/claims
- [ ] `src/app/admin/claims/page.tsx`

### 5.2 /claim/[slug]
- [ ] `src/app/claim/[slug]/page.tsx`（Path A 邀请 + Path B 自助）

### 5.3 认领完成后端
- [ ] `src/app/api/claim/complete/route.ts`

### 5.4 verify-claim Agent（Path B 自动验证）
- [ ] `scripts/agents/verify-claim.ts`（DNS TXT / GitHub file / Jike bio）

### 5.5 字段写权限
- [ ] native_submitted 修改走 makerOverrides，编辑审批后 merge

---

## Phase 6：可观测 + /admin 补全

### 6.1 WeeklyMetrics
- [ ] `scripts/agents/weekly-review.ts`

### 6.2 /admin 主界面
- [x] `src/app/admin/page.tsx` + `AdminClient.tsx`（键盘流完整）

### 6.3 /admin/dedup
- [x] `src/app/admin/dedup/page.tsx` + `DedupClient.tsx`（键盘快捷键 m/d）
- [x] `src/app/api/editorial/dedup/route.ts`（merge/dismiss，写 editorial_actions）
- [x] 验证通过：merge 后 content_item archived，dedup_candidate resolved

### 6.4 URL 健康检测 Agent
- [ ] `scripts/agents/url-health.ts`（每周日，HEAD 请求 + 状态流转）

---

## Phase 7：产品快速更新（Phase 5 后）
- [ ] maker_verified 发布更新入口 + ProductUpdates 时间线

## Phase 8-10（延迟决策）
| Phase | 触发条件 | 主要工作 |
|-------|---------|---------|
| 8：向量富化 | feed 产品 > 500 | embedding + sqlite-vec + AI 排序 |
| 9：MCP Server | Phase 8 完成 | 语义搜索 API |
| 10：原生主导 | maker 贡献 > 爬取 | 爬取降级为发现机制 |

---

## 近期优先顺序（2026-04-13 更新）

```
1. [✅] /admin middleware 鉴权 + API 路由保护
2. [✅] 飞书凭据配置 + 日报发送验证
3. [✅] Phase 4 submit 核心流（AI prefill + DB 写入）
4. [✅] editorial action bug fix（reject 重建 feed、feature 时间戳、archive 连带下架）
5. [~] enrich-media 重跑中（加了 SQLITE_BUSY 重试）
6. [下一步] Turso 云实例 + Vercel 部署（让平台上线）
7. [下一步] Phase 5 认领流
```

---

## 附录 B：环境变量汇总

```bash
# 数据库
DATABASE_URL=libsql://solobase-xxx.turso.io   # 上线前必须
DATABASE_AUTH_TOKEN=xxx
DATABASE_URL_LOCAL=file:./local.db

# AI（one-api 中转）
ONE_API_BASE_URL=https://xxx
ONE_API_KEY=sk-xxx

# 飞书（用户待配置）
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_CHAT_ID=oc_xxx
FEISHU_VERIFICATION_TOKEN=xxx
EDITORIAL_SECRET=xxx         # /api/editorial/action 保护

# 邮件（Resend，Phase 4 需要）
RESEND_API_KEY=re_xxx
MAGIC_LINK_BASE_URL=https://solobase.co

# 安全
CRON_SECRET=xxx              # Vercel Cron 保护
ADMIN_PASSWORD=xxx           # /admin 密码保护（middleware 待做）

# 爬虫（已配置）
JIKE_COOKIE=xxx
PH_API_TOKEN=xxx
```
