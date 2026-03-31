const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Auth token management — set by AuthProvider, used by all API calls
let _authToken: string | null = null;
let _getTokenFn: (() => Promise<string | null>) | null = null;

export function setAuthToken(token: string | null) {
  _authToken = token;
}

export function setGetTokenFn(fn: (() => Promise<string | null>) | null) {
  _getTokenFn = fn;
}

export function authHeaders(): Record<string, string> {
  return _authToken ? { Authorization: `Bearer ${_authToken}` } : {};
}

/** Fetch wrapper that auto-injects the Clerk auth token. */
async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Authorization")) {
    // Get a fresh token if possible, fall back to cached
    if (_getTokenFn) {
      try {
        const token = await _getTokenFn();
        if (token) {
          _authToken = token;
          headers.set("Authorization", `Bearer ${token}`);
        }
      } catch {
        if (_authToken) headers.set("Authorization", `Bearer ${_authToken}`);
      }
    } else if (_authToken) {
      headers.set("Authorization", `Bearer ${_authToken}`);
    }
  }
  return fetch(url, { ...init, headers });
}

export interface TopicData {
  slug: string;
  name: string;
  description: string | null;
  pro_label: string;
  anti_label: string;
  target_language?: string;
  target_country?: string;
  color_scheme?: string;
  visibility?: string;
  created_by?: string | null;
}

export interface MediaItem {
  type: "photo" | "video";
  url: string;
  thumbnail?: string | null;
}

export interface TweetData {
  id_str: string;
  topic_slug: string | null;
  created_at: string | null;
  screen_name: string | null;
  author_name: string | null;
  author_bio: string | null;
  author_followers: number | null;
  full_text: string | null;
  likes: number;
  retweets: number;
  replies: number;
  quotes: number;
  views: number;
  engagement: number | null;
  url: string | null;
  media: MediaItem[];
}

export interface ClassificationData {
  id_str: string;
  about_subject: boolean | null;
  political_bent: string | null;
  author_lean: string | null;
  classification_basis: string | null;
  confidence: number | null;
  agreement: string | null;
  classification_method: string | null;
  votes: string | null;
  intensity_score: number | null;
  intensity_confidence: number | null;
  intensity_reasoning: string | null;
  intensity_flag: string | null;
  override_flag: boolean;
  override_political_bent: string | null;
  override_intensity_score: number | null;
  override_notes: string | null;
  override_at: string | null;
  effective_political_bent: string | null;
  effective_intensity_score: number | null;
  narrative_frames: string[] | null;
  emotion_mode: string | null;
  frame_confidence: number | null;
}

export interface FeedItem {
  tweet: TweetData;
  classification: ClassificationData;
  feed_score: number;
}

export interface BreakdownCategory {
  count: number;
  pct: number;
  avg_engagement: number;
  avg_views: number;
}

export interface BreakdownData {
  topic: string;
  total_tweets: number;
  on_topic: number;
  breakdown: Record<string, BreakdownCategory>;
  intensity: {
    pro_avg: number | null;
    anti_avg: number | null;
    pro_distribution: Record<number, number>;
    anti_distribution: Record<number, number>;
  };
  last_updated: string | null;
}

export interface UserProfile {
  id: string;
  email: string | null;
  name: string | null;
  tier: string;
}

export async function fetchMe(): Promise<UserProfile> {
  const res = await apiFetch(`${API_URL}/api/me`);
  if (!res.ok) throw new Error("Failed to fetch user profile");
  return res.json();
}

export async function fetchTopics(): Promise<TopicData[]> {
  const res = await apiFetch(`${API_URL}/api/topics`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch topics");
  return res.json();
}

export interface FrameItem {
  key: string;
  label: string;
}

export interface TopicSuggestion {
  topic_name: string;
  slug: string;
  description: string;
  pro_label: string;
  anti_label: string;
  pro_definition: string;
  anti_definition: string;
  search_query: string;
  classification_prompt: string;
  intensity_prompt: string;
  custom_frames?: FrameItem[];
  custom_emotions?: FrameItem[];
  target_language?: string;
  target_country?: string;
  color_scheme?: string;
}

export async function suggestTopic(topicName: string): Promise<TopicSuggestion> {
  const res = await apiFetch(`${API_URL}/api/topics/suggest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic_name: topicName }),
  });
  if (!res.ok) throw new Error("Failed to generate topic suggestion");
  return res.json();
}

export async function createTopic(data: TopicSuggestion): Promise<TopicData> {
  const res = await apiFetch(`${API_URL}/api/topics/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to create topic");
  }
  return res.json();
}

export async function runTopicPipeline(slug: string, options?: { hours?: number; maxPages?: number }): Promise<void> {
  const params = new URLSearchParams();
  if (options?.hours) params.set("hours", String(options.hours));
  if (options?.maxPages) params.set("max_pages", String(options.maxPages));
  const qs = params.toString() ? `?${params}` : "";
  const res = await apiFetch(`${API_URL}/api/topics/${slug}/run${qs}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to start pipeline");
}

export async function fetchFeed(
  topic: string,
  bias: number,
  limit = 20,
  hours = 24
): Promise<FeedItem[]> {
  const params = new URLSearchParams({
    topic,
    bias: String(bias),
    limit: String(limit),
    hours: String(hours),
  });
  const res = await apiFetch(`${API_URL}/api/feed?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch feed");
  return res.json();
}

export interface RawFeedItem {
  tweet: TweetData;
  classification: ClassificationData;
}

export interface AnalyticsVoice {
  screen_name: string;
  author_name: string;
  followers: number;
  tweet_count: number;
  total_engagement: number;
  total_views: number;
}

export interface AnalyticsPhrase {
  phrase: string;
  count: number;
}

export interface AnalyticsEngagement {
  count: number;
  avg_likes: number;
  avg_retweets: number;
  avg_replies: number;
  avg_views: number;
  avg_engagement: number;
}

export interface AnalyticsDomain {
  domain: string;
  count: number;
}

export interface AnalyticsUrl {
  url: string;
  display: string;
  count: number;
}

export interface AnalyticsSourceData {
  domains: AnalyticsDomain[];
  urls: AnalyticsUrl[];
}

export interface FrameCount {
  count: number;
  pct: number;
}

export interface FrameGap {
  frame: string;
  label: string;
  anti_pct: number;
  pro_pct: number;
  delta: number;
  dominant_side: string;
}

export interface EmotionGap {
  emotion: string;
  label: string;
  anti_pct: number;
  pro_pct: number;
  delta: number;
  dominant_side: string;
}

export interface NarrativeData {
  frames: { anti: Record<string, FrameCount>; pro: Record<string, FrameCount> };
  emotions: { anti: Record<string, FrameCount>; pro: Record<string, FrameCount> };
  frame_gaps: FrameGap[];
  emotion_gaps: EmotionGap[];
  frame_labels: Record<string, string>;
  emotion_labels: Record<string, string>;
  anti_label: string;
  pro_label: string;
  total_framed: { anti: number; pro: number };
}

export interface GapAnalysisData {
  metrics: {
    source_overlap: { value: number; separated: number; interpretation: string; takeaway: string; section_link: string };
    voice_concentration: { anti: { value: number }; pro: { value: number }; ratio: number; gap: number; higher_side: string; lower_side: string; takeaway: string; strength: string; section_link: string };
    narrative_concentration: { anti: { value: number }; pro: { value: number }; gap: number; higher_side: string; takeaway: string; strength: string; section_link: string };
    emotional_amplification: { anti: { emotion: string; multiplier: number }[]; pro: { emotion: string; multiplier: number }[]; gap: { emotion: string; higher_side: string; higher_val: number; lower_val: number } | null; takeaway: string; section_link: string };
  };
  bullets: string[];
  causal_paragraph: string;
  anti_label: string;
  pro_label: string;
}

export async function fetchGapAnalysis(topic: string): Promise<GapAnalysisData | null> {
  const res = await apiFetch(`${API_URL}/api/gap-analysis?topic=${encodeURIComponent(topic)}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchNarrative(topic: string): Promise<NarrativeData | null> {
  const res = await apiFetch(`${API_URL}/api/narrative?topic=${encodeURIComponent(topic)}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

export interface Recommendation {
  title: string;
  detail: string;
  type: string;
}

export interface RecommendationsData {
  anti_recommendations: Recommendation[];
  pro_recommendations: Recommendation[];
  anti_label: string;
  pro_label: string;
}

export async function fetchRecommendations(topic: string): Promise<RecommendationsData | null> {
  const res = await apiFetch(`${API_URL}/api/recommendations?topic=${encodeURIComponent(topic)}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export interface ExposureOverlapByType {
  score: number;
  shared: number;
  anti_only: number;
  pro_only: number;
}

export interface ExposureOverlapData {
  score: number;
  label: string;
  sentence: string;
  shared_count: number;
  anti_only_count: number;
  pro_only_count: number;
  total_stories: number;
  by_type?: { urls: ExposureOverlapByType; themes: ExposureOverlapByType };
  themes_list?: { name: string; anti_count: number; pro_count: number; total: number; side: string }[];
  urls_list?: { name: string; anti_count: number; pro_count: number; total: number; side: string }[];
  shared_themes?: string[];
  shared_urls?: string[];
  anti_label: string;
  pro_label: string;
}

export async function fetchExposureOverlap(topic: string): Promise<ExposureOverlapData | null> {
  const res = await apiFetch(`${API_URL}/api/exposure-overlap?topic=${encodeURIComponent(topic)}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export interface PairedSide {
  id_str: string;
  screen_name: string;
  author_name: string;
  full_text: string;
  headline: string;
  likes: number;
  retweets: number;
  views: number;
  engagement: number;
  frame: string;
  emotion: string;
  source: string;
  url: string | null;
  created_at: string | null;
}

export interface PairedStory {
  story_label: string;
  anti_tweet_count: number;
  pro_tweet_count: number;
  anti: PairedSide;
  pro: PairedSide;
  interpretation: string;
  contrast_label: string;
  contrast_score: number;
}

export interface PairedStoriesData {
  stories: PairedStory[];
  anti_label: string;
  pro_label: string;
}

export async function fetchPairedStories(topic: string): Promise<PairedStoriesData | null> {
  const res = await apiFetch(`${API_URL}/api/paired-stories?topic=${encodeURIComponent(topic)}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export interface SharedSource {
  domain: string;
  anti_count: number;
  pro_count: number;
  total: number;
}

export interface SharedUrl {
  url: string;
  display: string;
  anti_count: number;
  pro_count: number;
  total: number;
}

export interface SharedNarrative {
  frame: string;
  label: string;
  anti_count: number;
  pro_count: number;
  total: number;
}

export interface OverlapData {
  shared_sources: SharedSource[];
  shared_urls: SharedUrl[];
  shared_narratives: SharedNarrative[];
}

export interface ExclusiveStory {
  url: string;
  display: string;
  count: number;
}

export interface KeywordGap {
  word: string;
  side_count: number;
  other_count: number;
  ratio: number | null;
}

export interface AnalyticsData {
  engagement: { anti: AnalyticsEngagement; pro: AnalyticsEngagement; neutral: AnalyticsEngagement };
  voices: { anti: AnalyticsVoice[]; pro: AnalyticsVoice[] };
  phrases: { anti: AnalyticsPhrase[]; pro: AnalyticsPhrase[] };
  exclusive_stories?: { anti_only: ExclusiveStory[]; pro_only: ExclusiveStory[] };
  keyword_gaps?: { anti_misses: KeywordGap[]; pro_misses: KeywordGap[] };
  sources: { anti: AnalyticsSourceData; pro: AnalyticsSourceData; overall: AnalyticsSourceData };
  overlap?: OverlapData;
  anti_label: string;
  pro_label: string;
}

export async function fetchAnalytics(topic: string): Promise<AnalyticsData | null> {
  const res = await apiFetch(`${API_URL}/api/analytics?topic=${encodeURIComponent(topic)}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

export interface ViralPost {
  id_str: string;
  screen_name: string;
  author_name: string;
  full_text: string;
  likes: number;
  retweets: number;
  views: number;
  engagement: number;
  url: string | null;
  created_at: string | null;
}

export interface AlertFlag {
  type: string;
  severity: "high" | "medium";
  message: string;
}

export interface FramePerformance {
  frame: string;
  label: string;
  avg_engagement: number;
  tweet_count: number;
}

export interface PlaybookEntry {
  frame: string;
  label: string;
  share: number;
}

export interface GapEntry {
  frame: string;
  label: string;
  my_share: number;
  other_share: number;
  gap: number;
}

export interface NarrativeStrategyData {
  frame_performance: FramePerformance[];
  playbook: { anti: PlaybookEntry[]; pro: PlaybookEntry[] };
  gaps: { anti: GapEntry[]; pro: GapEntry[] };
  anti_label: string;
  pro_label: string;
}

// --- Narrative Depth (rhetoric intensity, example tweets, amplification) ---

export interface IntensityProfile {
  distribution: { mild: number; moderate: number; aggressive: number; extreme: number };
  avg_intensity: number;
  total_scored: number;
}

export interface ExampleTweetItem {
  id_str: string;
  screen_name: string;
  author_name: string;
  full_text: string;
  likes: number;
  retweets: number;
  replies: number;
  views: number;
  engagement: number;
  author_followers: number;
  url: string;
  intensity_score: number | null;
  emotion: string | null;
}

export interface FrameExample {
  frame: string;
  label: string;
  anti: ExampleTweetItem | null;
  pro: ExampleTweetItem | null;
  anti_tweets: ExampleTweetItem[];
  pro_tweets: ExampleTweetItem[];
}

export interface AmplificationSide {
  high_reach_count: number;
  organic_count: number;
  high_reach_avg_eng: number;
  organic_avg_eng: number;
  high_reach_eng_share: number;
  top_amplifiers: {
    screen_name: string;
    author_name: string;
    full_text: string;
    followers: number;
    engagement: number;
    url: string;
  }[];
}

export interface AmplifiedFrame {
  frame: string;
  label: string;
  high_reach_tweets: number;
  avg_engagement: number;
}

export interface NarrativeDepthData {
  rhetoric: { anti: IntensityProfile; pro: IntensityProfile };
  example_tweets: FrameExample[];
  amplification: {
    anti: AmplificationSide;
    pro: AmplificationSide;
    follower_threshold: number;
    amplified_frames: AmplifiedFrame[];
  };
  anti_label: string;
  pro_label: string;
}

export async function fetchNarrativeDepth(topic: string): Promise<NarrativeDepthData | null> {
  const res = await apiFetch(`${API_URL}/api/narrative-depth?topic=${encodeURIComponent(topic)}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

// --- Media Breakdown ---
export interface MediaStats {
  text_only: number;
  photo: number;
  video: number;
  link: number;
  total: number;
  pct: { text_only: number; photo: number; video: number; link: number };
}

export interface MediaBreakdownData {
  anti: MediaStats;
  pro: MediaStats;
  overall: MediaStats;
  anti_label: string;
  pro_label: string;
}

export async function fetchMediaBreakdown(topic: string): Promise<MediaBreakdownData | null> {
  const res = await apiFetch(`${API_URL}/api/media-breakdown?topic=${encodeURIComponent(topic)}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

// --- Side-by-Side Feed ---
export interface FeedPreviewItem {
  id_str: string;
  screen_name: string;
  author_name: string;
  author_followers: number;
  full_text: string;
  likes: number;
  retweets: number;
  quotes: number;
  replies: number;
  views: number;
  engagement: number;
  url: string;
  created_at: string | null;
  media: { type: string; url: string; thumbnail: string | null }[];
}

export interface SideBySideFeedData {
  anti: FeedPreviewItem[];
  pro: FeedPreviewItem[];
  anti_label: string;
  pro_label: string;
}

// --- Hashtags ---
export interface HashtagItem {
  tag: string;
  count: number;
}

export interface HashtagData {
  anti: HashtagItem[];
  pro: HashtagItem[];
  overall: HashtagItem[];
  shared_count: number;
  anti_only_count: number;
  pro_only_count: number;
  anti_label: string;
  pro_label: string;
}

export async function fetchHashtags(topic: string): Promise<HashtagData | null> {
  const res = await apiFetch(`${API_URL}/api/hashtags?topic=${encodeURIComponent(topic)}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

// --- Last Run ---
export interface LastRunData {
  ran_at: string | null;
  tweets_fetched: number;
  tweets_new: number;
  tweets_classified: number;
  total_cost_usd: number;
  status: string;
  total_tweets_in_dataset: number;
  date_range: { earliest: string | null; latest: string | null };
}

export async function fetchLastRun(topic: string): Promise<LastRunData | null> {
  const res = await apiFetch(`${API_URL}/api/last-run?topic=${encodeURIComponent(topic)}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

// --- Pipeline Progress ---
export interface PipelineProgress {
  step: number;
  total_steps: number;
  label: string;
  detail: string;
  pct: number;
  running: boolean;
}

export async function fetchPipelineProgress(slug: string): Promise<PipelineProgress | null> {
  const res = await apiFetch(`${API_URL}/api/topics/${slug}/progress`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchSideBySideFeed(topic: string): Promise<SideBySideFeedData | null> {
  const res = await apiFetch(`${API_URL}/api/side-by-side-feed?topic=${encodeURIComponent(topic)}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

// --- Dunks ---
export interface DunkItem {
  tweet: {
    id_str: string;
    screen_name: string;
    author_name: string;
    full_text: string;
    likes: number;
    retweets: number;
    quotes: number;
    replies: number;
    views: number;
    engagement: number;
    author_followers: number;
    url: string;
    created_at: string | null;
  };
  side: string;
  dunked_by: string;
  dunk_score: number;
  dunk_type: string;
  reply_ratio: number;
  opposite_engagers: number;
  quote_ratio: number;
  dunker_examples: {
    screen_name: string;
    full_text: string;
    engagement: number;
    url: string;
    is_quote: boolean;
  }[];
}

export interface DunksData {
  dunks: DunkItem[];
  anti_label: string;
  pro_label: string;
  total_analyzed: number;
}

export async function fetchDunks(topic: string): Promise<DunksData | null> {
  const res = await apiFetch(`${API_URL}/api/dunks?topic=${encodeURIComponent(topic)}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchNarrativeStrategy(topic: string): Promise<NarrativeStrategyData | null> {
  const res = await apiFetch(`${API_URL}/api/narrative-strategy?topic=${encodeURIComponent(topic)}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

export interface PulseExtrasData {
  viral: { anti: ViralPost[]; pro: ViralPost[] };
  alerts: AlertFlag[];
  anti_label: string;
  pro_label: string;
}

export async function fetchPulseExtras(topic: string): Promise<PulseExtrasData | null> {
  const res = await apiFetch(`${API_URL}/api/pulse-extras?topic=${encodeURIComponent(topic)}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

export interface SummaryData {
  summary: string;
  tweet_count: number;
  generated_at: string | null;
}

export async function fetchSummaries(
  topic: string
): Promise<Record<string, SummaryData>> {
  const res = await apiFetch(`${API_URL}/api/summaries?topic=${encodeURIComponent(topic)}`, {
    cache: "no-store",
  });
  if (!res.ok) return {};
  return res.json();
}

export async function fetchAllTweets(
  topic: string,
  hours = 24
): Promise<RawFeedItem[]> {
  const params = new URLSearchParams({ topic, hours: String(hours) });
  const res = await apiFetch(`${API_URL}/api/feed/all?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch tweets");
  return res.json();
}

// --- Smart Feed ---
export interface SmartFeedItem {
  tweet: TweetData;
  classification: ClassificationData;
  feed_score: number;
  score_breakdown: Record<string, number | string>;
}

export async function fetchSmartFeed(
  topic: string,
  bias: number = 0,
  hours: number = 720,
  limit: number = 100,
): Promise<SmartFeedItem[]> {
  const params = new URLSearchParams({
    topic,
    bias: String(bias),
    hours: String(hours),
    limit: String(limit),
  });
  const res = await apiFetch(`${API_URL}/api/feed/smart?${params}`, { cache: "no-store" });
  if (!res.ok) return [];
  return res.json();
}

export function scoreFeed(
  items: RawFeedItem[],
  bias: number,
  limit = 50
): FeedItem[] {
  if (items.length === 0) return [];

  const maxViews = Math.max(...items.map((i) => i.tweet.views || 1), 1);
  const authorCounts: Record<string, number> = {};

  const scored = items.map((item) => {
    let intensity = item.classification.effective_intensity_score;
    const bent = (item.classification.effective_political_bent || "unclear").toLowerCase();

    // Assign mild intensity to unscored tweets based on their classification
    if (intensity == null) {
      if (bent.includes("anti")) {
        intensity = -2;
      } else if (bent.includes("pro")) {
        intensity = 2;
      }
    }

    // Bias weight: at 0 (neutral), no weighting — raw distribution.
    // As bias moves away from 0, weighting gradually kicks in.
    const biasMagnitude = Math.abs(bias) / 10; // 0 to 1
    let biasWeight: number;
    if (intensity == null) {
      // Neutral/unclear tweets: fade out as bias gets extreme
      biasWeight = 1.0 - 0.9 * biasMagnitude;
    } else {
      // Check if tweet is on the same side as the bias
      const sameSide = (bias < 0 && intensity < 0) || (bias > 0 && intensity > 0);
      const distance = Math.abs(bias - intensity);

      // Steeper decay for opposing tweets, gentler for same-side
      const decayRate = sameSide ? 0.12 : 0.35;
      const polarizedWeight = Math.max(5.0 * Math.exp(-decayRate * distance), 0.02);

      // Blend: at bias=0 weight=1.0 (no effect), at extremes full polarized weight
      biasWeight = 1.0 + (polarizedWeight - 1.0) * biasMagnitude;
    }

    const baseScore = (item.tweet.views || 0) / maxViews;

    const author = item.tweet.screen_name || "";
    authorCounts[author] = (authorCounts[author] || 0) + 1;
    const count = authorCounts[author];
    const diversityPenalty = count === 1 ? 1.0 : count === 2 ? 0.7 : 0.5;

    const feedScore = baseScore * biasWeight * diversityPenalty;

    return {
      tweet: item.tweet,
      classification: item.classification,
      feed_score: Math.round(feedScore * 1000000) / 1000000,
    } as FeedItem;
  });

  scored.sort((a, b) => b.feed_score - a.feed_score);
  return scored.slice(0, limit);
}

export async function fetchBreakdown(
  topic: string,
  hours = 24
): Promise<BreakdownData> {
  const params = new URLSearchParams({ topic, hours: String(hours) });
  const res = await apiFetch(`${API_URL}/api/breakdown?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch breakdown");
  return res.json();
}

export interface AdminFilters {
  political_bent?: string;
  override_only?: boolean;
  low_confidence?: boolean;
  search?: string;
  sort_by?: string;
  limit?: number;
}

export interface AdminStats {
  total: number;
  overrides: number;
  low_confidence: number;
  by_bent: Record<string, { count: number; avg_confidence: number }>;
}

export async function fetchAdminTweets(
  topic: string,
  filters?: AdminFilters
): Promise<{ tweet: TweetData; classification: ClassificationData }[]> {
  const params = new URLSearchParams({ topic });
  if (filters?.political_bent) params.set("political_bent", filters.political_bent);
  if (filters?.override_only) params.set("override_only", "true");
  if (filters?.low_confidence) params.set("low_confidence", "true");
  if (filters?.search) params.set("search", filters.search);
  if (filters?.sort_by) params.set("sort_by", filters.sort_by);
  if (filters?.limit) params.set("limit", String(filters.limit));

  const res = await apiFetch(`${API_URL}/api/admin/tweets?${params}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch admin tweets");
  return res.json();
}

export async function fetchAdminStats(
  topic: string,
): Promise<AdminStats> {
  const p = new URLSearchParams({ topic });
  const res = await apiFetch(`${API_URL}/api/admin/stats?${p}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch admin stats");
  return res.json();
}

export async function submitOverride(
  data: {
    id_str: string;
    override_political_bent: string | null;
    override_intensity_score: number | null;
    override_notes: string;
  }
) {
  const res = await apiFetch(`${API_URL}/api/override`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to submit override");
  return res.json();
}

export async function fetchAccountRules(
  topic: string,
): Promise<Record<string, string>> {
  const res = await apiFetch(`${API_URL}/api/admin/account-rules?topic=${encodeURIComponent(topic)}`, {
    cache: "no-store",
  });
  if (!res.ok) return {};
  return res.json();
}

export async function setAccountRule(
  topic: string,
  screenName: string,
  politicalBent: string,
): Promise<{ status: string; rules: Record<string, string>; affected_tweets: number }> {
  const res = await apiFetch(`${API_URL}/api/admin/account-rules?topic=${encodeURIComponent(topic)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ screen_name: screenName, political_bent: politicalBent }),
  });
  if (!res.ok) throw new Error("Failed to set account rule");
  return res.json();
}

export interface TopicDetail {
  slug: string;
  name: string;
  description: string | null;
  pro_label: string;
  anti_label: string;
  search_query: string | null;
  classification_prompt: string | null;
  intensity_prompt: string | null;
  target_language: string | null;
  target_country: string | null;
  color_scheme: string | null;
  is_active: boolean | null;
  created_at: string | null;
}

export interface PipelineRun {
  id: number;
  ran_at: string | null;
  tweets_fetched: number | null;
  tweets_new: number | null;
  tweets_classified: number | null;
  total_cost_usd: number | null;
  status: string | null;
  error_message: string | null;
}

export async function fetchTopicDetail(slug: string): Promise<TopicDetail> {
  const res = await apiFetch(`${API_URL}/api/topics/${slug}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Topic not found");
  return res.json();
}

export async function updateTopic(
  slug: string,
  data: Partial<{
    topic_name: string;
    description: string;
    pro_label: string;
    anti_label: string;
    search_query: string;
    classification_prompt: string;
    intensity_prompt: string;
    target_language: string;
    target_country: string | null;
    color_scheme: string;
    is_active: boolean;
  }>
): Promise<TopicDetail> {
  const res = await apiFetch(`${API_URL}/api/topics/${slug}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update topic");
  return res.json();
}

export async function deleteTopic(slug: string): Promise<void> {
  const res = await apiFetch(`${API_URL}/api/topics/${slug}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete topic");
}

export async function fetchTopicRuns(slug: string): Promise<PipelineRun[]> {
  const res = await apiFetch(`${API_URL}/api/topics/${slug}/runs`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch pipeline runs");
  return res.json();
}

export async function fetchMyTopics(): Promise<Record<string, string>> {
  const res = await apiFetch(`${API_URL}/api/topics/my`);
  if (!res.ok) return {};
  return res.json();
}

export async function subscribeTopic(slug: string): Promise<void> {
  await apiFetch(`${API_URL}/api/topics/${slug}/subscribe`, { method: "POST" });
}

export async function unsubscribeTopic(slug: string): Promise<void> {
  await apiFetch(`${API_URL}/api/topics/${slug}/subscribe`, { method: "DELETE" });
}
