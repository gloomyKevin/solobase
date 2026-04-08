"use client";

import { useState } from "react";
import { TagBadge } from "@/components/common/TagBadge";
import {
  businessModelOptions,
  buildEffortOptions,
  projectStageOptions,
} from "@/config/categories";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  Pencil,
  Sparkles,
  Link2,
  FileText,
} from "lucide-react";

type Step = "input" | "prefilling" | "review" | "submitting" | "success" | "error";

interface PrefillData {
  name: string;
  tagline: string;
  description: string;
  suggestedTags: string[];
}

export function SubmitForm() {
  const [step, setStep] = useState<Step>("input");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [prefill, setPrefill] = useState<PrefillData | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Editable confirmed data
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [stage, setStage] = useState("");
  const [effort, setEffort] = useState("");
  const [model, setModel] = useState("");

  async function handlePrefill() {
    if (!url && !text) return;
    setStep("prefilling");
    setErrorMsg("");

    try {
      const res = await fetch("/api/submit/prefill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url || undefined, text: text || undefined }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "AI 分析失败");
      }

      const data = await res.json();
      setPrefill(data);
      setName(data.name || "");
      setTagline(data.tagline || "");
      setDescription(data.description || "");
      setStep("review");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "请求失败，请重试");
      setStep("input");
    }
  }

  async function handleSubmit() {
    if (!name || !tagline) return;
    setStep("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          additionalText: text || undefined,
          confirmedData: {
            name,
            tagline,
            description: description || undefined,
            businessModel: model || undefined,
            buildEffort: effort || undefined,
            stage: stage || undefined,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "提交失败");
      }

      setStep("success");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "提交失败，请重试");
      setStep("review");
    }
  }

  return (
    <div className="space-y-6">
      {/* ===== Step 1: Input ===== */}
      <div className="rounded-2xl bg-card p-6 shadow-[var(--shadow-card)] sm:p-8">
        <div className="flex items-center gap-2 mb-5">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
            1
          </div>
          <h2 className="text-base font-semibold">输入产品信息</h2>
          {(step === "review" || step === "success") && (
            <CheckCircle2 className="h-4 w-4 text-secondary" />
          )}
        </div>

        {step === "input" || step === "prefilling" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Link2 className="h-4 w-4" />
              <span>产品 URL</span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="url"
                placeholder="https://your-product.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={step === "prefilling"}
                className="flex-1 rounded-xl border border-border bg-background px-4 py-3 text-base placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
              <button
                onClick={handlePrefill}
                disabled={step === "prefilling" || (!url && !text)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity shrink-0 disabled:opacity-50"
              >
                {step === "prefilling" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {step === "prefilling" ? "分析中..." : "AI 分析"}
              </button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border/60" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-card px-2 text-muted-foreground">或者</span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <FileText className="h-4 w-4" />
              <span>用文字描述你的产品</span>
            </div>
            <textarea
              placeholder="把你在即刻/Twitter 上介绍产品的那段文字粘贴过来就行..."
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={step === "prefilling"}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring resize-none disabled:opacity-50"
            />

            {errorMsg && (
              <p className="text-sm text-destructive">{errorMsg}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {url || text.slice(0, 60) + (text.length > 60 ? "..." : "")}
          </p>
        )}
      </div>

      {/* ===== Step 2: AI Preview ===== */}
      {(step === "review" || step === "submitting" || step === "success") && (
        <div className="rounded-2xl bg-card p-6 shadow-[var(--shadow-card)] sm:p-8">
          <div className="flex items-center gap-2 mb-5">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-[11px] font-bold text-secondary-foreground">
              2
            </div>
            <h2 className="text-base font-semibold">AI 预填结果</h2>
            <span className="text-xs text-muted-foreground">（确认或修改）</span>
            {step === "success" && (
              <CheckCircle2 className="h-4 w-4 text-secondary" />
            )}
          </div>

          {step === "success" ? (
            <p className="text-sm text-muted-foreground">{name} — {tagline}</p>
          ) : (
            <div className="space-y-4">
              {/* Editable fields */}
              {[
                { key: "name", label: "产品名称", value: name, setValue: setName },
                { key: "tagline", label: "一句话描述", value: tagline, setValue: setTagline },
                { key: "description", label: "详细描述", value: description, setValue: setDescription },
              ].map((field) => (
                <div key={field.key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      {field.label}
                    </span>
                    <button
                      onClick={() => setEditingField(editingField === field.key ? null : field.key)}
                      className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                    >
                      <Pencil className="h-2.5 w-2.5" />
                      {editingField === field.key ? "完成" : "修改"}
                    </button>
                  </div>
                  {editingField === field.key ? (
                    field.key === "description" ? (
                      <textarea
                        value={field.value}
                        onChange={(e) => field.setValue(e.target.value)}
                        rows={3}
                        className="w-full rounded-lg border border-primary/30 bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                      />
                    ) : (
                      <input
                        type="text"
                        value={field.value}
                        onChange={(e) => field.setValue(e.target.value)}
                        className="w-full rounded-lg border border-primary/30 bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    )
                  ) : (
                    <div className="rounded-lg bg-surface-sunken px-3 py-2.5 text-sm">
                      {field.value || <span className="text-muted-foreground/60">待填写</span>}
                    </div>
                  )}
                </div>
              ))}

              {/* AI suggested tags */}
              {prefill?.suggestedTags && prefill.suggestedTags.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground mb-1 block">
                    AI 建议标签
                  </span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {prefill.suggestedTags.map((tag) => (
                      <TagBadge key={tag} label={tag} dimension="default" />
                    ))}
                  </div>
                </div>
              )}

              {/* User-fill fields */}
              <div className="border-t border-border/60 pt-4 mt-4">
                <p className="text-xs text-accent-foreground/70 mb-3 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  以下字段需要你确认或补充
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <span className="text-xs font-medium text-muted-foreground mb-1 block">
                      产品阶段
                    </span>
                    <select
                      value={stage}
                      onChange={(e) => setStage(e.target.value)}
                      className="w-full rounded-lg border-2 border-accent/30 bg-accent/5 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">选择阶段...</option>
                      {projectStageOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-muted-foreground mb-1 block">
                      构建门槛
                    </span>
                    <select
                      value={effort}
                      onChange={(e) => setEffort(e.target.value)}
                      className="w-full rounded-lg border-2 border-accent/30 bg-accent/5 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">选择门槛...</option>
                      {buildEffortOptions
                        .filter((o) => o.value !== "undetermined")
                        .map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-muted-foreground mb-1 block">
                      商业模式
                    </span>
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="w-full rounded-lg border-2 border-accent/30 bg-accent/5 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">选择模式...</option>
                      {businessModelOptions
                        .filter((o) => o.value !== "undetermined")
                        .map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={handleSubmit}
                  disabled={step === "submitting" || !name || !tagline}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {step === "submitting" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      确认提交
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
                <button
                  onClick={() => setStep("input")}
                  disabled={step === "submitting"}
                  className="inline-flex items-center justify-center rounded-xl border border-border px-5 py-3 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                >
                  返回修改
                </button>
              </div>

              {errorMsg && (
                <p className="text-sm text-destructive">{errorMsg}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== Step 3: Success ===== */}
      {step === "success" && (
        <div className="rounded-2xl bg-card p-6 text-center shadow-[var(--shadow-card)] sm:p-8">
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
          <a
            href="/"
            className="mt-6 inline-flex items-center justify-center rounded-xl border border-border px-6 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
          >
            返回首页
          </a>
        </div>
      )}
    </div>
  );
}
