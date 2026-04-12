"use client";

import { useState } from "react";
import { DynamicGrid } from "./DynamicGrid";
import { Feed, type FeedEntry } from "./Feed";

interface ProjectData {
  slug: string; name: string; tagline: string; screenshot: string;
  stage: string; stageColor: string; revenue: string | null;
  founderType: string; buildEffort: string; isEditorsPick: boolean;
  featuredInsight?: string;
}

export function HomeClient({ projects, feedItems }: { projects: ProjectData[]; feedItems: FeedEntry[] }) {
  const [topicFilter, setTopicFilter] = useState<string | null>(null);

  const handleTopicFilter = (topic: string | null) => {
    // 点击同一个 topic 取消筛选
    setTopicFilter(prev => prev === topic ? null : topic);
  };

  return (
    <>
      {/* 顶部展厅 — 编辑策展，可自定义 */}
      <DynamicGrid projects={projects} onTopicFilter={handleTopicFilter} />

      {/* 分割线 */}
      <div className="mt-6 mb-5 border-t border-border/12" />

      {/* 无尽流 */}
      <Feed items={feedItems} topicFilter={topicFilter} />
    </>
  );
}
