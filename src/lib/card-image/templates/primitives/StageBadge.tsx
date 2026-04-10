import { stageColors } from "../../tokens";

interface Props {
  stage: string;
  label: string;
}

const stageLabels: Record<string, string> = {
  idea: "构思中",
  building: "开发中",
  launched: "已上线",
  revenue: "有收入",
  scaling: "增长中",
};

export function StageBadge({ stage, label }: Props) {
  const bgColor = stageColors[stage] || "#9CA3AF";
  const displayLabel = label || stageLabels[stage] || stage;

  return (
    <div
      style={{
        display: "flex",
        fontSize: 13,
        fontWeight: 600,
        padding: "4px 14px",
        borderRadius: 100,
        color: "white",
        background: bgColor,
      }}
    >
      {displayLabel}
    </div>
  );
}
