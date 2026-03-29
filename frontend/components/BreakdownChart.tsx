import { BreakdownData } from "@/lib/api";

interface BreakdownChartProps {
  data: BreakdownData;
  proLabel: string;
  antiLabel: string;
}

function getCategoryColor(key: string, antiBent: string, proBent: string): string {
  if (key === antiBent) return "bg-blue-500";
  if (key === proBent) return "bg-red-500";
  if (key === "neutral") return "bg-gray-500";
  return "bg-gray-700";
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

export default function BreakdownChart({
  data,
  proLabel,
  antiLabel,
}: BreakdownChartProps) {
  const labels: Record<string, string> = {
    "anti-war": antiLabel,
    "pro-war": proLabel,
    neutral: "Neutral",
    unclear: "Unclear",
  };

  const categories = Object.entries(data.breakdown);
  const antiBent = antiLabel.toLowerCase().replace(/\s+/g, "-");
  const proBent = proLabel.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-400">
        <span className="font-semibold text-gray-200">{data.on_topic}</span> on-topic tweets
        <span className="text-gray-600"> / {data.total_tweets} total</span>
      </div>

      {/* Horizontal bar chart */}
      <div className="space-y-2">
        {categories.map(([key, cat]) => {
          const label = labels[key] || key;
          const color = getCategoryColor(key, antiBent, proBent);
          return (
            <div key={key}>
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>{label}</span>
                <span>
                  {cat.count} ({cat.pct}%)
                </span>
              </div>
              <div className="h-4 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full ${color} rounded-full transition-all`}
                  style={{ width: `${Math.max(cat.pct, 1)}%` }}
                />
              </div>
              <div className="flex gap-3 text-xs text-gray-600 mt-0.5">
                <span>Avg views: {formatNumber(cat.avg_views)}</span>
                <span>Avg engagement: {formatNumber(cat.avg_engagement)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Intensity averages */}
      {(data.intensity.pro_avg != null || data.intensity.anti_avg != null) && (
        <div className="border-t border-gray-800 pt-3 mt-3">
          <div className="text-xs font-semibold text-gray-400 mb-2">
            Avg Intensity
          </div>
          <div className="flex gap-4 text-sm">
            {data.intensity.anti_avg != null && (
              <span className="text-blue-400">
                {antiLabel}: {data.intensity.anti_avg > 0 ? "+" : ""}{data.intensity.anti_avg.toFixed(1)}
              </span>
            )}
            {data.intensity.pro_avg != null && (
              <span className="text-red-400">
                {proLabel}: {data.intensity.pro_avg > 0 ? "+" : ""}{data.intensity.pro_avg.toFixed(1)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Last updated */}
      {data.last_updated && (
        <div className="text-xs text-gray-600">
          Last updated: {new Date(data.last_updated).toLocaleString()}
        </div>
      )}
    </div>
  );
}
