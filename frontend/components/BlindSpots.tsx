"use client";

import { useState } from "react";
import { AnalyticsData, SummaryData, GapEntry } from "@/lib/api";

interface BlindSpotsProps {
  analytics: AnalyticsData;
  narrativeGaps: SummaryData | null;
  frameGaps?: { anti: GapEntry[]; pro: GapEntry[] } | null;
  frameGapLabels?: { anti: string; pro: string };
}

function NarrativeSection({ points }: { points: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const preview = points[0];
  const rest = points.slice(1);

  return (
    <div>
      <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2 font-medium">
        Narrative blind spots
      </div>
      {/* Always show first point */}
      <div className="text-xs text-gray-300 leading-relaxed pl-4 border-l-2 border-gray-700">
        {preview}
      </div>
      {/* Expandable remaining points */}
      {rest.length > 0 && (
        <>
          {expanded && (
            <div className="space-y-3 mt-3">
              {rest.map((point, i) => (
                <div
                  key={i}
                  className="text-xs text-gray-300 leading-relaxed pl-4 border-l-2 border-gray-700"
                >
                  {point}
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
          >
            {expanded ? "Show less" : `Show ${rest.length} more`}
          </button>
        </>
      )}
    </div>
  );
}

export default function BlindSpots({ analytics, narrativeGaps, frameGaps, frameGapLabels }: BlindSpotsProps) {
  const antiLabel = analytics.anti_label;
  const proLabel = analytics.pro_label;
  const exclusive = analytics.exclusive_stories;
  const keywords = analytics.keyword_gaps;

  const hasExclusive = (exclusive?.anti_only?.length || 0) > 0 || (exclusive?.pro_only?.length || 0) > 0;
  const hasKeywords = (keywords?.anti_misses?.length || 0) > 0 || (keywords?.pro_misses?.length || 0) > 0;
  const hasNarrative = narrativeGaps?.summary;
  const hasFrameGaps = (frameGaps?.anti?.length || 0) > 0 || (frameGaps?.pro?.length || 0) > 0;

  if (!hasExclusive && !hasKeywords && !hasNarrative && !hasFrameGaps) return null;

  function toGapPhrase(label: string): string {
    const l = label.toLowerCase();
    if (l.includes("security") || l.includes("crime") || l.includes("threat") || l.includes("enforcement")) return "security and enforcement";
    if (l.includes("humanitarian") || l.includes("compassion") || l.includes("suffering")) return "humanitarian framing";
    if (l.includes("rights") || l.includes("fairness") || l.includes("dignity")) return "rights-based arguments";
    if (l.includes("rule of law") || l.includes("legality") || l.includes("law")) return "rule of law framing";
    if (l.includes("blame") || l.includes("institutional") || l.includes("political")) return "institutional blame";
    if (l.includes("economic") && (l.includes("cost") || l.includes("burden"))) return "economic cost concerns";
    if (l.includes("economic") && (l.includes("contribution") || l.includes("labor"))) return "economic contribution";
    if (l.includes("cultural") || l.includes("identity")) return "identity framing";
    if (l.includes("family") || l.includes("separation")) return "family impact";
    if (l.includes("military") || l.includes("escalation") || l.includes("defense")) return "military framing";
    if (l.includes("diplomat") || l.includes("peace")) return "diplomacy framing";
    if (l.includes("protest") || l.includes("anti-war")) return "protest framing";
    if (l.includes("border")) return "border enforcement";
    return label.toLowerCase();
  }

  const parseNarrativeGaps = (text: string) => {
    const antiSection: string[] = [];
    const proSection: string[] = [];
    let current: string[] | null = null;

    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.toLowerCase().includes(`what ${antiLabel.toLowerCase()} doesn`)) {
        current = antiSection;
      } else if (trimmed.toLowerCase().includes(`what ${proLabel.toLowerCase()} doesn`)) {
        current = proSection;
      } else if (current && (trimmed.startsWith("- ") || trimmed.startsWith("* "))) {
        current.push(trimmed.replace(/^[-*]\s*/, ""));
      }
    }
    return { antiMisses: antiSection, proMisses: proSection };
  };

  const narrative = hasNarrative ? parseNarrativeGaps(narrativeGaps!.summary) : null;

  const renderSide = (
    label: string,
    color: "blue" | "red",
    keywordData: { word: string; side_count: number; other_count: number; ratio: number | null }[] | undefined,
    exclusiveData: { url: string; display: string; count: number }[] | undefined,
    narrativeData: string[] | undefined,
    otherLabel: string,
    frameGapData?: GapEntry[],
  ) => {
    const colorClasses = {
      blue: {
        title: "text-blue-400",
        tagBg: "bg-red-500/15",
        tagText: "text-red-300",
        tagCount: "text-red-500/60",
        linkCount: "text-red-400/60",
        border: "border-blue-500/20",
        sectionBg: "bg-blue-500/5",
      },
      red: {
        title: "text-red-400",
        tagBg: "bg-blue-500/15",
        tagText: "text-blue-300",
        tagCount: "text-blue-500/60",
        linkCount: "text-blue-400/60",
        border: "border-red-500/20",
        sectionBg: "bg-red-500/5",
      },
    }[color];

    return (
      <div className={`rounded-lg border ${colorClasses.border} overflow-hidden`}>
        {/* Side header */}
        <div className={`px-4 py-2.5 ${colorClasses.sectionBg}`}>
          <div className={`text-sm font-semibold ${colorClasses.title}`}>
            What {label} doesn't see
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Keywords */}
          {keywordData && keywordData.length > 0 && (
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2 font-medium">
                Keywords they rarely encounter
              </div>
              <div className="flex flex-wrap gap-2">
                {keywordData.map((k) => (
                  <span
                    key={k.word}
                    className={`text-xs ${colorClasses.tagBg} ${colorClasses.tagText} px-2.5 py-1 rounded-md`}
                    title={`Used ${k.side_count}x by ${otherLabel}, ${k.other_count}x by ${label}`}
                  >
                    {k.word}
                    <span className={`${colorClasses.tagCount} ml-1.5 font-mono text-[10px]`}>
                      {k.side_count}x
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Exclusive stories */}
          {exclusiveData && exclusiveData.length > 0 && (
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2 font-medium">
                Stories only {otherLabel} sees
              </div>
              <div className="space-y-1.5">
                {exclusiveData.map((s) => (
                  <a
                    key={s.url}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-200 group"
                  >
                    <span className={`${colorClasses.linkCount} font-mono text-[10px] shrink-0 w-5`}>
                      {s.count}x
                    </span>
                    <span className="truncate group-hover:underline">
                      {s.display}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Narrative gaps — expandable */}
          {narrativeData && narrativeData.length > 0 && (
            <NarrativeSection points={narrativeData} />
          )}

          {/* Frame gaps — arguments this side ignores */}
          {frameGapData && frameGapData.length > 0 && (
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2 font-medium">
                Arguments they ignore
              </div>
              <div className="space-y-1.5">
                {frameGapData.map((g) => (
                  <div key={g.frame} className="flex items-center gap-2 text-xs">
                    <span className="text-gray-300">{toGapPhrase(g.label)}</span>
                    <span className="text-[10px] text-gray-600">{g.my_share}% vs {g.other_share}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-gray-300 mb-1">
        What Each Side Misses
      </h3>
      <p className="text-[10px] sm:text-xs text-gray-600 mb-5">
        Stories, keywords, and narratives that one side sees but the other doesn't
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {renderSide(
          antiLabel, "blue",
          keywords?.anti_misses,
          exclusive?.pro_only,
          narrative?.antiMisses,
          proLabel,
          frameGaps?.anti,
        )}
        {renderSide(
          proLabel, "red",
          keywords?.pro_misses,
          exclusive?.anti_only,
          narrative?.proMisses,
          antiLabel,
          frameGaps?.pro,
        )}
      </div>

      {hasNarrative && (
        <div className="mt-4 pt-3 border-t border-gray-800 flex items-center gap-2 text-[10px] text-gray-600">
          <span className="bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded">AI-generated</span>
          {narrativeGaps?.generated_at && (
            <span>Updated {new Date(narrativeGaps.generated_at).toLocaleDateString()}</span>
          )}
        </div>
      )}
    </div>
  );
}
