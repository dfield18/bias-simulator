import { TweetData, ClassificationData } from "@/lib/api";
import { getSideColors, ColorScheme } from "@/lib/colors";
import IntensityBar from "./IntensityBar";

interface TweetCardProps {
  tweet: TweetData;
  classification: ClassificationData;
  proLabel: string;
  antiLabel: string;
  colorScheme?: ColorScheme;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "..." : text;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function TweetCard({
  tweet,
  classification,
  proLabel,
  antiLabel,
  colorScheme = "political",
}: TweetCardProps) {
  const bent = classification.effective_political_bent || "unclear";
  const antiBent = antiLabel.toLowerCase().replace(/\s+/g, "-");
  const proBent = proLabel.toLowerCase().replace(/\s+/g, "-");
  const colors = getSideColors(colorScheme as ColorScheme);
  const bentColor =
    bent === antiBent
      ? colors.anti.border
      : bent === proBent
      ? colors.pro.border
      : bent === "neutral"
      ? "border-gray-500/30"
      : "border-gray-700";

  return (
    <div
      className={`bg-gray-900 border ${bentColor} rounded-xl p-3 sm:p-4 hover:bg-gray-850 transition-colors overflow-hidden min-w-0`}
    >
      {/* Author header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <span className="font-bold text-gray-100 truncate text-sm sm:text-base">
            {tweet.author_name || "Unknown"}
          </span>
          <span className="text-gray-500 truncate text-xs sm:text-sm">
            @{tweet.screen_name || "unknown"}
          </span>
          <span className="text-gray-600 text-xs shrink-0">
            {timeAgo(tweet.created_at)}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {classification.override_flag && (
            <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded">
              Override
            </span>
          )}
          <span
            className={`text-xs px-2 py-0.5 rounded ${
              bent === antiBent
                ? `${colors.anti.bgLight} ${colors.anti.text}`
                : bent === proBent
                ? `${colors.pro.bgLight} ${colors.pro.text}`
                : "bg-gray-500/20 text-gray-400"
            }`}
          >
            {bent}
          </span>
        </div>
      </div>

      {/* Author bio */}
      {tweet.author_bio && (
        <p className="text-xs text-gray-500 mb-2">
          {truncate(tweet.author_bio, 80)}
        </p>
      )}

      {/* Tweet text */}
      {(() => {
        const cleanText = decodeHtmlEntities((tweet.full_text || "").replace(/https?:\/\/t\.co\/\S+/g, "").trim());
        const isLong = cleanText.length > 280;
        if (!isLong) {
          return (
            <p className="text-gray-200 mb-3 whitespace-pre-wrap leading-relaxed text-sm sm:text-base">
              {cleanText}
            </p>
          );
        }
        return (
          <details className="mb-3 group">
            <summary className="list-none cursor-pointer">
              <p className="text-gray-200 whitespace-pre-wrap leading-relaxed text-sm sm:text-base group-open:hidden">
                {cleanText.slice(0, 280).trimEnd()}&hellip;
              </p>
              <p className="text-gray-200 whitespace-pre-wrap leading-relaxed text-sm sm:text-base hidden group-open:block">
                {cleanText}
              </p>
              <span className="text-xs text-blue-400 hover:text-blue-300 group-open:hidden">Show more</span>
              <span className="text-xs text-blue-400 hover:text-blue-300 hidden group-open:inline">Show less</span>
            </summary>
          </details>
        );
      })()}

      {/* Media */}
      {tweet.media && tweet.media.length > 0 && (
        <div
          className={`mb-3 gap-1 rounded-xl overflow-hidden ${
            tweet.media.length === 1
              ? "grid grid-cols-1"
              : "grid grid-cols-2"
          }`}
        >
          {tweet.media.slice(0, 4).map((m, i) => (
            <div key={i} className={`relative ${
              tweet.media.length === 1 ? "" :
              tweet.media.length === 3 && i === 0 ? "row-span-2" : ""
            } overflow-hidden bg-gray-800`}>
              {m.type === "video" ? (
                <a href={tweet.url || ""} target="_blank" rel="noopener noreferrer" className="block relative group">
                  {m.thumbnail ? (
                    <img src={m.thumbnail} alt="" className="w-full object-contain max-h-96" />
                  ) : (
                    <div className="w-full h-40 bg-gray-700 flex items-center justify-center">
                      <span className="text-gray-500 text-xs">Video</span>
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
                    <div className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21" /></svg>
                    </div>
                  </div>
                </a>
              ) : (
                <img
                  src={m.url}
                  alt=""
                  loading="lazy"
                  className={`w-full ${tweet.media.length === 1 ? "object-contain max-h-96" : "h-full object-cover"}`}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Frame & emotion tags */}
      {(classification.narrative_frames?.length || classification.emotion_mode) && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {classification.narrative_frames?.map((frame) => (
            <span
              key={frame}
              className="text-[10px] bg-purple-500/15 text-purple-300 px-1.5 py-0.5 rounded"
            >
              {frame.replace(/-/g, " ")}
            </span>
          ))}
          {classification.emotion_mode && (
            <span className="text-[10px] bg-amber-500/15 text-amber-300 px-1.5 py-0.5 rounded">
              {classification.emotion_mode.replace(/-/g, " ")}
            </span>
          )}
        </div>
      )}

      {/* Engagement stats */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 mb-3">
        <span className="flex items-center gap-1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          {formatNumber(tweet.likes)}
        </span>
        <span className="flex items-center gap-1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 17l-4-4m0 0l4-4m-4 4h14M17 7l4 4m0 0l-4 4m4-4H7" />
          </svg>
          {formatNumber(tweet.retweets)}
        </span>
        {tweet.quotes != null && tweet.quotes > 0 && (
          <span className="flex items-center gap-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z" />
              <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />
            </svg>
            {formatNumber(tweet.quotes)}
          </span>
        )}
        <span className="flex items-center gap-1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
          {formatNumber(tweet.replies)}
        </span>
        <span className="flex items-center gap-1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" />
          </svg>
          {formatNumber(tweet.views)}
        </span>
        {tweet.author_followers != null && (
          <span className="text-gray-600 sm:ml-auto">
            {formatNumber(tweet.author_followers)} followers
          </span>
        )}
      </div>

      {/* Intensity bar */}
      {classification.effective_intensity_score != null && (
        <div className="mb-2">
          <IntensityBar
            score={classification.effective_intensity_score}
            proLabel={proLabel}
            antiLabel={antiLabel}
            colorScheme={colorScheme as "political" | "neutral"}
          />
        </div>
      )}

      {/* Link to original */}
      {tweet.url && (
        <a
          href={tweet.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          View original tweet
        </a>
      )}
    </div>
  );
}
