"use client";

import { useState } from "react";
import { NarrativeData, ExposureOverlapData, PlaybookEntry } from "@/lib/api";

interface NarrativeFramesProps {
  data: NarrativeData;
  exposureOverlap?: ExposureOverlapData | null;
  hideFraming?: boolean;
  playbook?: { anti: PlaybookEntry[]; pro: PlaybookEntry[] } | null;
  strategyLabels?: { anti: string; pro: string } | null;
  onViewTweets?: (frameKey: string) => void;
}

function StoryList({
  items,
  filter,
  antiLabel,
  proLabel,
  isUrl,
  showPct,
}: {
  items: { name: string; anti_count: number; pro_count: number; total: number; side: string }[];
  filter: string;
  antiLabel: string;
  proLabel: string;
  isUrl: boolean;
  showPct?: boolean;
}) {
  const filtered = filter === "all" ? items
    : filter === "shared" ? items.filter((i) => i.side === "shared")
    : filter === "anti" ? items.filter((i) => i.side === "anti" || i.side === "shared")
    : items.filter((i) => i.side === "pro" || i.side === "shared");

  if (filtered.length === 0) return <p className="text-xs text-gray-600 py-2">None found</p>;

  const grandTotal = showPct ? items.reduce((s, i) => s + i.total, 0) : 0;

  return (
    <div className="space-y-1 max-h-64 overflow-y-auto">
      {filtered.map((item) => {
        const pct = showPct && grandTotal > 0 ? Math.round(item.total / grandTotal * 100) : 0;
        const maxPct = showPct && grandTotal > 0
          ? Math.round(filtered[0].total / grandTotal * 100)
          : 0;
        const barWidth = maxPct > 0 ? (pct / maxPct) * 100 : 0;

        return (
        <div
          key={item.name}
          className={`relative flex items-center justify-between px-2.5 py-1.5 rounded border-l-2 overflow-hidden ${
            item.side === "shared"
              ? "border-gray-500"
              : item.side === "anti"
              ? "border-blue-500/40"
              : "border-red-500/40"
          }`}
        >
          {/* Background bar for themes */}
          {showPct && barWidth > 0 && (
            <div
              className={`absolute inset-y-0 left-0 ${
                item.side === "shared"
                  ? "bg-gray-700/30"
                  : item.side === "anti"
                  ? "bg-blue-500/10"
                  : "bg-red-500/10"
              }`}
              style={{ width: `${barWidth}%` }}
            />
          )}
          {!showPct && (
            <div className={`absolute inset-0 ${
              item.side === "shared"
                ? "bg-gray-800/30"
                : item.side === "anti"
                ? "bg-blue-500/5"
                : "bg-red-500/5"
            }`} />
          )}
          <div className="relative flex-1 min-w-0 mr-2">
            {isUrl ? (
              <a href={`https://${item.name}`} target="_blank" rel="noopener noreferrer"
                className="text-[11px] text-blue-400 hover:text-blue-300 truncate block">
                {item.name}
              </a>
            ) : (
              <span className="text-[11px] text-gray-300 truncate block">{item.name}</span>
            )}
          </div>
          <span className="relative text-[10px] text-gray-500 font-mono shrink-0">
            {showPct && grandTotal > 0 ? `${pct}%` : item.total}
          </span>
        </div>
        );
      })}
    </div>
  );
}

function ExposureOverlapCard({
  eo, antiLabel, proLabel,
}: {
  eo: ExposureOverlapData;
  antiLabel: string;
  proLabel: string;
}) {
  const [sideFilter, setSideFilter] = useState("all");

  const eoColor =
    eo.score <= 15 ? "text-red-400" : eo.score <= 35 ? "text-orange-400" : eo.score <= 60 ? "text-yellow-400" : "text-green-400";
  const eoBg =
    eo.score <= 15 ? "bg-red-500/10 border-red-500/30"
    : eo.score <= 35 ? "bg-orange-500/10 border-orange-500/30"
    : eo.score <= 60 ? "bg-yellow-500/10 border-yellow-500/30"
    : "bg-green-500/10 border-green-500/30";

  const filterButtons = (current: string, setter: (v: string) => void) => (
    <div className="flex items-center gap-3">
      {[
        { key: "all", label: "All" },
        { key: "shared", label: "Shared" },
        { key: "anti", label: antiLabel },
        { key: "pro", label: proLabel },
      ].map((f) => (
        <button
          key={f.key}
          onClick={() => setter(f.key)}
          className={`text-xs transition-colors pb-0.5 ${
            current === f.key
              ? "text-gray-200 border-b border-gray-200"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className={`border rounded-xl p-4 sm:p-5 ${eoBg}`}>
      {/* Header */}
      <div className="mb-3">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className={`text-3xl font-bold ${eoColor}`}>{eo.score}%</span>
          <span className="text-sm text-gray-300">of topics appear on both sides</span>
        </div>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed mb-4">
        {eo.sentence}
      </p>

      {/* Filter — shared across both columns */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-gray-500">Show:</span>
        {filterButtons(sideFilter, setSideFilter)}
      </div>

      {/* Two-column: Themes + URLs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Themes */}
        <div>
          <div className="text-xs font-semibold text-gray-300 mb-2">
            Themes{eo.by_type && <span className="text-gray-500 font-normal"> ({eo.by_type.themes.shared} shared)</span>}
          </div>
          <StoryList
            items={eo.themes_list || []}
            filter={sideFilter}
            antiLabel={antiLabel}
            proLabel={proLabel}
            isUrl={false}
            showPct={true}
          />
        </div>

        {/* URLs */}
        <div>
          <div className="text-xs font-semibold text-gray-300 mb-2">
            Links{eo.by_type && <span className="text-gray-500 font-normal"> ({eo.by_type.urls.shared} shared)</span>}
          </div>
          <StoryList
            items={eo.urls_list || []}
            filter={sideFilter}
            antiLabel={antiLabel}
            proLabel={proLabel}
            isUrl={true}
          />
        </div>
      </div>
    </div>
  );
}

function RadarChart({ keys, labels, antiValues, proValues, antiLabel, proLabel }: {
  keys: string[];
  labels: Record<string, string>;
  antiValues: Record<string, { pct: number }>;
  proValues: Record<string, { pct: number }>;
  antiLabel: string;
  proLabel: string;
}) {
  const n = keys.length;
  if (n < 3) return null;

  const maxPct = Math.max(
    ...keys.map((k) => Math.max(antiValues[k]?.pct || 0, proValues[k]?.pct || 0)),
    1
  );

  const size = 480;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.22;
  const rings = [25, 50, 75, 100];
  const angleStep = (2 * Math.PI) / n;

  const getPoint = (index: number, value: number) => {
    const angle = angleStep * index - Math.PI / 2;
    const r = (value / 100) * maxR;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };

  const antiPoints = keys.map((k, i) => getPoint(i, ((antiValues[k]?.pct || 0) / maxPct) * 100));
  const proPoints = keys.map((k, i) => getPoint(i, ((proValues[k]?.pct || 0) / maxPct) * 100));

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[400px] sm:max-w-[460px]">
        {rings.map((r) => {
          const points = Array.from({ length: n }, (_, i) => getPoint(i, r));
          return <polygon key={r} points={points.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="rgb(55, 65, 81)" strokeWidth="0.5" />;
        })}
        {keys.map((_, i) => {
          const p = getPoint(i, 100);
          return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgb(55, 65, 81)" strokeWidth="0.5" />;
        })}
        <polygon points={antiPoints.map((p) => `${p.x},${p.y}`).join(" ")} fill="rgba(59, 130, 246, 0.15)" stroke="rgb(59, 130, 246)" strokeWidth="1.5" />
        <polygon points={proPoints.map((p) => `${p.x},${p.y}`).join(" ")} fill="rgba(239, 68, 68, 0.15)" stroke="rgb(239, 68, 68)" strokeWidth="1.5" />
        {antiPoints.map((p, i) => <circle key={`a${i}`} cx={p.x} cy={p.y} r="2.5" fill="rgb(59, 130, 246)" />)}
        {proPoints.map((p, i) => <circle key={`p${i}`} cx={p.x} cy={p.y} r="2.5" fill="rgb(239, 68, 68)" />)}
        {keys.map((key, i) => {
          const angle = angleStep * i - Math.PI / 2;
          const labelR = maxR + 32;
          const lx = cx + labelR * Math.cos(angle);
          const ly = cy + labelR * Math.sin(angle);
          const cosA = Math.cos(angle);
          const anchor = cosA > 0.3 ? "start" : cosA < -0.3 ? "end" : "middle";
          return <text key={key} x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle" fill="rgb(156, 163, 175)" fontSize="11">{labels[key] || key}</text>;
        })}
      </svg>
      <div className="flex justify-center gap-6 mt-2 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
          <span className="text-blue-400 font-medium">{antiLabel}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <span className="text-red-400 font-medium">{proLabel}</span>
        </div>
      </div>
    </div>
  );
}

export default function NarrativeFrames({ data, exposureOverlap, hideFraming, playbook, strategyLabels, onViewTweets }: NarrativeFramesProps) {
  const { frames, emotions, frame_gaps, emotion_gaps, frame_labels, emotion_labels } = data;
  const antiLabel = data.anti_label;
  const proLabel = data.pro_label;

  const [frameView, setFrameView] = useState<"frames" | "emotions">("frames");
  const [showScoreTooltip, setShowScoreTooltip] = useState(false);

  // Sort frames by total usage
  const sortedFrameKeys = Object.keys(frame_labels)
    .map((k) => ({ key: k, total: (frames.anti[k]?.pct || 0) + (frames.pro[k]?.pct || 0) }))
    .filter((d) => d.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)
    .map((d) => d.key);

  // Sort emotions by total usage
  const sortedEmotionKeys = [...new Set([...Object.keys(emotions.anti), ...Object.keys(emotions.pro)])]
    .map((k) => ({ key: k, total: (emotions.anti[k]?.pct || 0) + (emotions.pro[k]?.pct || 0) }))
    .filter((d) => d.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)
    .map((d) => d.key);

  // Dominant emotions per side
  const antiTopEmotion = sortedEmotionKeys.length > 0
    ? sortedEmotionKeys.reduce((best, k) => (emotions.anti[k]?.pct || 0) > (emotions.anti[best]?.pct || 0) ? k : best, sortedEmotionKeys[0])
    : null;
  const proTopEmotion = sortedEmotionKeys.length > 0
    ? sortedEmotionKeys.reduce((best, k) => (emotions.pro[k]?.pct || 0) > (emotions.pro[best]?.pct || 0) ? k : best, sortedEmotionKeys[0])
    : null;

  // --- Narrative Gap Score ---
  const allFrameKeys = Object.keys(frame_labels);
  const antiTotal = allFrameKeys.reduce((sum, k) => sum + (frames.anti[k]?.count || 0), 0);
  const proTotal = allFrameKeys.reduce((sum, k) => sum + (frames.pro[k]?.count || 0), 0);

  const frameDiffs = allFrameKeys.map((k) => {
    const antiShare = antiTotal > 0 ? (frames.anti[k]?.count || 0) / antiTotal : 0;
    const proShare = proTotal > 0 ? (frames.pro[k]?.count || 0) / proTotal : 0;
    return { key: k, label: frame_labels[k], diff: Math.abs(antiShare - proShare), antiShare, proShare };
  });

  const narrativeGapScore = Math.round(0.5 * frameDiffs.reduce((sum, d) => sum + d.diff, 0) * 100);
  const topDrivers = [...frameDiffs].sort((a, b) => b.diff - a.diff).slice(0, 3);

  const gapLabel =
    narrativeGapScore <= 20 ? "Similar stories"
    : narrativeGapScore <= 40 ? "Noticeably different stories"
    : narrativeGapScore <= 60 ? "Very different stories"
    : "Almost completely different stories";

  const gapColor =
    narrativeGapScore <= 20 ? "text-green-400"
    : narrativeGapScore <= 40 ? "text-yellow-400"
    : narrativeGapScore <= 60 ? "text-orange-400"
    : "text-red-400";

  const gapBgColor =
    narrativeGapScore <= 20 ? "bg-green-500/10 border-green-500/30"
    : narrativeGapScore <= 40 ? "bg-yellow-500/10 border-yellow-500/30"
    : narrativeGapScore <= 60 ? "bg-orange-500/10 border-orange-500/30"
    : "bg-red-500/10 border-red-500/30";

  const maxFramePct = Math.max(
    ...allFrameKeys.flatMap((k) => [frames.anti[k]?.pct || 0, frames.pro[k]?.pct || 0]),
    1
  );

  if (hideFraming) {
    return exposureOverlap ? (
      <ExposureOverlapCard eo={exposureOverlap} antiLabel={antiLabel} proLabel={proLabel} />
    ) : null;
  }

  const titles: Record<string, { title: string; subtitle: string }> = {
    frames: {
      title: "What Each Side Argues",
      subtitle: "The arguments and themes each side emphasizes — where the shapes diverge, priorities differ",
    },
    emotions: {
      title: "The Emotional Energy Behind Each Side",
      subtitle: "Two sides can argue the same point with very different emotions — where the shapes diverge, they bring different energy",
    },
  };

  return (
    <div className="space-y-4">
      {exposureOverlap && <ExposureOverlapCard eo={exposureOverlap} antiLabel={antiLabel} proLabel={proLabel} />}

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-1">
          <div>
            <h3 className="text-sm font-semibold text-gray-300">{titles[frameView].title}</h3>
            <p className="text-[10px] sm:text-xs text-gray-600 mt-0.5">{titles[frameView].subtitle}</p>
          </div>
          <div className="flex items-center gap-1 bg-gray-800 rounded-md p-0.5 shrink-0">
            {([
              { id: "frames" as const, label: "Arguments" },
              { id: "emotions" as const, label: "Emotions" },
            ]).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFrameView(tab.id)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  frameView === tab.id ? "bg-gray-700 text-gray-100" : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Arguments radar */}
        {frameView === "frames" && sortedFrameKeys.length >= 3 && (
          <>
            <RadarChart
              keys={sortedFrameKeys}
              labels={frame_labels}
              antiValues={frames.anti}
              proValues={frames.pro}
              antiLabel={antiLabel}
              proLabel={proLabel}
            />
            <div className="text-[10px] text-gray-600 mt-3">
              Based on {data.total_framed.anti} {antiLabel} and {data.total_framed.pro} {proLabel} tweets
            </div>

            {/* Ranked top frames per side */}
            {playbook && (playbook.anti.length > 0 || playbook.pro.length > 0) && (() => {
              const rankLabels = ["#1", "#2", "#3"];
              const aL = strategyLabels?.anti || antiLabel;
              const pL = strategyLabels?.pro || proLabel;
              return (
                <div className="mt-5 pt-5 border-t border-gray-800">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-medium">Top Arguments Per Side</div>
                  <p className="text-[10px] text-gray-600 mb-4">
                    Ranked by how often each frame appears. A tweet can use multiple frames.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {(["anti", "pro"] as const).map((side) => {
                      const entries = playbook[side];
                      const label = side === "anti" ? aL : pL;
                      const colorClass = side === "anti" ? "text-blue-400" : "text-red-400";
                      const borderClass = side === "anti" ? "border-blue-500/20" : "border-red-500/20";
                      const barColor = side === "anti" ? "bg-blue-500/50" : "bg-red-500/50";
                      const maxShare = entries.length > 0 ? entries[0].share : 1;
                      return (
                        <div key={side} className={`border ${borderClass} rounded-xl p-4 bg-gray-800/20`}>
                          <div className={`text-[10px] ${colorClass} uppercase tracking-wider font-medium mb-3`}>{label}</div>
                          <div className="space-y-3">
                            {entries.map((entry, i) => (
                              <div key={entry.frame}>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`text-[10px] ${colorClass} font-bold`}>{rankLabels[i] || `#${i + 1}`}</span>
                                  <span className="text-sm text-gray-200 font-medium">{entry.label}</span>
                                  {onViewTweets && (
                                    <button
                                      onClick={() => onViewTweets(entry.frame)}
                                      className="text-[9px] text-gray-500 hover:text-gray-300 transition-colors ml-auto"
                                    >
                                      View tweets &rarr;
                                    </button>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-4 bg-gray-800 rounded overflow-hidden relative">
                                    <div className={`h-full ${barColor} rounded`} style={{ width: `${(entry.share / maxShare) * 100}%` }} />
                                    <span className="absolute inset-y-0 left-2 flex items-center text-[9px] text-white font-medium">{entry.share}% of frames</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {/* Emotions radar */}
        {frameView === "emotions" && sortedEmotionKeys.length >= 3 && (
          <>
            <RadarChart
              keys={sortedEmotionKeys}
              labels={emotion_labels}
              antiValues={emotions.anti}
              proValues={emotions.pro}
              antiLabel={antiLabel}
              proLabel={proLabel}
            />
            {antiTopEmotion && proTopEmotion && (
              <p className="text-[10px] text-gray-500 mt-4">
                {antiLabel} leans toward {emotion_labels[antiTopEmotion] || antiTopEmotion} while {proLabel} leans toward {emotion_labels[proTopEmotion] || proTopEmotion}.
                {antiTopEmotion === proTopEmotion
                  ? " Both sides share the same dominant emotional register."
                  : " The two sides bring different emotional energy to the same topic."}
              </p>
            )}
            <div className="text-[10px] text-gray-600 mt-2">
              Based on {data.total_framed.anti} {antiLabel} and {data.total_framed.pro} {proLabel} tweets
            </div>

            {/* Top Emotions Per Side */}
            {(() => {
              const rankLabels = ["#1", "#2", "#3"];
              const antiEmotionRanked = sortedEmotionKeys
                .map((k) => ({ key: k, label: emotion_labels[k] || k, pct: emotions.anti[k]?.pct || 0 }))
                .filter((e) => e.pct > 0)
                .sort((a, b) => b.pct - a.pct)
                .slice(0, 3);
              const proEmotionRanked = sortedEmotionKeys
                .map((k) => ({ key: k, label: emotion_labels[k] || k, pct: emotions.pro[k]?.pct || 0 }))
                .filter((e) => e.pct > 0)
                .sort((a, b) => b.pct - a.pct)
                .slice(0, 3);

              if (antiEmotionRanked.length === 0 && proEmotionRanked.length === 0) return null;

              return (
                <div className="mt-5 pt-5 border-t border-gray-800">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-medium">Top Emotions Per Side</div>
                  <p className="text-[10px] text-gray-600 mb-4">
                    The dominant emotional tone in each side&apos;s tweets, ranked by frequency.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {([
                      { entries: antiEmotionRanked, label: antiLabel, colorClass: "text-blue-400", borderClass: "border-blue-500/20", barColor: "bg-blue-500/50" },
                      { entries: proEmotionRanked, label: proLabel, colorClass: "text-red-400", borderClass: "border-red-500/20", barColor: "bg-red-500/50" },
                    ]).map(({ entries, label, colorClass, borderClass, barColor }) => {
                      const maxPctLocal = entries.length > 0 ? entries[0].pct : 1;
                      return (
                        <div key={label} className={`border ${borderClass} rounded-xl p-4 bg-gray-800/20`}>
                          <div className={`text-[10px] ${colorClass} uppercase tracking-wider font-medium mb-3`}>{label}</div>
                          <div className="space-y-3">
                            {entries.map((entry, i) => (
                              <div key={entry.key}>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`text-[10px] ${colorClass} font-bold`}>{rankLabels[i] || `#${i + 1}`}</span>
                                  <span className="text-sm text-gray-200 font-medium">{entry.label}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-4 bg-gray-800 rounded overflow-hidden relative">
                                    <div className={`h-full ${barColor} rounded`} style={{ width: `${(entry.pct / maxPctLocal) * 100}%` }} />
                                    <span className="absolute inset-y-0 left-2 flex items-center text-[9px] text-white font-medium">{entry.pct}% of tweets</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </>
        )}

      </div>
    </div>
  );
}
