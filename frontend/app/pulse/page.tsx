"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface TopicCard {
  slug: string;
  name: string;
  pro_label: string;
  anti_label: string;
  topic_type?: string;
  description?: string;
  heat?: number;
  total_posts: number;
  pro_pct: number;
  anti_pct: number;
  pro_engagement: number;
  anti_engagement: number;
  total_engagement: number;
  total_views: number;
  has_page: boolean;
  url?: string;
  sample_pro?: string[];
  sample_anti?: string[];
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

function TopicCardComponent({ topic, index }: { topic: TopicCard; index: number }) {
  const total = topic.total_posts;
  const proWidth = topic.pro_pct;
  const antiWidth = topic.anti_pct;
  const totalEng = topic.total_engagement;

  // Determine engagement winner
  let engInsight = "";
  if (topic.pro_engagement > 0 && topic.anti_engagement > 0) {
    const ratio = topic.pro_engagement > topic.anti_engagement
      ? (topic.pro_engagement / topic.anti_engagement).toFixed(1)
      : (topic.anti_engagement / topic.pro_engagement).toFixed(1);
    const winner = topic.pro_engagement > topic.anti_engagement ? topic.pro_label : topic.anti_label;
    if (parseFloat(ratio) > 1.3) {
      engInsight = `${winner} gets ${ratio}x more engagement`;
    }
  }

  const inner = (
    <div className={`bg-gray-900 border border-gray-800 rounded-xl p-5 transition-colors ${topic.has_page ? "hover:border-gray-600" : ""}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-base font-bold text-gray-100">{topic.name}</h3>
          {topic.description && (
            <p className="text-xs text-gray-500 mt-0.5">{topic.description}</p>
          )}
        </div>
      </div>

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

      {/* Stats row */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span>{total} posts</span>
        <span>{fmt(totalEng)} engagements</span>
        {topic.total_views > 0 && <span>{fmt(topic.total_views)} views</span>}
      </div>

      {/* Engagement insight */}
      {engInsight && (
        <p className="text-xs text-gray-400 mt-2 italic">{engInsight}</p>
      )}

      {/* Explore link for curated */}
      {topic.has_page && (
        <div className="text-xs text-blue-400 mt-3 font-medium">
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

  return (
    <main className="max-w-4xl mx-auto px-4 py-10 sm:py-16">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Link href="/dashboard" className="text-gray-500 hover:text-gray-300 text-sm">
            &larr; Dashboard
          </Link>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-100">
          Today&apos;s Pulse
        </h1>
        <p className="text-sm text-gray-500 mt-1">{today}</p>
        <p className="text-base text-gray-400 mt-3 max-w-xl">
          What&apos;s happening on X right now — the top political conversations ranked by engagement, with real-time sentiment from both sides.
        </p>
      </div>

      {loading && (
        <div className="space-y-4 animate-pulse">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-5 h-32">
              <div className="h-4 w-40 bg-gray-800 rounded mb-3" />
              <div className="h-3 w-full bg-gray-800 rounded mb-2" />
              <div className="h-2 w-32 bg-gray-800 rounded" />
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
        <>
          {/* Trending topics */}
          {data.trending.length > 0 && (
            <section className="mb-10">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-lg font-semibold text-gray-300">Trending Now</h2>
                <span className="text-xs text-gray-600">Auto-discovered from X</span>
              </div>
              <div className="space-y-3">
                {data.trending.map((topic, i) => (
                  <TopicCardComponent key={topic.slug} topic={topic} index={i} />
                ))}
              </div>
            </section>
          )}

          {/* Curated topics */}
          {data.curated.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-lg font-semibold text-gray-300">Always Tracking</h2>
                <span className="text-xs text-gray-600">Updated daily</span>
              </div>
              <div className="space-y-3">
                {data.curated.map((topic, i) => (
                  <TopicCardComponent key={topic.slug} topic={topic} index={i} />
                ))}
              </div>
            </section>
          )}

          {data.curated.length === 0 && data.trending.length === 0 && (
            <p className="text-gray-500 text-center py-12">
              No pulse data available yet. Check back after the next data refresh.
            </p>
          )}
        </>
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
