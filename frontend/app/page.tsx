"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import SentimentDistribution from "@/components/SentimentDistribution";
import TweetCard from "@/components/TweetCard";
import { RawFeedItem, TweetData, ClassificationData } from "@/lib/api";

// Iran War data for the landing page demo — updated from real DB data
const DEMO_ITEMS: RawFeedItem[] = (() => {
  const items: RawFeedItem[] = [];
  // Anti-war tweets (negative intensity scores) — from real 48h data
  const antiScores = [-8,-8,-7,-7,-7,-7,-7,-7,-7,-7,-7,-7,-7,-7,-7,-6,-6,-6,-6,-6,-6,-6,-6,-6,-6,-5,-5,-5,-5,-5,-5,-5,-5,-5,-5,-4,-4,-4,-4,-4,-4,-4,-4,-4,-4,-4,-4,-4,-4,-4,-4,-4,-4,-4,-4,-3,-3,-3,-3,-3,-3,-3,-3,-3,-3,-3,-3,-3,-3,-3,-3];
  for (const score of antiScores) {
    items.push({
      tweet: { id_str: `anti${score}${Math.random()}`, topic_slug: "iran-conflict", created_at: null, screen_name: null, author_name: null, author_bio: null, author_followers: null, full_text: null, likes: 0, retweets: 0, replies: 0, quotes: 0, views: 0, engagement: null, url: null, media: [] },
      classification: { id_str: `anti${score}${Math.random()}`, about_subject: true, political_bent: "anti-war", author_lean: null, classification_basis: null, confidence: 0.9, agreement: null, classification_method: null, votes: null, intensity_score: score, intensity_confidence: null, intensity_reasoning: null, intensity_flag: null, override_flag: false, override_political_bent: null, override_intensity_score: null, override_notes: null, override_at: null, effective_political_bent: "anti-war", effective_intensity_score: score, narrative_frames: null, emotion_mode: null, frame_confidence: null },
    });
  }
  // Pro-war tweets (positive intensity scores) — from real 48h data
  const proScores = [8,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,6,6,6,6,6,6,6,6,6,5,5,5,5,5,5,5,5,5,5,5,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4];
  for (const score of proScores) {
    items.push({
      tweet: { id_str: `pro${score}${Math.random()}`, topic_slug: "iran-conflict", created_at: null, screen_name: null, author_name: null, author_bio: null, author_followers: null, full_text: null, likes: 0, retweets: 0, replies: 0, quotes: 0, views: 0, engagement: null, url: null, media: [] },
      classification: { id_str: `pro${score}${Math.random()}`, about_subject: true, political_bent: "pro-war", author_lean: null, classification_basis: null, confidence: 0.9, agreement: null, classification_method: null, votes: null, intensity_score: score, intensity_confidence: null, intensity_reasoning: null, intensity_flag: null, override_flag: false, override_political_bent: null, override_intensity_score: null, override_notes: null, override_at: null, effective_political_bent: "pro-war", effective_intensity_score: score, narrative_frames: null, emotion_mode: null, frame_confidence: null },
    });
  }
  // Neutral tweets
  for (let i = 0; i < 15; i++) {
    items.push({
      tweet: { id_str: `neutral${i}`, topic_slug: "iran-conflict", created_at: null, screen_name: null, author_name: null, author_bio: null, author_followers: null, full_text: null, likes: 0, retweets: 0, replies: 0, quotes: 0, views: 0, engagement: null, url: null, media: [] },
      classification: { id_str: `neutral${i}`, about_subject: true, political_bent: "neutral", author_lean: null, classification_basis: null, confidence: 0.9, agreement: null, classification_method: null, votes: null, intensity_score: 0, intensity_confidence: null, intensity_reasoning: null, intensity_flag: null, override_flag: false, override_political_bent: null, override_intensity_score: null, override_notes: null, override_at: null, effective_political_bent: "neutral", effective_intensity_score: 0, narrative_frames: null, emotion_mode: null, frame_confidence: null },
    });
  }
  return items;
})();

// Real tweets for the Iran War demo feed — updated from DB
const DEMO_TWEETS: { tweet: TweetData; classification: ClassificationData; score: number }[] = [
  { tweet: { id_str: "d1", topic_slug: "iran-conflict", created_at: "2026-04-25T12:00:00Z", screen_name: "s_m_marandi", author_name: "Seyed Mohammad Marandi", author_bio: "Professor, University of Tehran", author_followers: 520000, full_text: "The Islamic Republic of Iran is fully prepared for war. Everyone should prepare for global economic disruptions if the conflict escalates further.", likes: 8200, retweets: 4100, replies: 1800, quotes: 755, views: 248000, engagement: 14855, url: null, media: [] }, classification: { id_str: "d1", about_subject: true, political_bent: "pro-war", author_lean: null, classification_basis: null, confidence: 0.92, agreement: null, classification_method: null, votes: null, intensity_score: 4, intensity_confidence: null, intensity_reasoning: null, intensity_flag: null, override_flag: false, override_political_bent: null, override_intensity_score: null, override_notes: null, override_at: null, effective_political_bent: "pro-war", effective_intensity_score: 4, narrative_frames: null, emotion_mode: null, frame_confidence: null }, score: 88 },
  { tweet: { id_str: "d2", topic_slug: "iran-conflict", created_at: "2026-04-25T14:00:00Z", screen_name: "RpsAgainstTrump", author_name: "Republicans Against Trump", author_bio: "Holding power accountable", author_followers: 890000, full_text: "President Zelensky: The United States produces about 60, maybe 65, anti-ballistic missiles per month. That is not enough to sustain a prolonged conflict.", likes: 4100, retweets: 2200, replies: 800, quotes: 325, views: 165000, engagement: 7425, url: null, media: [] }, classification: { id_str: "d2", about_subject: true, political_bent: "anti-war", author_lean: null, classification_basis: null, confidence: 0.94, agreement: null, classification_method: null, votes: null, intensity_score: -4, intensity_confidence: null, intensity_reasoning: null, intensity_flag: null, override_flag: false, override_political_bent: null, override_intensity_score: null, override_notes: null, override_at: null, effective_political_bent: "anti-war", effective_intensity_score: -4, narrative_frames: null, emotion_mode: null, frame_confidence: null }, score: 85 },
  { tweet: { id_str: "d3", topic_slug: "iran-conflict", created_at: "2026-04-25T13:00:00Z", screen_name: "JoshHall2024", author_name: "Josh Hall", author_bio: "Political commentator", author_followers: 340000, full_text: "BREAKING: \"Seditious Six\" Democrat Senator Mark Kelly of Arizona has reportedly established a back channel to undermine negotiations with Iran.", likes: 7200, retweets: 3800, replies: 1400, quotes: 481, views: 105000, engagement: 12881, url: null, media: [] }, classification: { id_str: "d3", about_subject: true, political_bent: "pro-war", author_lean: null, classification_basis: null, confidence: 0.90, agreement: null, classification_method: null, votes: null, intensity_score: 8, intensity_confidence: null, intensity_reasoning: null, intensity_flag: null, override_flag: false, override_political_bent: null, override_intensity_score: null, override_notes: null, override_at: null, effective_political_bent: "pro-war", effective_intensity_score: 8, narrative_frames: null, emotion_mode: null, frame_confidence: null }, score: 82 },
  { tweet: { id_str: "d4", topic_slug: "iran-conflict", created_at: "2026-04-25T11:00:00Z", screen_name: "ProjectLincoln", author_name: "The Lincoln Project", author_bio: "Holding those who would undermine democracy accountable.", author_followers: 3100000, full_text: "Trump's war is on day 56. American troops are dying. Gas is $4.17 on average. The stock market is cratering. And Trump is golfing.", likes: 2100, retweets: 1200, replies: 400, quotes: 189, views: 89000, engagement: 3889, url: null, media: [] }, classification: { id_str: "d4", about_subject: true, political_bent: "anti-war", author_lean: null, classification_basis: null, confidence: 0.95, agreement: null, classification_method: null, votes: null, intensity_score: -7, intensity_confidence: null, intensity_reasoning: null, intensity_flag: null, override_flag: false, override_political_bent: null, override_intensity_score: null, override_notes: null, override_at: null, effective_political_bent: "anti-war", effective_intensity_score: -7, narrative_frames: null, emotion_mode: null, frame_confidence: null }, score: 78 },
  { tweet: { id_str: "d5", topic_slug: "iran-conflict", created_at: "2026-04-25T15:00:00Z", screen_name: "AJEnglish", author_name: "Al Jazeera English", author_bio: "News, analysis from the Middle East & worldwide.", author_followers: 11200000, full_text: "Spanish PM Pedro Sanchez has responded to reports that the US may suspend Spain from NATO over its opposition to the Iran conflict.", likes: 2100, retweets: 1100, replies: 300, quotes: 196, views: 142000, engagement: 3696, url: null, media: [] }, classification: { id_str: "d5", about_subject: true, political_bent: "anti-war", author_lean: null, classification_basis: null, confidence: 0.91, agreement: null, classification_method: null, votes: null, intensity_score: -3, intensity_confidence: null, intensity_reasoning: null, intensity_flag: null, override_flag: false, override_political_bent: null, override_intensity_score: null, override_notes: null, override_at: null, effective_political_bent: "anti-war", effective_intensity_score: -3, narrative_frames: null, emotion_mode: null, frame_confidence: null }, score: 72 },
  { tweet: { id_str: "d6", topic_slug: "iran-conflict", created_at: "2026-04-25T10:00:00Z", screen_name: "jacksonhinklle", author_name: "Jackson Hinkle", author_bio: "Political commentator", author_followers: 2800000, full_text: "Reporter: \"The civilian toll of the war you supported is huge. Have you lost any sleep?\" Former advisor: \"I sleep just fine.\"", likes: 2800, retweets: 1400, replies: 500, quotes: 239, views: 98000, engagement: 4939, url: null, media: [] }, classification: { id_str: "d6", about_subject: true, political_bent: "anti-war", author_lean: null, classification_basis: null, confidence: 0.93, agreement: null, classification_method: null, votes: null, intensity_score: -4, intensity_confidence: null, intensity_reasoning: null, intensity_flag: null, override_flag: false, override_political_bent: null, override_intensity_score: null, override_notes: null, override_at: null, effective_political_bent: "anti-war", effective_intensity_score: -4, narrative_frames: null, emotion_mode: null, frame_confidence: null }, score: 75 },
  { tweet: { id_str: "d7", topic_slug: "iran-conflict", created_at: "2026-04-25T16:00:00Z", screen_name: "DemocraticWins", author_name: "Democratic Wins", author_bio: "Tracking Democratic wins across America", author_followers: 420000, full_text: "BREAKING: Stunning new polling just revealed that 30% of Republican voters oppose Trump's handling of the Iran conflict.", likes: 1800, retweets: 900, replies: 300, quotes: 139, views: 67000, engagement: 3139, url: null, media: [] }, classification: { id_str: "d7", about_subject: true, political_bent: "anti-war", author_lean: null, classification_basis: null, confidence: 0.92, agreement: null, classification_method: null, votes: null, intensity_score: -4, intensity_confidence: null, intensity_reasoning: null, intensity_flag: null, override_flag: false, override_political_bent: null, override_intensity_score: null, override_notes: null, override_at: null, effective_political_bent: "anti-war", effective_intensity_score: -4, narrative_frames: null, emotion_mode: null, frame_confidence: null }, score: 70 },
  { tweet: { id_str: "d8", topic_slug: "iran-conflict", created_at: "2026-04-25T09:00:00Z", screen_name: "FurkanGozukara", author_name: "Furkan Gozukara", author_bio: "AI researcher, news commentator", author_followers: 180000, full_text: "Fox News confirms Pentagon has deployed an unprecedented three aircraft carriers to the Persian Gulf region amid escalating tensions.", likes: 1400, retweets: 800, replies: 250, quotes: 110, views: 54000, engagement: 2560, url: null, media: [] }, classification: { id_str: "d8", about_subject: true, political_bent: "anti-war", author_lean: null, classification_basis: null, confidence: 0.88, agreement: null, classification_method: null, votes: null, intensity_score: -7, intensity_confidence: null, intensity_reasoning: null, intensity_flag: null, override_flag: false, override_political_bent: null, override_intensity_score: null, override_notes: null, override_at: null, effective_political_bent: "anti-war", effective_intensity_score: -7, narrative_frames: null, emotion_mode: null, frame_confidence: null }, score: 68 },
  { tweet: { id_str: "d10", topic_slug: "iran-conflict", created_at: "2026-04-02T16:30:00Z", screen_name: "DanCrenshawTX", author_name: "Dan Crenshaw", author_bio: "Congressman TX-02. Former Navy SEAL.", author_followers: 2100000, full_text: "Iran has killed hundreds of American service members through its proxies. This is not about starting a war — it's about finishing one they started long ago.", likes: 24300, retweets: 6200, replies: 2800, quotes: 890, views: 480000, engagement: 34190, url: null, media: [] }, classification: { id_str: "d10", about_subject: true, political_bent: "pro-war", author_lean: null, classification_basis: null, confidence: 0.91, agreement: null, classification_method: null, votes: null, intensity_score: 6, intensity_confidence: null, intensity_reasoning: null, intensity_flag: null, override_flag: false, override_political_bent: null, override_intensity_score: null, override_notes: null, override_at: null, effective_political_bent: "pro-war", effective_intensity_score: 6, narrative_frames: null, emotion_mode: null, frame_confidence: null }, score: 76 },
  { tweet: { id_str: "d11", topic_slug: "iran-conflict", created_at: "2026-04-02T12:45:00Z", screen_name: "AOC", author_name: "Alexandria Ocasio-Cortez", author_bio: "US Representative, NY-14.", author_followers: 13200000, full_text: "No congressional authorization. No exit strategy. No plan for the day after. But sure, let's bomb another country and call it leadership.", likes: 41000, retweets: 11500, replies: 5200, quotes: 2300, views: 1900000, engagement: 60000, url: null, media: [] }, classification: { id_str: "d11", about_subject: true, political_bent: "anti-war", author_lean: null, classification_basis: null, confidence: 0.94, agreement: null, classification_method: null, votes: null, intensity_score: -7, intensity_confidence: null, intensity_reasoning: null, intensity_flag: null, override_flag: false, override_political_bent: null, override_intensity_score: null, override_notes: null, override_at: null, effective_political_bent: "anti-war", effective_intensity_score: -7, narrative_frames: null, emotion_mode: null, frame_confidence: null }, score: 90 },
  { tweet: { id_str: "d12", topic_slug: "iran-conflict", created_at: "2026-04-02T17:00:00Z", screen_name: "AP", author_name: "The Associated Press", author_bio: "Advancing the power of facts.", author_followers: 16800000, full_text: "DEVELOPING: Iran's foreign minister warns of 'severe consequences' following U.S. strikes. UN Security Council emergency session called for tomorrow.", likes: 12400, retweets: 7200, replies: 980, quotes: 420, views: 980000, engagement: 21000, url: null, media: [] }, classification: { id_str: "d12", about_subject: true, political_bent: "neutral", author_lean: null, classification_basis: null, confidence: 0.96, agreement: null, classification_method: null, votes: null, intensity_score: 0, intensity_confidence: null, intensity_reasoning: null, intensity_flag: null, override_flag: false, override_political_bent: null, override_intensity_score: null, override_notes: null, override_at: null, effective_political_bent: "neutral", effective_intensity_score: 0, narrative_frames: null, emotion_mode: null, frame_confidence: null }, score: 68 },
];

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface PulseTopic {
  slug: string;
  name: string;
  pro_label: string;
  anti_label: string;
  pro_pct: number;
  anti_pct: number;
  total_engagement: number;
}

interface PulseResponse {
  trending: PulseTopic[];
  featured_tweet: { text: string; author: string | null; author_name: string; url: string | null } | null;
  keywords: { word: string; count: number }[];
}

function MiniDonut({ segments, colors }: { segments: { name: string; pct: number }[]; colors: string[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const size = 160, cx = size / 2, cy = size / 2, r = 60, inner = 35;
  let cumAngle = -90;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-3 font-medium">Share of engagement</p>
      <div className="flex items-center gap-4">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {segments.map((seg, i) => {
              const angle = (seg.pct / 100) * 360;
              const startAngle = cumAngle;
              const endAngle = cumAngle + angle;
              cumAngle = endAngle;
              const startRad = (startAngle * Math.PI) / 180;
              const endRad = (endAngle * Math.PI) / 180;
              const largeArc = angle > 180 ? 1 : 0;
              const x1 = cx + r * Math.cos(startRad), y1 = cy + r * Math.sin(startRad);
              const x2 = cx + r * Math.cos(endRad), y2 = cy + r * Math.sin(endRad);
              const ix1 = cx + inner * Math.cos(endRad), iy1 = cy + inner * Math.sin(endRad);
              const ix2 = cx + inner * Math.cos(startRad), iy2 = cy + inner * Math.sin(startRad);
              const d = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${inner} ${inner} 0 ${largeArc} 0 ${ix2} ${iy2} Z`;
              return (
                <path key={i} d={d} fill={colors[i % colors.length]}
                  opacity={hovered === null || hovered === i ? 0.85 : 0.3}
                  className="transition-opacity duration-150 cursor-pointer"
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                />
              );
            })}
          </svg>
          {hovered !== null && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-lg font-bold text-gray-100">{segments[hovered].pct}%</span>
              <span className="text-[9px] text-gray-400 text-center max-w-[60px] leading-tight">{segments[hovered].name}</span>
            </div>
          )}
        </div>
        <div className="space-y-1">
          {segments.map((seg, i) => (
            <div key={i}
              className={`flex items-center gap-1.5 transition-opacity duration-150 ${hovered !== null && hovered !== i ? "opacity-40" : ""}`}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}>
              <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
              <span className="text-[10px] text-gray-400">{seg.name}</span>
              <span className="text-[10px] text-gray-600">{seg.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PulsePreview() {
  const [pulse, setPulse] = useState<PulseResponse | null>(null);

  useEffect(() => {
    fetch(`${API}/api/pulse`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setPulse(d))
      .catch(() => {});
  }, []);

  if (!pulse || pulse.trending.length === 0) {
    return (
      <section className="max-w-5xl mx-auto px-5 sm:px-8 py-8">
        <Link href="/pulse" className="block bg-gray-900 border border-gray-800 rounded-xl p-5 sm:p-6 hover:border-gray-600 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-100">Today&apos;s Pulse</h2>
              <p className="text-sm text-gray-400 mt-1">See what X is debating right now — trending topics, real-time sentiment, and the top posts from both sides</p>
            </div>
            <span className="text-gray-500 text-xl shrink-0 ml-4">&rarr;</span>
          </div>
        </Link>
      </section>
    );
  }

  const colors = ["bg-blue-500/20 text-blue-300", "bg-red-500/20 text-red-300", "bg-green-500/20 text-green-300", "bg-yellow-500/20 text-yellow-300", "bg-purple-500/20 text-purple-300"];
  const donutColors = ["#3b82f6", "#ef4444", "#22c55e", "#eab308", "#a855f7", "#f97316", "#06b6d4"];
  const totalEng = pulse.trending.reduce((s, t) => s + t.total_engagement, 0) || 1;
  const segments = pulse.trending.slice(0, 7).map(t => ({
    name: t.name, pct: Math.round(t.total_engagement / totalEng * 100),
  }));

  // Donut SVG
  const size = 160;
  const cx = size / 2, cy = size / 2, r = 60, inner = 35;
  let cumAngle = -90;

  // Takeaway
  const loudest = pulse.trending.reduce((a, b) => a.total_engagement > b.total_engagement ? a : b);
  const mostContested = pulse.trending.reduce((a, b) => Math.abs(a.anti_pct - a.pro_pct) < Math.abs(b.anti_pct - b.pro_pct) ? a : b);
  const takeaway = loudest.slug === mostContested.slug
    ? `${loudest.name} is dominating X today — and it's the most contested debate.`
    : `${loudest.name} is generating the most engagement on X today, while ${mostContested.name} is the most contested debate.`;

  return (
    <section className="max-w-5xl mx-auto px-5 sm:px-8 py-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-100">What X is debating right now</h2>
        <Link href="/pulse" className="text-sm text-blue-400 hover:text-blue-300 transition-colors shrink-0">
          Full Pulse &rarr;
        </Link>
      </div>

      {/* Topic pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        {pulse.trending.slice(0, 7).map((t, i) => (
          <Link key={t.slug} href="/pulse"
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${colors[i % colors.length]}`}>
            {t.name}
          </Link>
        ))}
      </div>

      {/* Takeaway */}
      <p className="text-sm sm:text-base text-gray-300 mb-5">{takeaway}</p>

      {/* Donut + featured tweet side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Mini donut */}
        <MiniDonut segments={segments} colors={donutColors} />

        {/* Featured tweet */}
        {pulse.featured_tweet && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-3 font-medium">Most engaged X post today</p>
            <a href={pulse.featured_tweet.url || "#"} target="_blank" rel="noopener noreferrer"
              className="block hover:bg-gray-800/30 rounded -mx-1 px-1 py-0.5 transition-colors">
              <blockquote className="text-sm text-gray-300 leading-relaxed line-clamp-4 mb-2">
                &ldquo;{pulse.featured_tweet.text}&rdquo;
              </blockquote>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-400">{pulse.featured_tweet.author_name}</span>
                {pulse.featured_tweet.author && <span className="text-xs text-gray-600">{pulse.featured_tweet.author}</span>}
              </div>
            </a>
          </div>
        )}
      </div>

      {/* Word cloud preview */}
      {pulse.keywords && pulse.keywords.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-x-2.5 gap-y-1 justify-center">
          {pulse.keywords.slice(0, 15).map((k, i) => {
            const maxC = pulse.keywords[0].count || 1;
            const fontSize = Math.round(10 + (k.count / maxC) * 12);
            const wordColors = ["text-blue-400", "text-red-400", "text-green-400", "text-yellow-400", "text-purple-400"];
            return (
              <span key={i} className={`${wordColors[i % wordColors.length]} font-medium opacity-70`} style={{ fontSize }}>
                {k.word}
              </span>
            );
          })}
        </div>
      )}

      <div className="text-center mt-5">
        <Link href="/pulse" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
          See the full Pulse with detailed analysis &rarr;
        </Link>
      </div>
    </section>
  );
}

export default function LandingPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const [demoBias, setDemoBias] = useState(0);
  const [landingData, setLandingData] = useState<{
    topic_name?: string; anti_label?: string; pro_label?: string; total_tweets?: number;
    echo_chamber?: { score: number; shared_sources: string; shared_frames: string };
    frames?: { key: string; label: string; anti_pct: number; pro_pct: number }[];
  } | null>(null);

  // Dynamic trending topic feed
  const [liveFeedItems, setLiveFeedItems] = useState<RawFeedItem[]>([]);
  const [liveTopic, setLiveTopic] = useState<{ slug: string; name: string; pro_label: string; anti_label: string } | null>(null);

  useEffect(() => {
    const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    fetch(`${API}/api/demo/landing`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        if (data && (data.echo_chamber || data.frames)) {
          setLandingData(data);
        }
      })
      .catch(e => console.error("[Landing] Demo data fetch failed:", e));

    // Fetch hottest trending topic's feed for the live demo
    fetch(`${API}/api/pulse`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(pulse => {
        if (!pulse?.trending?.length) return;
        // Pick the hottest trending topic that has a real page
        const hot = pulse.trending.find((t: { has_page: boolean; url?: string }) => t.has_page && t.url);
        if (!hot) return;
        const slug = hot.url.replace("/analytics/", "");
        setLiveTopic({ slug, name: hot.name, pro_label: hot.pro_label, anti_label: hot.anti_label });
        // Fetch its feed — use wider window since trending events span days
        return fetch(`${API}/api/feed/all?topic=${slug}&hours=168`);
      })
      .then(r => r?.ok ? r.json() : null)
      .then(items => {
        if (items && items.length > 3) setLiveFeedItems(items);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace("/dashboard");
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || isSignedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    );
  }

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": "https://www.dividedview.com/#organization",
      "name": "BrooklynEcho LLC",
      "url": "https://www.dividedview.com",
      "logo": "https://www.dividedview.com/favicon.svg",
      "description": "BrooklynEcho LLC builds DividedView, an AI-powered political media and brand sentiment analysis platform.",
      "contactPoint": {
        "@type": "ContactPoint",
        "email": "support@dividedview.com",
        "contactType": "customer support",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": "https://www.dividedview.com/#website",
      "name": "DividedView",
      "url": "https://www.dividedview.com",
      "publisher": { "@id": "https://www.dividedview.com/#organization" },
      "description": "AI-powered political media and brand sentiment analysis showing how each side frames the same events.",
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "DividedView",
      "applicationCategory": "AnalyticsApplication",
      "operatingSystem": "Web",
      "description": "DividedView uses AI to analyze real posts from X on any political topic, showing how each side frames the same events. Simulated feeds, narrative analysis, echo chamber scoring, and geographic sentiment mapping.",
      "url": "https://www.dividedview.com",
      "publisher": { "@id": "https://www.dividedview.com/#organization" },
      "offers": [
        {
          "@type": "Offer",
          "price": "0",
          "priceCurrency": "USD",
          "description": "Free plan with 5 preloaded topics, 1 custom topic, and 3 data refreshes per month",
        },
        {
          "@type": "Offer",
          "price": "10",
          "priceCurrency": "USD",
          "description": "Pro plan with 100 custom topics, 100 runs per month, and priority support",
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is DividedView?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "DividedView is an AI-powered platform that analyzes real posts from X (formerly Twitter) on political topics and brands. It classifies posts by political leaning or sentiment intensity, and shows how each side frames the same events through simulated feeds, narrative analysis, and echo chamber scoring.",
          },
        },
        {
          "@type": "Question",
          "name": "How does DividedView detect echo chambers?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "DividedView calculates an Echo Chamber Score by measuring the overlap in sources, arguments, and narrative frames between opposing perspectives on any topic. A low score indicates a strong echo chamber where each side sees completely different content and framing.",
          },
        },
        {
          "@type": "Question",
          "name": "Is DividedView free to use?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. DividedView offers a free plan with access to 5 preloaded topics, 1 custom topic, and 3 data refreshes per month. A Pro plan is available at $10/month for 100 custom topics, 100 runs, and priority support.",
          },
        },
        {
          "@type": "Question",
          "name": "What topics can I analyze on DividedView?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "DividedView supports any political topic or public policy issue (e.g., immigration, AI regulation, elections) as well as company and brand sentiment analysis (e.g., Tesla, Nike, Meta). You can analyze any subject that people discuss on X.",
          },
        },
        {
          "@type": "Question",
          "name": "How does the simulated feed work?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "DividedView's simulated feed pulls real posts from X and reorganizes them using a multi-signal scoring algorithm that accounts for political bias, engagement, source authority, recency, and content type. A bias slider lets you see how different political leanings change which posts surface first.",
          },
        },
      ],
    },
  ];

  return (
    <div className="min-h-screen overflow-x-hidden">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {/* Nav */}
      <nav className="bg-gray-950/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-5 flex items-center justify-between">
          <div className="text-base font-semibold tracking-tight text-gray-100">DividedView</div>
          <div className="flex items-center gap-4">
            <Link
              href="/sign-in"
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/dashboard"
              className="text-sm px-4 py-1.5 bg-white text-gray-950 rounded-md font-medium hover:bg-gray-200 transition-colors"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-5 sm:px-8 pt-10 sm:pt-20 pb-8 sm:pb-16">
        <div className="max-w-2xl">
          <p className="text-sm text-gray-500 mb-2 sm:mb-3 tracking-wide hidden sm:block">Media sentiment analysis</p>
          <h1 className="text-3xl sm:text-[3.5rem] font-bold leading-[1.1] mb-3 sm:mb-5 tracking-tight">
            The same story.<br />
            Two different realities.
          </h1>
          <p className="text-sm sm:text-lg text-gray-400 mb-5 sm:mb-8 leading-relaxed max-w-lg">
            We simulate X feeds by political bias, using real posts classified by AI to reveal how each side experiences the platform differently.
          </p>
          <div className="flex items-center gap-3 sm:gap-4">
            <Link
              href="/dashboard"
              className="inline-block px-5 sm:px-6 py-2 sm:py-2.5 bg-white text-gray-950 rounded-md font-medium hover:bg-gray-200 transition-colors text-sm"
            >
              Try it free
            </Link>
            <Link
              href="/pricing"
              className="inline-block px-5 sm:px-6 py-2 sm:py-2.5 border border-gray-600 text-gray-300 rounded-md font-medium hover:border-gray-400 hover:text-white transition-colors text-sm"
            >
              Pro is $10/mo
            </Link>
          </div>
          <p className="text-xs text-gray-500 mt-2">No sign-up required to try it out</p>
        </div>

        <p className="text-xs sm:text-sm text-gray-500 mt-6 sm:mt-14 mb-2 sm:mb-3">Enter any topic &rarr; AI classifies thousands of real posts &rarr; Explore the results</p>
        <p className="text-base sm:text-xl text-gray-300 mb-4 sm:mb-6 font-medium">Slide to see how a user&apos;s political bias shapes their simulated feed.</p>

        {/* Interactive demo — live trending topic or Iran War fallback */}
        {(() => {
          const useLive = liveFeedItems.length > 3 && liveTopic;
          const feedItems = useLive ? liveFeedItems : DEMO_ITEMS;
          const proLabel = useLive ? liveTopic!.pro_label : "Pro-War";
          const antiLabel = useLive ? liveTopic!.anti_label : "Anti-War";
          const topicName = useLive ? liveTopic!.name : "Iran War";
          const topicSlug = useLive ? liveTopic!.slug : "iran-conflict";
          const proBent = proLabel.toLowerCase().replace(/\s+/g, "-");
          const antiBent = antiLabel.toLowerCase().replace(/\s+/g, "-");

          // Sort tweets for the feed cards (only show DEMO_TWEETS for Iran fallback, or top live tweets)
          const feedTweets = useLive
            ? liveFeedItems
                .filter(item => item.classification.about_subject)
                .sort((a, b) => {
                  const engA = a.tweet.engagement || 0;
                  const engB = b.tweet.engagement || 0;
                  const biasBoostA = (() => {
                    const bent = a.classification.effective_political_bent || "";
                    if (demoBias < 0 && bent === antiBent) return Math.abs(demoBias) * 5;
                    if (demoBias > 0 && bent === proBent) return demoBias * 5;
                    return 0;
                  })();
                  const biasBoostB = (() => {
                    const bent = b.classification.effective_political_bent || "";
                    if (demoBias < 0 && bent === antiBent) return Math.abs(demoBias) * 5;
                    if (demoBias > 0 && bent === proBent) return demoBias * 5;
                    return 0;
                  })();
                  return (engB + biasBoostB) - (engA + biasBoostA);
                })
                .slice(0, 8)
            : [...DEMO_TWEETS].sort((a, b) => {
                const scoreA = (() => {
                  const bent = a.classification.effective_political_bent || "";
                  const intensity = Math.abs(a.classification.effective_intensity_score || 0);
                  if (demoBias === 0) return a.score;
                  if (demoBias < 0 && bent === "anti-war") return a.score + Math.abs(demoBias) * intensity * 2;
                  if (demoBias > 0 && bent === "pro-war") return a.score + demoBias * intensity * 2;
                  if (bent === "neutral") return a.score * 0.8;
                  return a.score * Math.max(0.2, 1 - Math.abs(demoBias) * 0.08);
                })();
                const scoreB = (() => {
                  const bent = b.classification.effective_political_bent || "";
                  const intensity = Math.abs(b.classification.effective_intensity_score || 0);
                  if (demoBias === 0) return b.score;
                  if (demoBias < 0 && bent === "anti-war") return b.score + Math.abs(demoBias) * intensity * 2;
                  if (demoBias > 0 && bent === "pro-war") return b.score + demoBias * intensity * 2;
                  if (bent === "neutral") return b.score * 0.8;
                  return b.score * Math.max(0.2, 1 - Math.abs(demoBias) * 0.08);
                })();
                return scoreB - scoreA;
              });

          return (
            <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl overflow-hidden">
              <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-1">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs sm:text-sm text-gray-300 font-semibold">Simulated X Feed — {topicName}</div>
                    <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">This reconstruction shows how the same posts get prioritized differently based on political leaning</p>
                  </div>
                  {useLive && (
                    <Link href={`/analytics/${topicSlug}`} className="text-[10px] text-blue-400 hover:text-blue-300 shrink-0 ml-2">
                      Full analysis →
                    </Link>
                  )}
                </div>
              </div>

              <div className="px-4 sm:px-5">
                <SentimentDistribution
                  items={feedItems}
                  antiLabel={antiLabel}
                  proLabel={proLabel}
                  bias={demoBias}
                  onChange={setDemoBias}
                  hideTitle
                />
              </div>

              <div className="px-4 sm:px-5 pb-4 sm:pb-5">
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 scrollbar-thin">
                  {feedTweets.map((item) => (
                    <TweetCard
                      key={item.tweet.id_str}
                      tweet={item.tweet}
                      classification={item.classification}
                      proLabel={proLabel}
                      antiLabel={antiLabel}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Live analytics panels */}
        {(() => {
          const ec = landingData?.echo_chamber;
          const frames = landingData?.frames;
          const aL = landingData?.anti_label || "Anti-War";
          const pL = landingData?.pro_label || "Pro-War";

          return (
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Echo Chamber Score */}
              <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-4 flex flex-col">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-medium">Echo Chamber Score</div>
                <div className="text-xs text-gray-400 mb-5">{landingData?.topic_name || "Iran War"}</div>
                <div className="flex-1 flex flex-col items-center justify-center">
                  <div className="text-5xl font-bold text-orange-400 mb-1">{ec ? `${ec.score}%` : "..."}</div>
                  <div className="text-xs text-gray-500 mb-4">overlap between sides</div>
                  <div className="w-full max-w-[200px] h-2 rounded-full bg-gray-800 mb-1.5">
                    <div className="h-full rounded-full bg-gradient-to-r from-red-500 via-orange-400 to-green-500" style={{ width: `${ec?.score || 0}%` }} />
                  </div>
                  <div className="flex justify-between w-full max-w-[200px] text-[9px] text-gray-600 mb-6">
                    <span>Echo chamber</span>
                    <span>Shared conversation</span>
                  </div>
                  <div className="w-full space-y-2.5">
                    {[
                      { label: "Shared sources", value: ec?.shared_sources || "...", sub: "publishers" },
                      { label: "Shared arguments", value: ec?.shared_frames || "...", sub: "narrative frames" },
                    ].map((m) => (
                      <div key={m.label} className="flex items-center justify-between">
                        <span className="text-[11px] text-gray-400">{m.label}</span>
                        <div className="text-right">
                          <span className="text-[11px] text-gray-200 font-medium">{m.value}</span>
                          <span className="text-[9px] text-gray-600 ml-1">{m.sub}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* What Each Side Argues */}
              <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-4 flex flex-col">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-medium">What Each Side Argues</div>
                <div className="flex items-center justify-between mb-2 mt-1">
                  <span className="text-[9px] text-blue-400">{aL}</span>
                  <span className="text-[9px] text-red-400">{pL}</span>
                </div>
                <div className="flex-1 flex flex-col justify-center space-y-3">
                  {(frames || []).map((f) => (
                    <div key={f.key} className="flex items-center gap-1">
                      <div className="w-[33%] flex justify-end">
                        <div className="h-4 bg-blue-500/40 rounded-l-sm" style={{ width: `${f.anti_pct}%` }} />
                      </div>
                      <div className="w-[34%] text-center">
                        <span className="text-[10px] text-gray-500 whitespace-nowrap">{f.label}</span>
                      </div>
                      <div className="w-[33%] flex justify-start">
                        <div className="h-4 bg-red-500/40 rounded-r-sm" style={{ width: `${f.pro_pct}%` }} />
                      </div>
                    </div>
                  ))}
                  {!frames && <p className="text-xs text-gray-600 text-center py-4">Loading...</p>}
                </div>
              </div>
            </div>
          );
        })()}
        <p className="text-[10px] text-gray-600 text-center mt-3">Live data from Iran War analysis</p>
      </section>

      {/* Pulse Preview */}
      <PulsePreview />

      {/* FAQ Section */}
      <section className="max-w-3xl mx-auto px-5 sm:px-8 py-16">
        <h2 className="text-2xl font-bold text-center mb-10">Frequently Asked Questions</h2>
        <div className="space-y-4">
          {[
            { q: "What is DividedView?", a: "DividedView is an AI-powered platform that analyzes real posts from X (formerly Twitter) on any political topic or brand. It classifies posts by political leaning or consumer sentiment, then shows how each side frames the same events through simulated feeds, narrative analysis, and echo chamber scoring." },
            { q: "How does the simulated feed work?", a: "DividedView pulls real posts from X and reorganizes them using a multi-signal scoring algorithm that factors in political bias, engagement, source authority, recency, and content type. A bias slider lets you see how different leanings change which posts surface first." },
            { q: "How does DividedView detect echo chambers?", a: "DividedView calculates an Echo Chamber Score by measuring the overlap in sources, arguments, and narrative frames between opposing perspectives. A low score indicates a strong echo chamber where each side sees completely different content." },
            { q: "Can I analyze companies and brands?", a: "Yes. DividedView supports both political topics and brand sentiment analysis. For companies, it classifies posts as positive or negative consumer sentiment, with frames like product quality, customer service, and pricing." },
            { q: "What does DividedView show for each topic?", a: "For every political topic, DividedView surfaces the main arguments each side is making, the top accounts amplifying them, narrative overlap (echo chamber score), and how engagement differs between perspectives." },
            { q: "Is DividedView free?", a: "Yes. The free plan includes 5 preloaded topics, 1 custom topic, and 3 data refreshes per month. A Pro plan is available at $10/month for 100 custom topics and 100 runs." },
          ].map(({ q, a }) => (
            <details key={q} className="bg-gray-900 border border-gray-800 rounded-xl group">
              <summary className="px-5 py-4 cursor-pointer select-none text-sm font-medium text-gray-200 hover:text-white transition-colors flex items-center justify-between">
                {q}
                <span className="text-gray-600 group-open:rotate-45 transition-transform text-lg ml-2">+</span>
              </summary>
              <p className="px-5 pb-4 text-sm text-gray-400 leading-relaxed -mt-1">{a}</p>
            </details>
          ))}
        </div>
        <div className="text-center mt-12">
          <p className="text-gray-500 text-sm mb-4">See what both sides are saying. Free to start, no credit card required.</p>
          <Link
            href="/dashboard"
            className="inline-block px-6 py-2.5 bg-white text-gray-950 rounded-md font-medium hover:bg-gray-200 transition-colors text-sm"
          >
            Get started
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800/30 py-8">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-600">
          <div>&copy; 2026 BrooklynEcho LLC. All rights reserved.</div>
          <div className="flex gap-5">
            <Link href="/about" className="hover:text-gray-400 transition-colors">About</Link>
            <Link href="/pricing" className="hover:text-gray-400 transition-colors">Pricing</Link>
            <Link href="/privacy" className="hover:text-gray-400 transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-gray-400 transition-colors">Terms</Link>
            <a href="mailto:support@dividedview.com" className="hover:text-gray-400 transition-colors">Support</a>
            <Link href="/sign-in" className="hover:text-gray-400 transition-colors">Log in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
