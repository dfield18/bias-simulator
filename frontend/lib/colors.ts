/**
 * Color schemes for topic sides.
 * "political" = blue/red (left/right)
 * "neutral" = purple/green (non-partisan)
 */

export type ColorScheme = "political" | "neutral";

export function getSideColors(scheme: ColorScheme = "political") {
  if (scheme === "neutral") {
    return {
      anti: {
        text: "text-purple-400",
        bg: "bg-purple-500",
        bgLight: "bg-purple-500/20",
        bgFaint: "bg-purple-500/5",
        border: "border-purple-500/30",
        borderLight: "border-purple-500/20",
        fill: "rgb(168, 85, 247)",      // purple-500
        fillLight: "rgba(168, 85, 247, 0.15)",
      },
      pro: {
        text: "text-green-400",
        bg: "bg-green-500",
        bgLight: "bg-green-500/20",
        bgFaint: "bg-green-500/5",
        border: "border-green-500/30",
        borderLight: "border-green-500/20",
        fill: "rgb(34, 197, 94)",       // green-500
        fillLight: "rgba(34, 197, 94, 0.15)",
      },
    };
  }
  // Default: political
  return {
    anti: {
      text: "text-blue-400",
      bg: "bg-blue-500",
      bgLight: "bg-blue-500/20",
      bgFaint: "bg-blue-500/5",
      border: "border-blue-500/30",
      borderLight: "border-blue-500/20",
      fill: "rgb(59, 130, 246)",       // blue-500
      fillLight: "rgba(59, 130, 246, 0.15)",
    },
    pro: {
      text: "text-red-400",
      bg: "bg-red-500",
      bgLight: "bg-red-500/20",
      bgFaint: "bg-red-500/5",
      border: "border-red-500/30",
      borderLight: "border-red-500/20",
      fill: "rgb(239, 68, 68)",        // red-500
      fillLight: "rgba(239, 68, 68, 0.15)",
    },
  };
}
