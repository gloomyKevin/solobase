import { colors } from "../../tokens";

interface Props {
  label: string;
  value: string;
  icon?: string;
}

export function MetricPill({ label, value, icon }: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        background: colors.muted,
        borderRadius: 100,
        padding: "7px 16px",
        fontSize: 14,
        fontWeight: 500,
        color: colors.mutedForeground,
      }}
    >
      {icon && <span>{icon}</span>}
      <span style={{ color: colors.primary, fontWeight: 700 }}>{value}</span>
    </div>
  );
}
