"use client";

import { useState } from "react";
import { NarrativeData } from "@/lib/api";

interface FramingSummaryProps {
  data: NarrativeData;
}

// Generate a consistent color from a frame key (deterministic hash)
const PALETTE = [
  "rgb(239, 68, 68)",    // red
  "rgb(34, 197, 94)",    // green
  "rgb(234, 179, 8)",    // yellow
  "rgb(59, 130, 246)",   // blue
  "rgb(168, 85, 247)",   // purple
  "rgb(249, 115, 22)",   // orange
  "rgb(52, 211, 153)",   // emerald
  "rgb(96, 165, 250)",   // light blue
  "rgb(45, 212, 191)",   // teal
  "rgb(244, 114, 182)",  // pink
  "rgb(163, 230, 53)",   // lime
  "rgb(251, 191, 36)",   // amber
];

function getFrameColor(key: string, index: number): string {
  return PALETTE[index % PALETTE.length];
}

function getFrameShare(frames: Record<string, { count: number; pct: number }>, frameLabels: Record<string, string>, allKeys: string[]) {
  const entries = Object.entries(frames)
    .map(([key, val]) => ({
      key,
      label: frameLabels[key] || key,
      count: val.count,
      pct: val.pct,
      color: getFrameColor(key, allKeys.indexOf(key)),
    }))
    .filter((e) => e.count > 0)
    .sort((a, b) => b.pct - a.pct);
  return entries;
}

export default function FramingSummary({ data }: FramingSummaryProps) {
  const { frames, frame_gaps, frame_labels } = data;
  const antiLabel = data.anti_label;
  const proLabel = data.pro_label;
  const [hoveredFrame, setHoveredFrame] = useState<string | null>(null);

  const allKeys = Object.keys(frame_labels);
  const antiFrames = getFrameShare(frames.anti, frame_labels, allKeys);
  const proFrames = getFrameShare(frames.pro, frame_labels, allKeys);

  // Build narrative identity from top frames
  function buildIdentity(frameList: typeof antiFrames): string {
    const top3 = frameList.slice(0, 3);
    return top3.map((f) => f.label.toLowerCase()).join(", ") || "mixed framing";
  }

  const antiIdentity = buildIdentity(antiFrames);
  const proIdentity = buildIdentity(proFrames);

  // Top frame gaps for advantage table
  const topGaps = frame_gaps
    .filter((g) => g.delta >= 3)
    .slice(0, 3);

  return (
    <div className="space-y-4">
      {/* 1. Narrative Mix — stacked bars */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-medium">Narrative Mix</div>
        <h3 className="text-sm font-semibold text-gray-300 mb-0.5">
          What each side's conversation is mostly about
        </h3>
        <p className="text-[10px] text-gray-600 mb-4">
          Each bar shows the % breakdown of arguments used by that side
        </p>

        <div className="space-y-3">
          {/* Anti bar */}
          <div>
            <div className="text-xs text-blue-400 font-medium mb-1">{antiLabel}</div>
            <div className="h-6 rounded-md overflow-hidden flex">
              {antiFrames.map((f) => (
                <div
                  key={f.key}
                  className="h-full relative transition-opacity"
                  style={{
                    width: `${f.pct}%`,
                    backgroundColor: f.color,
                    opacity: hoveredFrame && hoveredFrame !== f.key ? 0.3 : 1,
                  }}
                  onMouseEnter={() => setHoveredFrame(f.key)}
                  onMouseLeave={() => setHoveredFrame(null)}
                >
                  {f.pct >= 10 && (
                    <span className="absolute inset-0 flex items-center justify-center text-[9px] text-white font-medium">
                      {Math.round(f.pct)}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Pro bar */}
          <div>
            <div className="text-xs text-red-400 font-medium mb-1">{proLabel}</div>
            <div className="h-6 rounded-md overflow-hidden flex">
              {proFrames.map((f) => (
                <div
                  key={f.key}
                  className="h-full relative transition-opacity"
                  style={{
                    width: `${f.pct}%`,
                    backgroundColor: f.color,
                    opacity: hoveredFrame && hoveredFrame !== f.key ? 0.3 : 1,
                  }}
                  onMouseEnter={() => setHoveredFrame(f.key)}
                  onMouseLeave={() => setHoveredFrame(null)}
                >
                  {f.pct >= 10 && (
                    <span className="absolute inset-0 flex items-center justify-center text-[9px] text-white font-medium">
                      {Math.round(f.pct)}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3">
          {Object.entries(frame_labels)
            .filter(([key]) => antiFrames.some((f) => f.key === key) || proFrames.some((f) => f.key === key))
            .map(([key, label]) => (
              <div
                key={key}
                className={`flex items-center gap-1 text-[10px] transition-opacity ${
                  hoveredFrame && hoveredFrame !== key ? "opacity-30" : ""
                }`}
                onMouseEnter={() => setHoveredFrame(key)}
                onMouseLeave={() => setHoveredFrame(null)}
              >
                <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: getFrameColor(key, allKeys.indexOf(key)) }} />
                <span className="text-gray-400">{label}</span>
              </div>
            ))}
        </div>

        {/* Hover tooltip */}
        {hoveredFrame && (
          <div className="mt-2 text-[10px] text-gray-400">
            <span className="font-medium text-gray-300">{frame_labels[hoveredFrame]}</span>
            {" — "}
            <span className="text-blue-400">{antiFrames.find((f) => f.key === hoveredFrame)?.pct.toFixed(1) || "0"}% {antiLabel}</span>
            {" · "}
            <span className="text-red-400">{proFrames.find((f) => f.key === hoveredFrame)?.pct.toFixed(1) || "0"}% {proLabel}</span>
          </div>
        )}
      </div>

      {/* 2. Frame Advantage Table + 3. Narrative Identity — side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Frame Advantage */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-medium">Frame Advantage</div>
          <h3 className="text-sm font-semibold text-gray-300 mb-3">
            Biggest framing gaps
          </h3>
          {topGaps.length > 0 ? (
            <div className="space-y-2">
              {topGaps.map((gap) => {
                const isAnti = gap.dominant_side === "anti";
                return (
                  <div key={gap.frame} className="flex items-center justify-between">
                    <span className="text-xs text-gray-300">{gap.label}</span>
                    <span className={`text-xs font-medium ${isAnti ? "text-blue-400" : "text-red-400"}`}>
                      +{gap.delta}% {isAnti ? antiLabel : proLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-500">No significant framing gaps</p>
          )}
        </div>

        {/* Top Narrative Identity */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-medium">Narrative Identity</div>
          <h3 className="text-sm font-semibold text-gray-300 mb-3">
            Each side's framing style
          </h3>
          <div className="space-y-3">
            <div>
              <div className="text-xs text-blue-400 font-medium mb-0.5">{antiLabel}</div>
              <div className="text-sm text-gray-200 font-medium capitalize">{antiIdentity}</div>
              <div className="text-[10px] text-gray-600 mt-0.5">
                Top frames: {antiFrames.slice(0, 2).map((f) => f.label).join(", ")}
              </div>
            </div>
            <div>
              <div className="text-xs text-red-400 font-medium mb-0.5">{proLabel}</div>
              <div className="text-sm text-gray-200 font-medium capitalize">{proIdentity}</div>
              <div className="text-[10px] text-gray-600 mt-0.5">
                Top frames: {proFrames.slice(0, 2).map((f) => f.label).join(", ")}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
