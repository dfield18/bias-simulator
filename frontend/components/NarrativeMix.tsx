"use client";

import { useState } from "react";
import { NarrativeData } from "@/lib/api";
import { getSideColors, ColorScheme } from "@/lib/colors";

interface NarrativeMixProps {
  data: NarrativeData;
  colorScheme?: ColorScheme;
}

const TOP_N = 4;
const OTHER_COLOR = "rgb(75, 85, 99)";

const PALETTE = [
  "rgb(59, 130, 246)",
  "rgb(234, 179, 8)",
  "rgb(34, 197, 94)",
  "rgb(168, 85, 247)",
  "rgb(249, 115, 22)",
];

function toDescriptor(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("security") || l.includes("crime") || l.includes("threat")) return "security and threat framing";
  if (l.includes("humanitarian") || l.includes("compassion") || l.includes("suffering")) return "humanitarian concerns";
  if (l.includes("rights") || l.includes("fairness") || l.includes("dignity")) return "rights and fairness framing";
  if (l.includes("rule of law") || l.includes("legality") || l.includes("law")) return "legality and enforcement framing";
  if (l.includes("blame") || l.includes("institutional") || l.includes("political")) return "institutional accountability";
  if (l.includes("economic") && (l.includes("cost") || l.includes("burden"))) return "economic cost framing";
  if (l.includes("economic") && (l.includes("contribution") || l.includes("labor"))) return "economic contribution framing";
  if (l.includes("cultural") || l.includes("identity")) return "cultural identity framing";
  if (l.includes("military") || l.includes("escalation") || l.includes("defense")) return "military and defense framing";
  if (l.includes("diplomat") || l.includes("peace")) return "diplomacy and peace framing";
  if (l.includes("protest") || l.includes("anti-war")) return "protest and opposition framing";
  if (l.includes("border")) return "border enforcement framing";
  if (l.includes("family") || l.includes("separation")) return "family and separation concerns";
  return label.toLowerCase();
}

interface BarSegment {
  key: string;
  label: string;
  share: number;
  color: string;
  isOther: boolean;
  otherFrames?: string[];
}

export default function NarrativeMix({ data, colorScheme }: NarrativeMixProps) {
  const sc = getSideColors(colorScheme || "political");
  const { frames, frame_labels } = data;
  const antiLabel = data.anti_label;
  const proLabel = data.pro_label;
  const [hoveredFrame, setHoveredFrame] = useState<string | null>(null);

  // Build frame list sorted by combined importance
  const allKeys = Object.keys(frame_labels);
  const frameMix = allKeys
    .map((k) => ({
      key: k,
      label: frame_labels[k],
      antiPct: frames.anti[k]?.pct || 0,
      proPct: frames.pro[k]?.pct || 0,
      combined: (frames.anti[k]?.pct || 0) + (frames.pro[k]?.pct || 0),
    }))
    .filter((f) => f.combined > 0)
    .sort((a, b) => b.combined - a.combined);

  if (frameMix.length === 0) return null;

  // Global top N frames, sorted by combined importance — this order is shared by both bars
  const topFrames = frameMix.slice(0, TOP_N);
  const topFrameKeys = topFrames.map((f) => f.key);
  const hiddenFrames = frameMix.slice(TOP_N);

  // Color map
  const colorMap: Record<string, string> = {};
  topFrameKeys.forEach((k, i) => { colorMap[k] = PALETTE[i % PALETTE.length]; });

  // Build bar segments in the shared global order
  function buildBarData(side: "anti" | "pro"): BarSegment[] {
    const rawTotal = frameMix.reduce((s, f) => s + (side === "anti" ? f.antiPct : f.proPct), 0) || 1;

    // Segments in the same global order as topFrameKeys
    const segments: BarSegment[] = topFrameKeys.map((k) => {
      const f = frameMix.find((x) => x.key === k)!;
      const pct = side === "anti" ? f.antiPct : f.proPct;
      return {
        key: k,
        label: f.label,
        share: pct / rawTotal * 100,
        color: colorMap[k],
        isOther: false,
      };
    });

    // Other — always last
    const otherShare = hiddenFrames.reduce((s, f) => s + (side === "anti" ? f.antiPct : f.proPct), 0) / rawTotal * 100;
    if (otherShare > 0.5) {
      segments.push({
        key: "__other__",
        label: "Other",
        share: otherShare,
        color: OTHER_COLOR,
        isOther: true,
        otherFrames: hiddenFrames.map((f) => f.label),
      });
    }

    return segments;
  }

  const antiBar = buildBarData("anti");
  const proBar = buildBarData("pro");

  // Top frame per side
  const antiTopFrame = [...frameMix].sort((a, b) => b.antiPct - a.antiPct)[0];
  const proTopFrame = [...frameMix].sort((a, b) => b.proPct - a.proPct)[0];
  const antiTotal = frameMix.reduce((s, f) => s + f.antiPct, 0) || 1;
  const proTotal = frameMix.reduce((s, f) => s + f.proPct, 0) || 1;
  const antiTopPct = Math.round(antiTopFrame.antiPct / antiTotal * 100);
  const proTopPct = Math.round(proTopFrame.proPct / proTotal * 100);

  // Takeaway
  const antiTop2 = [...frameMix].sort((a, b) => b.antiPct - a.antiPct).slice(0, 2);
  const proTop2 = [...frameMix].sort((a, b) => b.proPct - a.proPct).slice(0, 2);
  const takeaway = `${antiLabel} leans on ${antiTop2.map((f) => toDescriptor(f.label)).join(" and ")}, while ${proLabel} emphasizes ${proTop2.map((f) => toDescriptor(f.label)).join(" and ")}.`;

  // Biggest framing gap
  const gapSentence = (() => {
    const gaps = frameMix.map((f) => {
      const antiShare = f.antiPct / antiTotal * 100;
      const proShare = f.proPct / proTotal * 100;
      const diff = antiShare - proShare;
      const absDiff = Math.abs(diff);
      const hi = Math.max(antiShare, proShare);
      const lo = Math.min(antiShare, proShare);
      // Always compute a ratio; cap at 10× for near-zero denominators
      const ratio = lo >= 0.5 ? Math.round(hi / lo * 10) / 10 : Math.min(Math.round(hi), 10);
      const hiSide: "anti" | "pro" = diff > 0 ? "anti" : "pro";
      return { key: f.key, label: f.label, diff, absDiff, ratio, hiSide };
    }).sort((a, b) => b.absDiff - a.absDiff);

    if (gaps.length === 0 || gaps[0].absDiff < 3) {
      return "The two sides use similar framing, with no single dominant gap.";
    }

    const top = gaps[0];
    const second = gaps.length > 1 && gaps[1].absDiff >= 5 ? gaps[1] : null;

    function fmtRatio(r: number): string {
      return r >= 10 ? "10×+" : `${r}×`;
    }

    function sideName(s: "anti" | "pro") { return s === "anti" ? antiLabel : proLabel; }

    if (second && second.hiSide !== top.hiSide) {
      return `${sideName(top.hiSide)} tweets mention ${toDescriptor(top.label)} ${fmtRatio(top.ratio)} as often as ${sideName(second.hiSide)} tweets do, while ${sideName(second.hiSide)} tweets mention ${toDescriptor(second.label)} ${fmtRatio(second.ratio)} as often as ${sideName(top.hiSide)} tweets.`;
    }

    return `${sideName(top.hiSide)} tweets mention ${toDescriptor(top.label)} ${fmtRatio(top.ratio)} as often as the other side.`;
  })();

  // Tooltip
  const tooltipContent = hoveredFrame ? (() => {
    const antiSeg = antiBar.find((s) => s.key === hoveredFrame);
    const proSeg = proBar.find((s) => s.key === hoveredFrame);
    const label = hoveredFrame === "__other__" ? "Other" : (frame_labels[hoveredFrame] || hoveredFrame);
    const otherList = antiSeg?.isOther ? antiSeg.otherFrames : proSeg?.isOther ? proSeg.otherFrames : undefined;
    return (
      <div className="text-[10px] text-gray-400 mt-1 min-h-[18px]">
        <span className="font-medium text-gray-300">{label}</span>
        {" — "}
        <span className={sc.anti.text}>{antiSeg?.share.toFixed(1) || "0"}% {antiLabel}</span>
        {" · "}
        <span className={sc.pro.text}>{proSeg?.share.toFixed(1) || "0"}% {proLabel}</span>
        {otherList && otherList.length > 0 && (
          <span className="text-gray-600 ml-1">
            (Includes: {otherList.join(", ")})
          </span>
        )}
      </div>
    );
  })() : <div className="min-h-[18px] mt-1" />;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 sm:p-6">
      {/* Header */}
      <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 font-medium">
        Narrative Mix
      </div>
      <h3 className="text-sm font-semibold text-gray-300">
        How each side frames the issue
      </h3>

      {/* Stacked bars */}
      <div className="space-y-4 mt-5">
        <StackedBar
          segments={antiBar}
          sideLabel={antiLabel}
          sideColor={sc.anti.text}
          hoveredFrame={hoveredFrame}
          onHover={setHoveredFrame}
        />
        <StackedBar
          segments={proBar}
          sideLabel={proLabel}
          sideColor={sc.pro.text}
          hoveredFrame={hoveredFrame}
          onHover={setHoveredFrame}
        />
      </div>

      {/* Legend + tooltip */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-4">
        {topFrameKeys.map((k) => (
          <div
            key={k}
            className={`flex items-center gap-1.5 text-[10px] transition-opacity cursor-default ${
              hoveredFrame && hoveredFrame !== k ? "opacity-25" : ""
            }`}
            onMouseEnter={() => setHoveredFrame(k)}
            onMouseLeave={() => setHoveredFrame(null)}
          >
            <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: colorMap[k] }} />
            <span className="text-gray-400">{frame_labels[k]}</span>
          </div>
        ))}
        {hiddenFrames.length > 0 && (
          <div
            className={`flex items-center gap-1.5 text-[10px] transition-opacity cursor-default ${
              hoveredFrame && hoveredFrame !== "__other__" ? "opacity-25" : ""
            }`}
            onMouseEnter={() => setHoveredFrame("__other__")}
            onMouseLeave={() => setHoveredFrame(null)}
          >
            <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: OTHER_COLOR }} />
            <span className="text-gray-400">Other</span>
          </div>
        )}
      </div>
      {tooltipContent}

      {/* Top frame callouts */}
      <div className="grid grid-cols-2 gap-4 mt-6">
        <div className="bg-gray-800/50 rounded-xl px-5 py-4">
          <div className={`text-[10px] ${sc.anti.text} uppercase tracking-wider font-medium`}>
            {antiLabel}
          </div>
          <div className="text-lg text-gray-100 font-bold mt-1.5 leading-tight">
            {antiTopFrame.label}
          </div>
          <div className="text-sm text-gray-300 font-semibold mt-1.5">
            {antiTopPct}% <span className="text-xs text-gray-500 font-normal">of conversation</span>
          </div>
        </div>
        <div className="bg-gray-800/50 rounded-xl px-5 py-4">
          <div className={`text-[10px] ${sc.pro.text} uppercase tracking-wider font-medium`}>
            {proLabel}
          </div>
          <div className="text-lg text-gray-100 font-bold mt-1.5 leading-tight">
            {proTopFrame.label}
          </div>
          <div className="text-sm text-gray-300 font-semibold mt-1.5">
            {proTopPct}% <span className="text-xs text-gray-500 font-normal">of conversation</span>
          </div>
        </div>
      </div>

      {/* Executive takeaway */}
      <p className="text-xs text-gray-400 mt-5 leading-relaxed">
        {takeaway}
      </p>

      {/* Biggest framing gap */}
      <div className="mt-6 pt-4 border-t border-gray-800">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-1.5">Biggest gap</div>
        <p className="text-xs text-gray-300 leading-relaxed">
          {gapSentence}
        </p>
      </div>
    </div>
  );
}

function StackedBar({
  segments,
  sideLabel,
  sideColor,
  hoveredFrame,
  onHover,
}: {
  segments: BarSegment[];
  sideLabel: string;
  sideColor: string;
  hoveredFrame: string | null;
  onHover: (key: string | null) => void;
}) {
  return (
    <div>
      <div className={`text-xs font-medium ${sideColor} mb-1.5`}>{sideLabel}</div>
      <div className="h-9 rounded-lg overflow-hidden flex">
        {segments.map((seg) => (
          seg.share >= 0.5 ? (
            <div
              key={seg.key}
              className="h-full relative transition-opacity cursor-default"
              style={{
                width: `${seg.share}%`,
                backgroundColor: seg.color,
                opacity: hoveredFrame && hoveredFrame !== seg.key ? 0.2 : 1,
              }}
              onMouseEnter={() => onHover(seg.key)}
              onMouseLeave={() => onHover(null)}
            >
              <span className="absolute inset-0 flex items-center justify-center text-[9px] text-white font-semibold drop-shadow-sm">
                {Math.round(seg.share) > 0 ? `${Math.round(seg.share)}%` : ""}
              </span>
            </div>
          ) : null
        ))}
      </div>
    </div>
  );
}
