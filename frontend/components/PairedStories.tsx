"use client";

import { useState } from "react";
import { PairedStoriesData, PairedStory, PairedSide } from "@/lib/api";

interface PairedStoriesProps {
  data: PairedStoriesData;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "..." : text;
}

function ContrastBadge({ label }: { label: string }) {
  const color =
    label === "High contrast"
      ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
      : label === "Different framing"
      ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
      : label === "Different tone"
      ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
      : "bg-gray-700 text-gray-400 border-gray-600";

  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${color}`}>
      {label}
    </span>
  );
}

function ExpandedStory({
  story,
  antiLabel,
  proLabel,
  onCollapse,
}: {
  story: PairedStory;
  antiLabel: string;
  proLabel: string;
  onCollapse: () => void;
}) {
  const [showFullText, setShowFullText] = useState(false);

  return (
    <div className="border border-gray-700 rounded-xl overflow-hidden">
      {/* Story header */}
      <div className="px-4 sm:px-5 py-3 bg-gray-800/40 border-b border-gray-800">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h4 className="text-base sm:text-lg font-semibold text-gray-100">
              {story.story_label}
            </h4>
            <div className="text-[10px] text-gray-500 mt-0.5">
              Shared story &middot; {story.anti_tweet_count + story.pro_tweet_count} tweets from both sides
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ContrastBadge label={story.contrast_label} />
            <button
              onClick={onCollapse}
              className="text-gray-500 hover:text-gray-300 transition-colors p-1"
              aria-label="Collapse"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Hero: side-by-side framing headlines */}
      <div className="grid grid-cols-1 sm:grid-cols-2">
        {/* Left */}
        <a
          href={story.anti.url || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="block p-4 sm:p-5 border-b sm:border-b-0 sm:border-r border-gray-800 bg-blue-500/[0.03] hover:bg-blue-500/[0.06] transition-colors"
        >
          <div className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider mb-2">
            {antiLabel}
          </div>
          <p className="text-base sm:text-lg font-semibold text-gray-100 leading-snug mb-3">
            {story.anti.headline}
          </p>
          <p className="text-[11px] text-gray-500 leading-relaxed mb-2">
            {truncate(story.anti.full_text, 140)}
          </p>
          <div className="text-[10px] text-gray-600">
            @{story.anti.screen_name}
            {story.anti.source && <span> &middot; {story.anti.source}</span>}
            <span className="ml-2">
              {"\u2764"} {formatNumber(story.anti.likes)} &middot; {"\uD83D\uDC41"} {formatNumber(story.anti.views)}
            </span>
          </div>
        </a>

        {/* Right */}
        <a
          href={story.pro.url || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="block p-4 sm:p-5 bg-red-500/[0.03] hover:bg-red-500/[0.06] transition-colors"
        >
          <div className="text-[10px] text-red-400 font-semibold uppercase tracking-wider mb-2">
            {proLabel}
          </div>
          <p className="text-base sm:text-lg font-semibold text-gray-100 leading-snug mb-3">
            {story.pro.headline}
          </p>
          <p className="text-[11px] text-gray-500 leading-relaxed mb-2">
            {truncate(story.pro.full_text, 140)}
          </p>
          <div className="text-[10px] text-gray-600">
            @{story.pro.screen_name}
            {story.pro.source && <span> &middot; {story.pro.source}</span>}
            <span className="ml-2">
              {"\u2764"} {formatNumber(story.pro.likes)} &middot; {"\uD83D\uDC41"} {formatNumber(story.pro.views)}
            </span>
          </div>
        </a>
      </div>

      {/* Frame vs Frame comparison strip */}
      <div className="px-4 sm:px-5 py-2.5 bg-gray-800/30 border-t border-gray-800">
        <div className="flex items-center justify-center gap-3 sm:gap-6 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="bg-purple-500/15 text-purple-300 px-2 py-0.5 rounded text-[11px]">{story.anti.frame}</span>
            <span className="text-gray-600 text-xs">vs</span>
            <span className="bg-purple-500/15 text-purple-300 px-2 py-0.5 rounded text-[11px]">{story.pro.frame}</span>
          </div>
          <div className="w-px h-4 bg-gray-700 hidden sm:block" />
          <div className="flex items-center gap-1.5">
            <span className="bg-amber-500/15 text-amber-300 px-2 py-0.5 rounded text-[11px]">{story.anti.emotion}</span>
            <span className="text-gray-600 text-xs">vs</span>
            <span className="bg-amber-500/15 text-amber-300 px-2 py-0.5 rounded text-[11px]">{story.pro.emotion}</span>
          </div>
        </div>
      </div>

      {/* Comparison takeaway */}
      {story.interpretation && (
        <div className="px-4 sm:px-5 py-3 border-t border-gray-800">
          <p className="text-xs text-gray-400 text-center leading-relaxed">
            {story.interpretation}
          </p>
          <div className="flex items-center justify-center gap-3 mt-2">
            <button
              onClick={() => setShowFullText(!showFullText)}
              className="text-[10px] text-gray-500 hover:text-gray-300"
            >
              {showFullText ? "Hide full tweets" : "Show full tweets"}
            </button>
            {story.anti.url && (
              <a href={story.anti.url} target="_blank" rel="noopener noreferrer"
                className="text-[10px] text-blue-400 hover:text-blue-300">View {antiLabel} tweet</a>
            )}
            {story.pro.url && (
              <a href={story.pro.url} target="_blank" rel="noopener noreferrer"
                className="text-[10px] text-red-400 hover:text-red-300">View {proLabel} tweet</a>
            )}
          </div>
        </div>
      )}

      {/* Full tweet text — expandable */}
      {showFullText && (
        <div className="grid grid-cols-1 sm:grid-cols-2 border-t border-gray-800">
          <div className="p-4 border-b sm:border-b-0 sm:border-r border-gray-800">
            <p className="text-xs text-gray-400 whitespace-pre-wrap leading-relaxed">{story.anti.full_text}</p>
          </div>
          <div className="p-4">
            <p className="text-xs text-gray-400 whitespace-pre-wrap leading-relaxed">{story.pro.full_text}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function CollapsedStory({
  story,
  antiLabel,
  proLabel,
  onExpand,
}: {
  story: PairedStory;
  antiLabel: string;
  proLabel: string;
  onExpand: () => void;
}) {
  return (
    <button
      onClick={onExpand}
      className="w-full border border-gray-800 rounded-xl p-3 sm:p-4 hover:bg-gray-800/30 transition-colors text-left"
    >
      <div className="flex items-start gap-3">
        <span className="text-gray-500 text-xs shrink-0 mt-1">{"\u25B6"}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs font-medium text-gray-200">{story.story_label}</span>
            <ContrastBadge label={story.contrast_label} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 sm:gap-2 text-[11px]">
            <div>
              <span className="text-blue-400 font-medium">{antiLabel}:</span>
              <span className="text-gray-400 ml-1">{story.anti.headline}</span>
            </div>
            <div>
              <span className="text-red-400 font-medium">{proLabel}:</span>
              <span className="text-gray-400 ml-1">{story.pro.headline}</span>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

export default function PairedStories({ data }: PairedStoriesProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set([0, 1]));

  if (!data.stories || data.stories.length === 0) return null;

  const toggle = (i: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-gray-300">
          Same Story, Different Lens
        </h3>
        <p className="text-[10px] sm:text-xs text-gray-600 mt-0.5">
          How each side frames the same real-world events — ranked by contrast
        </p>
      </div>

      <div className="space-y-3">
        {data.stories.map((story, i) =>
          expanded.has(i) ? (
            <ExpandedStory key={i} story={story} antiLabel={data.anti_label} proLabel={data.pro_label} onCollapse={() => toggle(i)} />
          ) : (
            <CollapsedStory
              key={i}
              story={story}
              antiLabel={data.anti_label}
              proLabel={data.pro_label}
              onExpand={() => toggle(i)}
            />
          )
        )}
      </div>
    </div>
  );
}
