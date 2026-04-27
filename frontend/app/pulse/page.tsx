"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface TopicCard {
  slug: string;
  name: string;
  pro_label: string;
  anti_label: string;
  topic_type?: string;
  description?: string;
  total_posts: number;
  pro_pct: number;
  anti_pct: number;
  pro_engagement: number;
  anti_engagement: number;
  total_engagement: number;
  total_views: number;
  has_page: boolean;
  url?: string;
  is_new?: boolean;
  sample_pro?: (string | { text: string; author?: string | null; url: string | null })[];
  sample_anti?: (string | { text: string; author?: string | null; url: string | null })[];
}

interface PulseData {
  date: string;
  curated: TopicCard[];
  trending: TopicCard[];
  trending_updated_at: string | null;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function generateSummary(topic: TopicCard): string {
  const dominant = topic.anti_pct > topic.pro_pct ? topic.anti_label : topic.pro_label;
  const dominantPct = Math.max(topic.anti_pct, topic.pro_pct);
  const minor = topic.anti_pct > topic.pro_pct ? topic.pro_label : topic.anti_label;

  // Check engagement disconnect
  const proEng = topic.pro_engagement;
  const antiEng = topic.anti_engagement;
  let engWinner = "";
  let engRatio = 0;
  if (proEng > 0 && antiEng > 0) {
    if (proEng > antiEng) {
      engRatio = Math.round(proEng / antiEng * 10) / 10;
      engWinner = topic.pro_label;
    } else {
      engRatio = Math.round(antiEng / proEng * 10) / 10;
      engWinner = topic.anti_label;
    }
  }

  const volWinner = topic.anti_pct > topic.pro_pct ? topic.anti_label : topic.pro_label;

  if (engRatio > 1.3 && engWinner !== volWinner) {
    return `${volWinner} dominates the conversation (${dominantPct}%), but ${engWinner} content gets ${engRatio}x more engagement per post`;
  }
  if (dominantPct >= 65) {
    return `${dominant} overwhelmingly leads the conversation at ${dominantPct}% of posts`;
  }
  if (dominantPct >= 55) {
    return `${dominant} leads the conversation, but ${minor} is not far behind`;
  }
  return `The conversation is closely split between ${topic.anti_label} and ${topic.pro_label}`;
}

function TopicBadges({ isLoudest, isMostControversial, isNew }: { isLoudest: boolean; isMostControversial: boolean; isNew: boolean }) {
  return (
    <div className="flex items-center gap-2 shrink-0 ml-2 flex-wrap justify-end">
      {isLoudest && (
        <span className="text-[10px] text-yellow-400/80 font-medium bg-yellow-400/10 px-2 py-0.5 rounded-full">
          Loudest topic
        </span>
      )}
      {isMostControversial && (
        <span className="text-[10px] text-purple-400/80 font-medium bg-purple-400/10 px-2 py-0.5 rounded-full">
          Most contested
        </span>
      )}
      {isNew && (
        <span className="text-[10px] text-green-400/80 font-medium bg-green-400/10 px-2 py-0.5 rounded-full">
          New today
        </span>
      )}
    </div>
  );
}

function TopicCardComponent({ topic, isLoudest = false, isMostControversial = false, isNew = false }: {
  topic: TopicCard; isLoudest?: boolean; isMostControversial?: boolean; isNew?: boolean;
}) {
  const proWidth = topic.pro_pct;
  const antiWidth = topic.anti_pct;
  const summary = generateSummary(topic);

  const inner = (
    <div className={`bg-gray-900 border border-gray-800 rounded-xl p-5 transition-colors ${topic.has_page ? "hover:border-gray-600" : ""}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-lg font-bold text-gray-100">{topic.name}</h3>
        <TopicBadges isLoudest={isLoudest} isMostControversial={isMostControversial} isNew={isNew} />
      </div>

      {/* AI summary */}
      <p className="text-sm text-gray-400 mb-3">{summary}</p>

      {/* Volume bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-blue-400 font-medium">{topic.anti_label} {antiWidth}%</span>
          <span className="text-red-400 font-medium">{topic.pro_label} {proWidth}%</span>
        </div>
        <div className="h-3 bg-gray-800 rounded-full overflow-hidden flex">
          {(() => {
            const combined = antiWidth + proWidth || 1;
            const antiBar = Math.round(antiWidth / combined * 100);
            const proBar = 100 - antiBar;
            return (
              <>
                <div className="bg-blue-500/70 h-full" style={{ width: `${antiBar}%` }} />
                <div className="bg-red-500/70 h-full" style={{ width: `${proBar}%` }} />
              </>
            );
          })()}
        </div>
      </div>

      {/* Top quotes per side */}
      {(topic.sample_anti?.length || topic.sample_pro?.length) ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          <div className="space-y-2">
            {(topic.sample_anti || []).map((sample, idx) => {
              const text = typeof sample === "string" ? sample : sample.text;
              const author = typeof sample === "object" ? sample.author : null;
              const directUrl = typeof sample === "object" && sample.url ? sample.url : null;
              const url = directUrl || `https://x.com/search?q=${encodeURIComponent(text.slice(0, 60))}`;
              return (
                <a key={idx} href={url} target="_blank" rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="block text-xs text-gray-500 border-l-2 border-blue-500/40 pl-2 leading-relaxed line-clamp-2 hover:text-gray-300 transition-colors">
                  {author && <span className="text-blue-400/70 font-medium">{author}: </span>}&ldquo;{text}&rdquo;
                </a>
              );
            })}
          </div>
          <div className="space-y-2">
            {(topic.sample_pro || []).map((sample, idx) => {
              const text = typeof sample === "string" ? sample : sample.text;
              const author = typeof sample === "object" ? sample.author : null;
              const directUrl = typeof sample === "object" && sample.url ? sample.url : null;
              const url = directUrl || `https://x.com/search?q=${encodeURIComponent(text.slice(0, 60))}`;
              return (
                <a key={idx} href={url} target="_blank" rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="block text-xs text-gray-500 border-l-2 border-red-500/40 pl-2 leading-relaxed line-clamp-2 hover:text-gray-300 transition-colors">
                  {author && <span className="text-red-400/70 font-medium">{author}: </span>}&ldquo;{text}&rdquo;
                </a>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Explore link for curated */}
      {topic.has_page && (
        <div className="text-xs text-blue-400 mt-2 font-medium">
          Explore full analysis →
        </div>
      )}
    </div>
  );

  if (topic.has_page) {
    return <Link href={topic.url || `/analytics/${topic.slug}`}>{inner}</Link>;
  }
  return inner;
}

export default function PulsePage() {
  const [data, setData] = useState<PulseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/pulse`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load pulse data");
        return res.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const pulseRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);

  const handleShare = async () => {
    if (!pulseRef.current) return;
    setSharing(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(pulseRef.current, {
        backgroundColor: "#0a0e17",
        pixelRatio: 2,
      });
      // Try native share first, fall back to download
      if (navigator.share) {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], "dividedview-pulse.png", { type: "image/png" });
        await navigator.share({ files: [file], title: "Today's Pulse — DividedView" });
      } else {
        const link = document.createElement("a");
        link.download = "dividedview-pulse.png";
        link.href = dataUrl;
        link.click();
      }
    } catch (e) {
      console.error("Share failed:", e);
    } finally {
      setSharing(false);
    }
  };

  return (
    <main className="max-w-4xl mx-auto px-4 py-10 sm:py-16">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <Link href="/dashboard" className="text-gray-500 hover:text-gray-300 text-sm">
            &larr; Dashboard
          </Link>
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-100">
            Today&apos;s Pulse
          </h1>
          {data && (
            <button
              onClick={handleShare}
              disabled={sharing}
              className="px-4 py-2 text-xs font-medium text-gray-400 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {sharing ? "Generating..." : "Share as image"}
            </button>
          )}
        </div>
        <p className="text-sm text-gray-500 mt-1">{today}</p>
        <p className="text-base text-gray-400 mt-3 max-w-xl">
          What&apos;s happening on X right now — the top political conversations ranked by engagement, with real-time sentiment from both sides.
        </p>
      </div>

      {loading && (
        <div className="space-y-4 animate-pulse">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-5 h-40">
              <div className="h-5 w-48 bg-gray-800 rounded mb-3" />
              <div className="h-3 w-full bg-gray-800 rounded mb-2" />
              <div className="h-3 w-3/4 bg-gray-800 rounded mb-3" />
              <div className="h-2.5 w-full bg-gray-800 rounded" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">
          {error}
        </div>
      )}

      {data && (
        <div ref={pulseRef}>
          {/* Daily takeaway */}
          {(() => {
            const allTopics = [...data.trending, ...data.curated];
            if (allTopics.length === 0) return null;

            // Find loudest and most contested
            const loudest = allTopics.reduce((a, b) => a.total_engagement > b.total_engagement ? a : b);
            const mostContested = allTopics.reduce((a, b) => {
              const aDiff = Math.abs(a.anti_pct - a.pro_pct);
              const bDiff = Math.abs(b.anti_pct - b.pro_pct);
              return aDiff < bDiff ? a : b;
            });

            let takeaway = "";
            if (loudest.slug === mostContested.slug) {
              takeaway = `${loudest.name} is dominating X today — and it's the most contested debate, split ${mostContested.anti_pct}% to ${mostContested.pro_pct}%.`;
            } else {
              takeaway = `${loudest.name} is generating the most engagement on X today, while ${mostContested.name} is the most contested debate.`;
            }

            return (
              <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-4 mb-6">
                <p className="text-base sm:text-lg text-gray-200 font-medium leading-relaxed">{takeaway}</p>
              </div>
            );
          })()}

          {/* Trending topics */}
          {data.trending.length > 0 && (
            <section className="mb-10">
              <h2 className="text-lg font-semibold text-gray-300 mb-4">What X is debating right now</h2>

              {/* Overview: ranked sentiment bars */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-5">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-4 font-medium">Sentiment by topic — ranked by engagement</p>
                <div className="space-y-3">
                  {data.trending.map((topic) => {
                    const combined = topic.anti_pct + topic.pro_pct || 1;
                    const antiBar = Math.round(topic.anti_pct / combined * 100);
                    const proBar = 100 - antiBar;
                    return (
                      <div key={topic.slug}>
                        <div className="mb-1">
                          <span className="text-sm font-medium text-gray-200">{topic.name}</span>
                        </div>
                        <div className="h-3.5 bg-gray-800 rounded-full overflow-hidden flex">
                          <div className="bg-blue-500/70 h-full" style={{ width: `${antiBar}%` }} />
                          <div className="bg-red-500/70 h-full" style={{ width: `${proBar}%` }} />
                        </div>
                        <div className="flex justify-between mt-1 text-xs">
                          <span className="text-blue-400">{topic.anti_label} {topic.anti_pct}%</span>
                          <span className="text-red-400">{topic.pro_label} {topic.pro_pct}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Overview: donut chart — share of engagement */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-5">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-4 font-medium">Share of total engagement</p>
                {(() => {
                  const totalEng = data.trending.reduce((s, t) => s + t.total_engagement, 0) || 1;
                  const segments = data.trending.map(t => ({
                    name: t.name,
                    pct: Math.round(t.total_engagement / totalEng * 100),
                  }));
                  const colors = ["#3b82f6", "#ef4444", "#22c55e", "#eab308", "#a855f7", "#f97316", "#06b6d4"];
                  const size = 160;
                  const cx = size / 2;
                  const cy = size / 2;
                  const r = 60;
                  const inner = 35;
                  let cumAngle = -90;

                  return (
                    <div className="flex items-center gap-6">
                      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
                        {segments.map((seg, i) => {
                          const angle = (seg.pct / 100) * 360;
                          const startAngle = cumAngle;
                          const endAngle = cumAngle + angle;
                          cumAngle = endAngle;

                          const startRad = (startAngle * Math.PI) / 180;
                          const endRad = (endAngle * Math.PI) / 180;
                          const largeArc = angle > 180 ? 1 : 0;

                          const x1 = cx + r * Math.cos(startRad);
                          const y1 = cy + r * Math.sin(startRad);
                          const x2 = cx + r * Math.cos(endRad);
                          const y2 = cy + r * Math.sin(endRad);
                          const ix1 = cx + inner * Math.cos(endRad);
                          const iy1 = cy + inner * Math.sin(endRad);
                          const ix2 = cx + inner * Math.cos(startRad);
                          const iy2 = cy + inner * Math.sin(startRad);

                          const d = [
                            `M ${x1} ${y1}`,
                            `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
                            `L ${ix1} ${iy1}`,
                            `A ${inner} ${inner} 0 ${largeArc} 0 ${ix2} ${iy2}`,
                            "Z",
                          ].join(" ");

                          return <path key={i} d={d} fill={colors[i % colors.length]} opacity={0.8} />;
                        })}
                      </svg>
                      <div className="space-y-1.5">
                        {segments.map((seg, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: colors[i % colors.length], opacity: 0.8 }} />
                            <span className="text-xs text-gray-400">{seg.name}</span>
                            <span className="text-xs text-gray-600">{seg.pct}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {(() => {
                const allTopics = [...data.trending, ...data.curated];
                const mostContestedSlug = allTopics.length > 0
                  ? allTopics.reduce((a, b) => Math.abs(a.anti_pct - a.pro_pct) < Math.abs(b.anti_pct - b.pro_pct) ? a : b).slug
                  : "";
                return (
                  <div className="space-y-3">
                    {data.trending.map((topic, i) => (
                      <TopicCardComponent
                        key={topic.slug}
                        topic={topic}
                        isLoudest={i === 0}
                        isMostControversial={topic.slug === mostContestedSlug}
                        isNew={topic.is_new || false}
                      />
                    ))}
                  </div>
                );
              })()}
            </section>
          )}

          {/* Curated topics */}
          {data.curated.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-300 mb-4">Ongoing conversations</h2>
              {(() => {
                const allTopics = [...data.trending, ...data.curated];
                const mostContestedSlug = allTopics.length > 0
                  ? allTopics.reduce((a, b) => Math.abs(a.anti_pct - a.pro_pct) < Math.abs(b.anti_pct - b.pro_pct) ? a : b).slug
                  : "";
                return (
                  <div className="space-y-3">
                    {data.curated.map((topic, i) => (
                      <TopicCardComponent
                        key={topic.slug}
                        topic={topic}
                        isLoudest={i === 0 && data.trending.length === 0}
                        isMostControversial={topic.slug === mostContestedSlug}
                      />
                    ))}
                  </div>
                );
              })()}
            </section>
          )}

          {data.curated.length === 0 && data.trending.length === 0 && (
            <p className="text-gray-500 text-center py-12">
              No pulse data available yet. Check back after the next data refresh.
            </p>
          )}
        </div>
      )}

      {/* Footer CTA */}
      {data && (
        <div className="text-center mt-12 pt-8 border-t border-gray-800">
          <p className="text-sm text-gray-500 mb-3">
            Want deeper analysis? Click any topic above, or create your own.
          </p>
          <Link
            href="/dashboard"
            className="inline-block px-5 py-2.5 bg-white text-gray-950 rounded-md font-medium hover:bg-gray-200 transition-colors text-sm"
          >
            Get started
          </Link>
        </div>
      )}
    </main>
  );
}
