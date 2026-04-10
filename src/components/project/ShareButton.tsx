"use client";

import { useState } from "react";
import { Share2, Download, X, Loader2 } from "lucide-react";

interface ShareButtonProps {
  slug: string;
  name: string;
}

export function ShareButton({ slug, name }: ShareButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const handleShare = async () => {
    setIsLoading(true);
    setIsOpen(true);

    try {
      const response = await fetch(`/api/share/${slug}?format=wechat`);
      if (!response.ok) throw new Error("Failed to generate share card");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setImageUrl((previousUrl) => {
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        return url;
      });

      // Try native share API first
      if (navigator.share && navigator.canShare) {
        const file = new File([blob], `solobase-${slug}.png`, {
          type: "image/png",
        });
        const shareData = { files: [file] };
        if (navigator.canShare(shareData)) {
          await navigator.share(shareData);
          setIsOpen(false);
          setImageUrl(null);
          URL.revokeObjectURL(url);
          return;
        }
      }
    } catch {
      // Fall through to show modal
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    if (!imageUrl) return;
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = `solobase-${slug}.png`;
    a.click();
  };

  const handleClose = () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(null);
    setIsOpen(false);
  };

  return (
    <>
      <button
        onClick={handleShare}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Share2 className="h-4 w-4" />
        )}
        分享这个项目
      </button>

      {/* Share modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl">
            <button
              onClick={handleClose}
              className="absolute right-3 top-3 rounded-lg p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>

            <h3 className="mb-3 text-base font-semibold">分享「{name}」</h3>

            {isLoading ? (
              <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : imageUrl ? (
              <>
                <img
                  src={imageUrl}
                  alt={`${name} share card`}
                  className="mb-4 w-full rounded-xl"
                />
                <p className="mb-3 text-center text-xs text-muted-foreground">
                  长按图片保存，或点击下方按钮下载
                </p>
                <button
                  onClick={handleDownload}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Download className="h-4 w-4" />
                  保存图片
                </button>
              </>
            ) : (
              <p className="text-center text-sm text-muted-foreground">
                生成分享卡片失败，请重试
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
