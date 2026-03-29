"use client";

import { AnalyticsData, NarrativeData, ExposureOverlapData } from "@/lib/api";

interface WhatThisMeansProps {
  analytics: AnalyticsData;
  narrative: NarrativeData;
  exposureOverlap: ExposureOverlapData | null;
  antiLabel: string;
  proLabel: string;
}

interface ExecutiveInsightInputs {
  dominantVolumeSide: string;
  otherVolumeSide: string;
  dominantVolumeShare: number;
  volumeRatio: number;
  dominantEngagementSide: string;
  dominantEngagementShare: number;
  avgEngagementWinningSide: string;
  avgEngagementRatio: number;
  narrativeGapScore: number;
  exposureOverlapScore: number | null;
  topEmotion: string;
  topEmotionSame: boolean;
  biggestFrameGaps: { frame: string; favoredSide: string; gapPct: number }[];
}

function computeInputs(
  analytics: AnalyticsData,
  narrative: NarrativeData,
  exposureOverlap: ExposureOverlapData | null,
  antiLabel: string,
  proLabel: string,
): ExecutiveInsightInputs {
  const anti = analytics.engagement.anti;
  const pro = analytics.engagement.pro;
  const totalTweets = anti.count + pro.count;

  const dominantVolumeSide = anti.count > pro.count ? antiLabel : proLabel;
  const otherVolumeSide = anti.count > pro.count ? proLabel : antiLabel;
  const dominantVolumeShare = totalTweets > 0 ? Math.max(anti.count, pro.count) / totalTweets : 0;
  const volumeRatio = Math.round(Math.max(anti.count, pro.count) / Math.max(Math.min(anti.count, pro.count), 1) * 10) / 10;

  const antiTotalEng = anti.avg_engagement * anti.count;
  const proTotalEng = pro.avg_engagement * pro.count;
  const totalEng = antiTotalEng + proTotalEng;
  const dominantEngagementSide = antiTotalEng > proTotalEng ? antiLabel : proLabel;
  const dominantEngagementShare = totalEng > 0 ? Math.max(antiTotalEng, proTotalEng) / totalEng : 0;

  const avgEngagementWinningSide = anti.avg_engagement > pro.avg_engagement ? antiLabel : proLabel;
  const avgEngagementRatio = Math.round(Math.max(anti.avg_engagement, pro.avg_engagement) / Math.max(Math.min(anti.avg_engagement, pro.avg_engagement), 1) * 10) / 10;

  // Narrative gap score
  const allKeys = Object.keys(narrative.frame_labels);
  const antiTotal = allKeys.reduce((s, k) => s + ((narrative.frames.anti[k] as any)?.count || 0), 0);
  const proTotal = allKeys.reduce((s, k) => s + ((narrative.frames.pro[k] as any)?.count || 0), 0);
  const diffs = allKeys.map((k) => {
    const aS = antiTotal > 0 ? ((narrative.frames.anti[k] as any)?.count || 0) / antiTotal : 0;
    const pS = proTotal > 0 ? ((narrative.frames.pro[k] as any)?.count || 0) / proTotal : 0;
    return Math.abs(aS - pS);
  });
  const narrativeGapScore = Math.round(0.5 * diffs.reduce((s, d) => s + d, 0) * 100);

  // Top emotion
  const emotionCounts: Record<string, number> = {};
  const antiEmoCounts: Record<string, number> = {};
  const proEmoCounts: Record<string, number> = {};
  for (const [k, v] of Object.entries(narrative.emotions.anti)) {
    const c = (v as any).count || 0;
    emotionCounts[k] = (emotionCounts[k] || 0) + c;
    antiEmoCounts[k] = c;
  }
  for (const [k, v] of Object.entries(narrative.emotions.pro)) {
    const c = (v as any).count || 0;
    emotionCounts[k] = (emotionCounts[k] || 0) + c;
    proEmoCounts[k] = c;
  }
  const topEmoKey = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  const topEmotion = narrative.emotion_labels[topEmoKey] || topEmoKey;
  const topAntiEmo = Object.entries(antiEmoCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  const topProEmo = Object.entries(proEmoCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  const topEmotionSame = topAntiEmo === topProEmo;

  // Frame gaps
  const biggestFrameGaps = narrative.frame_gaps
    .filter((g) => g.delta >= 10)
    .slice(0, 3)
    .map((g) => ({
      frame: g.label,
      favoredSide: g.dominant_side === "anti" ? antiLabel : proLabel,
      gapPct: g.delta,
    }));

  return {
    dominantVolumeSide,
    otherVolumeSide,
    dominantVolumeShare,
    volumeRatio,
    dominantEngagementSide,
    dominantEngagementShare,
    avgEngagementWinningSide,
    avgEngagementRatio,
    narrativeGapScore,
    exposureOverlapScore: exposureOverlap?.score ?? null,
    topEmotion,
    topEmotionSame,
    biggestFrameGaps,
  };
}

function generateImplications(inputs: ExecutiveInsightInputs) {
  const {
    dominantVolumeSide, otherVolumeSide, dominantVolumeShare, volumeRatio,
    dominantEngagementSide, dominantEngagementShare,
    avgEngagementWinningSide, avgEngagementRatio,
    narrativeGapScore, exposureOverlapScore,
    topEmotion, topEmotionSame, biggestFrameGaps,
  } = inputs;

  type Bullet = { text: string; priority: number };
  const candidates: Bullet[] = [];

  // Rule 1: Low overlap / separate realities
  if (exposureOverlapScore !== null && exposureOverlapScore <= 15) {
    candidates.push({ text: "Most stories are not shared across sides — each audience sees a different reality.", priority: 100 });
  } else if (exposureOverlapScore !== null && exposureOverlapScore <= 35) {
    candidates.push({ text: "Limited story overlap — most of what each side sees is unique to their feed.", priority: 90 });
  } else if (exposureOverlapScore !== null && exposureOverlapScore > 60) {
    candidates.push({ text: "Both sides see many of the same stories — framing is the key battleground, not reach.", priority: 70 });
  }

  // Rule 2: Performance advantage
  if (avgEngagementRatio >= 1.5) {
    candidates.push({ text: `${avgEngagementWinningSide} earns ~${avgEngagementRatio}× more engagement per post.`, priority: 95 });
  }

  // Rule 3: Attention concentration
  if (dominantEngagementShare >= 0.75 && dominantEngagementSide !== dominantVolumeSide) {
    candidates.push({ text: `Despite lower volume, most audience attention goes to ${dominantEngagementSide} content.`, priority: 88 });
  } else if (dominantEngagementShare >= 0.75) {
    candidates.push({ text: `Most audience attention goes to ${dominantEngagementSide} content.`, priority: 80 });
  }

  // Rule 4: Emotional driver — fixed for accuracy
  if (topEmotionSame) {
    candidates.push({ text: `${topEmotion} is the main driver of visibility on both sides.`, priority: 75 });
  } else {
    // Find which side the top emotion is stronger on
    candidates.push({ text: `${topEmotion} is the dominant driver — especially on ${dominantEngagementSide}.`, priority: 75 });
  }

  // Rule 5: Narrative divide
  if (narrativeGapScore > 40) {
    candidates.push({ text: "Each side tells a very different version of the story.", priority: 72 });
  } else if (narrativeGapScore > 20) {
    candidates.push({ text: "The two sides share some common ground but emphasize different arguments.", priority: 60 });
  }

  // Rule 6: Strongest frame gap
  if (biggestFrameGaps.length > 0) {
    const top = biggestFrameGaps[0];
    candidates.push({ text: `${top.frame} is more visible on ${top.favoredSide} but underrepresented on the other side.`, priority: 68 });
  }

  // Sort, pick top 3
  candidates.sort((a, b) => b.priority - a.priority);
  const bullets = candidates.slice(0, 3).map((c) => c.text);

  // Strategic implication
  let strategicImplication = "";
  const sameSideDominates = dominantVolumeSide === dominantEngagementSide && dominantEngagementSide === avgEngagementWinningSide;

  if (sameSideDominates && avgEngagementRatio >= 1.5) {
    strategicImplication = `${dominantVolumeSide} messaging is not only more visible, but gets more likes, shares, and replies per post when it appears. Competing narratives need stronger hooks or more emotionally resonant framing to break through.`;
  } else if (exposureOverlapScore !== null && exposureOverlapScore <= 35 && narrativeGapScore > 20) {
    strategicImplication = `This is not a single shared conversation. Messaging needs to be tailored for distinct audience realities rather than assuming common context.`;
  } else if (avgEngagementRatio >= 1.75) {
    strategicImplication = `${topEmotion}-driven content is shaping attention. Lower-intensity messages may need clearer urgency or emotional salience to compete.`;
  } else {
    strategicImplication = `Framing and emotional tone matter as much as volume. Focus on which narrative frames are actually driving audience attention.`;
  }

  // Risk or opportunity — tighter language
  let riskOrOpportunity: { label: string; text: string } | null = null;

  if (exposureOverlapScore !== null && exposureOverlapScore <= 20) {
    riskOrOpportunity = { label: "Biggest Risk", text: "Most messages never reach the other side." };
  } else if (avgEngagementRatio >= 2.0 && dominantVolumeShare >= 0.75) {
    riskOrOpportunity = { label: "Biggest Risk", text: "A narrow set of narratives is shaping most of what people see." };
  } else if (exposureOverlapScore !== null && exposureOverlapScore > 35 && narrativeGapScore > 30) {
    riskOrOpportunity = { label: "Biggest Opportunity", text: "Shared stories create openings to compete on framing, not just reach." };
  } else if (biggestFrameGaps.length > 0 && biggestFrameGaps[0].gapPct >= 20) {
    riskOrOpportunity = { label: "Biggest Opportunity", text: "Underrepresented narratives may gain traction if reframed with stronger urgency." };
  }

  return { bullets, strategicImplication, riskOrOpportunity };
}

function WhatThisMeansContent({ analytics, narrative, exposureOverlap, antiLabel, proLabel }: WhatThisMeansProps) {
  const inputs = computeInputs(analytics, narrative, exposureOverlap, antiLabel, proLabel);
  const { bullets, strategicImplication, riskOrOpportunity } = generateImplications(inputs);

  if (bullets.length === 0) return null;

  return (
    <>
      {/* Strategic implication */}
      <p className="text-xs text-gray-400 leading-relaxed mt-2 mb-3">
        {strategicImplication}
      </p>

      {/* Biggest Risk or Opportunity */}
      {riskOrOpportunity && (
        <div className={`rounded-md px-2.5 py-1.5 flex items-center gap-1.5 text-xs ${
          riskOrOpportunity.label === "Biggest Risk"
            ? "bg-red-500/10 text-red-300/80"
            : "bg-green-500/10 text-green-300/80"
        }`}>
          <span className={`font-semibold ${
            riskOrOpportunity.label === "Biggest Risk" ? "text-red-400" : "text-green-400"
          }`}>
            {riskOrOpportunity.label}:
          </span>
          {riskOrOpportunity.text}
        </div>
      )}
    </>
  );
}

/** Inline version — renders inside a parent card (no wrapper div) */
export function WhatThisMeansInline(props: WhatThisMeansProps) {
  return <WhatThisMeansContent {...props} />;
}

/** Standalone version — renders with its own card wrapper */
export default function WhatThisMeans(props: WhatThisMeansProps) {
  const inputs = computeInputs(props.analytics, props.narrative, props.exposureOverlap, props.antiLabel, props.proLabel);
  const { bullets } = generateImplications(inputs);
  if (bullets.length === 0) return null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
      <WhatThisMeansContent {...props} />
    </div>
  );
}
