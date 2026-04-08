"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  Link2,
  MessageSquare,
  User,
} from "lucide-react";

type Step = "form" | "submitting" | "success";

export default function RecommendPage() {
  const [step, setStep] = useState<Step>("form");
  const [url, setUrl] = useState("");
  const [recommendedBy, setRecommendedBy] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url || !reason) return;
    setStep("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          recommendedBy: recommendedBy || undefined,
          recommendReason: reason,
          additionalNotes: notes || undefined,
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
            <h1 className="text-2xl font-bold sm:text-3xl">推荐一个好产品</h1>
            <p className="mt-2 text-muted-foreground">
              发现了一个值得分享的独立产品？帮他推荐到 SoloBase
            </p>
          </div>

          {step === "success" ? (
            <div className="rounded-2xl bg-card p-8 text-center shadow-[var(--shadow-card)]">
              <CheckCircle2 className="mx-auto h-12 w-12 text-secondary" />
              <h3 className="mt-4 text-lg font-semibold">推荐成功！</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                感谢你的推荐，我们会尽快审核
              </p>
              <a
                href="/"
                className="mt-6 inline-flex items-center justify-center rounded-xl border border-border px-6 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
              >
                返回首页
              </a>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="rounded-2xl bg-card p-6 shadow-[var(--shadow-card)] sm:p-8">
              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <Link2 className="h-4 w-4" />
                    <span>产品 URL *</span>
                  </div>
                  <input
                    type="url"
                    placeholder="https://the-product.com"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    required
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <User className="h-4 w-4" />
                    <span>你是谁（选填）</span>
                  </div>
                  <input
                    type="text"
                    placeholder="你的名字或社交媒体 ID"
                    value={recommendedBy}
                    onChange={(e) => setRecommendedBy(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <MessageSquare className="h-4 w-4" />
                    <span>推荐理由 *</span>
                  </div>
                  <textarea
                    placeholder="为什么觉得这个产品值得关注？它有什么特别之处？"
                    rows={4}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    required
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  />
                </div>

                <div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <span>补充说明（选填）</span>
                  </div>
                  <textarea
                    placeholder="任何补充信息..."
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  />
                </div>

                {errorMsg && (
                  <p className="text-sm text-destructive">{errorMsg}</p>
                )}

                <button
                  type="submit"
                  disabled={step === "submitting" || !url || !reason}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {step === "submitting" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      提交推荐
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
