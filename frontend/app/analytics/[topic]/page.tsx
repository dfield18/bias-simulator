"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { cachedFetch, invalidateCache } from "@/lib/cache";
import { getSideColors } from "@/lib/colors";

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
  fetchMe,
  fetchSmartFeed,
  fetchDunks,
  fetchMyTopics,
  SmartFeedItem,
  GeographyData,
  fetchGeography,
} from "@/lib/api";
import SummaryTabs from "@/components/SummaryTabs";
import NarrativeFrames from "@/components/NarrativeFrames";
import GapAnalysis from "@/components/GapAnalysis";
import PairedStories from "@/components/PairedStories";
import Recommendations from "@/components/Recommendations";
import SentimentMap from "@/components/SentimentMap";
import { WhatThisMeansInline } from "@/components/WhatThisMeans";
import TweetCard from "@/components/TweetCard";
import BreakdownChart from "@/components/BreakdownChart";
import SentimentDistribution from "@/components/SentimentDistribution";
import AnalyticsView, { TrendingPhrases, TopSources } from "@/components/AnalyticsView";
import BlindSpots from "@/components/BlindSpots";
import NarrativeMix from "@/components/NarrativeMix";

const tabs = [
  { id: "pulse", label: "Overview", subtitle: "The big picture" },
  { id: "feed", label: "Simulated Feed", subtitle: "The conversation" },
  { id: "narrative", label: "Narratives", subtitle: "Arguments, overlap, and blind spots" },
  { id: "voices", label: "Key Voices", subtitle: "Who's saying what" },
  { id: "geography", label: "Geography", subtitle: "Where posts come from" },
  { id: "strategy", label: "Insights & Action", subtitle: "Key findings and next steps" },
  { id: "report", label: "Full Report", subtitle: "All tabs in one view" },
];

export default function AnalyticsPage() {
  const params = useParams();
  const router = useRouter();
  const topicSlug = params.topic as string;

  const [topic, setTopic] = useState<TopicData | null>(null);
  const [allTopics, setAllTopics] = useState<TopicData[]>([]);
  const [userTier, setUserTier] = useState<string>("free");
  const [userId, setUserId] = useState<string | null>(null);
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
  const [feedAccountFilter, setFeedAccountFilter] = useState<string>("all");
  const [showStickySlider, setShowStickySlider] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(88);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedVisibleCount, setFeedVisibleCount] = useState(50);
  const [activeTab, setActiveTab] = useState("pulse");
  const [selectedFrame, setSelectedFrame] = useState<string>("all");
  const [flashpointsExpanded, setFlashpointsExpanded] = useState(false);
  const [geography, setGeography] = useState<GeographyData | null>(null);

  // Essential data — loaded once on mount
  useEffect(() => {
    const s = topicSlug;
    fetchMe().then((u) => { setUserTier(u.tier); setUserId(u.id); }).catch(() => {});
    // Safety timeout: if topic doesn't load in 10s, stop showing spinner
    const timeout = setTimeout(() => setFeedLoading(false), 10000);
    cachedFetch(`topics`, () => fetchTopics(), 60 * 1000).then((topics) => {
      setAllTopics(topics);
      const t = topics.find((t) => t.slug === s);
      if (t) setTopic(t);
      else { clearTimeout(timeout); setFeedLoading(false); }
    }).catch(() => { clearTimeout(timeout); setFeedLoading(false); });
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
      // Prefetch dashboard data so navigating back is instant
      cachedFetch("myTopics", () => fetchMyTopics(), 2 * 60 * 1000).catch(() => {});
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
      cachedFetch(`${s}:exposureOverlap`, () => fetchExposureOverlap(s)).then((d) => d && setExposureOverlap(d)).catch(console.error);
      cachedFetch(`${s}:pairedStories`, () => fetchPairedStories(s)).then((d) => d && setPairedStories(d)).catch(console.error);
    }
    if (activeTab === "voices" || activeTab === "report") {
      cachedFetch(`${s}:narrativeDepth`, () => fetchNarrativeDepth(s)).then((d) => d && setNarrativeDepth(d)).catch(console.error);
      cachedFetch(`${s}:analytics`, () => fetchAnalytics(s)).then((d) => d && setAnalytics(d)).catch(console.error);
      cachedFetch(`${s}:dunks`, () => fetchDunks(s)).then((d) => d && setDunksData(d)).catch(console.error);
    }
    if (activeTab === "geography" || activeTab === "report") {
      cachedFetch(`${s}:geography`, () => fetchGeography(s)).then((d) => d && setGeography(d)).catch(console.error);
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

  // Feed items: smart-ranked or chronological, then filtered by account type
  const feedScored = useMemo(() => {
    let items = smartFeedItems;
    if (feedSortMode === "latest") {
      items = [...items].sort((a, b) => {
        const da = a.tweet?.created_at || "";
        const db = b.tweet?.created_at || "";
        return db.localeCompare(da);
      });
    }
    if (feedAccountFilter !== "all") {
      items = items.filter((item) => {
        const acctType = (item as any).score_breakdown?.account_type || "general";
        return acctType === feedAccountFilter;
      });
    }
    return items;
  }, [smartFeedItems, feedSortMode, feedAccountFilter]);

  const feedItems = feedScored.slice(0, feedVisibleCount);

  // Reset feed visible count on sort/bias/filter change
  useEffect(() => { setFeedVisibleCount(50); }, [bias, feedSortMode, feedAccountFilter]);

  // Scroll to top when sort or filter changes (not bias — that uses onPointerUp)
  useEffect(() => {
    if (activeTab === "feed") window.scrollTo({ top: 0, behavior: "smooth" });
  }, [feedSortMode, feedAccountFilter]);

  // Track header height for sticky slider positioning
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => setHeaderHeight(el.getBoundingClientRect().height);
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Show sticky slider when user scrolls past 300px on feed tab
  useEffect(() => {
    if (activeTab !== "feed") {
      setShowStickySlider(false);
      return;
    }
    const handleScroll = () => {
      setShowStickySlider(window.scrollY > 300);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [activeTab]);

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

  // Dynamic colors based on topic type
  const sc = topic ? getSideColors((topic.color_scheme || "political") as "political" | "neutral") : getSideColors("political");

  if (!topic) {
    if (!feedLoading) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen">
          <div className="text-5xl font-bold text-gray-700 mb-4">404</div>
          <p className="text-sm text-gray-400 mb-6">Topic not found</p>
          <a href="/dashboard" className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors">
            Back to Dashboard
          </a>
        </div>
      );
    }
    // Skeleton UI while loading
    return (
      <div className="min-h-screen">
        {/* Skeleton header */}
        <div className="border-b border-gray-800 bg-gray-900/50 sticky top-0 z-20">
          <div className="max-w-5xl mx-auto px-4 py-3">
            <div className="flex items-center gap-4">
              <div className="h-4 w-16 bg-gray-800 rounded animate-pulse" />
              <div className="h-5 w-40 bg-gray-800 rounded animate-pulse" />
            </div>
          </div>
          <div className="max-w-5xl mx-auto px-4 py-2 flex gap-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-8 w-24 bg-gray-800/50 rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
        {/* Skeleton content */}
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-3 w-24 bg-gray-800 rounded animate-pulse" />
                    <div className="h-3 w-16 bg-gray-800 rounded animate-pulse" />
                    <div className="h-4 w-20 bg-gray-800 rounded animate-pulse ml-auto" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 w-full bg-gray-800/60 rounded animate-pulse" />
                    <div className="h-3 w-4/5 bg-gray-800/60 rounded animate-pulse" />
                    <div className="h-3 w-3/5 bg-gray-800/40 rounded animate-pulse" />
                  </div>
                  <div className="flex gap-4 mt-4">
                    <div className="h-3 w-12 bg-gray-800/40 rounded animate-pulse" />
                    <div className="h-3 w-12 bg-gray-800/40 rounded animate-pulse" />
                    <div className="h-3 w-12 bg-gray-800/40 rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 h-48 animate-pulse" />
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 h-32 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header ref={headerRef} className="border-b border-gray-800 bg-gray-950 fixed top-0 left-0 right-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 sm:gap-5 min-w-0">
              <Link
                href="/dashboard"
                className="text-gray-500 hover:text-gray-300 text-sm shrink-0"
              >
                &larr;<span className="hidden sm:inline"> Topics</span>
              </Link>
              <div className="flex items-baseline gap-2 min-w-0">
                <select
                  value={topicSlug}
                  onChange={(e) => router.push(`/analytics/${e.target.value}`)}
                  className="text-lg sm:text-xl font-bold bg-gray-800/50 border border-gray-700/50 text-gray-100 cursor-pointer hover:text-white hover:border-gray-600 focus:outline-none focus:border-gray-500 rounded-lg px-3 py-1 pr-8 truncate"
                  style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center", WebkitAppearance: "none", MozAppearance: "none" }}
                >
                  {allTopics
                    .filter((t) => t.slug === topicSlug || userTier !== "free" || t.featured || t.created_by === userId)
                    .map((t) => (
                    <option key={t.slug} value={t.slug} className="bg-gray-900 text-gray-100">
                      {t.name}
                    </option>
                  ))}
                  {allTopics.length === 0 && (
                    <option value={topicSlug}>{topic.name}</option>
                  )}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!userId && (
                <Link
                  href="/sign-up"
                  className="px-3 py-1.5 text-xs font-medium text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-md transition-colors hover:bg-blue-500/20"
                >
                  Sign up free
                </Link>
              )}
              {userId && userTier === "free" && !(topic && topic.created_by != null && userId === topic.created_by) && (
                <Link
                  href="/pricing"
                  className="px-3 py-1.5 text-xs font-medium text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-md transition-colors hover:bg-blue-500/20"
                >
                  Upgrade to Pro
                </Link>
              )}
              {(userTier === "admin" || (topic && topic.created_by != null && userId === topic.created_by)) && <button
                onClick={async () => {
                  if (isRunning === "done") {
                    window.location.reload();
                    return;
                  }
                  setIsRunning("running");
                  setPipelineProgress(null);
                  try {
                    await runTopicPipeline(topicSlug);
                    const poll = async () => {
                      for (let i = 0; i < 300; i++) {
                        await new Promise((r) => setTimeout(r, 5000));
                        try {
                          const prog = await fetchPipelineProgress(topicSlug);
                          if (prog) setPipelineProgress(prog);
                          if (prog && !prog.running) {
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
                            invalidateCache("topics");
                            // Re-fetch feed data automatically
                            try {
                              const [newFeed, newBreakdown, newRun] = await Promise.all([
                                fetchSmartFeed(topicSlug, bias, 720, 200),
                                fetchBreakdown(topicSlug, 720),
                                fetchLastRun(topicSlug),
                              ]);
                              setSmartFeedItems(newFeed);
                              setBreakdown(newBreakdown);
                              if (newRun) setLastRun(newRun);
                              // Also refresh all tweets for the chart
                              fetchAllTweets(topicSlug, 720).then(setAllTweets).catch(() => {});
                            } catch { /* page will show stale data, user can reload */ }
                            setIsRunning("done");
                            return;
                          }
                        } catch { /* keep polling */ }
                      }
                      invalidateCache(topicSlug);
                      invalidateCache("topics");
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
                  : isRunning === "done" ? "Data Updated" : "Refresh Data"}
              </button>}
              {/* Data freshness note */}
              {lastRun && lastRun.ran_at && !isRunning && (
                <span className="text-[10px] text-gray-600 hidden sm:inline" title="To see more up-to-date data, click Refresh Data. It takes a few minutes to collect and analyze new posts.">
                  Data from {new Date(lastRun.ran_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              )}
              {(userTier === "admin" || (topic && topic.created_by != null && userId === topic.created_by)) && <Link
                href={`/topics/${topicSlug}`}
                className="px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 rounded-md transition-colors hidden sm:block"
              >
                Settings
              </Link>}
              <button
                onClick={() => { setActiveTab("help"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  activeTab === "help"
                    ? "bg-gray-700 text-gray-100"
                    : "text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700"
                }`}
              >
                Help
              </button>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="border-t border-gray-800/50">
          <div className="max-w-5xl mx-auto px-4">
            <div className="flex items-center gap-2 sm:gap-3 py-2 overflow-x-auto scrollbar-thin">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveTab(t.id);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className={`px-3 sm:px-4 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${
                    activeTab === t.id
                      ? "bg-gray-700 text-gray-100"
                      : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>
      {/* Spacer for fixed header */}
      <div style={{ height: `${headerHeight}px` }} />

      <div className="max-w-5xl mx-auto px-4 pt-8 pb-6 space-y-6">

        {/* Pipeline progress banner */}
        {isRunning === "running" && pipelineProgress && (() => {
          const tips = [
            "Each tweet is analyzed for political stance, intensity, and narrative framing",
            "Low-confidence classifications are double-checked by a multi-model ensemble",
            "The bias slider lets you simulate what different echo chambers see",
            "DividedView detects which arguments each side uses — and which they ignore",
            "Narrative frames reveal how the same event gets spun differently by each side",
          ];
          const tipIndex = Math.floor(Date.now() / 5000) % tips.length;
          return (
            <div className="bg-gray-900 border border-blue-500/20 rounded-xl p-5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="animate-spin h-5 w-5 border-2 border-blue-400 border-t-transparent rounded-full shrink-0" />
                  <span className="text-sm font-medium text-gray-300">{pipelineProgress.label}</span>
                </div>
                <span className="text-xs text-gray-500">Step {pipelineProgress.step} of {pipelineProgress.total_steps} &middot; {pipelineProgress.pct}%</span>
              </div>
              <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${pipelineProgress.pct}%` }}
                />
              </div>
              {pipelineProgress.detail && (
                <p className="text-xs text-gray-500 leading-relaxed mb-2">{pipelineProgress.detail}</p>
              )}
              <p className="text-[10px] text-gray-600 italic">{tips[tipIndex]}</p>
            </div>
          );
        })()}
        {isRunning === "running" && !pipelineProgress && (
          <div className="bg-gray-900 border border-blue-500/20 rounded-xl p-5 flex items-center gap-3">
            <div className="animate-spin h-5 w-5 border-2 border-blue-400 border-t-transparent rounded-full shrink-0" />
            <span className="text-sm text-gray-400">Starting pipeline...</span>
          </div>
        )}

        {/* Sticky bias slider — feed tab only, appears when chart scrolls away */}
        {activeTab === "feed" && topic && showStickySlider && (
          <>
            <div className="fixed left-0 right-0 bg-gray-950 border-b border-gray-800/30" style={{ top: `${headerHeight + 12}px`, zIndex: 15 }}>
              <div className="max-w-5xl mx-auto px-4 pt-6 pb-3">
                <div className="flex justify-between items-center mb-1.5">
                  <span className={`text-sm font-semibold ${getSideColors((topic.color_scheme || "political") as "political" | "neutral").anti.text}`}>{topic.anti_label}</span>
                  <span className="text-xs text-gray-500">
                    {getBiasDescription(bias)} <span className="text-gray-600">({bias > 0 ? "+" : ""}{bias.toFixed(1)})</span>
                  </span>
                  <span className={`text-sm font-semibold ${getSideColors((topic.color_scheme || "political") as "political" | "neutral").pro.text}`}>{topic.pro_label}</span>
                </div>
                <input
                  type="range"
                  min={-10}
                  max={10}
                  step={0.1}
                  value={bias}
                  onChange={(e) => setBias(parseFloat(e.target.value))}
                  onPointerUp={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                  onTouchEnd={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, ${getSideColors((topic.color_scheme || "political") as "political" | "neutral").anti.fill}, rgb(107,114,128) 45%, rgb(107,114,128) 55%, ${getSideColors((topic.color_scheme || "political") as "political" | "neutral").pro.fill})`,
                  }}
                />
              </div>
            </div>
          </>
        )}
        {/* Spacer to prevent content from hiding behind the fixed slider */}
        {activeTab === "feed" && topic && showStickySlider && (
          <div className="h-20" />
        )}

        {/* ============ TAB 1: Overview ============ */}
        {/* ============ TAB: Feed ============ */}
        {activeTab === "feed" && (
          <>
            {/* Sentiment distribution chart */}
            {allTweets.length > 0 && (
              <SentimentDistribution
                items={allTweets}
                antiLabel={topic.anti_label}
                proLabel={topic.pro_label}
                bias={bias}
                onChange={setBias}
                colorScheme={(topic.color_scheme || "political") as "political" | "neutral"}
              />
            )}
            <p className="text-[11px] text-gray-500 leading-relaxed">
              This simulated feed is built from real posts pulled from X and classified by AI. Drag the slider to simulate how a feed algorithm would prioritize content based on political leaning. Classifications are estimates and may occasionally be inaccurate.
            </p>

            {/* Feed header with sort toggle + account filter */}
            <div className="flex items-center justify-end flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <select
                  value={feedAccountFilter}
                  onChange={(e) => setFeedAccountFilter(e.target.value)}
                  className="px-2.5 py-1 bg-gray-800 border border-gray-700 rounded-md text-xs text-gray-300"
                >
                  <option value="all">All accounts</option>
                  {topic.topic_type === "company" ? (
                    <>
                      <option value="consumer">Consumers &amp; Customers</option>
                      <option value="news_media">News &amp; Media</option>
                      <option value="industry_analyst">Industry Analysts</option>
                      <option value="influencer_creator">Influencers &amp; Creators</option>
                      <option value="employee_insider">Employees &amp; Insiders</option>
                      <option value="investor_finance">Investors &amp; Finance</option>
                      <option value="general">General</option>
                    </>
                  ) : (
                    <>
                      <option value="politician">Politicians</option>
                      <option value="mainstream_news">Mainstream News</option>
                      <option value="independent_news">Independent Media</option>
                      <option value="partisan_news">Partisan Media</option>
                      <option value="activist">Activists &amp; Orgs</option>
                      <option value="general">General</option>
                    </>
                  )}
                </select>
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
            </div>

            <p className="text-[10px] text-gray-600">Classifications are generated by AI and should be treated as estimates.</p>

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
                  <div className="relative">
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
                      <div className="animate-spin h-8 w-8 border-2 border-blue-400 border-t-transparent rounded-full mb-3" />
                      <p className="text-sm text-gray-400">Loading tweets...</p>
                    </div>
                    <div className="space-y-4 opacity-40">
                      {[...Array(4)].map((_, i) => (
                        <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="h-3.5 w-28 bg-gray-800 rounded" />
                            <div className="h-3 w-20 bg-gray-800/60 rounded" />
                            <div className="h-5 w-16 bg-gray-800 rounded ml-auto" />
                          </div>
                          <div className="space-y-2 mb-3">
                            <div className="h-3 w-full bg-gray-800/50 rounded" />
                            <div className="h-3 w-11/12 bg-gray-800/50 rounded" />
                            <div className="h-3 w-3/4 bg-gray-800/40 rounded" />
                          </div>
                          <div className="flex gap-5">
                            {[...Array(4)].map((_, j) => (
                              <div key={j} className="h-3 w-10 bg-gray-800/30 rounded" />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
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
                        colorScheme={(topic.color_scheme || "political") as "political" | "neutral"}
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
                    <BreakdownChart data={breakdown} proLabel={topic.pro_label} antiLabel={topic.anti_label} colorScheme={(topic.color_scheme || "political") as "political" | "neutral"} />
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
            {/* Data freshness info */}
            {lastRun && lastRun.ran_at && activeTab === "pulse" && (
              <div className="text-[10px] text-gray-600 mb-2">
                This data was last refreshed on {new Date(lastRun.ran_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} at {new Date(lastRun.ran_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.
                {(userTier === "admin" || (topic && topic.created_by != null && userId === topic.created_by)) && " To see more current data, click Refresh Data above — it takes a few minutes to collect and analyze new posts."}
              </div>
            )}

            {/* Loading skeleton for overview data */}
            {(!analytics || !narrative) && (
              <div className="space-y-3 mb-6 animate-pulse">
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-3 h-24">
                      <div className="h-2 w-20 bg-gray-800 rounded mb-3" />
                      <div className="h-4 w-32 bg-gray-800 rounded mb-2" />
                      <div className="h-2 w-24 bg-gray-800 rounded" />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4 h-40">
                      <div className="h-2 w-28 bg-gray-800 rounded mb-4" />
                      <div className="space-y-2">
                        <div className="h-2 w-full bg-gray-800 rounded" />
                        <div className="h-2 w-3/4 bg-gray-800 rounded" />
                        <div className="h-2 w-5/6 bg-gray-800 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

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

              // Additional computed values for cards — views stats for the tweet-count winner
              const antiViews = Math.round(anti.avg_views * anti.count);
              const proViews = Math.round(pro.avg_views * pro.count);
              const totalViews = antiViews + proViews;
              const volDominantIsAnti = anti.count > pro.count;
              const volDominantViews = volDominantIsAnti ? antiViews : proViews;
              const volMinorityViews = volDominantIsAnti ? proViews : antiViews;
              const viewsDominantPct2 = totalViews > 0 ? Math.round(volDominantViews / totalViews * 100) : 0;
              const viewsRatio = volMinorityViews > 0 ? Math.round(volDominantViews / volMinorityViews * 10) / 10 : 0;

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
                    <div className={`text-base sm:text-lg font-bold ${volDominant === topic.anti_label ? sc.anti.text : sc.pro.text} leading-tight`}>
                      {volDominant} leads the conversation
                    </div>
                    <div className="text-[10px] text-gray-400 mt-2">
                      {volDominantPct}% of tweets <span className="text-gray-500 mx-1 text-sm">&#x2022;</span> {viewsDominantPct2}% of views
                    </div>
                    <div className="text-[10px] text-gray-600 mt-0.5">
                      {volRatio <= 1.1 ? "similar tweet volume" : `${volRatio}× more tweets`} <span className="text-gray-500 mx-1 text-sm">&#x2022;</span> {viewsRatio >= 0.9 && viewsRatio <= 1.1 ? "similar views" : viewsRatio > 1.1 ? `${viewsRatio}× more views` : `${Math.round(1 / viewsRatio * 10) / 10}× fewer views`}
                    </div>
                  </div>

                  {/* Card 2: What Performs Best */}
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">What Performs Best</div>
                    <div className={`text-base sm:text-lg font-bold ${perfDominant === topic.anti_label ? sc.anti.text : sc.pro.text} leading-tight`}>
                      {perfRatio <= 1.1 ? `${perfDominant} and ${perfDominant === topic.anti_label ? topic.pro_label : topic.anti_label} have similar engagement` : `${perfDominant} gets ${perfRatio}× more engagement`}
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
                          <div className={`text-[10px] ${sc.anti.text} font-medium`}>{topic.anti_label}</div>
                          <div className="text-sm sm:text-base font-bold text-gray-100 leading-tight">{antiTop}</div>
                        </div>
                        <div>
                          <div className={`text-[10px] ${sc.pro.text} font-medium`}>{topic.pro_label}</div>
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
                    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
                    const extractTopStories = (text: string): string[] => {
                      const stories: string[] = [];
                      // Extract from bold sections (Key Themes, Current Events, etc.)
                      const sections = text.split("**");
                      for (let i = 0; i < sections.length; i++) {
                        const header = sections[i].toLowerCase().trim();
                        if ((header.includes("current events") || header.includes("key themes") || header.includes("general") || header.includes("tone")) && i + 1 < sections.length) {
                          const content = sections[i + 1].replace(/^\s*:?\s*/, "").trim();
                          const sentences = content.split(/\.(?:\s|$)/).filter(s => s.trim().length > 15);
                          for (const s of sentences) {
                            const clean = s.trim();
                            if (clean.length > 15 && stories.length < 5) {
                              stories.push(capitalize(clean.endsWith(".") ? clean : clean + "."));
                            }
                          }
                        }
                      }
                      // Fallback: if bold parsing didn't work, split entire text into sentences
                      if (stories.length < 3) {
                        const allSentences = text.replace(/\*\*[^*]+\*\*/g, "").split(/\.(?:\s|$)/).filter(s => s.trim().length > 20);
                        for (const s of allSentences) {
                          const clean = s.trim();
                          if (clean.length > 20 && !stories.includes(capitalize(clean + ".")) && stories.length < 5) {
                            stories.push(capitalize(clean.endsWith(".") ? clean : clean + "."));
                          }
                        }
                      }
                      return stories.slice(0, 5);
                    };

                    const antiStories = summaries.anti?.summary ? extractTopStories(summaries.anti.summary) : [];
                    const proStories = summaries.pro?.summary ? extractTopStories(summaries.pro.summary) : [];

                    if (antiStories.length === 0 && proStories.length === 0) return null;

                    return (
                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {antiStories.length > 0 && (
                          <div className={`border ${sc.anti.border} rounded-lg p-3 ${sc.anti.bgFaint}`}>
                            <div className={`text-[10px] ${sc.anti.text} uppercase tracking-wider font-medium mb-2`}>{topic.anti_label} is focused on</div>
                            <ul className="space-y-1.5">
                              {antiStories.map((s, i) => (
                                <li key={i} className={`text-[11px] text-gray-300 leading-relaxed pl-3 border-l-2 ${sc.anti.border}`}>{s}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {proStories.length > 0 && (
                          <div className={`border ${sc.pro.border} rounded-lg p-3 ${sc.pro.bgFaint}`}>
                            <div className={`text-[10px] ${sc.pro.text} uppercase tracking-wider font-medium mb-2`}>{topic.pro_label} is focused on</div>
                            <ul className="space-y-1.5">
                              {proStories.map((s, i) => (
                                <li key={i} className={`text-[11px] text-gray-300 leading-relaxed pl-3 border-l-2 ${sc.pro.border}`}>{s}</li>
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
            {narrative && <NarrativeMix data={narrative} colorScheme={(topic.color_scheme || "political") as "political" | "neutral"} />}

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
                    const colorClass = side === "anti" ? sc.anti.text : sc.pro.text;
                    const borderClass = side === "anti" ? sc.anti.border : sc.pro.border;
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
                    onClick={() => setActiveTab("narrative")}
                    className="text-[10px] text-gray-500 hover:text-gray-300 mt-3 transition-colors"
                  >
                    View full analysis in Narratives &rarr;
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
                        {alert.tweet_url && alert.screen_name ? (
                          <>
                            {alert.message.split(`@${alert.screen_name}`)[0]}
                            <a href={alert.tweet_url} target="_blank" rel="noopener noreferrer" className="underline hover:text-white transition-colors">@{alert.screen_name}</a>
                            {alert.message.split(`@${alert.screen_name}`).slice(1).join(`@${alert.screen_name}`)}
                          </>
                        ) : alert.message}
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
                    {renderFeedColumn(sideBySideFeed.anti, aL, sc.anti.text, sc.anti.border)}
                    {renderFeedColumn(sideBySideFeed.pro, pL, sc.pro.text, sc.pro.border)}
                  </div>
                </div>
              );
            })()}

          </>
        )}

        {/* ============ TAB 2: Arguments ============ */}
        {activeTab === "report" && <div className="border-t border-gray-700 pt-6 mt-6"><div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-4">Arguments</div></div>}

        {(activeTab === "narrative" || activeTab === "report") && (() => {
          const narrativeLoading = !narrative && Object.keys(summaries).length === 0;
          return (
            <>
              {narrativeLoading && (
                <div className="space-y-3 animate-pulse">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4 h-32">
                      <div className="h-2 w-24 bg-gray-800 rounded mb-4" />
                      <div className="space-y-2">
                        <div className="h-2 w-full bg-gray-800 rounded" />
                        <div className="h-2 w-4/5 bg-gray-800 rounded" />
                        <div className="h-2 w-3/4 bg-gray-800 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {/* 1. Summary — always open, no collapsible wrapper */}
              {Object.keys(summaries).length > 0 && (
                <SummaryTabs
                  summaries={summaries}
                  antiLabel={topic.anti_label}
                  proLabel={topic.pro_label}
                  colorScheme={(topic.color_scheme || "political") as "political" | "neutral"}
                />
              )}

              {/* 2. What Each Side Argues + Top Arguments (combined) */}
              {narrative && (
                <NarrativeFrames
                  data={narrative}
                  exposureOverlap={null}
                  playbook={narrativeStrategy?.playbook}
                  strategyLabels={narrativeStrategy ? { anti: narrativeStrategy.anti_label, pro: narrativeStrategy.pro_label } : null}
                  colorScheme={(topic.color_scheme || "political") as "political" | "neutral"}
                  onViewTweets={(frameKey) => {
                    setSelectedFrame(frameKey);
                    setActiveTab("voices");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                />
              )}

              {/* ── The Full Picture — 2x2 expandable card grid ── */}
              <div className="space-y-4">

                {/* Card 1: Same Story, Different Lens */}
                {pairedStories && pairedStories.stories.length > 0 && (
                  <details className="bg-gray-900 border border-gray-800 rounded-xl" open={activeTab === "report" || undefined}>
                    <summary className="p-4 sm:p-5 cursor-pointer select-none hover:bg-gray-800/30 transition-colors rounded-xl">
                      <div className="inline">
                        <span className="text-sm font-semibold text-gray-300">Same Story, Different Lens</span>
                        <span className="text-[10px] text-gray-500 ml-2">{pairedStories.stories.length} paired {pairedStories.stories.length === 1 ? "story" : "stories"} — same event, two framings</span>
                      </div>
                    </summary>
                    <div className="px-4 sm:px-5 pb-4 sm:pb-5 -mt-2">
                      <PairedStories data={pairedStories} colorScheme={(topic.color_scheme || "political") as "political" | "neutral"} />
                    </div>
                  </details>
                )}

                {/* Card 2: Blind Spots */}
                {analytics && (
                  <details className="bg-gray-900 border border-gray-800 rounded-xl" open={activeTab === "report" || undefined}>
                    <summary className="p-4 sm:p-5 cursor-pointer select-none hover:bg-gray-800/30 transition-colors rounded-xl">
                      <div className="inline">
                        <span className="text-sm font-semibold text-gray-300">Blind Spots</span>
                        <span className="text-[10px] text-gray-500 ml-2">What each side misses</span>
                      </div>
                    </summary>
                    <div className="px-4 sm:px-5 pb-4 sm:pb-5 -mt-2">
                      <BlindSpots
                        analytics={analytics}
                        narrativeGaps={summaries.narrative_gaps || null}
                        frameGaps={narrativeStrategy?.gaps}
                        frameGapLabels={narrativeStrategy ? { anti: narrativeStrategy.anti_label, pro: narrativeStrategy.pro_label } : undefined}
                        colorScheme={(topic.color_scheme || "political") as "political" | "neutral"}
                      />
                    </div>
                  </details>
                )}

                {/* Card 3: Top Sources */}
                {analytics && (
                  <details className="bg-gray-900 border border-gray-800 rounded-xl" open={activeTab === "report" || undefined}>
                    <summary className="p-4 sm:p-5 cursor-pointer select-none hover:bg-gray-800/30 transition-colors rounded-xl">
                      <div className="inline">
                        <span className="text-sm font-semibold text-gray-300">Top Sources & Media</span>
                        <span className="text-[10px] text-gray-500 ml-2">Where each side gets its information</span>
                      </div>
                    </summary>
                    <div className="px-4 sm:px-5 pb-4 sm:pb-5 -mt-2">
                      <TopSources data={analytics} colorScheme={(topic.color_scheme || "political") as "political" | "neutral"} />
                    </div>
                  </details>
                )}

                {/* Card 4: Deep Dive */}
                <details className="bg-gray-900 border border-gray-800 rounded-xl" open={activeTab === "report" || undefined}>
                  <summary className="p-4 sm:p-5 cursor-pointer select-none hover:bg-gray-800/30 transition-colors rounded-xl">
                    <div className="inline">
                      <span className="text-sm font-semibold text-gray-300">Deep Dive</span>
                      <span className="text-[10px] text-gray-500 ml-2">Engagement, hashtags, rhetoric</span>
                    </div>
                  </summary>
                  <div className="px-4 sm:px-5 pb-4 sm:pb-5 space-y-6 -mt-2">
                    {/* Trending Phrases */}
                    {analytics && <TrendingPhrases data={analytics} colorScheme={(topic.color_scheme || "political") as "political" | "neutral"} />}

                    {/* Hashtags */}
                    {hashtags && (hashtags.anti.length > 0 || hashtags.pro.length > 0) && (
                      <div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-medium">Hashtags</div>
                        <h3 className="text-sm font-semibold text-gray-300 mb-3">How each side tags the conversation</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                          {([
                            { tags: hashtags.anti, label: hashtags.anti_label, color: sc.anti.text, bg: sc.anti.bgLight, textColor: sc.anti.text },
                            { tags: hashtags.pro, label: hashtags.pro_label, color: sc.pro.text, bg: sc.pro.bgLight, textColor: sc.pro.text },
                          ]).map(({ tags, label, color, bg, textColor }) => (
                            <div key={label}>
                              <div className={`text-[10px] ${color} uppercase tracking-wider font-medium mb-3`}>{label}</div>
                              {tags.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {tags.slice(0, 10).map((h) => (
                                    <span key={h.tag} className={`text-xs ${bg} ${textColor} px-2.5 py-1 rounded-md`}>
                                      #{h.tag} <span className="opacity-50 ml-1 text-[10px] font-mono">{h.count}</span>
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-[10px] text-gray-600">No hashtags found</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Rhetoric Intensity */}
                    {narrativeDepth && narrativeDepth.rhetoric && (() => {
                      const { anti, pro } = narrativeDepth.rhetoric;
                      const aL = narrativeDepth.anti_label;
                      const pL = narrativeDepth.pro_label;
                      const intensityLabel = (avg: number) => avg <= 3 ? "Measured" : avg <= 5 ? "Heated" : avg <= 7 ? "Aggressive" : "Extreme";
                      return (
                        <div>
                          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-medium">Rhetoric Intensity</div>
                          <h3 className="text-sm font-semibold text-gray-300 mb-3">How aggressively each side argues</h3>
                          <div className="grid grid-cols-2 gap-4">
                            {([
                              { side: anti, label: aL, color: sc.anti.text },
                              { side: pro, label: pL, color: sc.pro.text },
                            ] as const).map(({ side, label, color }) => (
                              <div key={label} className="text-center">
                                <div className={`text-[10px] ${color} uppercase tracking-wider font-medium mb-1`}>{label}</div>
                                <div className={`text-2xl font-bold ${color}`}>{side.avg_intensity}</div>
                                <div className="text-[10px] text-gray-500">/10 — {intensityLabel(side.avg_intensity)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </details>
              </div>

            </>
          );
        })()}

        {/* ============ TAB: Key Voices ============ */}
        {activeTab === "report" && <div className="border-t border-gray-700 pt-6 mt-6"><div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-4">Key Voices</div></div>}

        {(activeTab === "voices" || activeTab === "report") && (
          <>
            {!narrativeDepth && (
              <div className="space-y-3 animate-pulse">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4 h-36">
                    <div className="h-2 w-28 bg-gray-800 rounded mb-4" />
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2"><div className="h-3 w-20 bg-gray-800 rounded" /><div className="h-8 w-16 bg-gray-800 rounded" /></div>
                      <div className="space-y-2"><div className="h-3 w-20 bg-gray-800 rounded" /><div className="h-8 w-16 bg-gray-800 rounded" /></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* Amplification — Who is driving the conversation */}
            {narrativeDepth && narrativeDepth.amplification && (() => {
              const { anti, pro, follower_threshold } = narrativeDepth.amplification;
              const aL = narrativeDepth.anti_label;
              const pL = narrativeDepth.pro_label;
              const fmt = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
              const thresholdLabel = fmt(follower_threshold);

              return (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-medium">Who Amplifies Whom</div>
                  <h3 className="text-sm font-semibold text-gray-300 mb-0.5">
                    Who is driving the conversation
                  </h3>
                  <p className="text-[10px] text-gray-600 mb-5">
                    High-reach accounts ({thresholdLabel}+ followers) vs organic spread. Engagements = likes + retweets + quotes + replies.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                    {([
                      { side: anti, label: aL, color: sc.anti.text, border: sc.anti.border, barColor: sc.anti.bgLight.replace("/20", "/50") },
                      { side: pro, label: pL, color: sc.pro.text, border: sc.pro.border, barColor: sc.pro.bgLight.replace("/20", "/50") },
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
            {analytics && <AnalyticsView data={analytics} colorScheme={(topic.color_scheme || "political") as "political" | "neutral"} />}

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
                        The highest-engagement post from each side — click to view on X
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
                                  <div className={`text-[10px] ${sc.anti.text} font-medium uppercase tracking-wider`}>{aL}</div>
                                  {frame.anti_tweets && frame.anti_tweets.length > 0
                                    ? frame.anti_tweets.map((t) => renderTweet(t, aL, sc.anti.border, sc.anti.text))
                                    : <div className="border border-gray-800/40 border-dashed rounded-lg px-3 py-2"><span className="text-[10px] text-gray-600 italic">Not used by {aL}</span></div>
                                  }
                                </div>
                                <div className="space-y-3">
                                  <div className={`text-[10px] ${sc.pro.text} font-medium uppercase tracking-wider`}>{pL}</div>
                                  {frame.pro_tweets && frame.pro_tweets.length > 0
                                    ? frame.pro_tweets.map((t) => renderTweet(t, pL, sc.pro.border, sc.pro.text))
                                    : <div className="border border-gray-800/40 border-dashed rounded-lg px-3 py-2"><span className="text-[10px] text-gray-600 italic">Not used by {pL}</span></div>
                                  }
                                </div>
                              </div>
                            ) : (
                              /* All frames view: show top 1 per side, side by side */
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {renderTweet(frame.anti, aL, sc.anti.border, sc.anti.text) || (
                                  <div className="border border-gray-800/40 border-dashed rounded-lg px-3 py-2">
                                    <span className="text-[10px] text-gray-600 italic">Not used by {aL}</span>
                                  </div>
                                )}
                                {renderTweet(frame.pro, pL, sc.pro.border, sc.pro.text) || (
                                  <div className="border border-gray-800/40 border-dashed rounded-lg px-3 py-2">
                                    <span className="text-[10px] text-gray-600 italic">Not used by {pL}</span>
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
            {/* Flashpoints — expandable section within Key Voices */}
            {(() => {
              const dunksContent = (() => {
          if (!dunksData || dunksData.dunks.length === 0) {
            return null;
          }

          const fmt = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
          const dunks = dunksData.dunks;

          // Split by which side is getting dunked
          const antiDunked = dunks.filter(d => d.side === dunksData.anti_label);
          const proDunked = dunks.filter(d => d.side === dunksData.pro_label);

          const renderDunk = (dunk: typeof dunks[0], i: number) => {
            const isAntiSide = dunk.side === dunksData.anti_label;
            const sideColor = isAntiSide ? sc.anti.border : sc.pro.border;
            const sideText = isAntiSide ? sc.anti.text : sc.pro.text;
            const dunkerText = isAntiSide ? sc.pro.text : sc.anti.text;

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
              <p className="text-[10px] text-gray-600 mb-4">
                Posts that got picked up by the opposing side through quote-tweets, replies, or disproportionately high reply ratios (&quot;ratio&apos;d&quot;)
              </p>

              <div className="space-y-4">
                {dunks.slice(0, flashpointsExpanded ? 10 : 3).map((dunk, i) => renderDunk(dunk, i))}
              </div>

              {dunks.length > 3 && !flashpointsExpanded && (
                <button
                  onClick={() => setFlashpointsExpanded(true)}
                  className="w-full mt-4 py-2 text-xs text-gray-400 hover:text-gray-200 bg-gray-800/50 hover:bg-gray-800 rounded-lg transition-colors"
                >
                  Show all {Math.min(dunks.length, 10)} flashpoints ({dunks.length - 3} more)
                </button>
              )}

              {dunks.length > 0 && (
                <p className="text-[10px] text-gray-500 mt-5">
                  {antiDunked.length} {dunksData.anti_label} tweets dunked by {dunksData.pro_label},{" "}
                  {proDunked.length} {dunksData.pro_label} tweets dunked by {dunksData.anti_label}.
                  Analyzed {dunksData.total_analyzed} tweets total.
                </p>
              )}
            </>
          );
              })();
              if (!dunksContent) return null;
              return (
                <details className="bg-gray-900 border border-gray-800 rounded-xl" open={activeTab === "report" || undefined}>
                  <summary className="p-4 sm:p-5 cursor-pointer select-none hover:bg-gray-800/30 transition-colors rounded-xl">
                    <div className="inline">
                      <span className="text-sm font-semibold text-gray-300">Flashpoints</span>
                      <span className="text-[10px] text-gray-500 ml-2">Posts that sparked the other side</span>
                    </div>
                  </summary>
                  <div className="px-4 sm:px-5 pb-4 sm:pb-5 -mt-2">
                    {dunksContent}
                  </div>
                </details>
              );
            })()}
          </>
        )}

        {/* Common Ground — inline overlap (for report tab) */}
        {activeTab === "report" && analytics?.overlap && (() => {
              const { shared_sources, shared_narratives } = analytics.overlap;
              const sharedNarr = shared_narratives?.filter(n => n.anti_count > 0 && n.pro_count > 0) || [];
              const hasShared = (shared_sources?.length > 0) || (sharedNarr.length > 0);
              if (!hasShared) return null;
              const aL = analytics.anti_label;
              const pL = analytics.pro_label;
              const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
              return (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-medium">Common Ground</div>
                  <h3 className="text-sm font-semibold text-gray-300 mb-0.5">Where both sides overlap</h3>
                  <p className="text-[10px] text-gray-600 mb-4">Topics and sources that appear on both sides of the conversation</p>

                  {/* Shared Topics — butterfly chart */}
                  {sharedNarr.length > 0 && (() => {
                    const maxCount = Math.max(...sharedNarr.slice(0, 6).flatMap(n => [n.anti_count, n.pro_count]));
                    return (
                      <div className="mb-6">
                        <div className="text-[10px] text-gray-500 font-medium mb-3">Shared Topics</div>
                        {/* Header */}
                        <div className="flex items-center mb-2">
                          <div className={`w-[45%] text-right text-[9px] ${sc.anti.text} pr-2`}>{aL}</div>
                          <div className="w-[10%]" />
                          <div className={`w-[45%] text-left text-[9px] ${sc.pro.text} pl-2`}>{pL}</div>
                        </div>
                        <div className="space-y-2">
                          {sharedNarr.slice(0, 6).map(n => {
                            const total = n.anti_count + n.pro_count;
                            const antiPct = total > 0 ? Math.round((n.anti_count / total) * 100) : 0;
                            const proPct = total > 0 ? 100 - antiPct : 0;
                            const antiW = maxCount > 0 ? (n.anti_count / maxCount) * 100 : 0;
                            const proW = maxCount > 0 ? (n.pro_count / maxCount) * 100 : 0;
                            return (
                              <div key={n.frame} className="flex items-center">
                                <div className="w-[45%] flex items-center justify-end gap-1.5">
                                  <span className={`text-[9px] ${sc.anti.text} opacity-70 shrink-0`}>{antiPct}%</span>
                                  <div className="h-4 flex-1 flex justify-end">
                                    <div className={`h-full ${sc.anti.bg} opacity-50 rounded-l-sm`} style={{ width: `${antiW}%` }} />
                                  </div>
                                </div>
                                <div className="w-[10%] text-center">
                                  <span className="text-[9px] text-gray-500 leading-none">{n.label.length > 12 ? n.label.slice(0, 11) + "..." : n.label}</span>
                                </div>
                                <div className="w-[45%] flex items-center gap-1.5">
                                  <div className="h-4 flex-1 flex justify-start">
                                    <div className={`h-full ${sc.pro.bg} opacity-50 rounded-r-sm`} style={{ width: `${proW}%` }} />
                                  </div>
                                  <span className={`text-[9px] ${sc.pro.text} opacity-70 shrink-0`}>{proPct}%</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Shared Sources — butterfly chart */}
                  {shared_sources?.length > 0 && (() => {
                    const maxSrc = Math.max(...shared_sources.slice(0, 6).flatMap(s => [s.anti_count, s.pro_count]));
                    return (
                      <div>
                        <div className="text-[10px] text-gray-500 font-medium mb-3">Shared Sources</div>
                        <div className="space-y-2">
                          {shared_sources.slice(0, 6).map(s => {
                            const total = s.anti_count + s.pro_count;
                            const antiPct = total > 0 ? Math.round((s.anti_count / total) * 100) : 0;
                            const proPct = total > 0 ? 100 - antiPct : 0;
                            const antiW = maxSrc > 0 ? (s.anti_count / maxSrc) * 100 : 0;
                            const proW = maxSrc > 0 ? (s.pro_count / maxSrc) * 100 : 0;
                            return (
                              <div key={s.domain} className="flex items-center">
                                <div className="w-[45%] flex items-center justify-end gap-1.5">
                                  <span className={`text-[9px] ${sc.anti.text} opacity-70 shrink-0`}>{antiPct}%</span>
                                  <div className="h-4 flex-1 flex justify-end">
                                    <div className={`h-full ${sc.anti.bg} opacity-50 rounded-l-sm`} style={{ width: `${antiW}%` }} />
                                  </div>
                                </div>
                                <div className="w-[10%] text-center">
                                  <span className="text-[9px] text-gray-500 leading-none truncate">{s.domain.length > 12 ? s.domain.slice(0, 11) + "..." : s.domain}</span>
                                </div>
                                <div className="w-[45%] flex items-center gap-1.5">
                                  <div className="h-4 flex-1 flex justify-start">
                                    <div className={`h-full ${sc.pro.bg} opacity-50 rounded-r-sm`} style={{ width: `${proW}%` }} />
                                  </div>
                                  <span className={`text-[9px] ${sc.pro.text} opacity-70 shrink-0`}>{proPct}%</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}

        {/* ============ TAB: Geography ============ */}
        {activeTab === "report" && <div className="border-t border-gray-700 pt-6 mt-6"><div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-4">Geography</div></div>}

        {activeTab === "geography" && !geography && (
          <div className="text-center py-12 text-gray-500 text-sm">Loading geographic data...</div>
        )}

        {(activeTab === "geography" || activeTab === "report") && geography && (() => {
          const { locations, summary } = geography;
          const aL = geography.anti_label;
          const pL = geography.pro_label;
          const fmt = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
          const maxTotal = Math.max(...locations.slice(0, 20).map(l => l.total), 1);

          return (
            <>
              {/* Sentiment Map */}
              {(geography.us_states.length > 0 || geography.countries.length > 0) && (
                <SentimentMap
                  states={geography.us_states}
                  countries={geography.countries}
                  antiLabel={aL}
                  proLabel={pL}
                  colorScheme={(topic.color_scheme || "political") as "political" | "neutral"}
                />
              )}

              {/* Summary stats */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-medium">Geographic Reach</div>
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Where the conversation is happening</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                  <div className="text-center">
                    <div className="text-xl font-bold text-gray-200">{summary.coverage_pct}%</div>
                    <div className="text-[10px] text-gray-500">of posts have location</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-gray-200">{fmt(summary.unique_locations)}</div>
                    <div className="text-[10px] text-gray-500">unique locations</div>
                  </div>
                  <div className="text-center">
                    <div className={`text-xl font-bold ${sc.anti.text}`}>{fmt(summary.anti_total)}</div>
                    <div className="text-[10px] text-gray-500">{aL} posts</div>
                  </div>
                  <div className="text-center">
                    <div className={`text-xl font-bold ${sc.pro.text}`}>{fmt(summary.pro_total)}</div>
                    <div className="text-[10px] text-gray-500">{pL} posts</div>
                  </div>
                </div>
                {summary.coverage_pct < 30 && (
                  <p className="text-[10px] text-gray-600">Note: Only {summary.coverage_pct}% of authors set a public location. This data represents a subset of the full conversation.</p>
                )}
              </div>

              {/* Top locations bar chart */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-medium">Top Locations</div>
                <h3 className="text-sm font-semibold text-gray-300 mb-1">Where authors are located</h3>
                <p className="text-[10px] text-gray-600 mb-4">Based on user-set profile locations — sorted by post volume</p>

                <div className="space-y-2">
                  {locations.slice(0, 20).map((loc) => {
                    const antiPct = loc.total > 0 ? Math.round((loc.anti_count / loc.total) * 100) : 0;
                    const proPct = loc.total > 0 ? Math.round((loc.pro_count / loc.total) * 100) : 0;
                    const barW = (loc.total / maxTotal) * 100;

                    return (
                      <div key={loc.location} className="flex items-center gap-3">
                        <div className="w-32 sm:w-40 text-xs text-gray-300 truncate shrink-0" title={loc.location}>
                          {loc.location}
                        </div>
                        <div className="flex-1 h-5 bg-gray-800 rounded overflow-hidden relative" style={{ width: `${barW}%` }}>
                          <div className="h-full flex">
                            {loc.anti_count > 0 && (
                              <div className={`h-full ${sc.anti.bg} opacity-60`} style={{ width: `${antiPct}%` }} />
                            )}
                            {loc.neutral_count > 0 && (
                              <div className="h-full bg-gray-500 opacity-40" style={{ width: `${100 - antiPct - proPct}%` }} />
                            )}
                            {loc.pro_count > 0 && (
                              <div className={`h-full ${sc.pro.bg} opacity-60`} style={{ width: `${proPct}%` }} />
                            )}
                          </div>
                        </div>
                        <div className="w-10 text-right text-[10px] text-gray-500 shrink-0">{loc.total}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex items-center gap-4 mt-4">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-3 h-3 rounded-sm ${sc.anti.bg} opacity-60`} />
                    <span className="text-[10px] text-gray-400">{aL}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-3 h-3 rounded-sm ${sc.pro.bg} opacity-60`} />
                    <span className="text-[10px] text-gray-400">{pL}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-gray-500 opacity-40" />
                    <span className="text-[10px] text-gray-400">Neutral</span>
                  </div>
                </div>
              </div>

            </>
          );
        })()}

        {/* ============ TAB 4: Strategy ============ */}
        {activeTab === "report" && <div className="border-t border-gray-700 pt-6 mt-6"><div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-4">Insights & Action</div></div>}

        {(activeTab === "strategy" || activeTab === "report") && (
          <>
            {/* What's Driving the Difference */}
            {gapAnalysis && <GapAnalysis data={gapAnalysis} />}

            {/* Recommendations */}
            {recommendations && <Recommendations data={recommendations} colorScheme={(topic.color_scheme || "political") as "political" | "neutral"} />}

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
                    desc: "Combines follower count (log scale), follower/following ratio, X list count, account age, and verification status. Activist accounts get a 1.4x boost over news sources. Bot-like accounts (100+ posts/day) are penalized to 0.3x.",
                    detail: "Account type is detected from bio keywords. Accounts posting from native X clients (iOS, Android, Web) are boosted over API-posted content (0.75x for non-native sources)."
                  },
                  {
                    tag: "Format Boost",
                    title: "What kind of content is this?",
                    range: "0.5x - 2.6x",
                    desc: "Mirrors X's actual content hierarchy: native video (2.0x) > photos (1.4x) > text-only (1.0x) > external links (0.9x). Quote posts with commentary get 1.3x. Thread starters get 1.15x. Deep replies are penalized to 0.6x.",
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
                    desc: "Posts classified as outrage, fear, or moral condemnation get a modest boost (up to 1.15x) because X's algorithm rewards engagement bait. However, extreme-intensity content with low engagement is penalized to 0.4x as a toxicity proxy.",
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
                    Each tweet is classified by AI for political stance (pro/anti/neutral), with low-confidence classifications escalated to a multi-model ensemble for majority vote. Intensity scoring (-10 to +10) measures rhetorical aggression. Narrative framing and emotional tone are classified separately.
                  </p>
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-300 mb-1">Limitations</div>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    The feed cannot access who reposted or liked a post (X API limitation), so in-network engagement is approximated from quote-posts and replies within the dataset. Geographic targeting is not available. Toxicity scoring uses intensity + emotion as a proxy, not a dedicated moderation API.
                  </p>
                </div>
              </div>
            </div>

            {/* Tab guide */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 sm:p-6">
              <h2 className="text-base font-bold text-gray-200 mb-4">Dashboard Tabs</h2>
              <div className="space-y-3">
                {([
                  { name: "Feed", desc: "A simulated X feed ranked by the algorithm above. Use the bias slider to see how different political leanings change what content surfaces. Toggle between \"For You\" (algorithm-ranked) and \"Latest\" (chronological)." },
                  { name: "Overview", desc: "High-level KPIs: who's leading the conversation, engagement comparison, narrative divide score, and what each side's audience actually sees." },
                  { name: "Arguments", desc: "How each side frames the topic (radar charts), emotional tone, trending phrases, hashtags, content format breakdown, engagement by frame, and rhetoric intensity." },
                  { name: "Key Voices", desc: "Who is driving the conversation (high-reach vs organic accounts), top voices by engagement, and the highest-engagement tweets per narrative frame. Includes an expandable Flashpoints section showing tweets that triggered the other side." },
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

            {/* Support contact */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 sm:p-6">
              <h2 className="text-base font-bold text-gray-200 mb-2">Need Help?</h2>
              <p className="text-xs text-gray-400 leading-relaxed">
                If you have questions, feedback, or run into any issues, reach out to us at{" "}
                <a href="mailto:support@dividedview.com" className="text-blue-400 hover:text-blue-300">support@dividedview.com</a>.
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
