"use client";

import { RecommendationsData, Recommendation } from "@/lib/api";

interface RecommendationsProps {
  data: RecommendationsData;
}

function TypeIcon({ type }: { type: string }) {
  const icons: Record<string, string> = {
    messaging: "\uD83D\uDCE3",
    audience: "\uD83C\uDFAF",
    tone: "\uD83C\uDFA8",
    blind_spot: "\uD83D\uDCA1",
  };
  return <span className="text-sm">{icons[type] || "\u2728"}</span>;
}

function TypeLabel({ type }: { type: string }) {
  const labels: Record<string, string> = {
    messaging: "Messaging",
    audience: "Audience",
    tone: "Tone",
    blind_spot: "Blind spot",
  };
  const colors: Record<string, string> = {
    messaging: "bg-blue-500/15 text-blue-300",
    audience: "bg-green-500/15 text-green-300",
    tone: "bg-amber-500/15 text-amber-300",
    blind_spot: "bg-purple-500/15 text-purple-300",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded ${colors[type] || "bg-gray-700 text-gray-400"}`}>
      {labels[type] || type}
    </span>
  );
}

function RecCard({ rec, index }: { rec: Recommendation; index: number }) {
  return (
    <div className="bg-gray-800/40 rounded-lg p-3">
      <div className="flex items-start gap-2.5">
        <div className="shrink-0 mt-0.5">
          <TypeIcon type={rec.type} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-gray-200">{rec.title}</span>
            <TypeLabel type={rec.type} />
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">{rec.detail}</p>
        </div>
      </div>
    </div>
  );
}

export default function Recommendations({ data }: RecommendationsProps) {
  if (!data.anti_recommendations?.length && !data.pro_recommendations?.length) return null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-gray-300 mb-1">
        Recommendations
      </h3>
      <p className="text-[10px] sm:text-xs text-gray-600 mb-5">
        How each side could improve their messaging to reach a broader audience
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* Anti / Left side */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-5 bg-blue-500 rounded-full" />
            <span className="text-xs font-semibold text-blue-400">
              For {data.anti_label}
            </span>
          </div>
          <div className="space-y-2">
            {data.anti_recommendations.map((rec, i) => (
              <RecCard key={i} rec={rec} index={i} />
            ))}
          </div>
        </div>

        {/* Pro / Right side */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-5 bg-red-500 rounded-full" />
            <span className="text-xs font-semibold text-red-400">
              For {data.pro_label}
            </span>
          </div>
          <div className="space-y-2">
            {data.pro_recommendations.map((rec, i) => (
              <RecCard key={i} rec={rec} index={i} />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-gray-800 flex items-center gap-2 text-[10px] text-gray-600">
        <span className="bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded">AI-generated</span>
        <span>Based on narrative frames, emotional tone, and engagement patterns</span>
      </div>
    </div>
  );
}
