import { colors } from "../../tokens";

interface Props {
  color?: string;
  size?: number;
}

export function LogoWatermark({ color = colors.mutedForeground, size = 13 }: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 6,
        fontSize: size,
        color,
        fontWeight: 500,
        letterSpacing: 1,
        fontFamily: "DM Sans",
      }}
    >
      <div
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: colors.primary,
        }}
      />
      SOLOBASE
    </div>
  );
}
