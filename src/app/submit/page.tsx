import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { TagBadge } from "@/components/common/TagBadge";
import {
  ArrowRight,
  CheckCircle2,
  Pencil,
  Sparkles,
  Link2,
  FileText,
} from "lucide-react";

export default function SubmitPage() {
  return (
    <div className="flex min-h-full flex-col">
      <Header />

      <main className="flex-1 bg-gradient-to-b from-background to-surface-sunken/30">
        <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
          <div className="text-center mb-10">
            <h1 className="text-2xl font-bold sm:text-3xl">提交你的产品</h1>
            <p className="mt-2 text-muted-foreground">
              粘贴 URL 或描述你的产品，AI 帮你自动填好资料
            </p>
          </div>

          {/* ===== Step 1: Input ===== */}
          <div className="rounded-2xl bg-card p-6 shadow-[var(--shadow-card)] sm:p-8">
            <div className="flex items-center gap-2 mb-5">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                1
              </div>
              <h2 className="text-base font-semibold">输入产品信息</h2>
            </div>

            {/* URL input */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Link2 className="h-4 w-4" />
                <span>产品 URL</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://your-product.com"
                  className="flex-1 rounded-xl border border-border bg-background px-4 py-3 text-base placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
                  readOnly
                />
                <button className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity shrink-0">
                  <Sparkles className="h-4 w-4" />
                  AI 分析
                </button>
              </div>

              {/* Or text description */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border/60" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-card px-2 text-muted-foreground">
                    或者
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <FileText className="h-4 w-4" />
                <span>用文字描述你的产品</span>
              </div>
              <textarea
                placeholder="把你在即刻/Twitter 上介绍产品的那段文字粘贴过来就行..."
                rows={3}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                readOnly
              />
            </div>
          </div>

          {/* ===== Step 2: AI Preview ===== */}
          <div className="mt-6 rounded-2xl bg-card p-6 shadow-[var(--shadow-card)] sm:p-8">
            <div className="flex items-center gap-2 mb-5">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-[11px] font-bold text-secondary-foreground">
                2
              </div>
              <h2 className="text-base font-semibold">AI 预填结果</h2>
              <span className="text-xs text-muted-foreground">
                （确认或修改）
              </span>
            </div>

            <div className="space-y-4">
              {/* Prefilled fields */}
              {[
                { label: "产品名称", value: "PhotoAI Editor", ai: true },
                {
                  label: "一句话描述",
                  value: "用 AI 一键修出专业级产品图，个人卖家的秘密武器",
                  ai: true,
                },
                {
                  label: "详细描述",
                  value:
                    "面向电商个人卖家和小团队的 AI 图片编辑工具，一键生成可直接上架的产品主图...",
                  ai: true,
                },
              ].map((field) => (
                <div key={field.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      {field.label}
                    </span>
                    {field.ai && (
                      <button className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline">
                        <Pencil className="h-2.5 w-2.5" />
                        修改
                      </button>
                    )}
                  </div>
                  <div className="rounded-lg bg-surface-sunken px-3 py-2.5 text-sm">
                    {field.value}
                  </div>
                </div>
              ))}

              {/* AI suggested tags */}
              <div>
                <span className="text-xs font-medium text-muted-foreground mb-1 block">
                  AI 建议标签
                </span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <TagBadge label="AI 应用" dimension="default" />
                  <TagBadge label="效率工具" dimension="default" />
                  <TagBadge label="订阅制" dimension="business" />
                </div>
              </div>

              {/* User-fill fields (highlighted) */}
              <div className="border-t border-border/60 pt-4 mt-4">
                <p className="text-xs text-accent-foreground/70 mb-3 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  以下字段需要你确认或补充
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "产品阶段", placeholder: "选择阶段..." },
                    { label: "构建门槛", placeholder: "选择门槛..." },
                    { label: "商业模式", placeholder: "AI 建议: 订阅制" },
                    { label: "收入区间", placeholder: "选填..." },
                  ].map((field) => (
                    <div key={field.label}>
                      <span className="text-xs font-medium text-muted-foreground mb-1 block">
                        {field.label}
                      </span>
                      <div className="rounded-lg border-2 border-accent/30 bg-accent/5 px-3 py-2.5 text-sm text-muted-foreground">
                        {field.placeholder}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex gap-3">
              <button className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity">
                确认提交
                <ArrowRight className="h-4 w-4" />
              </button>
              <button className="inline-flex items-center justify-center rounded-xl border border-border px-5 py-3 text-sm font-medium text-foreground hover:bg-muted transition-colors">
                返回修改
              </button>
            </div>
          </div>

          {/* ===== Step 3: Success ===== */}
          <div className="mt-6 rounded-2xl bg-card p-6 text-center shadow-[var(--shadow-card)] sm:p-8">
            <div className="flex items-center justify-center gap-2 mb-5">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-[11px] font-bold text-secondary-foreground">
                3
              </div>
              <h2 className="text-base font-semibold">完成</h2>
            </div>

            <CheckCircle2 className="mx-auto h-12 w-12 text-secondary" />
            <h3 className="mt-4 text-lg font-semibold">提交成功！</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              你的产品已进入审核队列
              <br />
              通常 1-3 个工作日内完成审核
            </p>
            <button className="mt-6 inline-flex items-center justify-center rounded-xl border border-border px-6 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
              返回首页
            </button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
