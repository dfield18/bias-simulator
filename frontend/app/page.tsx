"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import SentimentDistribution from "@/components/SentimentDistribution";
import TweetCard from "@/components/TweetCard";
import { RawFeedItem, TweetData, ClassificationData } from "@/lib/api";

// Sample Iran War data for the landing page demo
const DEMO_ITEMS: RawFeedItem[] = (() => {
  const items: RawFeedItem[] = [];
  // Anti-war tweets (negative intensity scores)
  const antiScores = [-8,-7,-7,-6,-6,-6,-5,-5,-5,-5,-4,-4,-4,-4,-4,-3,-3,-3,-3,-3,-3,-2,-2,-2,-2,-2,-1,-1,-1,-1];
  for (const score of antiScores) {
    items.push({
      tweet: { id_str: `anti${score}${Math.random()}`, topic_slug: "iran-conflict", created_at: null, screen_name: null, author_name: null, author_bio: null, author_followers: null, full_text: null, likes: 0, retweets: 0, replies: 0, quotes: 0, views: 0, engagement: null, url: null, media: [] },
      classification: { id_str: `anti${score}${Math.random()}`, about_subject: true, political_bent: "anti-war", author_lean: null, classification_basis: null, confidence: 0.9, agreement: null, classification_method: null, votes: null, intensity_score: score, intensity_confidence: null, intensity_reasoning: null, intensity_flag: null, override_flag: false, override_political_bent: null, override_intensity_score: null, override_notes: null, override_at: null, effective_political_bent: "anti-war", effective_intensity_score: score, narrative_frames: null, emotion_mode: null, frame_confidence: null },
    });
  }
  // Pro-war tweets (positive intensity scores)
  const proScores = [8,7,7,6,6,6,5,5,5,5,4,4,4,4,3,3,3,3,3,2,2,2,2,1,1,1];
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

// Sample tweets for the Iran War demo feed
const DEMO_TWEETS: { tweet: TweetData; classification: ClassificationData; score: number }[] = [
  { tweet: { id_str: "d1", topic_slug: "iran-conflict", created_at: "2026-04-02T14:00:00Z", screen_name: "BBCBreaking", author_name: "BBC Breaking News", author_bio: "Breaking news alerts from the BBC", author_followers: 48200000, full_text: "Israeli forces launch coordinated strikes across multiple Iranian military installations, marking the largest escalation since January.", likes: 42300, retweets: 18200, replies: 3100, quotes: 890, views: 2100000, engagement: 64490, url: null, media: [] }, classification: { id_str: "d1", about_subject: true, political_bent: "neutral", author_lean: null, classification_basis: null, confidence: 0.95, agreement: null, classification_method: null, votes: null, intensity_score: 0, intensity_confidence: null, intensity_reasoning: null, intensity_flag: null, override_flag: false, override_political_bent: null, override_intensity_score: null, override_notes: null, override_at: null, effective_political_bent: "neutral", effective_intensity_score: 0, narrative_frames: null, emotion_mode: null, frame_confidence: null }, score: 95 },
  { tweet: { id_str: "d2", topic_slug: "iran-conflict", created_at: "2026-04-02T15:30:00Z", screen_name: "SenTedCruz", author_name: "Ted Cruz", author_bio: "U.S. Senator for Texas", author_followers: 5400000, full_text: "Iran has been the world's leading state sponsor of terror for decades. President Trump is right to respond with overwhelming force. Peace through strength.", likes: 31200, retweets: 8900, replies: 4200, quotes: 1200, views: 890000, engagement: 45500, url: null, media: [] }, classification: { id_str: "d2", about_subject: true, political_bent: "pro-war", author_lean: null, classification_basis: null, confidence: 0.92, agreement: null, classification_method: null, votes: null, intensity_score: 7, intensity_confidence: null, intensity_reasoning: null, intensity_flag: null, override_flag: false, override_political_bent: null, override_intensity_score: null, override_notes: null, override_at: null, effective_political_bent: "pro-war", effective_intensity_score: 7, narrative_frames: null, emotion_mode: null, frame_confidence: null }, score: 88 },
  { tweet: { id_str: "d3", topic_slug: "iran-conflict", created_at: "2026-04-02T13:00:00Z", screen_name: "RoKhanna", author_name: "Ro Khanna", author_bio: "Rep. CA-17. Fighting for an economy that works for everyone.", author_followers: 1200000, full_text: "Congress has not authorized military action against Iran. The President does not have a blank check for war. We need diplomacy, not another endless conflict in the Middle East.", likes: 28100, retweets: 9400, replies: 2100, quotes: 780, views: 650000, engagement: 40380, url: null, media: [] }, classification: { id_str: "d3", about_subject: true, political_bent: "anti-war", author_lean: null, classification_basis: null, confidence: 0.94, agreement: null, classification_method: null, votes: null, intensity_score: -6, intensity_confidence: null, intensity_reasoning: null, intensity_flag: null, override_flag: false, override_political_bent: null, override_intensity_score: null, override_notes: null, override_at: null, effective_political_bent: "anti-war", effective_intensity_score: -6, narrative_frames: null, emotion_mode: null, frame_confidence: null }, score: 85 },
  { tweet: { id_str: "d4", topic_slug: "iran-conflict", created_at: "2026-04-02T16:00:00Z", screen_name: "FoxNews", author_name: "Fox News", author_bio: "Follow America's #1 cable news network", author_followers: 24100000, full_text: "BREAKING: Pentagon confirms successful strikes on Iranian nuclear enrichment facilities. Defense Secretary calls it a 'decisive response to years of provocations.'", likes: 38900, retweets: 12300, replies: 5600, quotes: 2100, views: 1800000, engagement: 58900, url: null, media: [] }, classification: { id_str: "d4", about_subject: true, political_bent: "pro-war", author_lean: null, classification_basis: null, confidence: 0.88, agreement: null, classification_method: null, votes: null, intensity_score: 5, intensity_confidence: null, intensity_reasoning: null, intensity_flag: null, override_flag: false, override_political_bent: null, override_intensity_score: null, override_notes: null, override_at: null, effective_political_bent: "pro-war", effective_intensity_score: 5, narrative_frames: null, emotion_mode: null, frame_confidence: null }, score: 82 },
  { tweet: { id_str: "d5", topic_slug: "iran-conflict", created_at: "2026-04-02T12:00:00Z", screen_name: "tabornici", author_name: "Nic Taborn", author_bio: "Defense analyst. Former DoD.", author_followers: 89000, full_text: "The strikes on Iran's nuclear facilities are significant but the real question is what happens next. Escalation ladder is steep and there is no clear off-ramp.", likes: 4200, retweets: 1800, replies: 340, quotes: 210, views: 180000, engagement: 6550, url: null, media: [] }, classification: { id_str: "d5", about_subject: true, political_bent: "neutral", author_lean: null, classification_basis: null, confidence: 0.91, agreement: null, classification_method: null, votes: null, intensity_score: 1, intensity_confidence: null, intensity_reasoning: null, intensity_flag: null, override_flag: false, override_political_bent: null, override_intensity_score: null, override_notes: null, override_at: null, effective_political_bent: "neutral", effective_intensity_score: 1, narrative_frames: null, emotion_mode: null, frame_confidence: null }, score: 70 },
  { tweet: { id_str: "d6", topic_slug: "iran-conflict", created_at: "2026-04-02T14:45:00Z", screen_name: "IlhanMN", author_name: "Ilhan Omar", author_bio: "U.S. Congresswoman. Mom. Refugee.", author_followers: 3200000, full_text: "We learned nothing from Iraq. Nothing from Afghanistan. Nothing from Libya. And now we are sleepwalking into another catastrophic war. This must stop.", likes: 22100, retweets: 7800, replies: 3400, quotes: 920, views: 540000, engagement: 34220, url: null, media: [] }, classification: { id_str: "d6", about_subject: true, political_bent: "anti-war", author_lean: null, classification_basis: null, confidence: 0.96, agreement: null, classification_method: null, votes: null, intensity_score: -8, intensity_confidence: null, intensity_reasoning: null, intensity_flag: null, override_flag: false, override_political_bent: null, override_intensity_score: null, override_notes: null, override_at: null, effective_political_bent: "anti-war", effective_intensity_score: -8, narrative_frames: null, emotion_mode: null, frame_confidence: null }, score: 78 },
  { tweet: { id_str: "d7", topic_slug: "iran-conflict", created_at: "2026-04-02T15:00:00Z", screen_name: "LindseyGrahamSC", author_name: "Lindsey Graham", author_bio: "U.S. Senator for South Carolina", author_followers: 3800000, full_text: "If Iran retaliates, the response should be devastating. The regime needs to understand that the era of unanswered aggression is over.", likes: 19800, retweets: 5400, replies: 4100, quotes: 1500, views: 720000, engagement: 30800, url: null, media: [] }, classification: { id_str: "d7", about_subject: true, political_bent: "pro-war", author_lean: null, classification_basis: null, confidence: 0.93, agreement: null, classification_method: null, votes: null, intensity_score: 9, intensity_confidence: null, intensity_reasoning: null, intensity_flag: null, override_flag: false, override_political_bent: null, override_intensity_score: null, override_notes: null, override_at: null, effective_political_bent: "pro-war", effective_intensity_score: 9, narrative_frames: null, emotion_mode: null, frame_confidence: null }, score: 75 },
  { tweet: { id_str: "d8", topic_slug: "iran-conflict", created_at: "2026-04-02T11:30:00Z", screen_name: "Reuters", author_name: "Reuters", author_bio: "Top and breaking news, pictures and videos from Reuters.", author_followers: 26400000, full_text: "Oil prices surge 12% following U.S. strikes on Iran. European and Asian markets drop sharply as investors assess risk of wider regional conflict.", likes: 15200, retweets: 8100, replies: 1200, quotes: 560, views: 1400000, engagement: 25060, url: null, media: [] }, classification: { id_str: "d8", about_subject: true, political_bent: "neutral", author_lean: null, classification_basis: null, confidence: 0.97, agreement: null, classification_method: null, votes: null, intensity_score: 0, intensity_confidence: null, intensity_reasoning: null, intensity_flag: null, override_flag: false, override_political_bent: null, override_intensity_score: null, override_notes: null, override_at: null, effective_political_bent: "neutral", effective_intensity_score: 0, narrative_frames: null, emotion_mode: null, frame_confidence: null }, score: 72 },
  { tweet: { id_str: "d9", topic_slug: "iran-conflict", created_at: "2026-04-02T13:30:00Z", screen_name: "BernieSanders", author_name: "Bernie Sanders", author_bio: "U.S. Senator from Vermont.", author_followers: 18500000, full_text: "The American people are tired of endless wars. We should be investing in healthcare, education, and climate — not spending billions on another military adventure in the Middle East.", likes: 52000, retweets: 14200, replies: 3800, quotes: 1100, views: 2400000, engagement: 71100, url: null, media: [] }, classification: { id_str: "d9", about_subject: true, political_bent: "anti-war", author_lean: null, classification_basis: null, confidence: 0.95, agreement: null, classification_method: null, votes: null, intensity_score: -5, intensity_confidence: null, intensity_reasoning: null, intensity_flag: null, override_flag: false, override_political_bent: null, override_intensity_score: null, override_notes: null, override_at: null, effective_political_bent: "anti-war", effective_intensity_score: -5, narrative_frames: null, emotion_mode: null, frame_confidence: null }, score: 92 },
  { tweet: { id_str: "d10", topic_slug: "iran-conflict", created_at: "2026-04-02T16:30:00Z", screen_name: "DanCrenshawTX", author_name: "Dan Crenshaw", author_bio: "Congressman TX-02. Former Navy SEAL.", author_followers: 2100000, full_text: "Iran has killed hundreds of American service members through its proxies. This is not about starting a war — it's about finishing one they started long ago.", likes: 24300, retweets: 6200, replies: 2800, quotes: 890, views: 480000, engagement: 34190, url: null, media: [] }, classification: { id_str: "d10", about_subject: true, political_bent: "pro-war", author_lean: null, classification_basis: null, confidence: 0.91, agreement: null, classification_method: null, votes: null, intensity_score: 6, intensity_confidence: null, intensity_reasoning: null, intensity_flag: null, override_flag: false, override_political_bent: null, override_intensity_score: null, override_notes: null, override_at: null, effective_political_bent: "pro-war", effective_intensity_score: 6, narrative_frames: null, emotion_mode: null, frame_confidence: null }, score: 76 },
  { tweet: { id_str: "d11", topic_slug: "iran-conflict", created_at: "2026-04-02T12:45:00Z", screen_name: "AOC", author_name: "Alexandria Ocasio-Cortez", author_bio: "US Representative, NY-14.", author_followers: 13200000, full_text: "No congressional authorization. No exit strategy. No plan for the day after. But sure, let's bomb another country and call it leadership.", likes: 41000, retweets: 11500, replies: 5200, quotes: 2300, views: 1900000, engagement: 60000, url: null, media: [] }, classification: { id_str: "d11", about_subject: true, political_bent: "anti-war", author_lean: null, classification_basis: null, confidence: 0.94, agreement: null, classification_method: null, votes: null, intensity_score: -7, intensity_confidence: null, intensity_reasoning: null, intensity_flag: null, override_flag: false, override_political_bent: null, override_intensity_score: null, override_notes: null, override_at: null, effective_political_bent: "anti-war", effective_intensity_score: -7, narrative_frames: null, emotion_mode: null, frame_confidence: null }, score: 90 },
  { tweet: { id_str: "d12", topic_slug: "iran-conflict", created_at: "2026-04-02T17:00:00Z", screen_name: "AP", author_name: "The Associated Press", author_bio: "Advancing the power of facts.", author_followers: 16800000, full_text: "DEVELOPING: Iran's foreign minister warns of 'severe consequences' following U.S. strikes. UN Security Council emergency session called for tomorrow.", likes: 12400, retweets: 7200, replies: 980, quotes: 420, views: 980000, engagement: 21000, url: null, media: [] }, classification: { id_str: "d12", about_subject: true, political_bent: "neutral", author_lean: null, classification_basis: null, confidence: 0.96, agreement: null, classification_method: null, votes: null, intensity_score: 0, intensity_confidence: null, intensity_reasoning: null, intensity_flag: null, override_flag: false, override_political_bent: null, override_intensity_score: null, override_notes: null, override_at: null, effective_political_bent: "neutral", effective_intensity_score: 0, narrative_frames: null, emotion_mode: null, frame_confidence: null }, score: 68 },
];

export default function LandingPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const [demoBias, setDemoBias] = useState(0);
  const [landingData, setLandingData] = useState<{
    topic_name?: string; anti_label?: string; pro_label?: string; total_tweets?: number;
    echo_chamber?: { score: number; shared_sources: string; shared_frames: string };
    frames?: { key: string; label: string; anti_pct: number; pro_pct: number }[];
  } | null>(null);

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
              href="/sign-up"
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
            Real posts from X, classified by AI into a simulated feed for each side — see the main arguments, top accounts, and how a feed algorithm reshapes the conversation.
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
        <p className="text-sm sm:text-lg text-gray-300 mb-4 sm:mb-6 font-medium">Slide to see how a user&apos;s political bias reshapes their simulated feed.</p>

        {/* Interactive demo — Iran War feed */}
        {(() => {
          const sortedTweets = [...DEMO_TWEETS].sort((a, b) => {
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
              {/* Custom title for landing page */}
              <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-1">
                <div className="text-xs sm:text-sm text-gray-300 font-semibold">Simulated X Feed — Iran War</div>
                <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">This reconstruction shows how the same posts get prioritized differently based on political leaning.</p>
              </div>

              {/* Chart */}
              <div className="px-4 sm:px-5">
                <SentimentDistribution
                  items={DEMO_ITEMS}
                  antiLabel="Anti-War"
                  proLabel="Pro-War"
                  bias={demoBias}
                  onChange={setDemoBias}
                  hideTitle
                />
              </div>

              {/* Scrollable feed */}
              <div className="px-4 sm:px-5 pb-4 sm:pb-5">
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 scrollbar-thin">
                  {sortedTweets.map((item) => (
                    <TweetCard
                      key={item.tweet.id_str}
                      tweet={item.tweet}
                      classification={item.classification}
                      proLabel="Pro-War"
                      antiLabel="Anti-War"
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

      {/* CTA */}
      <section className="border-t border-gray-800/30">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-12 sm:py-16">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">See what both sides are saying.</h2>
          <p className="text-gray-500 mb-8 text-sm">Free to start. No credit card required.</p>
          <Link
            href="/sign-up"
            className="inline-block px-6 py-2.5 bg-white text-gray-950 rounded-md font-medium hover:bg-gray-200 transition-colors text-sm"
          >
            Get started
          </Link>
        </div>
      </section>

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
