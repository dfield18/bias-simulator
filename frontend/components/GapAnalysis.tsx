"use client";

import { GapAnalysisData } from "@/lib/api";

interface GapAnalysisProps {
  data: GapAnalysisData;
}

export default function GapAnalysis({ data }: GapAnalysisProps) {
  const { bullets, causal_paragraph } = data;

  if (bullets.length === 0 && !causal_paragraph) return null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-gray-300 mb-1">
        What&apos;s Driving the Difference
      </h3>
      <p className="text-[10px] sm:text-xs text-gray-600 mb-4">
        The main structural reasons these two sides end up seeing different stories
      </p>

      {/* Comparative bullets — ranked by strength */}
      {bullets.length > 0 && (
        <div className="space-y-2">
          {bullets.map((b, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${
                i === 0 ? "bg-yellow-500/20 text-yellow-400" : "bg-gray-800 text-gray-500"
              }`}>
                {i + 1}
              </div>
              <p className="text-xs text-gray-300 leading-relaxed">{b}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
