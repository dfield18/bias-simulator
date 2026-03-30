"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { cachedFetch, invalidateCache } from "@/lib/cache";

function decodeHtml(text: string): string {
  return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
}
import {
  TopicData,
  SummaryData,
  AnalyticsData,
  NarrativeData,
  GapAnalysisData,
  PairedStoriesData,
  ExposureOverlapData,
  RecommendationsData,
  PulseExtrasData,
  NarrativeStrategyData,
  NarrativeDepthData,
  MediaBreakdownData,
  SideBySideFeedData,
  HashtagData,
  LastRunData,
  RawFeedItem,
  BreakdownData,
  DunksData,
  fetchTopics,
  fetchSummaries,
  fetchAnalytics,
  fetchNarrative,
  fetchGapAnalysis,
  fetchPairedStories,
  fetchExposureOverlap,
  fetchRecommendations,
  fetchPulseExtras,
  fetchNarrativeStrategy,
  fetchNarrativeDepth,
  fetchMediaBreakdown,
  fetchSideBySideFeed,
  fetchHashtags,
  fetchLastRun,
  fetchPipelineProgress,
  PipelineProgress,
  runTopicPipeline,
  fetchAllTweets,
  fetchBreakdown,
  fetchSmartFeed,
  fetchDunks,
  SmartFeedItem,
} from "@/lib/api";
import SummaryTabs from "@/components/SummaryTabs";
import NarrativeFrames from "@/components/NarrativeFrames";
import GapAnalysis from "@/components/GapAnalysis";
import PairedStories from "@/components/PairedStories";
import Recommendations from "@/components/Recommendations";
import { WhatThisMeansInline } from "@/components/WhatThisMeans";
import TweetCard from "@/components/TweetCard";
import BreakdownChart from "@/components/BreakdownChart";
import SentimentDistribution from "@/components/SentimentDistribution";
import AnalyticsView, { TrendingPhrases, TopSources } from "@/components/AnalyticsView";
import BlindSpots from "@/components/BlindSpots";
import NarrativeMix from "@/components/NarrativeMix";

const tabs = [
  { id: "feed", label: "Feed", subtitle: "The conversation" },
  { id: "pulse", label: "Executive Pulse", subtitle: "The big picture" },
  { id: "narrative", label: "Narrative Deep-Dive", subtitle: "How each side frames it" },
  { id: "voices", label: "Key Voices", subtitle: "Who's saying what" },
  { id: "dunks", label: "Flashpoints", subtitle: "Posts that sparked the other side" },
  { id: "echo", label: "Echo Chamber", subtitle: "Who & where" },
  { id: "strategy", label: "Insights & Action", subtitle: "Key findings and next steps" },
  { id: "report", label: "Full Report", subtitle: "All tabs in one view" },
];

export default function AnalyticsPage() {
  const params = useParams();
  const topicSlug = params.topic as string;

  const [topic, setTopic] = useState<TopicData | null>(null);
  const [summaries, setSummaries] = useState<Record<string, SummaryData>>({});
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [narrative, setNarrative] = useState<NarrativeData | null>(null);
  const [gapAnalysis, setGapAnalysis] = useState<GapAnalysisData | null>(null);
  const [pairedStories, setPairedStories] = useState<PairedStoriesData | null>(null);
  const [exposureOverlap, setExposureOverlap] = useState<ExposureOverlapData | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationsData | null>(null);
  const [pulseExtras, setPulseExtras] = useState<PulseExtrasData | null>(null);
  const [narrativeStrategy, setNarrativeStrategy] = useState<NarrativeStrategyData | null>(null);
  const [narrativeDepth, setNarrativeDepth] = useState<NarrativeDepthData | null>(null);
  const [mediaBreakdown, setMediaBreakdown] = useState<MediaBreakdownData | null>(null);
  const [sideBySideFeed, setSideBySideFeed] = useState<SideBySideFeedData | null>(null);
  const [hashtags, setHashtags] = useState<HashtagData | null>(null);
  const [dunksData, setDunksData] = useState<DunksData | null>(null);
  const [lastRun, setLastRun] = useState<LastRunData | null>(null);
  const [isRunning, setIsRunning] = useState<false | "running" | "done">(false);
  const [pipelineProgress, setPipelineProgress] = useState<PipelineProgress | null>(null);

  // Feed state
  const [allTweets, setAllTweets] = useState<RawFeedItem[]>([]);
  const [smartFeedItems, setSmartFeedItems] = useState<SmartFeedItem[]>([]);
  const [breakdown, setBreakdown] = useState<BreakdownData | null>(null);
  const [bias, setBias] = useState(0);
  const [feedSortMode, setFeedSortMode] = useState<"smart" | "latest">("smart");
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedVisibleCount, setFeedVisibleCount] = useState(50);
  const [activeTab, setActiveTab] = useState("feed");
  const [selectedFrame, setSelectedFrame] = useState<string>("all");

  // Essential data — loaded once on mount
  useEffect(() => {
    const s = topicSlug;
    cachedFetch(`topics`, () => fetchTopics(), 60 * 1000).then((topics) => {
      const t = topics.find((t) => t.slug === s);
      if (t) setTopic(t);
    }).catch(console.error);
    cachedFetch(`${s}:lastRun`, () => fetchLastRun(s), 2 * 60 * 1000).then((d) => d && setLastRun(d)).catch(console.error);
    // Feed data — needed for default tab
    cachedFetch(`${s}:allTweets`, () => fetchAllTweets(s, 720)).then(setAllTweets).catch(console.error);
    cachedFetch(`${s}:smartFeed:0`, () => fetchSmartFeed(s, 0, 720, 200))
      .then(setSmartFeedItems)
      .catch(console.error)
      .finally(() => setFeedLoading(false));
    cachedFetch(`${s}:breakdown`, () => fetchBreakdown(s, 720)).then(setBreakdown).catch(console.error);

    // Background prefetch — load all other data after a short delay so feed renders first
    const bgTimer = setTimeout(() => {
      cachedFetch(`${s}:analytics`, () => fetchAnalytics(s)).then((d) => d && setAnalytics(d)).catch(console.error);
      cachedFetch(`${s}:narrative`, () => fetchNarrative(s)).then((d) => d && setNarrative(d)).catch(console.error);
      cachedFetch(`${s}:summaries`, () => fetchSummaries(s)).then(setSummaries).catch(console.error);
      cachedFetch(`${s}:narrativeStrategy`, () => fetchNarrativeStrategy(s)).then((d) => d && setNarrativeStrategy(d)).catch(console.error);
      cachedFetch(`${s}:narrativeDepth`, () => fetchNarrativeDepth(s)).then((d) => d && setNarrativeDepth(d)).catch(console.error);
      cachedFetch(`${s}:pulseExtras`, () => fetchPulseExtras(s)).then((d) => d && setPulseExtras(d)).catch(console.error);
      cachedFetch(`${s}:exposureOverlap`, () => fetchExposureOverlap(s)).then((d) => d && setExposureOverlap(d)).catch(console.error);
      cachedFetch(`${s}:gapAnalysis`, () => fetchGapAnalysis(s)).then((d) => d && setGapAnalysis(d)).catch(console.error);
      cachedFetch(`${s}:recommendations`, () => fetchRecommendations(s)).then((d) => d && setRecommendations(d)).catch(console.error);
      cachedFetch(`${s}:pairedStories`, () => fetchPairedStories(s)).then((d) => d && setPairedStories(d)).catch(console.error);
      cachedFetch(`${s}:sideBySideFeed`, () => fetchSideBySideFeed(s)).then((d) => d && setSideBySideFeed(d)).catch(console.error);
      cachedFetch(`${s}:hashtags`, () => fetchHashtags(s)).then((d) => d && setHashtags(d)).catch(console.error);
      cachedFetch(`${s}:mediaBreakdown`, () => fetchMediaBreakdown(s)).then((d) => d && setMediaBreakdown(d)).catch(console.error);
      cachedFetch(`${s}:dunks`, () => fetchDunks(s)).then((d) => d && setDunksData(d)).catch(console.error);
    }, 1000);
    return () => clearTimeout(bgTimer);
  }, [topicSlug]);

  // Lazy load tab data — fetch immediately if user clicks a tab before background prefetch completes
  useEffect(() => {
    const s = topicSlug;
    if (!s) return;

    if (activeTab === "pulse" || activeTab === "report") {
      cachedFetch(`${s}:analytics`, () => fetchAnalytics(s)).then((d) => d && setAnalytics(d)).catch(console.error);
      cachedFetch(`${s}:narrative`, () => fetchNarrative(s)).then((d) => d && setNarrative(d)).catch(console.error);
      cachedFetch(`${s}:summaries`, () => fetchSummaries(s)).then(setSummaries).catch(console.error);
      cachedFetch(`${s}:pulseExtras`, () => fetchPulseExtras(s)).then((d) => d && setPulseExtras(d)).catch(console.error);
      cachedFetch(`${s}:exposureOverlap`, () => fetchExposureOverlap(s)).then((d) => d && setExposureOverlap(d)).catch(console.error);
      cachedFetch(`${s}:sideBySideFeed`, () => fetchSideBySideFeed(s)).then((d) => d && setSideBySideFeed(d)).catch(console.error);
      cachedFetch(`${s}:mediaBreakdown`, () => fetchMediaBreakdown(s)).then((d) => d && setMediaBreakdown(d)).catch(console.error);
    }
    if (activeTab === "narrative" || activeTab === "report") {
      cachedFetch(`${s}:narrative`, () => fetchNarrative(s)).then((d) => d && setNarrative(d)).catch(console.error);
      cachedFetch(`${s}:narrativeStrategy`, () => fetchNarrativeStrategy(s)).then((d) => d && setNarrativeStrategy(d)).catch(console.error);
      cachedFetch(`${s}:analytics`, () => fetchAnalytics(s)).then((d) => d && setAnalytics(d)).catch(console.error);
      cachedFetch(`${s}:narrativeDepth`, () => fetchNarrativeDepth(s)).then((d) => d && setNarrativeDepth(d)).catch(console.error);
      cachedFetch(`${s}:hashtags`, () => fetchHashtags(s)).then((d) => d && setHashtags(d)).catch(console.error);
      cachedFetch(`${s}:mediaBreakdown`, () => fetchMediaBreakdown(s)).then((d) => d && setMediaBreakdown(d)).catch(console.error);
      cachedFetch(`${s}:summaries`, () => fetchSummaries(s)).then(setSummaries).catch(console.error);
    }
    if (activeTab === "voices" || activeTab === "report") {
      cachedFetch(`${s}:narrativeDepth`, () => fetchNarrativeDepth(s)).then((d) => d && setNarrativeDepth(d)).catch(console.error);
      cachedFetch(`${s}:analytics`, () => fetchAnalytics(s)).then((d) => d && setAnalytics(d)).catch(console.error);
    }
    if (activeTab === "dunks" || activeTab === "report") {
      cachedFetch(`${s}:dunks`, () => fetchDunks(s)).then((d) => d && setDunksData(d)).catch(console.error);
    }
    if (activeTab === "echo" || activeTab === "report") {
      cachedFetch(`${s}:narrative`, () => fetchNarrative(s)).then((d) => d && setNarrative(d)).catch(console.error);
      cachedFetch(`${s}:exposureOverlap`, () => fetchExposureOverlap(s)).then((d) => d && setExposureOverlap(d)).catch(console.error);
      cachedFetch(`${s}:pairedStories`, () => fetchPairedStories(s)).then((d) => d && setPairedStories(d)).catch(console.error);
      cachedFetch(`${s}:analytics`, () => fetchAnalytics(s)).then((d) => d && setAnalytics(d)).catch(console.error);
      cachedFetch(`${s}:narrativeStrategy`, () => fetchNarrativeStrategy(s)).then((d) => d && setNarrativeStrategy(d)).catch(console.error);
    }
    if (activeTab === "strategy" || activeTab === "report") {
      cachedFetch(`${s}:gapAnalysis`, () => fetchGapAnalysis(s)).then((d) => d && setGapAnalysis(d)).catch(console.error);
      cachedFetch(`${s}:recommendations`, () => fetchRecommendations(s)).then((d) => d && setRecommendations(d)).catch(console.error);
      cachedFetch(`${s}:analytics`, () => fetchAnalytics(s)).then((d) => d && setAnalytics(d)).catch(console.error);
    }
  }, [activeTab, topicSlug]);

  // Refetch smart feed when bias changes — debounced to avoid flooding API
  const [debouncedBias, setDebouncedBias] = useState(bias);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedBias(bias), 500);
    return () => clearTimeout(timer);
  }, [bias]);

  useEffect(() => {
    if (!topicSlug) return;
    setFeedLoading(true);
    // Round to 1 decimal for cache key stability
    const biasKey = Math.round(debouncedBias * 10) / 10;
    cachedFetch(`${topicSlug}:smartFeed:${biasKey}`, () => fetchSmartFeed(topicSlug, biasKey, 720, 200))
      .then(setSmartFeedItems)
      .catch(console.error)
      .finally(() => setFeedLoading(false));
  }, [debouncedBias, topicSlug]);

  // Feed items: smart-ranked or chronological
  const feedScored = useMemo(() => {
    if (feedSortMode === "latest") {
      return [...smartFeedItems].sort((a, b) => {
        const da = a.tweet?.created_at || "";
        const db = b.tweet?.created_at || "";
        return db.localeCompare(da);
      });
    }
    return smartFeedItems;
  }, [smartFeedItems, feedSortMode]);

  const feedItems = feedScored.slice(0, feedVisibleCount);

  // Reset feed visible count on sort/bias change
  useEffect(() => { setFeedVisibleCount(50); }, [bias, feedSortMode]);

  // Feed infinite scroll
  useEffect(() => {
    if (activeTab !== "feed") return;
    const sentinel = document.getElementById("feed-sentinel-analytics");
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && feedVisibleCount < feedScored.length) {
          setFeedVisibleCount((prev) => Math.min(prev + 30, feedScored.length));
        }
      },
      { rootMargin: "400px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [feedVisibleCount, feedScored.length, activeTab]);

  function getBiasDescription(value: number): string {
    if (!topic) return "";
    const abs = Math.abs(value);
    if (abs <= 1) return "all perspectives";
    const intensity = abs <= 3 ? "slightly" : abs <= 5 ? "moderately" : abs <= 7.5 ? "strongly" : "extremely";
    const side = value < 0 ? topic.anti_label.toLowerCase() : topic.pro_label.toLowerCase();
    return `${intensity} ${side}`;
  }

  if (!topic) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="animate-spin h-10 w-10 border-2 border-blue-400 border-t-transparent rounded-full mb-4" />
        <p className="text-sm text-gray-400">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="text-gray-500 hover:text-gray-300 text-sm"
              >
                &larr; Topics
              </Link>
              <div className="flex items-baseline gap-2">
                <h1 className="text-lg sm:text-xl font-bold">{topic.name}</h1>
                <span className="text-[10px] text-gray-600 hidden sm:block">
                  {tabs.find((t) => t.id === activeTab)?.subtitle || ""}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {lastRun && lastRun.ran_at && (
                <span className="text-[10px] text-gray-500 hidden sm:block">
                  {lastRun.total_tweets_in_dataset} tweets
                  {lastRun.date_range.earliest && lastRun.date_range.latest && (
                    <> &middot; {new Date(lastRun.date_range.earliest).toLocaleDateString()} &ndash; {new Date(lastRun.date_range.latest).toLocaleDateString()}</>
                  )}
                </span>
              )}
              <button
                onClick={async () => {
                  if (isRunning === "done") {
                    window.location.reload();
                    return;
                  }
                  setIsRunning("running");
                  setPipelineProgress(null);
                  console.log("[Refresh] Starting pipeline for", topicSlug);
                  try {
                    await runTopicPipeline(topicSlug);
                    console.log("[Refresh] Pipeline triggered, polling...");
                    const poll = async () => {
                      for (let i = 0; i < 300; i++) {
                        await new Promise((r) => setTimeout(r, 5000));
                        try {
                          const prog = await fetchPipelineProgress(topicSlug);
                          console.log(`[Refresh] Poll ${i + 1}:`, prog);
                          if (prog) setPipelineProgress(prog);
                          if (prog && !prog.running) {
                            console.log("[Refresh] Pipeline finished:", prog.label, prog.detail);
                            if (prog.label === "Error") {
                              const detail = prog.detail || "";
                              if (detail.includes("API key not valid") || detail.includes("INVALID_ARGUMENT")) {
                                alert("Pipeline failed: Gemini API key is invalid or expired. Update GEMINI_API_KEY in Railway Variables.");
                              } else if (detail.includes("401") || detail.includes("Unauthorized")) {
                                alert("Pipeline failed: SocialData API key is invalid. Update SOCIALDATA_API_KEY in Railway Variables.");
                              } else if (detail.includes("402") || detail.includes("Payment Required")) {
                                alert("Pipeline failed: SocialData API credits exhausted. Top up at socialdata.tools.");
                              } else {
                                alert(`Pipeline failed: ${detail}`);
                              }
                            }
                            invalidateCache(topicSlug);
                            const run = await fetchLastRun(topicSlug);
                            if (run) setLastRun(run);
                            setIsRunning("done");
                            return;
                          }
                        } catch (e) { console.log("[Refresh] Poll error:", e); }
                      }
                      console.log("[Refresh] Polling timed out");
                      invalidateCache(topicSlug);
                      setIsRunning("done");
                    };
                    poll();
                  } catch (e) {
                    console.error("[Refresh] Failed to start pipeline:", e);
                    setIsRunning(false);
                  }
                }}
                disabled={isRunning === "running"}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  isRunning === "running"
                    ? "text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 cursor-not-allowed"
                    : isRunning === "done"
                    ? "text-green-400 bg-green-500/10 border border-green-500/20 hover:bg-green-500/20"
                    : "text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700"
                }`}
              >
                {isRunning === "running"
                  ? pipelineProgress
                    ? `${pipelineProgress.label} (${pipelineProgress.pct}%)`
                    : "Starting..."
                  : isRunning === "done" ? "Reload page" : "Refresh Data"}
              </button>
              <Link
                href={`/topics/${topicSlug}`}
                className="px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 rounded-md transition-colors"
              >
                Refine Query
              </Link>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="border-t border-gray-800/50">
          <div className="max-w-5xl mx-auto px-4">
            <div className="flex items-center gap-3 py-2">
              <div className="flex gap-1 overflow-x-auto no-scrollbar">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setActiveTab(t.id);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className={`px-4 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                      activeTab === t.id
                        ? "bg-gray-700 text-gray-100"
                        : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => { setActiveTab("help"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                className={`px-4 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${
                  activeTab === "help"
                    ? "bg-gray-700 text-gray-100"
                    : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"
                }`}
              >
                Help
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* ============ TAB 1: Executive Pulse ============ */}
        {/* ============ TAB: Feed ============ */}
        {activeTab === "feed" && (
          <>
            {/* Sentiment distribution / bias slider */}
            {allTweets.length > 0 && (
              <SentimentDistribution
                items={allTweets}
                antiLabel={topic.anti_label}
                proLabel={topic.pro_label}
                bias={bias}
                onChange={setBias}
              />
            )}

            {/* Feed header with sort toggle */}
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">
                Showing{" "}
                <span className="text-gray-300 font-medium">{getBiasDescription(bias)}</span>{" "}
                feed &middot; {feedItems.length} tweets
              </div>
              <div className="flex items-center gap-1 bg-gray-800 rounded-md p-0.5">
                <button
                  onClick={() => setFeedSortMode("smart")}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    feedSortMode === "smart" ? "bg-gray-700 text-gray-100" : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  For You
                </button>
                <button
                  onClick={() => setFeedSortMode("latest")}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    feedSortMode === "latest" ? "bg-gray-700 text-gray-100" : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  Latest
                </button>
              </div>
            </div>

            {/* Loading indicator when bias changes */}
            {feedLoading && smartFeedItems.length > 0 && (
              <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-2">
                <div className="animate-spin h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full shrink-0" />
                <span className="text-xs text-blue-300">Updating feed for new bias position...</span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
              {/* Tweet feed */}
              <div>
                {feedLoading && smartFeedItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <div className="animate-spin h-8 w-8 border-2 border-blue-400 border-t-transparent rounded-full mb-4" />
                    <p className="text-sm text-gray-400">Loading your feed...</p>
                    <p className="text-[10px] text-gray-600 mt-1">Building your personalized timeline from {topic.name} tweets</p>
                  </div>
                ) : feedItems.length === 0 ? (
                  <p className="text-gray-500 text-center py-12">No tweets found.</p>
                ) : (
                  <div className="space-y-4">
                    {feedItems.map((item) => (
                      <TweetCard
                        key={item.tweet.id_str}
                        tweet={item.tweet}
                        classification={item.classification}
                        proLabel={topic.pro_label}
                        antiLabel={topic.anti_label}
                      />
                    ))}
                    {feedVisibleCount < feedScored.length && (
                      <div id="feed-sentinel-analytics" className="py-4 text-center">
                        <button
                          onClick={() => setFeedVisibleCount((prev) => Math.min(prev + 30, feedScored.length))}
                          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                        >
                          Show more ({feedScored.length - feedVisibleCount} remaining)
                        </button>
                      </div>
                    )}
                    {feedVisibleCount >= feedScored.length && feedItems.length > 0 && (
                      <p className="text-xs text-gray-600 text-center py-4">
                        Showing all {feedScored.length} tweets
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Sidebar — breakdown stats */}
              <aside className="hidden lg:block">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sticky top-44">
                  <h2 className="text-sm font-semibold text-gray-300 mb-3">Breakdown</h2>
                  {breakdown ? (
                    <BreakdownChart data={breakdown} proLabel={topic.pro_label} antiLabel={topic.anti_label} />
                  ) : (
                    <p className="text-xs text-gray-600">Loading stats...</p>
                  )}
                </div>
              </aside>
            </div>
          </>
        )}

        {/* Report mode section header helper */}
        {activeTab === "report" && (
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-gray-200">Full Report: {topic.name}</h2>
              <p className="text-xs text-gray-500 mt-1">Generated {new Date().toLocaleDateString()}</p>
            </div>
            <button
              onClick={() => window.print()}
              className="px-4 py-2 text-sm font-medium text-gray-200 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
            >
              Export PDF
            </button>
          </div>
        )}

        {(activeTab === "pulse" || activeTab === "report") && (
          <>
            {/* Executive Snapshot Metrics */}
            {analytics && narrative && (() => {
              const anti = analytics.engagement.anti;
              const pro = analytics.engagement.pro;
              const totalTweets = anti.count + pro.count;
              const totalEng = Math.round(anti.avg_engagement * anti.count + pro.avg_engagement * pro.count);
              const avgEng = totalTweets > 0 ? Math.round(totalEng / totalTweets) : 0;

              // Find top emotion per side and overall
              const emotionCounts: Record<string, number> = {};
              const antiEmotionCounts: Record<string, number> = {};
              const proEmotionCounts: Record<string, number> = {};
              for (const [key, val] of Object.entries(narrative.emotions.anti)) {
                const c = (val as any).count || 0;
                emotionCounts[key] = (emotionCounts[key] || 0) + c;
                antiEmotionCounts[key] = c;
              }
              for (const [key, val] of Object.entries(narrative.emotions.pro)) {
                const c = (val as any).count || 0;
                emotionCounts[key] = (emotionCounts[key] || 0) + c;
                proEmotionCounts[key] = c;
              }
              const topEmotion = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0];
              const sortedAntiEmotions = Object.entries(antiEmotionCounts).sort((a, b) => b[1] - a[1]);
              const sortedProEmotions = Object.entries(proEmotionCounts).sort((a, b) => b[1] - a[1]);
              const topAntiEmotion = sortedAntiEmotions[0];
              const topProEmotion = sortedProEmotions[0];
              const secondAntiEmotion = sortedAntiEmotions[1];
              const secondProEmotion = sortedProEmotions[1];
              const emotionLabels = narrative.emotion_labels;

              const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(n);

              // Computed values for cards
              const antiPctVol = totalTweets > 0 ? Math.round(anti.count / totalTweets * 100) : 0;
              const proPctVol = totalTweets > 0 ? Math.round(pro.count / totalTweets * 100) : 0;
              const volDominant = anti.count > pro.count ? topic.anti_label : topic.pro_label;
              const volDominantPct = Math.max(antiPctVol, proPctVol);
              const volRatio = Math.round(Math.max(anti.count, pro.count) / Math.max(Math.min(anti.count, pro.count), 1) * 10) / 10;

              const antiTotalEng = Math.round(anti.avg_engagement * anti.count);
              const proTotalEng = Math.round(pro.avg_engagement * pro.count);
              const engDominant = antiTotalEng > proTotalEng ? topic.anti_label : topic.pro_label;
              const engDominantPct = totalEng > 0 ? Math.round(Math.max(antiTotalEng, proTotalEng) / totalEng * 100) : 0;

              const perfRatio = Math.round(Math.max(anti.avg_engagement, pro.avg_engagement) / Math.max(Math.min(anti.avg_engagement, pro.avg_engagement), 1) * 10) / 10;
              const perfDominant = anti.avg_engagement > pro.avg_engagement ? topic.anti_label : topic.pro_label;

              const gapScore = (() => {
                const allKeys = Object.keys(narrative.frame_labels);
                const aT = allKeys.reduce((s, k) => s + ((narrative.frames.anti[k] as any)?.count || 0), 0);
                const pT = allKeys.reduce((s, k) => s + ((narrative.frames.pro[k] as any)?.count || 0), 0);
                const diffs = allKeys.map((k) => {
                  const aS = aT > 0 ? ((narrative.frames.anti[k] as any)?.count || 0) / aT : 0;
                  const pS = pT > 0 ? ((narrative.frames.pro[k] as any)?.count || 0) / pT : 0;
                  return Math.abs(aS - pS);
                });
                return Math.round(0.5 * diffs.reduce((s, d) => s + d, 0) * 100);
              })();
              const gapLabel = gapScore <= 20 ? "Low" : gapScore <= 40 ? "Moderate" : gapScore <= 60 ? "Strong" : "Very Strong";

              const topEmotionLabel = topEmotion ? emotionLabels[topEmotion[0]] || topEmotion[0] : "—";
              const topEmotionSide = (() => {
                if (!topEmotion) return "";
                const ac = antiEmotionCounts[topEmotion[0]] || 0;
                const pc = proEmotionCounts[topEmotion[0]] || 0;
                return ac > pc ? topic.anti_label : topic.pro_label;
              })();

              // Executive summary sentence
              const summaryLine = `${volDominant} leads the conversation and captures most audience attention.`;

              // Conversation Type
              const convTypeData = (() => {
                const ov = exposureOverlap?.score ?? 50;
                const gap = gapScore;
                if (ov <= 20 && gap >= 20) return {
                  label: "Separate Realities",
                  explanation: "Each side is seeing different stories and framing them differently — they are essentially in two separate conversations."
                };
                if (ov > 40 && gap >= 25) return {
                  label: "Same Story, Different Framing",
                  explanation: "Both sides are following the same events, but interpreting them through very different lenses."
                };
                if (ov > 60 && gap < 20) return {
                  label: "Shared Narrative",
                  explanation: "Both sides are seeing and discussing similar stories in similar ways — the conversation is relatively unified."
                };
                return {
                  label: "Partially Overlapping Narratives",
                  explanation: "The two sides share some common stories but each side also has content the other doesn't see."
                };
              })();
              const convType = convTypeData.label;

              // Additional computed values for cards
              const antiViews = Math.round(anti.avg_views * anti.count);
              const proViews = Math.round(pro.avg_views * pro.count);
              const totalViews = antiViews + proViews;
              const viewsDominantPct2 = totalViews > 0 ? Math.round(Math.max(antiViews, proViews) / totalViews * 100) : 0;
              const viewsRatio = Math.round(Math.max(antiViews, proViews) / Math.max(Math.min(antiViews, proViews), 1) * 10) / 10;

              const antiTop = topAntiEmotion ? emotionLabels[topAntiEmotion[0]] || topAntiEmotion[0] : "—";
              const proTop = topProEmotion ? emotionLabels[topProEmotion[0]] || topProEmotion[0] : "—";
              const sameTopEmotion = topAntiEmotion && topProEmotion && topAntiEmotion[0] === topProEmotion[0];
              const emotionStrongestSide = (() => {
                if (!topAntiEmotion || !topProEmotion) return "";
                const ac = antiEmotionCounts[topAntiEmotion[0]] || 0;
                const pc = proEmotionCounts[topProEmotion[0]] || 0;
                // Compare as % of each side's total
                const antiEmoTotal = Object.values(antiEmotionCounts).reduce((s, v) => s + v, 0) || 1;
                const proEmoTotal = Object.values(proEmotionCounts).reduce((s, v) => s + v, 0) || 1;
                return (ac / antiEmoTotal) > (pc / proEmoTotal) ? topic.anti_label : topic.pro_label;
              })();

              return (
                <>
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Card 1: Who's Dominating */}
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Who's Leading</div>
                    <div className={`text-base sm:text-lg font-bold ${volDominant === topic.anti_label ? "text-blue-400" : "text-red-400"} leading-tight`}>
                      {volDominant} leads the conversation
                    </div>
                    <div className="text-[10px] text-gray-400 mt-2">
                      {volDominantPct}% of tweets <span className="text-gray-500 mx-1 text-sm">&#x2022;</span> {viewsDominantPct2}% of views
                    </div>
                    <div className="text-[10px] text-gray-600 mt-0.5">
                      {volRatio}× more tweets <span className="text-gray-500 mx-1 text-sm">&#x2022;</span> {viewsRatio}× more views
                    </div>
                  </div>

                  {/* Card 2: What Performs Best */}
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">What Performs Best</div>
                    <div className={`text-base sm:text-lg font-bold ${perfDominant === topic.anti_label ? "text-blue-400" : "text-red-400"} leading-tight`}>
                      {perfDominant} gets {perfRatio}× more engagement
                    </div>
                    <div className="text-[10px] text-gray-400 mt-2">
                      {fmt(Math.round(Math.max(anti.avg_engagement, pro.avg_engagement)))} vs {fmt(Math.round(Math.min(anti.avg_engagement, pro.avg_engagement)))} avg engagement per tweet (likes + retweets + replies)
                    </div>
                  </div>

                  {/* Card 3: Narrative Divide */}
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Narrative Divide</div>
                    <div className="text-base sm:text-lg font-bold text-yellow-400 leading-tight">
                      {gapScore <= 20 ? "Similar stories on both sides"
                        : gapScore <= 40 ? "Different stories, not just different opinions"
                        : gapScore <= 60 ? "Very different stories being told"
                        : "Almost completely different realities"}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-2">
                      {gapLabel} divide ({gapScore}/100)
                    </div>
                    <details className="mt-1">
                      <summary className="text-[10px] text-gray-600 cursor-pointer hover:text-gray-400">
                        How is this calculated?
                      </summary>
                      <p className="text-[10px] text-gray-600 mt-1 leading-relaxed">
                        Measures how differently each side frames the topic. For each argument type (security, humanitarian, economic, etc.), we compare what % of each side's tweets use that frame, then sum the differences. 0 = identical framing on both sides. 100 = completely different framing with no overlap.
                      </p>
                    </details>
                  </div>

                  {/* Card 4: What Drives Engagement */}
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">What Drives Engagement</div>
                    {sameTopEmotion ? (
                      <>
                        <div className="text-base sm:text-lg font-bold text-gray-100 leading-tight">
                          {topEmotionLabel}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-2">
                          Top emotional driver on both sides
                        </div>
                      </>
                    ) : (
                      <div className="space-y-1.5 mt-1">
                        <div>
                          <div className="text-[10px] text-blue-400 font-medium">{topic.anti_label}</div>
                          <div className="text-sm sm:text-base font-bold text-gray-100 leading-tight">{antiTop}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-red-400 font-medium">{topic.pro_label}</div>
                          <div className="text-sm sm:text-base font-bold text-gray-100 leading-tight">{proTop}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Unified: What's Happening & Why + What's Driving This */}
                <div className="mt-4 bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-medium">
                    What's Happening & Why
                  </div>

                  {/* Headline */}
                  <p className="text-sm sm:text-base text-gray-200 font-semibold leading-snug mt-1">
                    {summaryLine}
                  </p>

                  {/* Top stories per side */}
                  {(summaries.anti?.summary || summaries.pro?.summary) && (() => {
                    const extractTopStories = (text: string): string[] => {
                      const stories: string[] = [];
                      const sections = text.split("**");
                      for (let i = 0; i < sections.length; i++) {
                        const header = sections[i].toLowerCase().trim();
                        if ((header.includes("current events") || header.includes("key themes")) && i + 1 < sections.length) {
                          const content = sections[i + 1].replace(/^\s*:?\s*/, "").trim();
                          // Split into sentences and take the first one, capped at 150 chars
                          const sentences = content.split(/\.(?:\s|$)/).filter(s => s.trim().length > 15);
                          if (sentences[0]) {
                            const s = sentences[0].trim();
                            stories.push(s + ".");
                          }
                        }
                      }
                      return stories.slice(0, 2);
                    };

                    const antiStories = summaries.anti?.summary ? extractTopStories(summaries.anti.summary) : [];
                    const proStories = summaries.pro?.summary ? extractTopStories(summaries.pro.summary) : [];

                    if (antiStories.length === 0 && proStories.length === 0) return null;

                    return (
                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {antiStories.length > 0 && (
                          <div className="border border-blue-500/20 rounded-lg p-3 bg-blue-500/5">
                            <div className="text-[10px] text-blue-400 uppercase tracking-wider font-medium mb-2">{topic.anti_label} is focused on</div>
                            <ul className="space-y-1.5">
                              {antiStories.map((s, i) => (
                                <li key={i} className="text-[11px] text-gray-300 leading-relaxed pl-3 border-l-2 border-blue-500/30">{s}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {proStories.length > 0 && (
                          <div className="border border-red-500/20 rounded-lg p-3 bg-red-500/5">
                            <div className="text-[10px] text-red-400 uppercase tracking-wider font-medium mb-2">{topic.pro_label} is focused on</div>
                            <ul className="space-y-1.5">
                              {proStories.map((s, i) => (
                                <li key={i} className="text-[11px] text-gray-300 leading-relaxed pl-3 border-l-2 border-red-500/30">{s}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* What This Means — combined with conversation type */}
                  <div className="border-t border-gray-800 pt-3 mt-4">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 font-medium">
                      What This Means
                    </div>
                    <p className="text-xs text-gray-300 leading-relaxed">
                      <span className="font-semibold text-gray-200">{convType}:</span> {convTypeData.explanation}
                    </p>
                    {analytics && narrative && (
                      <WhatThisMeansInline
                        analytics={analytics}
                        narrative={narrative}
                        exposureOverlap={exposureOverlap}
                        antiLabel={topic.anti_label}
                        proLabel={topic.pro_label}
                      />
                    )}
                  </div>
                </div>
                </>
              );
            })()}

            {/* Narrative Mix */}
            {narrative && <NarrativeMix data={narrative} />}

            {/* Top Voices — compact */}
            {analytics && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-medium">Top Voices</div>
                <h3 className="text-sm font-semibold text-gray-300 mb-3">
                  Who's Shaping the Conversation
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {(["anti", "pro"] as const).map((side) => {
                    const voices = analytics.voices[side].slice(0, 3);
                    const label = side === "anti" ? analytics.anti_label : analytics.pro_label;
                    const colorClass = side === "anti" ? "text-blue-400" : "text-red-400";
                    const borderClass = side === "anti" ? "border-blue-500/20" : "border-red-500/20";
                    return (
                      <div key={side}>
                        <div className={`text-xs font-medium ${colorClass} mb-2`}>{label}</div>
                        <div className="space-y-2">
                          {voices.map((v, i) => (
                            <div key={v.screen_name} className={`flex items-center gap-3 p-2 rounded-lg border ${borderClass} bg-gray-800/30`}>
                              <div className="text-lg font-bold text-gray-600 w-5 text-center shrink-0">{i + 1}</div>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-semibold text-gray-200 truncate">
                                  {v.author_name}
                                </div>
                                <div className="text-[10px] text-gray-500">
                                  <a href={`https://x.com/${v.screen_name}`} target="_blank" rel="noopener noreferrer" className="hover:text-gray-300 transition-colors">@{v.screen_name}</a> · {v.followers >= 1000000 ? `${(v.followers / 1000000).toFixed(1)}M` : v.followers >= 1000 ? `${(v.followers / 1000).toFixed(0)}K` : v.followers} followers
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-xs font-semibold text-gray-300">
                                  {v.total_engagement >= 1000000 ? `${(v.total_engagement / 1000000).toFixed(1)}M` : v.total_engagement >= 1000 ? `${(v.total_engagement / 1000).toFixed(0)}K` : v.total_engagement}
                                </div>
                                <div className="text-[9px] text-gray-600">engagement</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[9px] text-gray-600 mt-3">
                  Engagement = likes + retweets + replies. Ranked by total engagement across all posts in the dataset.
                </p>
              </div>
            )}

            {/* Echo Chamber Score — compact */}
            {exposureOverlap && (() => {
              const score = exposureOverlap.score;
              const color = score <= 20 ? "text-red-400" : score <= 40 ? "text-orange-400" : score <= 60 ? "text-yellow-400" : "text-green-400";
              const bgColor = score <= 20 ? "bg-red-400" : score <= 40 ? "bg-orange-400" : score <= 60 ? "bg-yellow-400" : "bg-green-400";
              const level = score <= 20 ? "Strong Echo Chamber" : score <= 40 ? "Moderate Echo Chamber" : score <= 60 ? "Some Overlap" : "Shared Conversation";

              return (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-medium">Echo Chamber</div>
                  <div className="flex items-center gap-4 mt-2">
                    <span className={`text-3xl font-bold ${color}`}>{score}%</span>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-gray-200">{level}</div>
                      <p className="text-[10px] text-gray-500 mt-0.5">{exposureOverlap.sentence}</p>
                    </div>
                  </div>
                  <div className="mt-3 h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className={`h-full ${bgColor} rounded-full transition-all`} style={{ width: `${score}%`, opacity: 0.7 }} />
                  </div>
                  <div className="flex justify-between text-[9px] text-gray-600 mt-1">
                    <span>Separate realities</span>
                    <span>Shared conversation</span>
                  </div>
                  <button
                    onClick={() => setActiveTab("echo")}
                    className="text-[10px] text-gray-500 hover:text-gray-300 mt-3 transition-colors"
                  >
                    View full echo chamber analysis &rarr;
                  </button>
                </div>
              );
            })()}

            {/* Alert Flags */}
            {pulseExtras && pulseExtras.alerts.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-medium">Alerts</div>
                <h3 className="text-sm font-semibold text-gray-300 mb-3">
                  Notable Patterns
                </h3>
                <div className="space-y-2">
                  {pulseExtras.alerts.map((alert, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-2.5 rounded-md px-3 py-2 ${
                        alert.severity === "high"
                          ? "bg-red-500/10 border border-red-500/20"
                          : "bg-yellow-500/10 border border-yellow-500/20"
                      }`}
                    >
                      <span className={`text-sm mt-0.5 shrink-0 ${
                        alert.severity === "high" ? "text-red-400" : "text-yellow-400"
                      }`}>
                        {alert.severity === "high" ? "!" : "~"}
                      </span>
                      <p className={`text-xs leading-relaxed ${
                        alert.severity === "high" ? "text-red-300/80" : "text-yellow-300/80"
                      }`}>
                        {alert.message}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Side-by-Side Feed Preview */}
            {sideBySideFeed && (sideBySideFeed.anti.length > 0 || sideBySideFeed.pro.length > 0) && (() => {
              const fmt = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
              const aL = sideBySideFeed.anti_label;
              const pL = sideBySideFeed.pro_label;

              const renderFeedColumn = (items: typeof sideBySideFeed.anti, label: string, color: string, borderColor: string) => (
                <div>
                  <div className={`text-[10px] ${color} uppercase tracking-wider font-medium mb-3`}>{label}</div>
                  <div className="space-y-3">
                    {items.map((item) => (
                      <a key={item.id_str} href={item.url} target="_blank" rel="noopener noreferrer"
                        className={`block border ${borderColor} rounded-lg p-3 bg-gray-800/20 hover:bg-gray-800/40 transition-colors`}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[11px] text-gray-200 font-medium">@{item.screen_name}</span>
                          {item.author_followers >= 10000 && (
                            <span className="text-[9px] text-gray-600">{fmt(item.author_followers)} followers</span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-300 leading-relaxed line-clamp-3 mb-2">{decodeHtml(item.full_text)}</p>
                        {item.media.length > 0 && (
                          <div className="flex gap-1 mb-2">
                            {item.media.slice(0, 2).map((m, i) => (
                              <div key={i} className="text-[9px] bg-gray-700/50 text-gray-400 px-1.5 py-0.5 rounded">
                                {m.type === "video" ? "Video" : "Photo"}
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-3 text-[9px] text-gray-500">
                          <span>{fmt(item.likes)} likes</span>
                          <span>{fmt(item.retweets)} RTs</span>
                          {item.quotes > 0 && <span>{fmt(item.quotes)} quotes</span>}
                          <span>{fmt(item.views)} views</span>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              );

              return (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-medium">Feed Preview</div>
                  <h3 className="text-sm font-semibold text-gray-300 mb-0.5">
                    What each side&apos;s audience sees
                  </h3>
                  <p className="text-[10px] text-gray-600 mb-5">
                    The top posts from each side, ranked by engagement — this is the content shaping each audience
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {renderFeedColumn(sideBySideFeed.anti, aL, "text-blue-400", "border-blue-500/20")}
                    {renderFeedColumn(sideBySideFeed.pro, pL, "text-red-400", "border-red-500/20")}
                  </div>
                </div>
              );
            })()}

          </>
        )}

        {/* ============ TAB 2: Narrative Deep-Dive ============ */}
        {activeTab === "report" && <div className="border-t border-gray-700 pt-6 mt-6"><div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-4">Narrative Deep-Dive</div></div>}

        {(activeTab === "narrative" || activeTab === "report") && (() => {
          /* Section wrapper — always expanded */
          const Section = ({ tag, title, subtitle, children }: { id?: string; tag: string; title: string; subtitle: string; children: React.ReactNode; defaultOpen?: boolean }) => (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
              <div className="mb-4">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-medium">{tag}</div>
                <h3 className="text-sm font-semibold text-gray-300">{title}</h3>
                <p className="text-[10px] text-gray-600 mt-0.5">{subtitle}</p>
              </div>
              {children}
            </div>
          );

          return (
            <>
              {/* 1. Summary — always open, no collapsible wrapper */}
              {Object.keys(summaries).length > 0 && (
                <SummaryTabs
                  summaries={summaries}
                  antiLabel={topic.anti_label}
                  proLabel={topic.pro_label}
                />
              )}

              {/* 2. What Each Side Argues + Top Arguments (combined) */}
              {narrative && (
                <NarrativeFrames
                  data={narrative}
                  exposureOverlap={null}
                  playbook={narrativeStrategy?.playbook}
                  strategyLabels={narrativeStrategy ? { anti: narrativeStrategy.anti_label, pro: narrativeStrategy.pro_label } : null}
                  onViewTweets={(frameKey) => {
                    setSelectedFrame(frameKey);
                    setActiveTab("voices");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                />
              )}

              {/* 5. Engagement by Frame — collapsed by default */}
              {narrativeStrategy && narrativeStrategy.frame_performance.length > 0 && (() => {
                const topFrames = narrativeStrategy.frame_performance.slice(0, 6);
                const maxEng = Math.max(...topFrames.map(f => f.avg_engagement), 1);
                const maxVol = Math.max(...topFrames.map(f => f.tweet_count), 1);
                const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

                return (
                  <Section id="engagement" tag="Engagement by Frame" title="Which narratives get the most traction" subtitle="Average engagement (likes + retweets + replies) and tweet volume for each frame">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-sm bg-yellow-500/50" />
                        <span className="text-[10px] text-gray-400">Avg Engagement (likes + retweets + replies)</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-sm bg-blue-500/40" />
                        <span className="text-[10px] text-gray-400">Tweet Volume</span>
                      </div>
                    </div>
                    <div className="space-y-4">
                      {topFrames.map((f) => (
                        <div key={f.frame}>
                          <div className="text-xs text-gray-300 mb-1.5 truncate">{f.label}</div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-5 bg-gray-800 rounded overflow-hidden relative">
                                <div className="h-full bg-yellow-500/50 rounded" style={{ width: `${(f.avg_engagement / maxEng) * 100}%` }} />
                                <span className="absolute inset-y-0 left-2 flex items-center text-[10px] text-white font-medium">{fmt(f.avg_engagement)} engagements</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-5 bg-gray-800 rounded overflow-hidden relative">
                                <div className="h-full bg-blue-500/40 rounded" style={{ width: `${(f.tweet_count / maxVol) * 100}%` }} />
                                <span className="absolute inset-y-0 left-2 flex items-center text-[10px] text-white font-medium">{f.tweet_count} posts</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {topFrames.length > 0 && (
                      <p className="text-[10px] text-gray-500 mt-4">
                        {topFrames[0].label} performs best overall with {fmt(topFrames[0].avg_engagement)} avg engagement across {topFrames[0].tweet_count} posts.
                      </p>
                    )}
                  </Section>
                );
              })()}

              {/* Trending Phrases */}
              {analytics && <TrendingPhrases data={analytics} />}

              {/* Hashtags */}
              {hashtags && (hashtags.anti.length > 0 || hashtags.pro.length > 0) && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-medium">Hashtags</div>
                  <h3 className="text-sm font-semibold text-gray-300 mb-0.5">
                    How each side tags the conversation
                  </h3>
                  <p className="text-[10px] text-gray-600 mb-5">
                    The most-used hashtags on each side — shared hashtags appear on both
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {([
                      { tags: hashtags.anti, label: hashtags.anti_label, color: "text-blue-400", bg: "bg-blue-500/15", textColor: "text-blue-300" },
                      { tags: hashtags.pro, label: hashtags.pro_label, color: "text-red-400", bg: "bg-red-500/15", textColor: "text-red-300" },
                    ]).map(({ tags, label, color, bg, textColor }) => (
                      <div key={label}>
                        <div className={`text-[10px] ${color} uppercase tracking-wider font-medium mb-3`}>{label}</div>
                        {tags.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {tags.slice(0, 15).map((h) => (
                              <span key={h.tag} className={`text-xs ${bg} ${textColor} px-2.5 py-1 rounded-md`}>
                                #{h.tag}
                                <span className="opacity-50 ml-1.5 text-[10px] font-mono">{h.count}</span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[10px] text-gray-600">No hashtags found</p>
                        )}
                      </div>
                    ))}
                  </div>
                  {(hashtags.shared_count > 0 || hashtags.anti_only_count > 0 || hashtags.pro_only_count > 0) && (
                    <p className="text-[10px] text-gray-500 mt-4">
                      {hashtags.shared_count} hashtag{hashtags.shared_count !== 1 ? "s" : ""} used by both sides,{" "}
                      {hashtags.anti_only_count} unique to {hashtags.anti_label},{" "}
                      {hashtags.pro_only_count} unique to {hashtags.pro_label}.
                    </p>
                  )}
                </div>
              )}

              {/* Content Format */}
              {mediaBreakdown && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-medium">Content Format</div>
                  <h3 className="text-sm font-semibold text-gray-300 mb-0.5">
                    How each side shares content
                  </h3>
                  <p className="text-[10px] text-gray-600 mb-5">
                    The mix of videos, photos, links, and text-only posts
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    {([
                      { stats: mediaBreakdown.anti, label: mediaBreakdown.anti_label, headerColor: "text-blue-400" },
                      { stats: mediaBreakdown.pro, label: mediaBreakdown.pro_label, headerColor: "text-red-400" },
                      { stats: mediaBreakdown.overall, label: "Overall", headerColor: "text-gray-400" },
                    ]).map(({ stats, label, headerColor }) => (
                      <div key={label}>
                        <div className={`text-[10px] ${headerColor} uppercase tracking-wider font-medium mb-3`}>{label}</div>
                        <div className="h-6 rounded-lg overflow-hidden flex mb-2">
                          {([
                            { key: "video" as const, color: "bg-purple-500/60" },
                            { key: "photo" as const, color: "bg-blue-500/60" },
                            { key: "link" as const, color: "bg-green-500/60" },
                            { key: "text_only" as const, color: "bg-gray-500/60" },
                          ]).map(({ key, color }) => {
                            const pct = stats.pct[key];
                            return pct > 0 ? (
                              <div key={key} className={`h-full ${color} flex items-center justify-center`} style={{ width: `${pct}%` }}>
                                {pct >= 12 && <span className="text-[9px] text-white font-medium">{pct}%</span>}
                              </div>
                            ) : null;
                          })}
                        </div>
                        <div className="space-y-1">
                          {([
                            { key: "video" as const, label: "Video", color: "bg-purple-500/60" },
                            { key: "photo" as const, label: "Photo", color: "bg-blue-500/60" },
                            { key: "link" as const, label: "Link", color: "bg-green-500/60" },
                            { key: "text_only" as const, label: "Text Only", color: "bg-gray-500/60" },
                          ]).map(({ key, label: catLabel, color }) => (
                            <div key={key} className="flex items-center gap-2 text-[10px]">
                              <div className={`w-2.5 h-2.5 rounded-sm ${color} shrink-0`} />
                              <span className="text-gray-400">{catLabel}</span>
                              <span className="text-gray-500 ml-auto">{stats[key]} ({stats.pct[key]}%)</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 6. Rhetoric Intensity — collapsed by default */}
              {narrativeDepth && narrativeDepth.rhetoric && (() => {
                const { anti, pro } = narrativeDepth.rhetoric;
                const aL = narrativeDepth.anti_label;
                const pL = narrativeDepth.pro_label;
                const buckets = ["mild", "moderate", "aggressive", "extreme"] as const;
                const bucketColors = { mild: "bg-green-500/60", moderate: "bg-yellow-500/60", aggressive: "bg-orange-500/60", extreme: "bg-red-500/60" };
                const bucketLabels = { mild: "Mild (1-3)", moderate: "Moderate (4-6)", aggressive: "Aggressive (7-8)", extreme: "Extreme (9-10)" };
                const intensityLabel = (avg: number) => avg <= 3 ? "Measured" : avg <= 5 ? "Heated" : avg <= 7 ? "Aggressive" : "Extreme";

                return (
                  <Section id="rhetoric" tag="Rhetoric Intensity" title="How aggressively each side argues" subtitle="Measures absolutist language, hyperbole, name-calling, and urgency — not which emotion, but how hard the language pushes">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                      {([
                        { side: anti, label: aL, color: "text-blue-400", border: "border-blue-500/20" },
                        { side: pro, label: pL, color: "text-red-400", border: "border-red-500/20" },
                      ] as const).map(({ side, label, color, border }) => (
                        <div key={label} className={`border ${border} rounded-xl p-4 bg-gray-800/20`}>
                          <div className={`text-[10px] ${color} uppercase tracking-wider font-medium mb-3`}>{label}</div>
                          <div className="flex items-baseline gap-2 mb-3">
                            <span className={`text-2xl font-bold ${color}`}>{side.avg_intensity}</span>
                            <span className="text-xs text-gray-400">/10 avg — {intensityLabel(side.avg_intensity)}</span>
                          </div>
                          <div className="space-y-2">
                            {buckets.map((b) => {
                              const pct = side.distribution[b];
                              return (
                                <div key={b} className="flex items-center gap-2">
                                  <div className="w-20 text-[10px] text-gray-400 shrink-0">{bucketLabels[b]}</div>
                                  <div className="flex-1 h-4 bg-gray-800 rounded overflow-hidden relative">
                                    <div className={`h-full ${bucketColors[b]} rounded`} style={{ width: `${pct}%` }} />
                                    {pct > 0 && <span className="absolute inset-y-0 left-2 flex items-center text-[9px] text-white font-medium">{pct}%</span>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div className="text-[9px] text-gray-600 mt-2">{side.total_scored} tweets scored</div>
                        </div>
                      ))}
                    </div>
                    {anti.avg_intensity > 0 && pro.avg_intensity > 0 && (
                      <p className="text-[10px] text-gray-500">
                        {anti.avg_intensity > pro.avg_intensity
                          ? `${aL} rhetoric runs hotter on average (${anti.avg_intensity} vs ${pro.avg_intensity}).`
                          : anti.avg_intensity < pro.avg_intensity
                          ? `${pL} rhetoric runs hotter on average (${pro.avg_intensity} vs ${anti.avg_intensity}).`
                          : `Both sides show similar rhetorical intensity (${anti.avg_intensity}).`}
                        {" "}
                        {(anti.distribution.extreme + anti.distribution.aggressive > 40 || pro.distribution.extreme + pro.distribution.aggressive > 40)
                          ? "A significant share of posts use aggressive or extreme language."
                          : "Most posts stay in the mild-to-moderate range."}
                      </p>
                    )}
                  </Section>
                );
              })()}



            </>
          );
        })()}

        {/* ============ TAB: Key Voices ============ */}
        {activeTab === "report" && <div className="border-t border-gray-700 pt-6 mt-6"><div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-4">Key Voices</div></div>}

        {(activeTab === "voices" || activeTab === "report") && (
          <>
            {/* Amplification — Who is driving the conversation */}
            {narrativeDepth && narrativeDepth.amplification && (() => {
              const { anti, pro, follower_threshold } = narrativeDepth.amplification;
              const aL = narrativeDepth.anti_label;
              const pL = narrativeDepth.pro_label;
              const fmt = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
              const thresholdLabel = fmt(follower_threshold);

              return (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-medium">Amplification</div>
                  <h3 className="text-sm font-semibold text-gray-300 mb-0.5">
                    Who is driving the conversation
                  </h3>
                  <p className="text-[10px] text-gray-600 mb-5">
                    High-reach accounts ({thresholdLabel}+ followers) vs organic spread. Engagements = likes + retweets + quotes + replies.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                    {([
                      { side: anti, label: aL, color: "text-blue-400", border: "border-blue-500/20", barColor: "bg-blue-500/50" },
                      { side: pro, label: pL, color: "text-red-400", border: "border-red-500/20", barColor: "bg-red-500/50" },
                    ] as const).map(({ side, label, color, border, barColor }) => (
                      <div key={label} className={`border ${border} rounded-xl p-4 bg-gray-800/20`}>
                        <div className={`text-[10px] ${color} uppercase tracking-wider font-medium mb-3`}>{label}</div>
                        <div className="mb-3">
                          <div className="text-[10px] text-gray-400 mb-1">Share of engagement from high-reach accounts</div>
                          <div className="h-5 bg-gray-800 rounded overflow-hidden relative">
                            <div className={`h-full ${barColor} rounded`} style={{ width: `${side.high_reach_eng_share}%` }} />
                            <span className="absolute inset-y-0 left-2 flex items-center text-[10px] text-white font-medium">{side.high_reach_eng_share}%</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-center">
                          <div>
                            <div className="text-lg font-bold text-gray-200">{fmt(side.high_reach_avg_eng)}</div>
                            <div className="text-[9px] text-gray-500">avg engagements (high reach)</div>
                          </div>
                          <div>
                            <div className="text-lg font-bold text-gray-200">{fmt(side.organic_avg_eng)}</div>
                            <div className="text-[9px] text-gray-500">avg engagements (organic)</div>
                          </div>
                        </div>
                        <div className="text-[9px] text-gray-600 mt-2">{side.high_reach_count} high-reach / {side.organic_count} organic accounts</div>
                        {side.top_amplifiers.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-700/30">
                            <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-2">Top Amplifiers</div>
                            <div className="space-y-2">
                              {side.top_amplifiers.map((amp, i) => (
                                <a key={`${amp.screen_name}-${i}`} href={amp.url} target="_blank" rel="noopener noreferrer"
                                  className="block hover:bg-gray-700/20 rounded px-1.5 py-1.5 transition-colors">
                                  <p className="text-[10px] text-gray-300 leading-relaxed line-clamp-2 mb-1">{decodeHtml(amp.full_text)}</p>
                                  <div className="flex items-center gap-2 text-[9px] text-gray-500">
                                    <span>(@{amp.screen_name})</span>
                                    <span>{fmt(amp.followers)} followers</span>
                                    <span>{fmt(amp.engagement)} engagements</span>
                                  </div>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {anti.high_reach_eng_share > 0 && pro.high_reach_eng_share > 0 && (
                    <p className="text-[10px] text-gray-500 mt-4">
                      {anti.high_reach_eng_share > pro.high_reach_eng_share
                        ? `${aL} is more reliant on high-reach accounts (${anti.high_reach_eng_share}% of engagement vs ${pro.high_reach_eng_share}% for ${pL}).`
                        : anti.high_reach_eng_share < pro.high_reach_eng_share
                        ? `${pL} is more reliant on high-reach accounts (${pro.high_reach_eng_share}% of engagement vs ${anti.high_reach_eng_share}% for ${aL}).`
                        : `Both sides rely equally on high-reach accounts (${anti.high_reach_eng_share}%).`}
                      {" "}
                      {(anti.high_reach_avg_eng > anti.organic_avg_eng * 5 || pro.high_reach_avg_eng > pro.organic_avg_eng * 5)
                        ? "High-reach posts dramatically outperform organic ones."
                        : "The engagement gap between high-reach and organic accounts is moderate."}
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Top Voices & Sources */}
            {analytics && <AnalyticsView data={analytics} />}

            {/* In Their Own Words — top tweets per frame with dropdown */}
            {narrativeDepth && narrativeDepth.example_tweets.length > 0 && (() => {
              const aL = narrativeDepth.anti_label;
              const pL = narrativeDepth.pro_label;
              const fmt = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
              const frames = narrativeDepth.example_tweets;
              const filtered = selectedFrame === "all" ? frames.slice(0, 3) : frames.filter((f) => f.frame === selectedFrame);

              return (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-5">
                    <div>
                      <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-medium">In Their Own Words</div>
                      <h3 className="text-sm font-semibold text-gray-300 mb-0.5">
                        Top tweets by narrative frame
                      </h3>
                      <p className="text-[10px] text-gray-600">
                        The highest-engagement tweet from each side — click to view on Twitter
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <label className="text-[9px] text-gray-500 uppercase tracking-wider font-medium">Filter by frame</label>
                      <select
                        value={selectedFrame}
                        onChange={(e) => setSelectedFrame(e.target.value)}
                        className="bg-blue-600 border border-blue-500 text-sm text-white font-medium rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      >
                        <option value="all">All Frames</option>
                        {frames.map((f) => (
                          <option key={f.frame} value={f.frame}>{f.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {(() => {
                    const isFiltered = selectedFrame !== "all";

                    const renderTweet = (tweet: typeof frames[0]["anti"], label: string, color: string, textColor: string) =>
                      tweet ? (
                        <a key={tweet.id_str} href={tweet.url} target="_blank" rel="noopener noreferrer"
                          className={`block border ${color} rounded-lg p-3 bg-gray-800/30 hover:bg-gray-800/50 transition-colors`}>
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`text-[10px] ${textColor} font-medium`}>{label}</span>
                            <span className="text-[10px] text-gray-500">@{tweet.screen_name}</span>
                            {tweet.author_followers >= 50000 && (
                              <span className="text-[8px] text-gray-600 bg-gray-700/50 px-1.5 py-0.5 rounded">{fmt(tweet.author_followers)} followers</span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-300 leading-relaxed mb-2 line-clamp-3">{decodeHtml(tweet.full_text)}</p>
                          <div className="flex items-center gap-3 text-[9px] text-gray-500">
                            <span>{fmt(tweet.likes)} likes</span>
                            <span>{fmt(tweet.retweets)} RTs</span>
                            {tweet.replies > 0 && <span>{fmt(tweet.replies)} replies</span>}
                            <span>{fmt(tweet.views)} views</span>
                            {tweet.emotion && <span className="text-gray-600 italic">{tweet.emotion}</span>}
                            {tweet.intensity_score !== null && (
                              <span className={`font-medium ${Math.abs(tweet.intensity_score) >= 8 ? "text-red-400/70" : Math.abs(tweet.intensity_score) >= 5 ? "text-orange-400/70" : "text-gray-500"}`}>
                                intensity {Math.abs(tweet.intensity_score)}/10
                              </span>
                            )}
                          </div>
                        </a>
                      ) : null;

                    return (
                      <div className="space-y-5">
                        {filtered.map((frame) => (
                          <div key={frame.frame}>
                            <div className="text-xs text-gray-300 font-medium mb-2">{frame.label}</div>
                            {isFiltered ? (
                              /* Filtered view: show multiple tweets, side by side columns */
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-3">
                                  <div className="text-[10px] text-blue-400 font-medium uppercase tracking-wider">{aL}</div>
                                  {frame.anti_tweets && frame.anti_tweets.length > 0
                                    ? frame.anti_tweets.map((t) => renderTweet(t, aL, "border-blue-500/30", "text-blue-400"))
                                    : <div className="border border-blue-500/30 rounded-lg p-3 bg-gray-800/10 text-center"><span className="text-[10px] text-gray-600">No {aL} tweets</span></div>
                                  }
                                </div>
                                <div className="space-y-3">
                                  <div className="text-[10px] text-red-400 font-medium uppercase tracking-wider">{pL}</div>
                                  {frame.pro_tweets && frame.pro_tweets.length > 0
                                    ? frame.pro_tweets.map((t) => renderTweet(t, pL, "border-red-500/30", "text-red-400"))
                                    : <div className="border border-red-500/30 rounded-lg p-3 bg-gray-800/10 text-center"><span className="text-[10px] text-gray-600">No {pL} tweets</span></div>
                                  }
                                </div>
                              </div>
                            ) : (
                              /* All frames view: show top 1 per side, side by side */
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {renderTweet(frame.anti, aL, "border-blue-500/30", "text-blue-400") || (
                                  <div className="border border-blue-500/30 rounded-lg p-3 bg-gray-800/10 flex items-center justify-center">
                                    <span className="text-[10px] text-gray-600">No {aL} tweets for this frame</span>
                                  </div>
                                )}
                                {renderTweet(frame.pro, pL, "border-red-500/30", "text-red-400") || (
                                  <div className="border border-red-500/30 rounded-lg p-3 bg-gray-800/10 flex items-center justify-center">
                                    <span className="text-[10px] text-gray-600">No {pL} tweets for this frame</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
          </>
        )}

        {/* ============ TAB: Flashpoints ============ */}
        {(activeTab === "dunks" || activeTab === "report") && (() => {
          if (!dunksData || dunksData.dunks.length === 0) {
            return activeTab === "dunks" ? (
              <div className="text-center py-12 text-gray-500 text-sm">No dunks detected in this dataset.</div>
            ) : null;
          }

          const fmt = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
          const dunks = dunksData.dunks;

          // Split by which side is getting dunked
          const antiDunked = dunks.filter(d => d.side === dunksData.anti_label);
          const proDunked = dunks.filter(d => d.side === dunksData.pro_label);

          const renderDunk = (dunk: typeof dunks[0], i: number) => {
            const isAntiSide = dunk.side === dunksData.anti_label;
            const sideColor = isAntiSide ? "border-blue-500/30" : "border-red-500/30";
            const sideText = isAntiSide ? "text-blue-400" : "text-red-400";
            const dunkerText = isAntiSide ? "text-red-400" : "text-blue-400";

            return (
              <div key={dunk.tweet.id_str} className={`border ${sideColor} rounded-xl p-4 bg-gray-800/20`}>
                {/* Dunk header */}
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[10px] ${sideText} font-medium uppercase tracking-wider`}>{dunk.side}</span>
                  <span className="text-[10px] text-gray-600">&rarr; dunked by</span>
                  <span className={`text-[10px] ${dunkerText} font-medium uppercase tracking-wider`}>{dunk.dunked_by}</span>
                  <span className="ml-auto text-[9px] bg-gray-700/50 text-gray-400 px-2 py-0.5 rounded">{dunk.dunk_type}</span>
                </div>

                {/* Original tweet */}
                <a href={dunk.tweet.url} target="_blank" rel="noopener noreferrer" className="block hover:bg-gray-800/30 rounded-lg p-3 -mx-1 transition-colors">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs text-gray-200 font-medium">@{dunk.tweet.screen_name}</span>
                    {dunk.tweet.author_followers >= 10000 && (
                      <span className="text-[9px] text-gray-600">{fmt(dunk.tweet.author_followers)} followers</span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-300 leading-relaxed mb-2">{decodeHtml(dunk.tweet.full_text)}</p>
                  <div className="flex items-center gap-3 text-[9px] text-gray-500">
                    <span>{fmt(dunk.tweet.likes)} likes</span>
                    <span>{fmt(dunk.tweet.retweets)} RTs</span>
                    <span>{fmt(dunk.tweet.quotes)} quotes</span>
                    <span className={dunk.reply_ratio >= 0.5 ? "text-yellow-400 font-medium" : ""}>{fmt(dunk.tweet.replies)} replies</span>
                    <span>{fmt(dunk.tweet.views)} views</span>
                  </div>
                </a>

                {/* Dunk signals */}
                <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-700/30 text-[9px]">
                  {dunk.reply_ratio >= 0.3 && (
                    <span className="text-yellow-400">Ratio: {dunk.reply_ratio.toFixed(1)} replies/like</span>
                  )}
                  {dunk.opposite_engagers > 0 && (
                    <span className={dunkerText}>{dunk.opposite_engagers} {dunk.dunked_by} account{dunk.opposite_engagers > 1 ? "s" : ""} engaged</span>
                  )}
                  {dunk.quote_ratio >= 0.3 && (
                    <span className="text-purple-400">Quote ratio: {dunk.quote_ratio.toFixed(1)}</span>
                  )}
                  <span className="text-gray-600 ml-auto">dunk score: {dunk.dunk_score}</span>
                </div>

                {/* Dunker examples */}
                {dunk.dunker_examples.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-gray-700/30">
                    <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-2">Responses from {dunk.dunked_by}</div>
                    <div className="space-y-2">
                      {dunk.dunker_examples.map((ex, j) => (
                        <a key={j} href={ex.url} target="_blank" rel="noopener noreferrer"
                          className="block text-[10px] text-gray-400 hover:text-gray-300 transition-colors pl-3 border-l-2 border-gray-700">
                          <p className="leading-relaxed">{decodeHtml(ex.full_text)}</p>
                          <span className="text-gray-600">@{ex.screen_name} &middot; {fmt(ex.engagement)} engagements &middot; {ex.is_quote ? "quote tweet" : "reply"}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          };

          return (
            <>
              {activeTab === "report" && <div className="border-t border-gray-700 pt-6 mt-6"><div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-4">Flashpoints</div></div>}

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-medium">Cross-Side Conflict</div>
                <h3 className="text-sm font-semibold text-gray-300 mb-0.5">
                  Tweets that triggered the other side
                </h3>
                <p className="text-[10px] text-gray-600 mb-5">
                  Posts that got picked up by the opposing side through quote-tweets, replies, or disproportionately high reply ratios (&quot;ratio&apos;d&quot;)
                </p>

                <div className="space-y-4">
                  {dunks.slice(0, 10).map((dunk, i) => renderDunk(dunk, i))}
                </div>

                {dunks.length > 0 && (
                  <p className="text-[10px] text-gray-500 mt-5">
                    {antiDunked.length} {dunksData.anti_label} tweets dunked by {dunksData.pro_label},{" "}
                    {proDunked.length} {dunksData.pro_label} tweets dunked by {dunksData.anti_label}.
                    Analyzed {dunksData.total_analyzed} tweets total.
                  </p>
                )}
              </div>
            </>
          );
        })()}

        {/* ============ TAB: Echo Chamber ============ */}
        {activeTab === "report" && <div className="border-t border-gray-700 pt-6 mt-6"><div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-4">Echo Chamber</div></div>}

        {(activeTab === "echo" || activeTab === "report") && (
          <>
            {/* Topic Overlap — full detail */}
            {narrative && exposureOverlap && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-medium">Topic Overlap</div>
                <h3 className="text-sm font-semibold text-gray-300 mb-0.5">
                  Are They Seeing the Same Events?
                </h3>
                <p className="text-[10px] sm:text-xs text-gray-600 mb-4">
                  Which news and events appear on both sides, and which are unique to one feed
                </p>
                <NarrativeFrames data={narrative} exposureOverlap={exposureOverlap} hideFraming={true} />
              </div>
            )}

            {/* Same Story, Different Lens */}
            {pairedStories && pairedStories.stories.length > 0 && (
              <PairedStories data={pairedStories} />
            )}

            {/* Blind Spots — merged: information gaps + frame gaps */}
            {analytics && (
              <BlindSpots
                analytics={analytics}
                narrativeGaps={summaries.narrative_gaps || null}
                frameGaps={narrativeStrategy?.gaps}
                frameGapLabels={narrativeStrategy ? { anti: narrativeStrategy.anti_label, pro: narrativeStrategy.pro_label } : undefined}
              />
            )}

            {/* Top Sources & Media */}
            {analytics && <TopSources data={analytics} />}

            {/* Common Ground — inline overlap */}
            {analytics?.overlap && (() => {
              const { shared_sources, shared_narratives } = analytics.overlap;
              const hasShared = (shared_sources?.length > 0) || (shared_narratives?.filter(n => n.anti_count > 0 && n.pro_count > 0).length > 0);
              if (!hasShared) return null;
              return (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-medium">Common Ground</div>
                  <h3 className="text-sm font-semibold text-gray-300 mb-0.5">Where both sides overlap</h3>
                  <p className="text-[10px] text-gray-600 mb-4">Sources and topics that appear on both sides of the conversation</p>
                  {shared_narratives?.filter(n => n.anti_count > 0 && n.pro_count > 0).length > 0 && (
                    <div className="mb-3">
                      <div className="text-[10px] text-gray-500 font-medium mb-2">Shared Topics</div>
                      <div className="flex flex-wrap gap-1.5">
                        {shared_narratives.filter(n => n.anti_count > 0 && n.pro_count > 0).slice(0, 8).map(n => (
                          <span key={n.frame} className="text-[11px] bg-gray-700/60 text-gray-300 px-2 py-1 rounded">{n.label}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {shared_sources?.length > 0 && (
                    <div>
                      <div className="text-[10px] text-gray-500 font-medium mb-2">Shared Sources</div>
                      <div className="flex flex-wrap gap-1.5">
                        {shared_sources.slice(0, 8).map(s => (
                          <span key={s.domain} className="text-[11px] bg-gray-700/60 text-gray-300 px-2 py-1 rounded">{s.domain}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

          </>
        )}

        {/* ============ TAB 4: Strategy ============ */}
        {activeTab === "report" && <div className="border-t border-gray-700 pt-6 mt-6"><div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-4">Insights & Action</div></div>}

        {(activeTab === "strategy" || activeTab === "report") && (
          <>
            {/* What's Driving the Difference */}
            {gapAnalysis && <GapAnalysis data={gapAnalysis} />}

            {/* Recommendations */}
            {recommendations && <Recommendations data={recommendations} />}

            {/* Bridge Building — actionable, referencing shared data */}
            {analytics?.overlap && (() => {
              const sharedTopics = analytics.overlap.shared_narratives?.filter((n) => n.anti_count > 0 && n.pro_count > 0).slice(0, 4) || [];
              const sharedSources = analytics.overlap.shared_sources?.slice(0, 4) || [];
              const topSharedTopic = sharedTopics[0];
              const topSharedSource = sharedSources[0];

              return (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-medium">Bridge Building</div>
                  <h3 className="text-sm font-semibold text-gray-300 mb-0.5">
                    How to reach across the divide
                  </h3>
                  <p className="text-[10px] text-gray-600 mb-5">
                    Actionable strategies based on where both sides already overlap
                  </p>

                  <div className="space-y-4">
                    {topSharedTopic && (
                      <div className="border border-green-500/20 rounded-lg p-4 bg-green-500/5">
                        <div className="text-[10px] text-green-400 uppercase tracking-wider font-medium mb-1">Lead with shared ground</div>
                        <p className="text-xs text-gray-300 leading-relaxed">
                          Both sides engage with <span className="font-semibold text-gray-100">{topSharedTopic.label}</span> framing.
                          Open with this topic to establish common ground before introducing your perspective.
                        </p>
                      </div>
                    )}
                    {topSharedSource && (
                      <div className="border border-green-500/20 rounded-lg p-4 bg-green-500/5">
                        <div className="text-[10px] text-green-400 uppercase tracking-wider font-medium mb-1">Cite trusted sources</div>
                        <p className="text-xs text-gray-300 leading-relaxed">
                          <span className="font-semibold text-gray-100">{topSharedSource.domain}</span> is cited by both sides.
                          Using sources both audiences already trust increases credibility across the divide.
                        </p>
                      </div>
                    )}
                    {sharedTopics.length > 1 && (
                      <div className="border border-gray-700/50 rounded-lg p-4 bg-gray-800/20">
                        <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-2">Other shared entry points</div>
                        <div className="flex flex-wrap gap-1.5">
                          {sharedTopics.slice(1).map((n) => (
                            <span key={n.frame} className="text-[11px] bg-gray-700/60 text-gray-300 px-2 py-1 rounded">{n.label}</span>
                          ))}
                          {sharedSources.slice(1).map((s) => (
                            <span key={s.domain} className="text-[11px] bg-gray-700/60 text-gray-300 px-2 py-1 rounded">{s.domain}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {/* ============ TAB: How It Works ============ */}
        {activeTab === "help" && (
          <div className="space-y-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 sm:p-6">
              <h2 className="text-lg font-bold text-gray-200 mb-1">How the Feed Algorithm Works</h2>
              <p className="text-xs text-gray-500 mb-6">
                Every tweet in your feed is scored across multiple dimensions. The final score determines ranking.
              </p>

              <div className="space-y-5">
                {/* Scoring overview */}
                <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-700/50">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-2">Formula</div>
                  <p className="text-xs text-gray-300 font-mono leading-relaxed">
                    final_score = relevance &times; bias_alignment &times; source_authority &times; format_boost &times; engagement &times; recency &times; outrage &times; diversity
                  </p>
                </div>

                {/* Signal cards */}
                {([
                  {
                    tag: "Bias Alignment",
                    title: "Does this match what you want to see?",
                    range: "0.03x - 4.0x",
                    desc: "Based on the bias slider position. Same-side content is boosted exponentially up to 4x at maximum bias. Opposite-side content is suppressed down to 0.03x. At neutral (0), the algorithm compensates for volume imbalances so you see roughly equal representation from both sides.",
                    detail: "Includes \"dunk\" detection: if same-side accounts are quote-tweeting opposite-side content (mocking it), that content gets a 1.2-1.4x boost. The exponential curve means moderate bias positions (3-5) already strongly favor your side, matching how real algorithmic feeds work."
                  },
                  {
                    tag: "Source Authority",
                    title: "Who is this person?",
                    range: "0.3x - 2.5x",
                    desc: "Combines follower count (log scale), follower/following ratio, Twitter list count, account age, and verification status. Activist accounts get a 1.4x boost over news sources. Bot-like accounts (100+ posts/day) are penalized to 0.3x.",
                    detail: "Account type is detected from bio keywords. Accounts posting from native Twitter clients (iOS, Android, Web) are boosted over API-posted content (0.75x for non-native sources)."
                  },
                  {
                    tag: "Format Boost",
                    title: "What kind of content is this?",
                    range: "0.5x - 2.6x",
                    desc: "Mirrors Twitter's actual content hierarchy: native video (2.0x) > photos (1.4x) > text-only (1.0x) > external links (0.9x). Quote tweets with commentary get 1.3x. Thread starters get 1.15x. Deep replies are penalized to 0.6x.",
                    detail: "This is one of the strongest signals. A video tweet from an activist account will consistently outrank a text-only tweet from a news outlet, even with similar engagement."
                  },
                  {
                    tag: "Engagement Signal",
                    title: "Is this getting traction?",
                    range: "0.1x - 3.0x",
                    desc: "Not just raw numbers — measures engagement rate (engagements / followers), viral velocity (views per hour), bookmark ratio (substantive content signal), and in-network amplification.",
                    detail: "In-network amplification: if accounts in your bias cluster have quote-tweeted or replied to this tweet, it scores higher. A low-follower account with high relative engagement (\"punches above its weight\") gets boosted — these are the tweets that go viral in niche political bubbles."
                  },
                  {
                    tag: "Recency Decay",
                    title: "How old is this?",
                    range: "0.1x - 1.0x",
                    desc: "Exponential decay with a 72-hour half-life. A tweet from 3 days ago scores ~0.5x. A tweet from a week ago scores ~0.1x. Breaking news within the last few hours stays near 1.0x.",
                    detail: null
                  },
                  {
                    tag: "Emotional Valence",
                    title: "Does this trigger a reaction?",
                    range: "0.4x - 1.15x",
                    desc: "Tweets classified as outrage, fear, or moral condemnation get a modest boost (up to 1.15x) because Twitter's algorithm rewards engagement bait. However, extreme-intensity content with low engagement is penalized to 0.4x as a toxicity proxy.",
                    detail: null
                  },
                  {
                    tag: "Diversity Penalty",
                    title: "Have we seen this before?",
                    range: "0.1x - 1.0x",
                    desc: "Applied during ranking to prevent repetition. Same author appearing again: 0.5x for their 2nd tweet, 0.33x for 3rd. Same domain (news source) repeating: same decay. Same narrative frame dominating: gradual 10% reduction per repeat.",
                    detail: "This is the most important quality-of-life signal. Without it, viral threads from a single account would dominate the entire feed."
                  },
                ] as const).map((signal) => (
                  <div key={signal.tag} className="border border-gray-800 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">{signal.tag}</div>
                      <span className="text-[10px] text-gray-600 font-mono">{signal.range}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-gray-300 mb-1">{signal.title}</h3>
                    <p className="text-xs text-gray-400 leading-relaxed">{signal.desc}</p>
                    {signal.detail && (
                      <p className="text-[11px] text-gray-500 leading-relaxed mt-2 pl-3 border-l-2 border-gray-700">{signal.detail}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Data sources */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 sm:p-6">
              <h2 className="text-base font-bold text-gray-200 mb-4">Data Sources & Methodology</h2>
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-semibold text-gray-300 mb-1">Tweet Collection</div>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Tweets are collected via the SocialData API using topic-specific search queries. Each pipeline run fetches the top ~500 tweets from the past 48 hours, sorted by views. Duplicate tweets are deduplicated on import.
                  </p>
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-300 mb-1">Classification</div>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Each tweet is classified using Gemini Flash for political stance (pro/anti/neutral), with low-confidence classifications escalated to a 3-model ensemble (Gemini + Claude Haiku + GPT-4o Mini) for majority vote. Intensity scoring (-10 to +10) measures rhetorical aggression. Narrative framing and emotional tone are classified separately.
                  </p>
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-300 mb-1">Limitations</div>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    The feed cannot access who retweeted or liked a tweet (Twitter API limitation), so in-network engagement is approximated from quote-tweets and replies within the dataset. Geographic targeting is not available. Toxicity scoring uses intensity + emotion as a proxy, not a dedicated moderation API.
                  </p>
                </div>
              </div>
            </div>

            {/* Tab guide */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 sm:p-6">
              <h2 className="text-base font-bold text-gray-200 mb-4">Dashboard Tabs</h2>
              <div className="space-y-3">
                {([
                  { name: "Feed", desc: "A simulated Twitter feed ranked by the algorithm above. Use the bias slider to see how different political leanings change what content surfaces. Toggle between \"For You\" (algorithm-ranked) and \"Latest\" (chronological)." },
                  { name: "Executive Pulse", desc: "High-level KPIs: who's leading the conversation, engagement comparison, narrative divide score, and what each side's audience actually sees." },
                  { name: "Narrative Deep-Dive", desc: "How each side frames the topic (radar charts), emotional tone, trending phrases, hashtags, content format breakdown, engagement by frame, and rhetoric intensity." },
                  { name: "Key Voices", desc: "Who is driving the conversation (high-reach vs organic accounts), top voices by engagement, and the highest-engagement tweets per narrative frame." },
                  { name: "Flashpoints", desc: "Tweets that triggered the other side — identified through high reply ratios (\"ratio'd\"), quote-tweet dunks from opposing accounts, and cross-side engagement patterns. Shows the original tweet, why it scored as a dunk, and example responses." },
                  { name: "Echo Chamber", desc: "How much overlap exists between the two sides: shared stories, blind spots (what each side misses), source analysis, and common ground." },
                  { name: "Insights & Action", desc: "What's driving the divergence between sides, AI-generated recommendations, and actionable bridge-building strategies based on shared topics and sources." },
                  { name: "Full Report", desc: "Renders all tabs in a single scrollable view for export or presentation. Use the \"Export PDF\" button to save." },
                ]).map((tab) => (
                  <div key={tab.name} className="flex gap-3">
                    <span className="text-xs text-gray-300 font-semibold w-28 shrink-0">{tab.name}</span>
                    <p className="text-xs text-gray-500 leading-relaxed">{tab.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
