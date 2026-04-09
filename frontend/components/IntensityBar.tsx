import { getSideColors, ColorScheme } from "@/lib/colors";

interface IntensityBarProps {
  score: number;
  proLabel: string;
  antiLabel: string;
  colorScheme?: ColorScheme;
}

export default function IntensityBar({
  score,
  proLabel,
  antiLabel,
  colorScheme = "political",
}: IntensityBarProps) {
  const sc = getSideColors(colorScheme);
  const absScore = Math.abs(score);
  const widthPct = (absScore / 10) * 50;
  const isAnti = score < 0;

  return (
    <div className="w-full">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 w-16 text-right">
          {antiLabel}
        </span>
        <div className="flex-1 h-3 bg-gray-800 rounded-full relative overflow-hidden">
          {/* Center marker */}
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-600 z-10" />
          {/* Fill bar */}
          <div
            className={`absolute top-0 bottom-0 rounded-full transition-all ${
              isAnti ? sc.anti.bg : sc.pro.bg
            }`}
            style={{
              left: isAnti ? `${50 - widthPct}%` : "50%",
              width: `${widthPct}%`,
            }}
          />
        </div>
        <span className="text-xs text-gray-500 w-16">{proLabel}</span>
      </div>
      <div className="text-center text-xs text-gray-400 mt-1">
        <span
          className={`font-mono font-bold ${
            isAnti ? sc.anti.text : sc.pro.text
          }`}
        >
          {score > 0 ? "+" : ""}
          {score}
        </span>
      </div>
    </div>
  );
}
