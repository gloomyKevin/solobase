import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { SubmitForm } from "@/components/submit/SubmitForm";
import Link from "next/link";
import { Users } from "lucide-react";

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

          <SubmitForm />

          <div className="mt-8 text-center">
            <Link
              href="/recommend"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              <Users className="h-4 w-4" />
              知道一个好产品？帮他推荐
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
