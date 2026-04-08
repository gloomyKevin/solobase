"use client";

import { useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  MessageSquare,
} from "lucide-react";

type Step = "form" | "submitting" | "success";

const feedbackTypes = [
  { value: "error_report", label: "信息纠错", description: "发现某个产品信息有误" },
  { value: "project_suggestion", label: "产品推荐", description: "推荐一个未收录的产品" },
  { value: "feature_request", label: "功能建议", description: "对平台的改进建议" },
  { value: "general", label: "其他反馈", description: "任何想对我们说的" },
] as const;

export default function FeedbackPage() {
  const [step, setStep] = useState<Step>("form");
  const [type, setType] = useState<string>("general");
  const [description, setDescription] = useState("");
  const [projectUrl, setProjectUrl] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description) return;
    setStep("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          content: {
            description,
            projectId: undefined,
            suggestedUrl: projectUrl || undefined,
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
      setStep("form");
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <Header />

      <main className="flex-1 bg-gradient-to-b from-background to-surface-sunken/30">
        <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
          <div className="text-center mb-10">
            <h1 className="text-2xl font-bold sm:text-3xl">反馈</h1>
            <p className="mt-2 text-muted-foreground">
              帮助我们做得更好
            </p>
          </div>

          {step === "success" ? (
            <div className="rounded-2xl bg-card p-8 text-center shadow-[var(--shadow-card)]">
              <CheckCircle2 className="mx-auto h-12 w-12 text-secondary" />
              <h3 className="mt-4 text-lg font-semibold">感谢反馈！</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                你的反馈对我们很重要，我们会认真查看
              </p>
              <Link
                href="/"
                className="mt-6 inline-flex items-center justify-center rounded-xl border border-border px-6 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
              >
                返回首页
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="rounded-2xl bg-card p-6 shadow-[var(--shadow-card)] sm:p-8">
              <div className="space-y-5">
                {/* Type selector */}
                <div>
                  <p className="mb-3 text-sm font-medium">反馈类型</p>
                  <div className="grid grid-cols-2 gap-2">
                    {feedbackTypes.map((ft) => (
                      <button
                        key={ft.value}
                        type="button"
                        onClick={() => setType(ft.value)}
                        className={`rounded-xl border p-3 text-left transition-all ${
                          type === ft.value
                            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                            : "border-border/60 hover:border-primary/30"
                        }`}
                      >
                        <p className="text-sm font-medium">{ft.label}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {ft.description}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* URL field for error reports */}
                {(type === "error_report" || type === "project_suggestion") && (
                  <div>
                    <p className="mb-1 text-sm text-muted-foreground">
                      相关产品 URL（选填）
                    </p>
                    <input
                      type="url"
                      placeholder="https://..."
                      value={projectUrl}
                      onChange={(e) => setProjectUrl(e.target.value)}
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                )}

                {/* Description */}
                <div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <MessageSquare className="h-4 w-4" />
                    <span>详细描述 *</span>
                  </div>
                  <textarea
                    placeholder="请具体描述你的反馈..."
                    rows={5}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  />
                </div>

                {errorMsg && (
                  <p className="text-sm text-destructive">{errorMsg}</p>
                )}

                <button
                  type="submit"
                  disabled={step === "submitting" || !description}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {step === "submitting" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      提交反馈
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
