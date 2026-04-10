import { tagColors } from "../../tokens";
import type { CardTag } from "../../types";

interface Props {
  tag: CardTag;
}

export function TagPill({ tag }: Props) {
  const c = tagColors[tag.dimension] || tagColors.default;
  return (
    <div
      style={{
        display: "flex",
        fontSize: 13,
        fontWeight: 500,
        padding: "4px 12px",
        borderRadius: 100,
        background: c.bg,
        color: c.text,
      }}
    >
      {tag.label}
    </div>
  );
}
