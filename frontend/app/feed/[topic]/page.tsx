"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  TopicData,
  RawFeedItem,
  BreakdownData,
  fetchTopics,
  fetchAllTweets,
  fetchBreakdown,
  runTopicPipeline,
  fetchPipelineProgress,
  fetchMe,
  PipelineProgress,
  scoreFeed,
} from "@/lib/api";
import SentimentDistribution from "@/components/SentimentDistribution";
import TweetCard from "@/components/TweetCard";
import BreakdownChart from "@/components/BreakdownChart";
import { downloadCsv } from "@/lib/csv";

function getBiasDescription(value: number, antiLabel: string, proLabel: string): string {
  const abs = Math.abs(value);
  if (abs <= 1) return "all perspectives";
  const intensity =
    abs <= 3 ? "slightly" : abs <= 5 ? "moderately" : abs <= 7.5 ? "strongly" : "extremely";
  const side = value < 0 ? antiLabel.toLowerCase() : proLabel.toLowerCase();
  return `${intensity} ${side}`;
}

export default function FeedPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const topicSlug = params.topic as string;
  const isNew = searchParams.get("new") === "1";

  const [topic, setTopic] = useState<TopicData | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserTier, setCurrentUserTier] = useState<string>("free");
  const [bias, setBias] = useState(0);
  const [allTweets, setAllTweets] = useState<RawFeedItem[]>([]);
  const [breakdown, setBreakdown] = useState<BreakdownData | null>(null);
  const [breakdownError, setBreakdownError] = useState(false);
  const [feedError, setFeedError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(isNew);
  const [fetching, setFetching] = useState(false);
  const [pipelineProgress, setPipelineProgress] = useState<PipelineProgress | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [chartVisible, setChartVisible] = useState(true);
  const chartRef = useRef<HTMLDivElement>(null);

  // Track whether chart is scrolled out of view
  useEffect(() => {
    if (!chartRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setChartVisible(entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, [allTweets.length]);

  // Load user info
  useEffect(() => {
    fetchMe().then((u) => { setCurrentUserId(u.id); setCurrentUserTier(u.tier); }).catch(() => {});
  }, []);

  // Load topic info
  useEffect(() => {
    fetchTopics().then((topics) => {
      const t = topics.find((t) => t.slug === topicSlug);
      if (t) setTopic(t);
    });
  }, [topicSlug]);

  // Load ALL tweets once on mount
  const loadTweets = () => {
    setLoading(true);
    setFeedError(false);
    return fetchAllTweets(topicSlug, 720)
      .then(setAllTweets)
      .catch(() => setFeedError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTweets();
  }, [topicSlug]);

  // Auto-poll for new topics until tweets arrive
  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(() => {
      fetchAllTweets(topicSlug, 720).then((data) => {
        setAllTweets(data);
        if (data.length > 0) setPolling(false);
      });
    }, 15000);
    return () => clearInterval(interval);
  }, [polling, topicSlug]);

  // Load breakdown, summaries, and analytics once
  useEffect(() => {
    fetchBreakdown(topicSlug).then(setBreakdown).catch(() => setBreakdownError(true));
  }, [topicSlug]);

  const [sortMode, setSortMode] = useState<"top" | "latest">("top");

  // Score and sort all tweets client-side
  const allScored = useMemo(() => {
    const scored = scoreFeed(allTweets, bias, allTweets.length);
    if (sortMode === "latest") {
      return [...scored].sort((a, b) => {
        const da = a.tweet?.created_at || "";
        const db = b.tweet?.created_at || "";
        return db.localeCompare(da);
      });
    }
    return scored;
  }, [allTweets, bias, sortMode]);

  // Infinite scroll: show more as user scrolls
  const [visibleCount, setVisibleCount] = useState(50);

  // Reset visible count when bias or sort changes (new ranking)
  useEffect(() => {
    setVisibleCount(50);
  }, [bias, sortMode]);

  const feed = allScored.slice(0, visibleCount);

  // Intersection observer for infinite scroll
  useEffect(() => {
    const sentinel = document.getElementById("feed-sentinel");
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && visibleCount < allScored.length) {
          setVisibleCount((prev) => Math.min(prev + 30, allScored.length));
        }
      },
      { rootMargin: "400px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visibleCount, allScored.length]);

  if (!topic) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-gray-500">
        Loading topic...
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
              <Link
                href="/dashboard"
                className="text-gray-500 hover:text-gray-300 text-sm shrink-0"
              >
                &larr;
              </Link>
              <h1 className="text-lg sm:text-xl font-bold truncate">{topic.name}</h1>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/analytics/${topicSlug}`}
                className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs sm:text-sm transition-colors"
              >
                Analytics
              </Link>
              <button
                onClick={() => {
                  const headers = [
                    "id", "screen_name", "author_name", "followers", "tweet_text",
                    "likes", "retweets", "replies", "views", "classification",
                    "intensity_score", "confidence", "created_at", "url",
                  ];
                  const rows = allScored.map((item) => [
                    item.tweet.id_str,
                    item.tweet.screen_name || "",
                    item.tweet.author_name || "",
                    String(item.tweet.author_followers || 0),
                    item.tweet.full_text || "",
                    String(item.tweet.likes),
                    String(item.tweet.retweets),
                    String(item.tweet.replies),
                    String(item.tweet.views),
                    item.classification.effective_political_bent || "",
                    String(item.classification.effective_intensity_score ?? ""),
                    String(item.classification.confidence ?? ""),
                    item.tweet.created_at || "",
                    item.tweet.url || "",
                  ]);
                  downloadCsv(`feed-${topicSlug}-bias-${bias}.csv`, headers, rows);
                }}
                className="hidden sm:block px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors"
              >
                Export CSV
              </button>
              {(currentUserTier === "admin" || (topic && topic.created_by != null && currentUserId === topic.created_by)) && (
              <button
                onClick={async () => {
                  if (fetching) return;
                  setFetching(true);
                  setPipelineProgress(null);
                  try {
                    await runTopicPipeline(topicSlug);
                    for (let i = 0; i < 120; i++) {
                      await new Promise((r) => setTimeout(r, 3000));
                      try {
                        const prog = await fetchPipelineProgress(topicSlug);
                        if (prog) setPipelineProgress(prog);
                        if (prog && !prog.running) break;
                      } catch { /* keep polling */ }
                    }
                    await loadTweets();
                    setPipelineProgress(null);
                    setFetching(false);
                  } catch (e) {
                    alert(e instanceof Error ? e.message : "Failed to start pipeline");
                    setPipelineProgress(null);
                    setFetching(false);
                  }
                }}
                disabled={fetching}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs sm:text-sm transition-colors disabled:opacity-50"
              >
                {fetching
                  ? pipelineProgress
                    ? `${pipelineProgress.label} (${pipelineProgress.pct}%)`
                    : "Starting..."
                  : "Fetch New Tweets"}
              </button>
              )}
              <button
                onClick={loadTweets}
                className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs sm:text-sm transition-colors"
              >
                Reload
              </button>
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className="md:hidden px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs sm:text-sm"
              >
                Stats
              </button>
            </div>
          </div>

          {/* Mini slider — appears when chart scrolls out of view */}
          {!chartVisible && (
            <div className="mt-2">
              <div className="flex items-center gap-3">
                <span className="text-xs sm:text-sm font-semibold text-blue-400 shrink-0 hidden sm:block">
                  {topic.anti_label}
                </span>
                <div className="flex-1 relative h-8 sm:h-7 cursor-pointer select-none touch-none"
                  onPointerDown={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    const v = Math.round((pct * 20 - 10) * 10) / 10;
                    setBias(v);
                    const onMove = (ev: PointerEvent) => {
                      const p = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
                      setBias(Math.round((p * 20 - 10) * 10) / 10);
                    };
                    const onUp = () => {
                      window.removeEventListener("pointermove", onMove);
                      window.removeEventListener("pointerup", onUp);
                    };
                    window.addEventListener("pointermove", onMove);
                    window.addEventListener("pointerup", onUp);
                  }}
                >
                  <div
                    className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-2 sm:h-1.5 rounded-full"
                    style={{
                      background: "linear-gradient(to right, rgb(59, 130, 246), rgb(107, 114, 128) 45%, rgb(107, 114, 128) 55%, rgb(239, 68, 68))",
                    }}
                  />
                  <div className="absolute top-1/2 -translate-y-1/2 left-1/2 w-px h-3 bg-gray-600" />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 sm:w-4 sm:h-4 rounded-full border-2 border-white shadow-lg"
                    style={{
                      left: `${((bias + 10) / 20) * 100}%`,
                      backgroundColor: bias < -1 ? "rgb(59, 130, 246)" : bias > 1 ? "rgb(239, 68, 68)" : "rgb(107, 114, 128)",
                    }}
                  />
                </div>
                <span className="text-xs sm:text-sm font-semibold text-red-400 shrink-0 hidden sm:block">
                  {topic.pro_label}
                </span>
              </div>
              <div className="text-center mt-1">
                <span
                  className="text-xs sm:text-sm font-medium"
                  style={{
                    color: bias < -1 ? "rgb(59, 130, 246)" : bias > 1 ? "rgb(239, 68, 68)" : "rgb(107, 114, 128)",
                  }}
                >
                  {getBiasDescription(bias, topic.anti_label, topic.pro_label)}
                </span>
                <span className="text-[10px] sm:text-xs text-gray-500 ml-1.5">
                  ({bias > 0 ? "+" : ""}{bias.toFixed(1)})
                </span>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Pipeline progress bar */}
      {fetching && pipelineProgress && (
        <div className="max-w-7xl mx-auto px-4 pt-3">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-gray-300 font-medium">
                {pipelineProgress.label}
              </span>
              <span className="text-[10px] text-gray-500">
                Step {pipelineProgress.step}/{pipelineProgress.total_steps}
              </span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${pipelineProgress.pct}%` }}
              />
            </div>
            {pipelineProgress.detail && (
              <p className="text-[10px] text-gray-500 mt-1">{pipelineProgress.detail}</p>
            )}
          </div>
        </div>
      )}

      {/* New topic banner */}
      {polling && allTweets.length === 0 && (
        <div className="max-w-7xl mx-auto px-4 pt-6">
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 flex items-center gap-3">
            <div className="animate-spin h-5 w-5 border-2 border-blue-400 border-t-transparent rounded-full shrink-0" />
            <div>
              <p className="text-blue-300 font-medium text-sm">
                Fetching and classifying tweets for this topic...
              </p>
              <p className="text-blue-400/60 text-xs mt-0.5">
                This usually takes 2-5 minutes. The page will update automatically.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Sentiment distribution chart */}
      {allTweets.length > 0 && (
        <div ref={chartRef} className="max-w-7xl mx-auto px-3 sm:px-4 pt-4">
          <SentimentDistribution
            items={allTweets}
            antiLabel={topic.anti_label}
            proLabel={topic.pro_label}
            bias={bias}
            onChange={setBias}
          />
        </div>
      )}

      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 flex gap-6 relative">
        {/* Sidebar - breakdown stats */}
        {showSidebar && (
          <div
            className="fixed inset-0 bg-black/50 z-30 md:hidden"
            onClick={() => setShowSidebar(false)}
          />
        )}
        <aside
          className={`${
            showSidebar
              ? "fixed top-0 left-0 bottom-0 w-72 z-40 bg-gray-950 p-4 overflow-y-auto"
              : "hidden"
          } md:relative md:block md:w-72 md:shrink-0 md:bg-transparent md:p-0 md:z-auto`}
        >
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:sticky md:top-44">
            <h2 className="text-sm font-semibold text-gray-300 mb-3">
              Breakdown
            </h2>
            {breakdown ? (
              <BreakdownChart
                data={breakdown}
                proLabel={topic.pro_label}
                antiLabel={topic.anti_label}
              />
            ) : breakdownError ? (
              <p className="text-xs text-gray-500">Could not load stats.</p>
            ) : (
              <p className="text-xs text-gray-600">Loading stats...</p>
            )}
          </div>
        </aside>

        {/* Feed */}
        <main className="flex-1 min-w-0 max-w-full sm:max-w-[600px] mx-auto">
          {/* Feed header with sort toggle */}
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Showing{" "}
              <span className="text-gray-300 font-medium">
                {getBiasDescription(bias, topic.anti_label, topic.pro_label)}
              </span>{" "}
              simulated feed &middot; {feed.length} tweets
            </div>
            <div className="flex items-center gap-1 bg-gray-800 rounded-md p-0.5">
              <button
                onClick={() => setSortMode("top")}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  sortMode === "top" ? "bg-gray-700 text-gray-100" : "text-gray-500 hover:text-gray-300"
                }`}
              >
                Top
              </button>
              <button
                onClick={() => setSortMode("latest")}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  sortMode === "latest" ? "bg-gray-700 text-gray-100" : "text-gray-500 hover:text-gray-300"
                }`}
              >
                Latest
              </button>
            </div>
          </div>

          {loading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="bg-gray-900 border border-gray-800 rounded-xl p-4 animate-pulse h-40"
                />
              ))}
            </div>
          ) : feedError ? (
            <div className="text-center py-12">
              <p className="text-red-400 mb-3">Failed to load tweets.</p>
              <button
                onClick={loadTweets}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm"
              >
                Retry
              </button>
            </div>
          ) : feed.length === 0 ? (
            <p className="text-gray-500 text-center py-12">
              No tweets found for this topic.
            </p>
          ) : (
            <div className="space-y-4">
              {feed.map((item) => (
                <TweetCard
                  key={item.tweet.id_str}
                  tweet={item.tweet}
                  classification={item.classification}
                  proLabel={topic.pro_label}
                  antiLabel={topic.anti_label}
                />
              ))}
              {/* Infinite scroll sentinel */}
              {visibleCount < allScored.length && (
                <div id="feed-sentinel" className="py-4 text-center text-xs text-gray-600">
                  Loading more tweets...
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
