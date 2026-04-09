"use client";

import { useState } from "react";
import { AnalyticsData } from "@/lib/api";
import { getSideColors, ColorScheme } from "@/lib/colors";

interface AnalyticsViewProps {
  data: AnalyticsData;
  colorScheme?: ColorScheme;
}

interface DonutSlice {
  label: string;
  count: number;
  pct: number;
  color: string;
  path: string;
}

function DonutChart({ slices, total, cx, cy, size }: {
  slices: DonutSlice[];
  total: number;
  cx: number;
  cy: number;
  size: number;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const hoveredSlice = hovered ? slices.find((s) => s.label === hovered) : null;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-48 h-48 sm:w-56 sm:h-56">
        {slices.map((s) => (
          <path
            key={s.label}
            d={s.path}
            fill={s.color}
            stroke="rgb(17, 24, 39)"
            strokeWidth="2"
            opacity={hovered && hovered !== s.label ? 0.4 : 1}
            className="transition-opacity cursor-pointer"
            onMouseEnter={() => setHovered(s.label)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
        {/* Center text — shows hovered item or total */}
        {hoveredSlice ? (
          <>
            <text x={cx} y={cy - 8} textAnchor="middle" fill={hoveredSlice.color} fontSize="18" fontWeight="700">
              {hoveredSlice.pct}%
            </text>
            <text x={cx} y={cy + 8} textAnchor="middle" fill="rgb(209, 213, 219)" fontSize="9">
              {hoveredSlice.label}
            </text>
            <text x={cx} y={cy + 20} textAnchor="middle" fill="rgb(107, 114, 128)" fontSize="8">
              {hoveredSlice.count} links
            </text>
          </>
        ) : (
          <>
            <text x={cx} y={cy - 6} textAnchor="middle" fill="rgb(209, 213, 219)" fontSize="22" fontWeight="700">
              {total}
            </text>
            <text x={cx} y={cy + 10} textAnchor="middle" fill="rgb(107, 114, 128)" fontSize="9">
              total links
            </text>
          </>
        )}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-3">
        {slices.map((s) => (
          <div
            key={s.label}
            className={`flex items-center gap-1.5 text-xs cursor-pointer transition-opacity ${
              hovered && hovered !== s.label ? "opacity-40" : ""
            }`}
            onMouseEnter={() => setHovered(s.label)}
            onMouseLeave={() => setHovered(null)}
          >
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: s.color }}
            />
            <span className={s.label === "Other" ? "text-gray-500" : "text-gray-300"}>
              {s.label} {s.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

export function EngagementComparison({ data, colorScheme }: AnalyticsViewProps) {
  const sc = getSideColors(colorScheme || "political");
  const { anti, pro } = data.engagement;
  const metrics = [
    { label: "Tweets", anti: anti.count, pro: pro.count, icon: "#" },
    { label: "Avg Likes", anti: anti.avg_likes, pro: pro.avg_likes, icon: "\u2764" },
    { label: "Avg Retweets", anti: anti.avg_retweets, pro: pro.avg_retweets, icon: "\uD83D\uDD01" },
    { label: "Avg Replies", anti: anti.avg_replies, pro: pro.avg_replies, icon: "\uD83D\uDCAC" },
    { label: "Avg Views", anti: anti.avg_views, pro: pro.avg_views, icon: "\uD83D\uDC41" },
    { label: "Avg Engagement", anti: anti.avg_engagement, pro: pro.avg_engagement, icon: "\u26A1" },
  ];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-gray-300 mb-4">
        Engagement Comparison
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {metrics.map((m) => {
          const antiWins = m.anti > m.pro;
          const proWins = m.pro > m.anti;
          const tie = m.anti === m.pro;

          return (
            <div
              key={m.label}
              className="bg-gray-800/50 rounded-lg p-3"
            >
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">
                {m.label}
              </div>
              <div className="flex items-end justify-between gap-2">
                {/* Anti value */}
                <div className="text-center flex-1">
                  <div
                    className={`text-lg sm:text-xl font-bold font-mono ${
                      antiWins ? sc.anti.text : "text-gray-500"
                    }`}
                  >
                    {formatNumber(m.anti)}
                  </div>
                  <div className={`text-[10px] ${sc.anti.text} opacity-60 mt-0.5`}>
                    {data.anti_label}
                  </div>
                </div>

                {/* Divider + indicator */}
                <div className="flex flex-col items-center pb-3">
                  <div
                    className={`text-[10px] font-bold ${
                      tie ? "text-gray-500" : antiWins ? sc.anti.text : sc.pro.text
                    }`}
                  >
                    {tie ? "=" : antiWins ? "\u25C0" : "\u25B6"}
                  </div>
                </div>

                {/* Pro value */}
                <div className="text-center flex-1">
                  <div
                    className={`text-lg sm:text-xl font-bold font-mono ${
                      proWins ? sc.pro.text : "text-gray-500"
                    }`}
                  >
                    {formatNumber(m.pro)}
                  </div>
                  <div className={`text-[10px] ${sc.pro.text} opacity-60 mt-0.5`}>
                    {data.pro_label}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VoiceList({
  voices,
  label,
  colorClass,
}: {
  voices: { screen_name: string; author_name: string; followers: number; tweet_count: number; total_engagement: number }[];
  label: string;
  colorClass: string;
}) {
  return (
    <div>
      <div className={`text-xs font-medium ${colorClass} mb-2`}>{label}</div>
      <div className="space-y-1.5">
        {voices.map((v, i) => (
          <div
            key={v.screen_name}
            className="flex items-center gap-2 bg-gray-800/40 rounded-lg px-2.5 py-1.5"
          >
            <span className="text-gray-600 text-xs font-mono w-4 shrink-0">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <a
                href={`https://x.com/${v.screen_name}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-gray-200 hover:text-blue-400 truncate block transition-colors"
              >
                @{v.screen_name}
              </a>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] text-gray-500">
                {formatNumber(v.total_engagement)} engagements
              </span>
              <span className="text-[10px] bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded">
                {v.tweet_count} {v.tweet_count === 1 ? "tw" : "tw"}
              </span>
            </div>
          </div>
        ))}
        {voices.length === 0 && (
          <p className="text-xs text-gray-600">No data</p>
        )}
      </div>
    </div>
  );
}

function PhraseCloud({
  phrases,
  label,
  colorClass,
  bgClass,
}: {
  phrases: { phrase: string; count: number }[];
  label: string;
  colorClass: string;
  bgClass: string;
}) {
  const maxCount = Math.max(...phrases.map((p) => p.count), 1);

  // Map count to font size: smallest=11px, largest=20px
  const getSize = (count: number) => {
    const ratio = count / maxCount;
    return 11 + ratio * 9;
  };

  return (
    <div>
      <div className={`text-xs font-medium ${colorClass} mb-2`}>{label}</div>
      <div className="flex flex-wrap gap-2 items-baseline">
        {phrases.map((p) => (
          <span
            key={p.phrase}
            className={`${bgClass} ${colorClass} px-2 py-0.5 rounded-md inline-block`}
            style={{ fontSize: `${getSize(p.count)}px` }}
            title={`${p.count} mentions`}
          >
            {p.phrase}
            <span className="opacity-50 ml-1 text-[10px]">{p.count}</span>
          </span>
        ))}
        {phrases.length === 0 && (
          <p className="text-xs text-gray-600">No data</p>
        )}
      </div>
    </div>
  );
}

function VoicesAndPhrases({ data, colorScheme }: AnalyticsViewProps) {
  const sc = getSideColors(colorScheme || "political");
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-gray-300 mb-4">
        Top Voices
      </h3>
      <div className="space-y-4">
        <VoiceList
          voices={data.voices.anti}
          label={data.anti_label}
          colorClass={sc.anti.text}
        />
        <VoiceList
          voices={data.voices.pro}
          label={data.pro_label}
          colorClass={sc.pro.text}
        />
      </div>
    </div>
  );
}

export function TrendingPhrases({ data, colorScheme }: AnalyticsViewProps) {
  const sc = getSideColors(colorScheme || "political");
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-medium">Language</div>
      <h3 className="text-sm font-semibold text-gray-300 mb-0.5">
        Trending Phrases
      </h3>
      <p className="text-[10px] text-gray-600 mb-4">
        The most common phrases each side uses in their tweets
      </p>
      <div className="space-y-4">
        <PhraseCloud
          phrases={data.phrases.anti}
          label={data.anti_label}
          colorClass={sc.anti.text}
          bgClass={sc.anti.bgLight}
        />
        <PhraseCloud
          phrases={data.phrases.pro}
          label={data.pro_label}
          colorClass={sc.pro.text}
          bgClass={sc.pro.bgLight}
        />
      </div>
    </div>
  );
}

function TopSources({ data, colorScheme }: AnalyticsViewProps) {
  const sc = getSideColors(colorScheme || "political");
  const [viewMode, setViewMode] = useState<"publishers" | "urls">("publishers");
  const [sideFilter, setSideFilter] = useState<"overall" | "anti" | "pro" | "shared">("overall");

  const sources = data.sources;
  if (!sources) return null;

  const hasAnti = sources.anti?.domains?.length > 0 || sources.anti?.urls?.length > 0;
  const hasPro = sources.pro?.domains?.length > 0 || sources.pro?.urls?.length > 0;
  const hasOverall = sources.overall?.domains?.length > 0 || sources.overall?.urls?.length > 0;
  const hasShared = data.overlap?.shared_sources?.length > 0 || data.overlap?.shared_urls?.length > 0;

  if (!hasAnti && !hasPro && !hasOverall) return null;

  // Build shared sources/urls from overlap data
  const sharedDomains = (data.overlap?.shared_sources || []).map(s => ({ domain: s.domain, count: s.total }));
  const sharedUrls = (data.overlap?.shared_urls || []).map(u => ({ url: u.url, display: u.display, count: u.total }));

  // Pick data based on side filter
  const activeSources = sideFilter === "anti" ? sources.anti
    : sideFilter === "pro" ? sources.pro
    : sideFilter === "shared" ? null
    : sources.overall;

  const barColor = sideFilter === "anti" ? sc.anti.border.replace("border-", "bg-")
    : sideFilter === "pro" ? sc.pro.border.replace("border-", "bg-")
    : sideFilter === "shared" ? "bg-yellow-500/40"
    : "bg-gray-400/40";

  const activeDomains = sideFilter === "shared" ? sharedDomains : (activeSources?.domains || []);
  const activeUrls = sideFilter === "shared" ? sharedUrls : (activeSources?.urls || []);

  const renderDomainList = (
    domains: { domain: string; count: number }[],
    bgColor: string
  ) => {
    const maxCount = Math.max(...domains.map((d) => d.count), 1);
    return (
      <div className="space-y-1.5">
        {domains.map((d) => (
          <div key={d.domain} className="flex items-center gap-2">
            <div className="flex-1 h-6 bg-gray-800 rounded overflow-hidden relative">
              <div
                className={`h-full ${bgColor} rounded`}
                style={{ width: `${(d.count / maxCount) * 100}%` }}
              />
              <span className="absolute inset-0 flex items-center px-2 text-[11px] text-gray-300 truncate">
                {d.domain}
              </span>
            </div>
            <span className="text-[10px] text-gray-500 w-6 text-right shrink-0">
              {d.count}
            </span>
          </div>
        ))}
        {domains.length === 0 && (
          <p className="text-xs text-gray-600">No sources found</p>
        )}
      </div>
    );
  };

  const renderUrlList = (
    urls: { url: string; display: string; count: number }[],
    bgColor: string
  ) => {
    const maxCount = Math.max(...urls.map((u) => u.count), 1);
    return (
      <div className="space-y-1.5">
        {urls.map((u) => (
          <div key={u.url} className="flex items-center gap-2">
            <div className="flex-1 h-6 bg-gray-800 rounded overflow-hidden relative">
              <div
                className={`h-full ${bgColor} rounded`}
                style={{ width: `${(u.count / maxCount) * 100}%` }}
              />
              <a
                href={u.url}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute inset-0 flex items-center px-2 text-[11px] text-blue-300 hover:text-blue-200 truncate"
              >
                {u.display}
              </a>
            </div>
            <span className="text-[10px] text-gray-500 w-6 text-right shrink-0">
              {u.count}
            </span>
          </div>
        ))}
        {urls.length === 0 && (
          <p className="text-xs text-gray-600">No URLs found</p>
        )}
      </div>
    );
  };

  // Build donut from active domains
  const buildDonut = (domains: { domain: string; count: number }[]) => {
    if (domains.length === 0) return null;
    const total = domains.reduce((s, d) => s + d.count, 0);
    const top6 = domains.slice(0, 6);
    const otherCount = domains.slice(6).reduce((s, d) => s + d.count, 0);
    const displayItems = [
      ...top6.map((d) => ({ label: d.domain, count: d.count })),
      ...(otherCount > 0 ? [{ label: "Other", count: otherCount }] : []),
    ];

    const colors = [
      "rgb(96, 165, 250)", "rgb(252, 129, 129)", "rgb(110, 231, 183)",
      "rgb(253, 224, 71)", "rgb(196, 148, 252)", "rgb(251, 146, 195)",
      "rgb(148, 163, 184)",
    ];

    const size = 200;
    const cx = size / 2;
    const cy = size / 2;
    const outerR = size * 0.44;
    const innerR = size * 0.28;
    let cumAngle = -Math.PI / 2;

    const slices = displayItems.map((d, i) => {
      const share = d.count / total;
      const startAngle = cumAngle;
      cumAngle += share * 2 * Math.PI;
      const endAngle = cumAngle;
      const largeArc = share > 0.5 ? 1 : 0;

      const ox1 = cx + outerR * Math.cos(startAngle);
      const oy1 = cy + outerR * Math.sin(startAngle);
      const ox2 = cx + outerR * Math.cos(endAngle);
      const oy2 = cy + outerR * Math.sin(endAngle);
      const ix1 = cx + innerR * Math.cos(endAngle);
      const iy1 = cy + innerR * Math.sin(endAngle);
      const ix2 = cx + innerR * Math.cos(startAngle);
      const iy2 = cy + innerR * Math.sin(startAngle);

      const path = `M ${ox1} ${oy1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${ox2} ${oy2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2} Z`;

      return { label: d.label, count: d.count, pct: Math.round(share * 100), color: colors[i % colors.length], path };
    });

    return <DonutChart slices={slices} total={total} cx={cx} cy={cy} size={size} />;
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <h3 className="text-sm font-semibold text-gray-300">
          Top Sources & Media
        </h3>
        <div className="flex items-center gap-4">
          {/* Side filter */}
          <div>
            <div className="text-[9px] text-gray-500 uppercase tracking-wider font-medium mb-1">View by side</div>
            <div className="flex items-center gap-1 bg-gray-800 rounded-md p-0.5">
              {([
                { id: "overall" as const, label: "Overall" },
                { id: "anti" as const, label: data.anti_label },
                { id: "pro" as const, label: data.pro_label },
                ...(hasShared ? [{ id: "shared" as const, label: "Shared" }] : []),
              ]).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSideFilter(tab.id)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    sideFilter === tab.id ? "bg-gray-700 text-gray-100" : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          {/* Divider */}
          <div className="w-px h-8 bg-gray-700 hidden sm:block" />
          {/* Publishers / URLs */}
          <div>
            <div className="text-[9px] text-gray-500 uppercase tracking-wider font-medium mb-1">Show as</div>
            <div className="flex items-center gap-1 border border-gray-700 rounded-md p-0.5">
              <button
                onClick={() => setViewMode("publishers")}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  viewMode === "publishers" ? "bg-blue-600 text-white" : "text-gray-500 hover:text-gray-300"
                }`}
              >
                Publishers
              </button>
              <button
                onClick={() => setViewMode("urls")}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  viewMode === "urls" ? "bg-blue-600 text-white" : "text-gray-500 hover:text-gray-300"
                }`}
              >
              URLs
            </button>
            </div>
          </div>
        </div>
      </div>

      {sideFilter === "overall" && (
        <p className="text-[10px] text-gray-600 mb-3">
          Overall combines both sides. If one side has significantly more posts, its sources will dominate this view — use the side toggles to compare.
        </p>
      )}
      {sideFilter === "shared" && (
        <p className="text-[10px] text-gray-600 mb-3">
          Sources referenced by both sides — these are the common ground where both audiences get their information.
        </p>
      )}

      {/* Bars left, Donut right */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          {viewMode === "publishers"
            ? renderDomainList(activeDomains, barColor)
            : renderUrlList(activeUrls, barColor)}
        </div>
        {viewMode === "publishers" && activeDomains.length > 0 && (
          <div className="flex items-center justify-center">
            {buildDonut(activeDomains)}
          </div>
        )}
        {viewMode === "urls" && activeUrls.length > 0 && (
          <div className="flex items-center justify-center">
            {buildDonut(activeUrls.map((u) => ({ domain: u.display, count: u.count })))}
          </div>
        )}
      </div>
    </div>
  );
}

export function OverlapSection({ data, colorScheme }: AnalyticsViewProps) {
  const sc = getSideColors(colorScheme || "political");
  const [overlapView, setOverlapView] = useState<"sources" | "urls" | "narratives">("sources");

  const overlap = data.overlap;
  if (!overlap) return null;

  const hasSources = overlap.shared_sources.length > 0;
  const hasUrls = overlap.shared_urls.length > 0;
  const hasNarratives = overlap.shared_narratives.length > 0;

  if (!hasSources && !hasUrls && !hasNarratives) return null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-300">
            Where Both Sides Overlap
          </h3>
          <p className="text-[10px] sm:text-xs text-gray-600 mt-0.5">
            Sources, links, and narratives shared by both sides of the conversation
          </p>
        </div>
        <div className="flex items-center gap-1 bg-gray-800 rounded-md p-0.5 shrink-0">
          {[
            { key: "sources" as const, label: "Sources", show: hasSources },
            { key: "urls" as const, label: "URLs", show: hasUrls },
            { key: "narratives" as const, label: "Narratives", show: hasNarratives },
          ].filter((t) => t.show).map((t) => (
            <button
              key={t.key}
              onClick={() => setOverlapView(t.key)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                overlapView === t.key
                  ? "bg-gray-700 text-gray-100"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {(() => {
        const antiTotal = data.engagement?.anti?.count || 1;
        const proTotal = data.engagement?.pro?.count || 1;

        return (
          <>
            {overlapView === "sources" && hasSources && (
              <div className="space-y-1.5">
                {overlap.shared_sources.map((s) => {
                  const antiPct = Math.round((s.anti_count / antiTotal) * 100);
                  const proPct = Math.round((s.pro_count / proTotal) * 100);
                  const maxPct = Math.max(antiPct, proPct, 1);
                  return (
                    <div key={s.domain}>
                      <div className="text-xs text-gray-300 mb-0.5">{s.domain}</div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] ${sc.anti.text} font-mono w-10 text-right shrink-0`}>{antiPct}%</span>
                        <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden flex justify-end">
                          <div className={`h-full ${sc.anti.bg}/50 rounded-full`} style={{ width: `${(antiPct / maxPct) * 100}%` }} />
                        </div>
                        <div className="w-px h-3 bg-gray-700 shrink-0" />
                        <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                          <div className={`h-full ${sc.pro.bg}/50 rounded-full`} style={{ width: `${(proPct / maxPct) * 100}%` }} />
                        </div>
                        <span className={`text-[10px] ${sc.pro.text} font-mono w-10 shrink-0`}>{proPct}%</span>
                      </div>
                    </div>
                  );
                })}
                <div className="flex justify-center gap-4 mt-2 text-[10px] text-gray-500">
                  <span className={sc.anti.text}>{data.anti_label} (% of their tweets)</span>
                  <span className={sc.pro.text}>{data.pro_label} (% of their tweets)</span>
                </div>
              </div>
            )}

            {overlapView === "urls" && hasUrls && (
              <div className="space-y-1.5">
                {overlap.shared_urls.map((u) => {
                  const antiPct = Math.round((u.anti_count / antiTotal) * 1000) / 10;
                  const proPct = Math.round((u.pro_count / proTotal) * 1000) / 10;
                  return (
                    <div key={u.url} className="flex items-center gap-2">
                      <a
                        href={u.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-gray-300 hover:text-blue-300 truncate flex-1"
                      >
                        {u.display}
                      </a>
                      <span className={`text-[10px] ${sc.anti.text} font-mono shrink-0`}>{antiPct}%</span>
                      <span className="text-[10px] text-gray-600 shrink-0">/</span>
                      <span className={`text-[10px] ${sc.pro.text} font-mono shrink-0`}>{proPct}%</span>
                    </div>
                  );
                })}
                <div className="flex justify-center gap-4 mt-2 text-[10px] text-gray-500">
                  <span className={sc.anti.text}>{data.anti_label} %</span>
                  <span className={sc.pro.text}>{data.pro_label} %</span>
                </div>
              </div>
            )}

            {overlapView === "narratives" && hasNarratives && (
              <div className="space-y-2">
                {overlap.shared_narratives.map((n) => {
                  const antiPct = Math.round((n.anti_count / antiTotal) * 100);
                  const proPct = Math.round((n.pro_count / proTotal) * 100);
                  const maxPct = Math.max(antiPct, proPct, 1);
                  return (
                    <div key={n.frame}>
                      <div className="text-xs text-gray-300 mb-0.5">{n.label}</div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] ${sc.anti.text} font-mono w-10 text-right shrink-0`}>{antiPct}%</span>
                        <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden flex justify-end">
                          <div className={`h-full ${sc.anti.bg}/50 rounded-full`} style={{ width: `${(antiPct / maxPct) * 100}%` }} />
                        </div>
                        <div className="w-px h-3 bg-gray-700 shrink-0" />
                        <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                          <div className={`h-full ${sc.pro.bg}/50 rounded-full`} style={{ width: `${(proPct / maxPct) * 100}%` }} />
                        </div>
                        <span className={`text-[10px] ${sc.pro.text} font-mono w-10 shrink-0`}>{proPct}%</span>
                      </div>
                    </div>
                  );
                })}
                <div className="flex justify-center gap-4 mt-2 text-[10px] text-gray-500">
                  <span className={sc.anti.text}>{data.anti_label} (% of their tweets)</span>
                  <span className={sc.pro.text}>{data.pro_label} (% of their tweets)</span>
                </div>
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}

export { TopSources };

export default function AnalyticsView({ data, colorScheme }: AnalyticsViewProps) {
  return (
    <div className="space-y-4">
      <div id="voices"><VoicesAndPhrases data={data} colorScheme={colorScheme} /></div>
    </div>
  );
}
